import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getDb, withTransaction } from '../db.js';
import { canonicalize } from './canonical-snapshot.js';
import { P0Error } from './errors.js';
import { ACTIONS, assertAllowed } from './permissions.js';
import { validateArtifactBytes } from './artifact-files.js';
import {
  completeIdempotencyKey,
  insertActivity,
  reserveIdempotencyKey,
} from './repository.js';

const FORBIDDEN_FIELDS = new Set([
  'id', 'file_no', 'received_date', 'created_at', 'updated_at',
  'workflow_mode', 'workflow_version', 'status', 'created_by_id',
  'actor_id', 'actor_name', 'actor_role', 'actor_level', 'actor_division',
  'correlation_id', 'idempotency_key', 'score', 'index', 'priority',
  'survey_date', 'surveyor_name', 'surveyor_phone', 'survey_recommendation', 'survey_notes',
  'recommended_amount', 'approved_amount', 'rejection_reason',
  'mpzis_date', 'ppd_number', 'disbursement_date', 'overall_score',
  'house_index', 'asset_index', 'income_index', 'spiritual_score',
  'approval', 'approved', 'projection', 'decision',
  'documents', 'attachments', 'bank_account', 'remaining_income',
]);

// This is deliberately smaller than MUSTAHIK_COLUMNS. A new intake cannot
// write workflow projections, decisions, upload references, or bank numbers.
const INTAKE_FIELDS = Object.freeze([
  'name', 'beneficiary_name', 'applicant_status', 'nik', 'kk_number', 'phone',
  'marital_status', 'pob', 'dob', 'occupation', 'work_place', 'education_level',
  'address', 'rt_rw', 'kelurahan', 'kecamatan', 'kabupaten_kota', 'province',
  'house_ownership', 'family_dependents', 'monthly_income', 'monthly_expense',
  'program', 'request_title', 'asnaf', 'fund_source', 'distribution_purpose',
  'parent_occupation', 'beneficiary_count', 'payment_method', 'bank_name',
  'bank_account_name', 'proposed_amount', 'notes',
]);

const INTAKE_FIELD_SET = new Set(INTAKE_FIELDS);
const INTEGER_FIELDS = new Set(['family_dependents', 'beneficiary_count']);
const MONEY_FIELDS = new Set(['monthly_income', 'monthly_expense', 'proposed_amount']);
export const MAX_PUBLIC_DOCUMENT_BYTES = 5 * 1024 * 1024;
const fileNumberLocks = new Map();

function p0Validation(fieldErrors, message = 'Data intake P0 tidak valid.') {
  return new P0Error('VALIDATION_FAILED', message, { status: 422, field_errors: fieldErrors });
}

function actorFrom(context) {
  return context?.actor || context?.user || {};
}

function normalisePayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw p0Validation({ body: 'OBJECT_REQUIRED' });
  }

  const fieldErrors = {};
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_FIELDS.has(key)) fieldErrors[key] = 'FIELD_FORBIDDEN';
    else if (!INTAKE_FIELD_SET.has(key)) fieldErrors[key] = 'FIELD_UNDECLARED';
  }
  if (Object.keys(fieldErrors).length) throw new P0Error('FIELD_FORBIDDEN', 'Field intake tidak diizinkan.', { status: 422, field_errors: fieldErrors });

  const result = {};
  for (const key of INTAKE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const value = input[key];
    if (INTEGER_FIELDS.has(key)) {
      if (!Number.isSafeInteger(value) && !(typeof value === 'string' && /^\d+$/.test(value.trim()))) fieldErrors[key] = 'INTEGER';
      else result[key] = Number(value);
      continue;
    }
    if (MONEY_FIELDS.has(key)) {
      const numeric = typeof value === 'number' ? value : (typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN);
      if (!Number.isFinite(numeric) || numeric < 0 || (key !== 'proposed_amount' && !Number.isSafeInteger(numeric))) fieldErrors[key] = key === 'proposed_amount' ? 'NON_NEGATIVE_NUMBER' : 'NON_NEGATIVE_INTEGER';
      else result[key] = numeric;
      continue;
    }
    if (value === null) {
      result[key] = null;
      continue;
    }
    if (typeof value !== 'string') fieldErrors[key] = 'STRING_REQUIRED';
    else result[key] = value.trim();
  }

  if (!result.name) fieldErrors.name = 'REQUIRED';
  if (result.name && result.name.length > 255) fieldErrors.name = 'MAX_LENGTH';
  if (result.beneficiary_name && result.beneficiary_name.length > 255) fieldErrors.beneficiary_name = 'MAX_LENGTH';

  if (result.applicant_status) {
    if (!['Perorangan', 'Lembaga'].includes(result.applicant_status)) {
      fieldErrors.applicant_status = 'ENUM';
    }
  } else {
    result.applicant_status = 'Perorangan';
  }

  if (result.nik !== undefined && result.nik !== null && result.nik !== '') {
    if (!/^\d{16}$/.test(result.nik)) {
      fieldErrors.nik = 'FORMAT';
    }
  }

  if (Object.keys(fieldErrors).length) throw p0Validation(fieldErrors);

  result.beneficiary_name ||= result.name;
  result.family_dependents ??= 0;
  result.beneficiary_count ??= 1;
  result.monthly_income ??= 0;
  result.monthly_expense ??= 0;
  result.program ||= 'Kemanusiaan';
  result.request_title ||= 'Permohonan Bantuan';
  result.proposed_amount ??= 0;

  if (result.notes && !result.distribution_purpose) {
    result.distribution_purpose = result.notes;
  } else if (result.distribution_purpose && !result.notes) {
    result.notes = result.distribution_purpose;
  }
  return result;
}

