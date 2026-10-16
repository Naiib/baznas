import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveUploadPath, isUploadPathContained } from '../upload-download-policy.js';
import { P0Error } from './errors.js';
import { createP0Mustahik } from './intake-service.js';
import {
  getAssessmentCase,
  createAssessmentDraft,
  saveAssessmentDraft,
  submitAssessment,
  reviewAssessment,
} from './assessment-service.js';
import {
  getMpzisCase,
  createMpzisDraft,
  saveMpzisDraft,
  submitMpzis,
  decideMpzisStep,
  MPZIS_STEPS,
} from './mpzis-service.js';
import {
  getPpdCase,
  createPpdDraft,
  savePpdDraft,
  submitPpd,
  financeCheckPpd,
  financeApprovePpd,
} from './ppd-service.js';
import { authorizeCaseRead, openArtifactForActor, streamAuditedArtifact } from './artifact-files.js';
import multer from 'multer';
import { recordPayment, verifyPayment } from './payment-service.js';
import { recordRecipientConfirmation, completeDistribution } from './completion-service.js';
import { getDb as defaultGetDb } from '../db.js';
import { processReceiptJob } from './receipt-jobs.js';
import {
  beginLegacyReconciliation,
  completeLegacyReconciliation,
  recoverArtifactStep,
} from './legacy-reconciliation.js';
import { getP0CaseWorkspace } from './case-read-model.js';

const SHA256 = /^[a-f0-9]{64}$/;

function flagEnabled(source, req) {
  try {
    const value = typeof source === 'function' ? source(req) : source;
    return value === true || value === 'true';
  } catch {
    return false;
  }
}

/** Middleware intended to run before express.json for disabled-mode fail-closed behavior. */
export function p0FlagGate({ isEnabled = () => process.env.PENYALURAN_P0_ENABLED === 'true' } = {}) {
  return (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || flagEnabled(isEnabled, req)) return next();
    return res.status(503).json(new P0Error('P0_WORKFLOW_DISABLED', 'Workflow P0 sedang dinonaktifkan.', { status: 503 }).toJSON());
  };
}

function errorResponse(res, error) {
  if (error instanceof P0Error) return res.status(error.status).json(error.toJSON());
  // Never send database, SQL, stack, or request data to the caller.
  return res.status(500).json({ success: false, code: 'P0_INTERNAL_ERROR', message: 'Terjadi kesalahan sistem.' });
}

function routeId(value, field) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new P0Error('FIELD_INVALID', `${field} tidak valid.`, { status: 400, field_errors: { [field]: 'INTEGER' } });
  return parsed;
}
function commandMeta(req) {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const headerKey = req.get('Idempotency-Key') || req.get('X-Idempotency-Key');
  const meta = {
    idempotency_key: headerKey || body.idempotency_key,
    correlation_id: req.get('X-Correlation-Id') || body.correlation_id,
  };
  for (const key of ['expected_status', 'expected_version', 'expected_revision', 'expected_snapshot_hash', 'application_id']) {
    if (Object.prototype.hasOwnProperty.call(body, key)) meta[key] = body[key];
  }
  for (const key of ['expected_version', 'expected_revision', 'application_id']) {
    if (meta[key] !== undefined && meta[key] !== null && meta[key] !== '') {
      const value = Number(meta[key]);
      if (Number.isSafeInteger(value)) meta[key] = value;
    }
  }
  return meta;
}
function commandBody(req) {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const controls = new Set(['idempotency_key', 'correlation_id', 'expected_status', 'expected_version', 'expected_revision', 'expected_snapshot_hash', 'application_id']);
  return Object.fromEntries(Object.entries(body).filter(([key]) => !controls.has(key)));
}
function disabledResponse(res) {
  return res.status(503).json(new P0Error('P0_WORKFLOW_DISABLED', 'Workflow P0 sedang dinonaktifkan.', { status: 503 }).toJSON());
}