function dateValue(now) {
  const date = typeof now === 'function' ? now() : (now || new Date());
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) throw new P0Error('SERVER_TIME_INVALID', 'Waktu server tidak valid.', { status: 500 });
  return parsed;
}

function fileNumberPrefix(now) {
  const date = dateValue(now);
  return `MST-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}-`;
}

async function allocateFileNo(db, now, sequenceId) {
  const prefix = fileNumberPrefix(now);
  // The database sequence-backed case id is unique across concurrent
  // transactions, so deriving the suffix from it avoids a MAX()+1 race.
  // Existing legacy numbers remain untouched; new numbers are server-owned.
  let sequence = Number.isSafeInteger(Number(sequenceId)) && Number(sequenceId) > 0
    ? Number(sequenceId)
    : 1;
  while (await db.get('SELECT id FROM mustahik WHERE file_no=$1 LIMIT 1', [`${prefix}${String(sequence).padStart(4, '0')}`])) sequence += 1;
  return `${prefix}${String(sequence).padStart(4, '0')}`;
}

async function withFileNumberLock(db, prefix, context, handler) {
  if (typeof context.fileNumberLock === 'function') return context.fileNumberLock(prefix, handler);
  // PostgreSQL advisory locks are transaction-scoped and therefore release
  // automatically on commit/rollback. MemPg has no advisory-lock function;
  // use an equivalent process lock for that explicit test seam and SQLite.
  if (db.isPg && db.pool?.constructor?.name !== 'MemPg') {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [prefix]);
    return handler();
  }
  const previous = fileNumberLocks.get(prefix) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  fileNumberLocks.set(prefix, queued);
  await previous;
  try {
    return await handler();
  } finally {
    release();
    if (fileNumberLocks.get(prefix) === queued) fileNumberLocks.delete(prefix);
  }
}

const PUBLIC_DOCUMENT_TYPES = Object.freeze({
  ktp: 'KTP', kk: 'Kartu Keluarga', sktm: 'SKTM / Surat RT-RW',
  surat_kelurahan: 'Surat Keterangan Kelurahan (Asli)',
  rekomendasi_upz: 'Rekomendasi UPZ (Asli)',
  rekomendasi: 'Rekomendasi UPZ / Masjid (Asli)',
  permohonan: 'Rincian Kebutuhan / Bukti Tagihan',
  surat_permohonan: 'Surat Permohonan',
  bukti_kebutuhan: 'Rincian Kebutuhan / Bukti Tagihan',
  proposal: 'Proposal Permohonan',
});

function publicFileName(value) {
  const basename = path.posix.basename(String(value || 'dokumen').replace(/\\/g, '/'));
  return basename.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 255) || 'dokumen';
}

function normalizePublicFiles(files = []) {
  if (!Array.isArray(files) || files.length > 5) throw new P0Error('UPLOAD_VALIDATION_FAILED', 'Maksimal lima dokumen dapat diunggah.', { status: 422 });
  return files.map((file) => {
    const docType = PUBLIC_DOCUMENT_TYPES[String(file?.fieldname || '').trim().toLowerCase()];
    if (!docType || !Buffer.isBuffer(file?.buffer)) throw new P0Error('UPLOAD_VALIDATION_FAILED', 'Data dokumen tidak valid.', { status: 422 });
    const originalName = publicFileName(file.originalname);
    if (file.buffer.length > MAX_PUBLIC_DOCUMENT_BYTES) {
      throw new P0Error('UPLOAD_VALIDATION_FAILED', `Ukuran berkas "${originalName}" pada bidang "${file.fieldname}" melebihi batas 5 MiB.`, { status: 422 });
    }
    let validated;
    try {
      validated = validateArtifactBytes(file.buffer);
    } catch (error) {
      throw new P0Error(error.code || 'UPLOAD_VALIDATION_FAILED', `Berkas "${originalName}" pada bidang "${file.fieldname}" harus berupa PDF, JPG, atau PNG yang valid.`, { status: 422 });
    }
    if (file.mimetype && file.mimetype !== validated.mimeType) throw new P0Error('UPLOAD_VALIDATION_FAILED', `Jenis dokumen "${originalName}" pada bidang "${file.fieldname}" tidak sesuai dengan isi berkas. Gunakan PDF, JPG, atau PNG.`, { status: 422 });
    const ext = path.extname(originalName).toLowerCase();
    const expectedExtensions = {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
    }[validated.mimeType] || [];
    if (!expectedExtensions.includes(ext)) {
      throw new P0Error('UPLOAD_VALIDATION_FAILED', `Ekstensi berkas "${originalName}" tidak sesuai dengan isi dokumen (${validated.mimeType}).`, { status: 422 });
    }
    return { fieldname: file.fieldname, docType, originalName, extension: validated.extension, mimeType: validated.mimeType, byteSize: validated.byteSize, sha256: validated.sha256, buffer: file.buffer };
  });
}

export async function resolveP0PublicIntakeActor(db, configuredId) {
  const id = Number(configuredId);
  if (!Number.isSafeInteger(id) || id < 1 || !db?.get) throw new P0Error('P0_PUBLIC_ACTOR_INVALID', 'Identitas layanan intake publik belum dikonfigurasi.', { status: 503 });
  let user;
  try { user = await db.get('SELECT id,name,email,role,level,division,is_active FROM users WHERE id=$1', [id]); }
  catch { throw new P0Error('P0_PUBLIC_ACTOR_INVALID', 'Identitas layanan intake publik tidak tersedia.', { status: 503 }); }
  const division = String(user.division || '').toLowerCase();
  const isPenyaluranDivision = division.includes('penyaluran') || division.includes('pendistribusian');
  if (!user || Number(user.id) !== id || user.is_active === false || user.is_active === 0 || String(user.role || '').toLowerCase() !== 'penyaluran' || String(user.level || '').toLowerCase() !== 'staff' || !isPenyaluranDivision) {
    throw new P0Error('P0_PUBLIC_ACTOR_INVALID', 'Identitas layanan intake publik tidak memenuhi kebijakan P0.', { status: 503 });
  }
  const name = String(user.name || '').trim();
  if (!name) throw new P0Error('P0_PUBLIC_ACTOR_INVALID', 'Nama identitas layanan intake publik tidak tersedia.', { status: 503 });
  return { id, name, email: String(user.email || ''), role: user.role, level: user.level, division: user.division };
}
function requestHash(payload) {
  return crypto.createHash('sha256').update(canonicalize(payload), 'utf8').digest('hex');
}

function correlationId(meta) {
  const candidate = meta?.correlation_id ?? meta?.correlationId;
  if (candidate === undefined || candidate === null || candidate === '') return crypto.randomUUID();
  if (typeof candidate !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)) {
    throw new P0Error('CORRELATION_ID_INVALID', 'Correlation id tidak valid.', { status: 400 });
  }
  return candidate;
}

function idempotencyKey(meta = {}, derivedKey = null) {
  const key = meta.idempotency_key ?? meta.idempotencyKey;
  if ((key === undefined || key === null || key === '') && meta.allow_derived_idempotency === true && derivedKey) return `public-${derivedKey}`;
  if (typeof key !== 'string' || !key.trim() || key.length > 150) throw new P0Error('IDEMPOTENCY_REQUIRED', 'Idempotency-Key wajib diisi.', { status: 400 });
  return key.trim();
}