/**
 * Register the canonical P0 route. The dependency shape is intentionally
 * stable so later P0 route groups can be added without moving policy logic
 * into server/index.js.
 */
export function registerPenyaluranP0Routes(app, {
  authenticateToken,
  services = {},
  isEnabled = () => process.env.PENYALURAN_P0_ENABLED === 'true',
  artifactRoot = process.env.PENYALURAN_ARTIFACT_DIR || path.join(process.cwd(), '.private-artifacts'),
  uploadRoot = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'),
  db = null,
  getDb: getDbDependency = defaultGetDb,
} = {}) {
  if (!app || typeof app.post !== 'function') throw new TypeError('An Express app is required.');
  if (typeof authenticateToken !== 'function') throw new TypeError('authenticateToken is required.');
  const registrationKey = Symbol.for('baznas.penyaluranP0RoutesRegistered');
  if (app[registrationKey]) return app;
  app[registrationKey] = true;
  // Resolve the actual database explicitly for every request.  `app.locals.db`
  // is not initialized by the production bootstrap and must not be treated as
  // an implicit dependency.
  const resolveDb = async (req) => {
    if (db) return typeof db === 'function' ? db(req) : db;
    if (typeof getDbDependency === 'function') return getDbDependency(req);
    return defaultGetDb();
  };
  app.post('/api/penyaluran/mustahik', authenticateToken, async (req, res) => {
    // This guard is deliberately before body inspection, validation, or SQL.
    if (!flagEnabled(isEnabled, req)) {
      return res.status(503).json(new P0Error('P0_WORKFLOW_DISABLED', 'Workflow P0 sedang dinonaktifkan.', { status: 503 }).toJSON());
    }
    try {
      const create = services.createP0Mustahik || createP0Mustahik;
      const requestDb = await resolveDb(req);
      const result = await create(
        req.body,
        { actor: req.user, db: requestDb },
        {
          idempotency_key: req.get('Idempotency-Key'),
          correlation_id: req.get('X-Correlation-Id'),
        },
      );
      return res.status(result?.replayed ? 200 : 201).json(result);
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  const service = (name, fallback) => services[name] || fallback;
  const workspaceService = services.getP0CaseWorkspace || getP0CaseWorkspace;
  app.get('/api/penyaluran/mustahik/:id/workspace', authenticateToken, async (req, res) => {
    try {
      const mustahikId = routeId(req.params.id, 'mustahik_id');
      const requestDb = await resolveDb(req);
      const result = await workspaceService({ actor: req.user, db: requestDb }, mustahikId, commandMeta(req));
      return res.status(200).json(result);
    } catch (error) { return errorResponse(res, error); }
  });

  app.get('/api/penyaluran/mustahik/:id/assessment', authenticateToken, async (req, res) => {
    try {
      const result = await service('getAssessmentCase', getAssessmentCase)({ actor: req.user, db: await resolveDb(req) }, routeId(req.params.id, 'mustahik_id'), commandMeta(req));
      return res.status(200).json(result);
    } catch (error) { return errorResponse(res, error); }
  });
  app.post('/api/penyaluran/mustahik/:id/assessment/drafts', authenticateToken, async (req, res) => {
    try {
      if (!flagEnabled(isEnabled, req)) return disabledResponse(res);
      const result = await service('createAssessmentDraft', createAssessmentDraft)({ actor: req.user, db: await resolveDb(req) }, routeId(req.params.id, 'mustahik_id'), commandBody(req), commandMeta(req));
      return res.status(result?.replayed ? 200 : 201).json(result);
    } catch (error) { return errorResponse(res, error); }
  });
  app.put('/api/penyaluran/mustahik/:id/assessment/:assessmentId', authenticateToken, async (req, res) => {
    try {
      if (!flagEnabled(isEnabled, req)) return disabledResponse(res);
      const result = await service('saveAssessmentDraft', saveAssessmentDraft)({ actor: req.user, db: await resolveDb(req), mustahik_id: routeId(req.params.id, 'mustahik_id') }, routeId(req.params.assessmentId, 'assessment_id'), commandBody(req), commandMeta(req));
      return res.status(200).json(result);
    } catch (error) { return errorResponse(res, error); }
  });
  app.post('/api/penyaluran/mustahik/:id/assessment/:assessmentId/submit', authenticateToken, async (req, res) => {
    try {
      if (!flagEnabled(isEnabled, req)) return disabledResponse(res);
      const result = await service('submitAssessment', submitAssessment)({ actor: req.user, db: await resolveDb(req), mustahik_id: routeId(req.params.id, 'mustahik_id') }, routeId(req.params.assessmentId, 'assessment_id'), commandBody(req), commandMeta(req));
      return res.status(200).json(result);
    } catch (error) { return errorResponse(res, error); }
  });
  app.post('/api/penyaluran/mustahik/:id/assessment/:assessmentId/review', authenticateToken, async (req, res) => {
    try {
      if (!flagEnabled(isEnabled, req)) return disabledResponse(res);
      const result = await service('reviewAssessment', reviewAssessment)({ actor: req.user, db: await resolveDb(req), mustahik_id: routeId(req.params.id, 'mustahik_id') }, routeId(req.params.assessmentId, 'assessment_id'), commandBody(req), commandMeta(req));
      return res.status(200).json(result);
    } catch (error) { return errorResponse(res, error); }
  });

  app.get('/api/penyaluran/mustahik/:id/mpzis', authenticateToken, async (req, res) => {
    try {
      const result = await service('getMpzisCase', getMpzisCase)({ actor: req.user, db: await resolveDb(req) }, routeId(req.params.id, 'mustahik_id'), commandMeta(req));
      return res.status(200).json(result);
    } catch (error) { return errorResponse(res, error); }
  });
  app.post('/api/penyaluran/mustahik/:id/mpzis/drafts', authenticateToken, async (req, res) => {
    try {
      if (!flagEnabled(isEnabled, req)) return disabledResponse(res);
      const result = await service('createMpzisDraft', createMpzisDraft)({ actor: req.user, db: await resolveDb(req) }, routeId(req.params.id, 'mustahik_id'), commandBody(req), commandMeta(req));
      return res.status(result?.replayed ? 200 : 201).json(result);
    } catch (error) { return errorResponse(res, error); }
  });
  app.put('/api/penyaluran/mustahik/:id/mpzis/:mpzisId', authenticateToken, async (req, res) => {
    try {
      if (!flagEnabled(isEnabled, req)) return disabledResponse(res);
      const result = await service('saveMpzisDraft', saveMpzisDraft)({ actor: req.user, db: await resolveDb(req), mustahik_id: routeId(req.params.id, 'mustahik_id') }, routeId(req.params.mpzisId, 'mpzis_id'), commandBody(req), commandMeta(req));
      return res.status(200).json(result);
    } catch (error) { return errorResponse(res, error); }
  });
  app.post('/api/penyaluran/mustahik/:id/mpzis/:mpzisId/submit', authenticateToken, async (req, res) => {
    try {
      if (!flagEnabled(isEnabled, req)) return disabledResponse(res);
      const result = await service('submitMpzis', submitMpzis)({ actor: req.user, db: await resolveDb(req), mustahik_id: routeId(req.params.id, 'mustahik_id') }, routeId(req.params.mpzisId, 'mpzis_id'), commandBody(req), commandMeta(req));
      return res.status(200).json(result);
    } catch (error) { return errorResponse(res, error); }
  });
  app.post('/api/penyaluran/mustahik/:id/mpzis/:mpzisId/approvals/:step', authenticateToken, async (req, res) => {
    try {
      if (!MPZIS_STEPS.includes(req.params.step)) throw new P0Error('FIELD_INVALID', 'Langkah MPZIS tidak valid.', { status: 422, field_errors: { step: 'ENUM' } });
      if (!flagEnabled(isEnabled, req)) return disabledResponse(res);
      const result = await service('decideMpzisStep', decideMpzisStep)({ actor: req.user, db: await resolveDb(req), mustahik_id: routeId(req.params.id, 'mustahik_id') }, routeId(req.params.mpzisId, 'mpzis_id'), req.params.step, commandBody(req), commandMeta(req));
      return res.status(200).json(result);
    } catch (error) { return errorResponse(res, error); }
  });

  app.get('/api/penyaluran/mustahik/:id/ppd', authenticateToken, async (req, res) => {
    try {
      const result = await service('getPpdCase', getPpdCase)({ actor: req.user, db: await resolveDb(req) }, routeId(req.params.id, 'mustahik_id'), commandMeta(req));
      return res.status(200).json(result);
    } catch (error) { return errorResponse(res, error); }
  });
  app.post('/api/penyaluran/mustahik/:id/ppd/drafts', authenticateToken, async (req, res) => {
    try {
      if (!flagEnabled(isEnabled, req)) return disabledResponse(res);
      const result = await service('createPpdDraft', createPpdDraft)({ actor: req.user, db: await resolveDb(req) }, routeId(req.params.id, 'mustahik_id'), commandBody(req), commandMeta(req));
      return res.status(result?.replayed ? 200 : 201).json(result);
    } catch (error) { return errorResponse(res, error); }
  });
  app.put('/api/penyaluran/mustahik/:id/ppd/:ppdId', authenticateToken, async (req, res) => {
    try {
      if (!flagEnabled(isEnabled, req)) return disabledResponse(res);
      const result = await service('savePpdDraft', savePpdDraft)({ actor: req.user, db: await resolveDb(req), mustahik_id: routeId(req.params.id, 'mustahik_id') }, routeId(req.params.ppdId, 'ppd_id'), commandBody(req), commandMeta(req));
      return res.status(200).json(result);
    } catch (error) { return errorResponse(res, error); }
  });
  app.post('/api/penyaluran/mustahik/:id/ppd/:ppdId/submit', authenticateToken, async (req, res) => {
    try {
      if (!flagEnabled(isEnabled, req)) return disabledResponse(res);
      const result = await service('submitPpd', submitPpd)({ actor: req.user, db: await resolveDb(req), mustahik_id: routeId(req.params.id, 'mustahik_id') }, routeId(req.params.ppdId, 'ppd_id'), commandBody(req), commandMeta(req));
      return res.status(200).json(result);
    } catch (error) { return errorResponse(res, error); }
  });
  for (const [path, name, fallback] of [
    ['finance-check', 'financeCheckPpd', financeCheckPpd],
    ['finance-approve', 'financeApprovePpd', financeApprovePpd],
  ]) app.post(`/api/penyaluran/mustahik/:id/ppd/:ppdId/${path}`, authenticateToken, async (req, res) => {
    try {
      if (!flagEnabled(isEnabled, req)) return disabledResponse(res);
      const result = await service(name, fallback)({ actor: req.user, db: await resolveDb(req), mustahik_id: routeId(req.params.id, 'mustahik_id') }, routeId(req.params.ppdId, 'ppd_id'), commandBody(req), commandMeta(req));
      return res.status(200).json(result);
    } catch (error) { return errorResponse(res, error); }
  });

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  const uploadField = (field) => (req, res, next) => upload.single(field)(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return errorResponse(res, new P0Error('ARTIFACT_TOO_LARGE', 'Ukuran berkas melebihi batas 10 MB.', { status: 413 }));
    return errorResponse(res, new P0Error('VALIDATION_FAILED', 'Multipart evidence tidak valid.', { status: 422 }));
  });
  const paymentRecord = services.recordPayment || recordPayment;
  const paymentVerify = services.verifyPayment || verifyPayment;
  const recipientConfirm = services.recordRecipientConfirmation || recordRecipientConfirmation;
  const complete = services.completeDistribution || completeDistribution;
  const p0CommandContext = async (req) => ({ actor: req.user, db: await resolveDb(req), mustahik_id: routeId(req.params.id, 'mustahik_id'), artifactRoot });
  app.post('/api/penyaluran/mustahik/:id/ppd/:ppdId/payment', authenticateToken, uploadField('proof'), async (req, res) => {
    try {
      if (!flagEnabled(isEnabled, req)) return disabledResponse(res);
      const body = { ...commandBody(req), file: req.file ? { buffer: req.file.buffer, originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size } : undefined };
      const result = await paymentRecord(await p0CommandContext(req), routeId(req.params.ppdId, 'ppd_id'), body, commandMeta(req));
      return res.status(result?.replayed ? 200 : 201).json(result);
    } catch (error) { return errorResponse(res, error); }
  });
  app.post('/api/penyaluran/mustahik/:id/ppd/:ppdId/payment/verify', authenticateToken, async (req, res) => {
    try {
      if (!flagEnabled(isEnabled, req)) return disabledResponse(res);
      const result = await paymentVerify(await p0CommandContext(req), routeId(req.params.ppdId, 'ppd_id'), commandBody(req), commandMeta(req));
      return res.status(200).json(result);
    } catch (error) { return errorResponse(res, error); }
  });
  app.post('/api/penyaluran/mustahik/:id/ppd/:ppdId/recipient-confirmation', authenticateToken, uploadField('evidence'), async (req, res) => {
    try {
      if (!flagEnabled(isEnabled, req)) return disabledResponse(res);
      const body = { ...commandBody(req), evidence_file: req.file ? { buffer: req.file.buffer, originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size } : undefined };
      const result = await recipientConfirm(await p0CommandContext(req), routeId(req.params.ppdId, 'ppd_id'), body, commandMeta(req));
      return res.status(result?.replayed ? 200 : 201).json(result);
    } catch (error) { return errorResponse(res, error); }
  });
  app.post('/api/penyaluran/mustahik/:id/ppd/:ppdId/complete', authenticateToken, async (req, res) => {
    try {
      if (!flagEnabled(isEnabled, req)) return disabledResponse(res);
      const context = await p0CommandContext(req);
      const ppdId = routeId(req.params.ppdId, 'ppd_id');
      const result = await complete(context, ppdId, commandBody(req), commandMeta(req));
      if (!result?.replayed && String(result?.data?.status || '').toLowerCase() === 'completed') {
        const generate = services.processReceiptJob || processReceiptJob;
        void Promise.resolve(generate(ppdId, { db: context.db, artifactRoot })).catch(() => {});
      }
      return res.status(200).json(result);
    } catch (error) { return errorResponse(res, error); }
  });

  // Artifact reads are part of the canonical P0 registration.  They deliberately
  // do not share the legacy public /uploads namespace or its disk middleware.
  const openArtifact = services.openArtifactForActor || openArtifactForActor;
  const streamArtifact = services.streamAuditedArtifact || streamAuditedArtifact;
  const authorizeCase = services.authorizeCaseRead || authorizeCaseRead;
  const getReceiptStatus = services.getReceiptStatus || (async ({ db: requestDb, mustahikId, ppdId }) => requestDb.get(
    "SELECT id,mustahik_id,revision,status,source,receipt_status,receipt_error,receipt_file_id,receipt_payload_sha256,receipt_file_sha256 FROM ppd WHERE id=$1 AND mustahik_id=$2 AND source='p0'",
    [ppdId, mustahikId],
  ));
  const artifactRead = (receipt = false) => async (req, res) => {
    let opened;
    try {
      const mustahikId = routeId(req.params.id, 'mustahik_id');
      const fileId = routeId(req.params.fileId, 'file_id');
      const requestedDisposition = req.query?.disposition;
      if (!receipt && requestedDisposition !== undefined && !['inline', 'attachment'].includes(requestedDisposition)) {
        throw new P0Error('FIELD_INVALID', 'disposition tidak valid.', { status: 400, field_errors: { disposition: 'ENUM' } });
      }
      const requestDb = await resolveDb(req);
      opened = await openArtifact({ db: requestDb, actor: req.user, mustahik_id: mustahikId, fileId, artifactRoot, requireAssignment: true });
      if (receipt && opened.file.kind !== 'system_receipt_pdf') {
        throw new P0Error('ARTIFACT_NOT_FOUND', 'Berkas tanda terima tidak ditemukan.', { status: 404 });
      }
      return await streamArtifact({ db: requestDb, req, response: res, actor: req.user, file: opened.file, opened, disposition: receipt ? 'attachment' : requestedDisposition, receipt });
    } catch (error) {
      if (opened?.handle?.close) await opened.handle.close().catch(() => {});
      return errorResponse(res, error);
    }
  };
  app.get('/api/penyaluran/mustahik/:id/documents/:documentId', authenticateToken, async (req, res) => {
    try {
      const mustahikId = routeId(req.params.id, 'mustahik_id');
      const documentId = routeId(req.params.documentId, 'document_id');
      const requestDb = await resolveDb(req);
      await authorizeCase(requestDb, mustahikId, req.user, { requireAssignment: true });
      const document = await requestDb.get('SELECT id,mustahik_id,filename,original_name FROM documents WHERE id=$1 AND mustahik_id=$2', [documentId, mustahikId]);
      if (!document) throw new P0Error('ARTIFACT_NOT_FOUND', 'Berkas tidak ditemukan.', { status: 404 });
      const uploadPath = resolveUploadPath(uploadRoot, document.filename);
      if (!uploadPath) throw new P0Error('ARTIFACT_NOT_FOUND', 'Berkas tidak ditemukan.', { status: 404 });
      let realPath;
      try {
        realPath = await fs.realpath(uploadPath);
      } catch (error) {
        if (error && error.code === 'ENOENT') throw new P0Error('ARTIFACT_NOT_FOUND', 'Berkas tidak ditemukan.', { status: 404 });
        throw error;
      }
      const realRoot = await fs.realpath(path.resolve(uploadRoot));
      if (!isUploadPathContained(realRoot, realPath)) throw new P0Error('ARTIFACT_NOT_FOUND', 'Berkas tidak ditemukan.', { status: 404 });
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.download(realPath, document.original_name || document.filename, (error) => {
        if (!error || res.headersSent) return;
        if (error.code === 'ENOENT') return res.status(404).json(new P0Error('ARTIFACT_NOT_FOUND', 'Berkas tidak ditemukan.', { status: 404 }).toJSON());
        return res.status(500).json({ success: false, code: 'P0_INTERNAL_ERROR', message: 'Terjadi kesalahan sistem.' });
      });
    } catch (error) { return errorResponse(res, error); }
  });
  app.get('/api/penyaluran/mustahik/:id/artifacts/:fileId', authenticateToken, artifactRead(false));
  app.get('/api/penyaluran/mustahik/:id/artifacts/:fileId/receipt', authenticateToken, artifactRead(true));
  app.get('/api/penyaluran/mustahik/:id/ppd/:ppdId/receipt', authenticateToken, async (req, res) => {
    let opened;
    try {
      const mustahikId = routeId(req.params.id, 'mustahik_id');
      const ppdId = routeId(req.params.ppdId, 'ppd_id');
      const requestDb = await resolveDb(req);
      await authorizeCase(requestDb, mustahikId, req.user, { requireAssignment: true, artifactKind: 'system_receipt_pdf' });
      const receipt = await getReceiptStatus({ db: requestDb, mustahikId, ppdId, actor: req.user });
      if (!receipt || Number(receipt.mustahik_id) !== mustahikId) throw new P0Error('ARTIFACT_NOT_FOUND', 'Berkas tanda terima tidak ditemukan.', { status: 404 });
      if (String(receipt.source || '').toLowerCase() !== 'p0') throw new P0Error('ARTIFACT_NOT_FOUND', 'Berkas tanda terima tidak ditemukan.', { status: 404 });
      if (!['completed', 'complete'].includes(String(receipt.status || '').toLowerCase())) throw new P0Error('WRONG_STATE', 'Bukti digital hanya tersedia setelah penyelesaian.', { status: 409 });
      const status = String(receipt.receipt_status || '').toLowerCase();
      if (status === 'failed') throw new P0Error('RECEIPT_GENERATION_FAILED', 'Bukti digital gagal dibuat.', { status: 503 });
      if (status !== 'ready') throw new P0Error('RECEIPT_PENDING', 'Bukti digital sedang diproses.', { status: 409 });
      if (receipt.receipt_file_id === null || receipt.receipt_file_id === undefined) throw new P0Error('RECEIPT_FILE_MISSING', 'Berkas tanda terima tidak ditemukan.', { status: 503 });
      const persistedFileHash = String(receipt.receipt_file_sha256 || '').trim().toLowerCase();
      if (!SHA256.test(persistedFileHash)) throw new P0Error('RECEIPT_FILE_MISSING', 'Hash berkas tanda terima tidak tersedia.', { status: 503 });
      const fileId = routeId(receipt.receipt_file_id, 'file_id');
      opened = await openArtifact({ db: requestDb, actor: req.user, mustahik_id: mustahikId, fileId, artifactRoot, requireAssignment: true });
      const artifactHash = String(opened.file.sha256 || '').trim().toLowerCase();
      if (opened.file.kind !== 'system_receipt_pdf'
        || opened.file.artifact_type !== 'ppd'
        || Number(opened.file.artifact_id) !== ppdId
        || (receipt.revision !== undefined && receipt.revision !== null && Number(opened.file.artifact_revision) !== Number(receipt.revision))
        || !SHA256.test(artifactHash)
        || artifactHash !== persistedFileHash) {
        throw new P0Error('RECEIPT_FILE_MISSING', 'Berkas tanda terima tidak ditemukan.', { status: 503 });
      }
      return await streamArtifact({ db: requestDb, req, response: res, actor: req.user, file: opened.file, opened, disposition: 'attachment', receipt: true });
    } catch (error) {
      if (opened?.handle?.close) await opened.handle.close().catch(() => {});
      return errorResponse(res, error);
    }
  });

  // Admin Legacy Reconciliation & Recovery Routes
  app.post('/api/admin/penyaluran/mustahik/:id/reconcile/start', authenticateToken, async (req, res) => {
    try {
      const mustahikId = routeId(req.params.id, 'mustahik_id');
      const requestDb = await resolveDb(req);
      const result = await beginLegacyReconciliation({ actor: req.user, db: requestDb }, mustahikId, commandBody(req), commandMeta(req));
      return res.status(200).json(result);
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  app.post('/api/admin/penyaluran/mustahik/:id/reconcile/complete', authenticateToken, async (req, res) => {
    try {
      const mustahikId = routeId(req.params.id, 'mustahik_id');
      const requestDb = await resolveDb(req);
      const result = await completeLegacyReconciliation({ actor: req.user, db: requestDb, artifactRoot }, mustahikId, commandBody(req), commandMeta(req));
      return res.status(200).json(result);
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  app.post('/api/admin/penyaluran/recovery/artifacts/:artifactType/:artifactId/:revision/steps/:step', authenticateToken, async (req, res) => {
    try {
      const { artifactType, step } = req.params;
      const artifactId = routeId(req.params.artifactId, 'artifact_id');
      const revision = routeId(req.params.revision, 'revision');
      const requestDb = await resolveDb(req);
      const result = await recoverArtifactStep(
        { actor: req.user, db: requestDb },
        { artifactType, artifactId, revision, step },
        commandBody(req),
        commandMeta(req),
      );
      return res.status(200).json(result);
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  return app;
}