/** Create a canonical P0 case, application, and validated public attachments. */
export async function createP0Mustahik(payload, context = {}, meta = {}) {
  if (context.p0Enabled === false || context.featureEnabled === false) throw new P0Error('P0_WORKFLOW_DISABLED', 'Workflow P0 sedang dinonaktifkan.', { status: 503 });
  const actor = actorFrom(context);
  assertAllowed(ACTIONS.INTAKE_CREATE, actor);
  const normalised = normalisePayload(payload);
  const uploads = normalizePublicFiles(context.files || []);
  const hash = requestHash({ payload: normalised, files: uploads.map(({ fieldname, sha256, byteSize }) => ({ fieldname, sha256, byteSize })) });
  const key = idempotencyKey(meta, meta.allow_derived_idempotency === true ? hash : null);
  const correlation = correlationId(meta);
  const db = context.db || context.dbOverride || context.txDb || await getDb();
  if (!db) throw new P0Error('P0_DATABASE_REQUIRED', 'Database P0 belum tersedia.', { status: 503 });
  const repository = context.repository || {};
  const reserve = repository.reserveIdempotencyKey || reserveIdempotencyKey;
  const complete = repository.completeIdempotencyKey || completeIdempotencyKey;
  const activity = repository.insertActivity || insertActivity;
  const uploadRoot = path.resolve(context.uploadDir || process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'));
  const writtenFiles = [];
  try {
    return await withTransaction(db, async (txDb) => {
      const reservation = await reserve(txDb, { actor_id: actor.id, idempotency_key: key, request_hash: hash });
      if (reservation.replayed) return { ...reservation.response, replayed: true };
      const now = dateValue(context.now);
      const prefix = fileNumberPrefix(now);
      return withFileNumberLock(txDb, prefix, context, async () => {
        const dbCandidate = { ...normalised };
        dbCandidate.recommended_amount = dbCandidate.proposed_amount;
        delete dbCandidate.proposed_amount;
        dbCandidate.asnaf ??= null;
        const columns = ['file_no', 'received_date', ...Object.keys(dbCandidate), 'remaining_income', 'application_count', 'status', 'workflow_version', 'workflow_mode', 'created_by_id'];
        const values = columns.map((col) => {
          if (col === 'file_no') return null;
          if (col === 'received_date') return now.toISOString().slice(0, 10);
          if (col === 'remaining_income') return normalised.monthly_income - normalised.monthly_expense;
          if (col === 'application_count') return 1;
          if (col === 'status') return 'Diajukan';
          if (col === 'workflow_version') return 0;
          if (col === 'workflow_mode') return 'p0';
          if (col === 'created_by_id') return actor.id;
          return dbCandidate[col] ?? null;
        });
        const placeholders = values.map((_, index) => `$${index + 1}`);
        const created = await txDb.query(`INSERT INTO mustahik (${columns.join(',')}) VALUES (${placeholders.join(',')}) RETURNING id,file_no,received_date`, values);
        const mustahik = created.rows?.[0];
        if (!mustahik?.id) throw new P0Error('P0_INTAKE_FAILED','Data intake tidak berhasil dibuat.',{status:500});
        const fileNo = await allocateFileNo(txDb,now,mustahik.id);
        const numbered = await txDb.query('UPDATE mustahik SET file_no=$1 WHERE id=$2 RETURNING file_no',[fileNo,mustahik.id]);
        if (!numbered.rows?.[0]?.file_no) throw new P0Error('P0_INTAKE_FAILED','Nomor berkas tidak berhasil dibuat.',{status:500});
        const application = await txDb.query('INSERT INTO applications (mustahik_id,application_number,program,request_title,status) VALUES ($1,$2,$3,$4,$5) RETURNING id',[mustahik.id,fileNo,normalised.program,normalised.request_title,'Diajukan']);
        if (uploads.length) await fs.mkdir(uploadRoot,{recursive:true,mode:0o700});
        for (const upload of uploads) {
          const filename = `${crypto.randomUUID()}${upload.extension}`;
          const diskPath = path.resolve(uploadRoot,filename);
          if (path.dirname(diskPath)!==uploadRoot) throw new P0Error('UPLOAD_PATH_INVALID','Lokasi penyimpanan dokumen tidak valid.',{status:500});
          writtenFiles.push(diskPath);
          await fs.writeFile(diskPath,upload.buffer,{flag:'wx',mode:0o600});
          await txDb.query('INSERT INTO documents (mustahik_id,doc_type,filename,original_name,file_url) VALUES ($1,$2,$3,$4,$5)',[mustahik.id,upload.docType,filename,upload.originalName,`/uploads/${filename}`]);
          await activity(txDb,{mustahik_id:mustahik.id,actor,action_type:'p0_intake_document_uploaded',title:'Public intake document uploaded',description:`Validated ${upload.docType} attachment.`,old_status:null,new_status:'Diajukan',correlation_id:correlation});
        }
        const response = {success:true,data:{id:mustahik.id,file_no:fileNo,received_date:mustahik.received_date||now.toISOString().slice(0,10),name:normalised.name,program:normalised.program,request_title:normalised.request_title,application_id:application.rows?.[0]?.id??null,status:'Diajukan',workflow_mode:'p0',workflow_version:0,applicant_status:normalised.applicant_status,proposed_amount:normalised.proposed_amount??0}};
        await activity(txDb,{mustahik_id:mustahik.id,actor,action_type:'p0_intake_created',title:'P0 intake created',description:`Authoritative P0 intake created with ${uploads.length} document(s).`,old_status:null,new_status:'Diajukan',correlation_id:correlation});
        await complete(txDb,{actor_id:actor.id,idempotency_key:key,response});
        return response;
      });
    });
  } catch (error) {
    await Promise.all(writtenFiles.map((filename)=>fs.unlink(filename).catch(()=>{})));
    if (error?.code==='23505' && /file_no|mustahik/i.test(String(error?.message))) throw new P0Error('P0_FILE_NUMBER_CONFLICT','Nomor berkas sedang digunakan. Silakan coba lagi.',{status:409});
    throw error;
  }
}
export const P0_INTAKE_FIELDS = INTAKE_FIELDS;
