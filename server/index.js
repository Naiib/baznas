import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import compression from 'compression';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { pathToFileURL } from 'url';
import { getDb, initDb, LEGACY_MUSTAHIK_WRITABLE_COLUMNS } from './db.js';
import {
  listMustahik,
  getMustahikById,
  createMustahik,
  updateMustahik,
  deleteMustahik,
  addAssessment,
  addMpzis,
  addPpd,
  addDocument,
  getDocuments,
  findUploadMetadata,
  createPublicApplication,
  trackApplication,
  generateWaMessage,
  addWaLog,
  getWaLogs,
  exportMustahikData,
  getMustahikStats,
  getDataOverview,
  findUserByEmail,
  findUserById,
  listUsers,
  updateUserLastLogin,
  updateUserAccess,
  createAuthSession,
  isAuthSessionActive,
  revokeAuthSession,
  createUser,
  getPenyaluranOverview,
  getPenyaluranByKecamatan,
  listPenyaluranTransactions,
  listMasterData,
  createMasterData,
  updateMasterData,
  getPilarPrograms,
  addPilarInitiative,
  updatePilarInitiative,
  deletePilarInitiative,
  getMustahikStageCounts,
  submitMustahikDecision,
  getApprovalDecisions,
  importMustahikBatch,
  appendActivityLog,
  getActivityLogs,
  getLaporanList,
  generateLaporan,
  exportLaporanData,
  getLaporanExportData,
  getPenerimaanOverview,
  listPenerimaanTransactions,
  getPenerimaanTransactionById,
  bulkValidatePenerimaanTransactions,
  createManualPenerimaanTransaction,
  validatePenerimaanTransactionById,
  approvePenerimaanTransactionById,
  rejectPenerimaanTransactionById,
  requestClarificationPenerimaanTransaction,
  resolveClarificationPenerimaanTransaction,
  reversePenerimaanTransactionById,
  listMuzakki,
  getMuzakkiById,
  createMuzakki,
  updateMuzakki,
  getDuplicateMuzakkiSuggestions,
  mergeMuzakki,
  listPenerimaanAuditLogs,
  recordRawWebhookEvent,
  processRawWebhookEvent,
  listRawWebhookEvents,
  retryRawWebhookEvent,
  processTransactionImport,
  getImportJobById,
  createReconciliationBatch,
  listReconciliationBatches,
  getReconciliationBatchById,
  importStatementLines,
  autoMatchBatchStatements,
  matchStatementLine,
  unmatchStatementLine,
  closeReconciliationBatch,
  normalizeReportFilters,
  decryptProviderSecret,
  getPenerimaanReportSummary,
  getPenerimaanReportTransactions,
  createPenerimaanExportJob,
  getPenerimaanExportJob,
  markPenerimaanExportJobProcessing,
  completePenerimaanExportJob,
  failPenerimaanExportJob,
  getPenerimaanSettings,
  updatePenerimaanSettings,
  listPenerimaanChannels,
  createPenerimaanChannel,
  updatePenerimaanChannel,
  listPenerimaanAccounts,
  createPenerimaanAccount,
  updatePenerimaanAccount,
  listPenerimaanFundCategories,
  createPenerimaanFundCategory,
  updatePenerimaanFundCategory,
  listPenerimaanProviderConfigs,
  updatePenerimaanProviderConfig,
  getPenerimaanAggregatesForPenyaluran,
} from './repository.js';
import {
  generatePenerimaanPdfReport,
  generatePenerimaanExcelReport,
} from './penerimaan-export.js';
import {
  canViewPenerimaanReport,
  canExportPenerimaanReport,
  canManagePenerimaanSettings,
} from './penerimaan-permissions.js';
import { verifyWebhookSignature, resolveWebhookSecret } from './webhook-verification.js';
import { resolveConfiguredProviderSecret, assertNoPlaintextProviderSecrets, getProviderSecretEncryptionKey } from './penerimaan-provider-secrets.js';
import { processPenerimaanExportJob, getExportDirectory, runPenerimaanExportStartupMaintenance } from './penerimaan-export-jobs.js';
import { generateExcelReport, generatePdfReport } from './report_generator.js';
import { requireAnyRole, requireAuth, requireProductionSecret } from './access-policy.js';
import { createFixedWindowLimiter, rateLimit } from './request-rate-limit.js';
import { isLegacyPenerimaanFrozen, legacyPenerimaanReadOnlyGuard, getLegacyPenerimaanFreezeNotice } from './legacy-freeze.js';
import { getDatabaseHealth } from './health.js';
import { canDownloadUpload, isUploadPathContained, normalizeUploadFilename, resolveUploadPath } from './upload-download-policy.js';
import { bootstrapSecrets } from './secrets.js';
import { createP0Mustahik, P0_INTAKE_FIELDS, resolveP0PublicIntakeActor } from './penyaluran-p0/intake-service.js';
import { getAssessmentCase, createAssessmentDraft, saveAssessmentDraft, submitAssessment, reviewAssessment } from './penyaluran-p0/assessment-service.js';
import { p0FlagGate, registerPenyaluranP0Routes } from './penyaluran-p0/routes.js';
import { openArtifactForActor, streamAuditedArtifact, createP0ArtifactUpload, validateArtifactBytes } from './penyaluran-p0/artifact-files.js';
import { normalizePublicApplicant, validateSuratPermohonanInput, streamSuratPermohonanPdf } from './public-surat-permohonan.js';
import { processReceiptJob, resumePendingReceiptJobs } from './penyaluran-p0/receipt-jobs.js';
import {
  isP0CutoverActive,
  isPenyaluranP0Enabled,
  assertP0CutoverConfiguration,
  legacyPenyaluranWriteGuard,
  legacyHardDeleteGuard,
  archiveCase,
  restoreCase,
} from './penyaluran-p0/legacy-reconciliation.js';
import { P0Error } from './penyaluran-p0/errors.js';

dotenv.config();
bootstrapSecrets();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;
const uploadDir = process.env.UPLOAD_DIR || './uploads';
const loginRateLimit = rateLimit(createFixedWindowLimiter({ limit: 5, windowMs: 15 * 60 * 1000 }), (req) => `${req.ip}:${String(req.body?.email || req.body?.username || '').toLowerCase()}`);
const publicTrackingRateLimit = rateLimit(createFixedWindowLimiter({ limit: 10, windowMs: 10 * 60 * 1000 }));
const publicApplicationRateLimit = rateLimit(createFixedWindowLimiter({ limit: 3, windowMs: 60 * 60 * 1000 }));

// ==========================================
// IN-MEMORY HIGH PERFORMANCE CACHE ENGINE
// ==========================================
class MemoryCache {
  constructor(defaultTtlSeconds = 60) {
    this.cache = new Map();
    this.defaultTtl = defaultTtlSeconds * 1000;
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      clears: 0
    };

    // Garbage collect expired keys every 60 seconds
    const interval = setInterval(() => this.cleanup(), 60000);
    if (interval.unref) interval.unref();
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return item.data;
  }

  set(key, data, ttlSeconds = null) {
    const ttl = ttlSeconds ? ttlSeconds * 1000 : this.defaultTtl;
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now()
    });
    this.stats.sets++;
  }

  del(key) {
    return this.cache.delete(key);
  }

  delPattern(pattern) {
    let count = 0;
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern.replace('*', '.*'));
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  clear() {
    this.cache.clear();
    this.stats.clears++;
  }

  cleanup() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRatio = totalRequests > 0 ? ((this.stats.hits / totalRequests) * 100).toFixed(2) + '%' : '0%';
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRatio,
      sets: this.stats.sets,
      clears: this.stats.clears,
      memoryUsage: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`
    };
  }
}

export const memoryCache = new MemoryCache(60);

/**
 * Middleware for caching JSON responses in memory with TTL
 */
export function cacheMiddleware(ttlSeconds = 60) {
  return (req, res, next) => {
    if (req.method !== 'GET') return next();

    const principal = req.user ? `${req.user.id}:${req.user.role}` : 'public';
    const key = `req:${principal}:${req.originalUrl || req.url}`;
    const cached = memoryCache.get(key);

    if (cached !== null) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-TTL', `${ttlSeconds}s`);
      return res.json(cached);
    }

    res.setHeader('X-Cache', 'MISS');
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        memoryCache.set(key, body, ttlSeconds);
      }
      return originalJson(body);
    };

    next();
  };
}

/**
 * Invalidate cache helper called whenever database data mutations occur
 */
export function invalidateCache(patterns = ['req:/api/mustahik*', 'req:/api/data*', 'req:/api/penyaluran*', 'req:/api/activity*', 'req:/api/penerimaan*']) {
  patterns.forEach(p => {
    const normalized = p.startsWith('req:/api') ? p.replace('req:/api', 'req:(.*:)?/api') : p;
    memoryCache.delPattern(normalized);
  });
}

// ==========================================
// MIDDLEWARES (Compression, CORS, Parsing)
// ==========================================

// 1. Response-Time Tracker Header
app.use((req, res, next) => {
  const start = process.hrtime();
  const originalSend = res.send.bind(res);
  res.send = function (body) {
    if (!res.headersSent) {
      const diff = process.hrtime(start);
      const timeMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
      res.setHeader('X-Response-Time', `${timeMs}ms`);
    }
    return originalSend(body);
  };
  next();
});

// 2. Gzip / Deflate Response Compression Middleware
app.use(compression({
  level: 6,
  threshold: 512, // Compress any response payload >= 512 bytes
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

const LOCAL_DEVELOPMENT_ORIGINS = Object.freeze([
  'http://localhost:3000',
  'http://localhost:5173',
]);

export function buildCorsOptions({
  nodeEnv = process.env.NODE_ENV,
  frontendUrl = process.env.FRONTEND_URL,
} = {}) {
  const configuredOrigins = String(frontendUrl || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = new Set([
    ...configuredOrigins,
    ...(nodeEnv === 'production' ? [] : LOCAL_DEVELOPMENT_ORIGINS),
  ]);

  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      const error = new Error('Origin tidak diizinkan');
      error.code = 'CORS_ORIGIN_DENIED';
      error.status = 403;
      return callback(error);
    },
  };
}

app.use(cors(buildCorsOptions()));
// Must precede express.json so a disabled P0 command cannot parse or inspect a body.
app.use('/api/penyaluran/mustahik', p0FlagGate({
  isEnabled: () => process.env.PENYALURAN_P0_ENABLED === 'true',
}));
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads/exports', (_req, res) => {
  res.status(404).json({ success: false, message: 'Direktori ekspor tidak tersedia secara publik.' });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const extension = path.extname(path.basename(file.originalname)).toLowerCase();
    const unique = `${randomUUID()}${extension}`;
    cb(null, unique);
  },
});

const UPLOAD_EXTENSIONS_BY_MIME = Object.freeze({
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, callback) => {
    const allowedExtensions = UPLOAD_EXTENSIONS_BY_MIME[file.mimetype];
    const extension = path.extname(path.basename(file.originalname)).toLowerCase();
    if (!allowedExtensions?.includes(extension)) {
      const error = new Error('Jenis file tidak didukung. Gunakan PDF, JPEG, atau PNG.');
      error.code = 'UPLOAD_VALIDATION_FAILED';
      error.status = 422;
      return callback(error);
    }
    return callback(null, true);
  },
});

const publicLegacyUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 + 1, files: 5 },
  fileFilter: (_req, file, callback) => {
    const allowedExtensions = UPLOAD_EXTENSIONS_BY_MIME[file.mimetype];
    const extension = path.extname(path.basename(file.originalname)).toLowerCase();
    if (!allowedExtensions?.includes(extension)) {
      const error = new Error(`Jenis file tidak didukung untuk berkas "${file.originalname}". Gunakan PDF, JPEG, atau PNG.`);
      error.code = 'UPLOAD_VALIDATION_FAILED';
      error.status = 422;
      return callback(error);
    }
    return callback(null, true);
  },
});

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const ext = path.extname(path.basename(file.originalname)).toLowerCase();
    if (!['.csv', '.xlsx', '.xls', '.txt'].includes(ext)) {
      const error = new Error('Jenis file tidak didukung. Gunakan CSV atau XLSX.');
      error.code = 'UPLOAD_VALIDATION_FAILED';
      error.status = 422;
      return callback(error);
    }
    return callback(null, true);
  },
});

app.locals.dataAccessRepository = {
  listMustahik,
  getMustahikById,
  createPublicApplication,
  trackApplication,
  exportLaporanData,
  appendActivityLog,
  updateUserAccess,
  getPenerimaanOverview,
  listPenerimaanTransactions,
  getPenerimaanTransactionById,
  bulkValidatePenerimaanTransactions,
  createManualPenerimaanTransaction,
  validatePenerimaanTransactionById,
  approvePenerimaanTransactionById,
  rejectPenerimaanTransactionById,
  requestClarificationPenerimaanTransaction,
  resolveClarificationPenerimaanTransaction,
  reversePenerimaanTransactionById,
  listMuzakki,
  getMuzakkiById,
  createMuzakki,
  updateMuzakki,
  getDuplicateMuzakkiSuggestions,
  mergeMuzakki,
  listPenerimaanAuditLogs,
  recordRawWebhookEvent,
  processRawWebhookEvent,
  listRawWebhookEvents,
  retryRawWebhookEvent,
  processTransactionImport,
  getImportJobById,
  createReconciliationBatch,
  listReconciliationBatches,
  getReconciliationBatchById,
  importStatementLines,
  autoMatchBatchStatements,
  matchStatementLine,
  unmatchStatementLine,
  closeReconciliationBatch,
  getPenerimaanReportSummary,
  getPenerimaanReportTransactions,
  createPenerimaanExportJob,
  getPenerimaanExportJob,
  getPenerimaanSettings,
  updatePenerimaanSettings,
  listPenerimaanChannels,
  updatePenerimaanChannel,
  listPenerimaanAccounts,
  updatePenerimaanAccount,
  getPenerimaanAggregatesForPenyaluran,
  findUploadMetadata,
};

app.locals.penyaluranP0Services = {
  createP0Mustahik,
  getAssessmentCase,
  createAssessmentDraft,
  saveAssessmentDraft,
  submitAssessment,
  reviewAssessment,
  openArtifactForActor,
  streamAuditedArtifact,
  createP0ArtifactUpload,
  processReceiptJob,
  resumePendingReceiptJobs,
};

// Route-level feature flag & read-only guard for legacy Penerimaan module during migration
app.use('/api/legacy/penerimaan', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && isLegacyPenerimaanFrozen()) {
    return legacyPenerimaanReadOnlyGuard(req, res, next);
  }
  next();
});

app.get('/api/legacy/penerimaan/status', (req, res) => {
  res.json({
    success: true,
    frozen: isLegacyPenerimaanFrozen(),
    readOnly: isLegacyPenerimaanFrozen(),
    message: getLegacyPenerimaanFreezeNotice(),
  });
});

// ==========================================
// HEALTH & CACHE DIAGNOSTIC APIS
// ==========================================

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const db = await getDb();
    const health = await getDatabaseHealth(db);
    res.json({ success: true, ...health, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ success: false, status: 'unavailable', checks: { database: 'unavailable' } });
  }
});

// Cache Stats & Telemetry
app.get('/api/cache/stats', authenticateToken, requireRole('admin'), (req, res) => {
  res.json({
    success: true,
    data: memoryCache.getStats()
  });
});

// Cache Flush
app.post('/api/cache/clear', authenticateToken, requireRole('admin'), (req, res) => {
  memoryCache.clear();
  res.json({
    success: true,
    message: 'In-memory cache flushed successfully',
    stats: memoryCache.getStats()
  });
});


// ==========================================
// AUTHENTICATION & MULTI-ROLE ACCESS CONTROL
// ==========================================
const JWT_SECRET = requireProductionSecret();

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ success: false, message: 'Akses ditolak: Token otentikasi tidak ditemukan.' });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    const legacyTestToken = process.env.NODE_ENV === 'test' && !user.jti;
    if (!legacyTestToken && (!user.jti || !await isAuthSessionActive(user.jti, user.id))) {
      return res.status(401).json({ success: false, message: 'Sesi telah berakhir. Silakan login kembali.' });
    }
    const currentUser = legacyTestToken ? null : await findUserById(user.id);
    if (!legacyTestToken && (!currentUser || !currentUser.is_active)) {
      return res.status(401).json({ success: false, message: 'Akun tidak aktif atau tidak ditemukan.' });
    }
    req.user = { ...user, level: currentUser?.level || user.level || 'staff' };
    return requireAuth(req, res, next);
  } catch {
    return res.status(401).json({ success: false, message: 'Sesi berakhir atau token tidak valid. Silakan login kembali.' });
  }
}

registerPenyaluranP0Routes(app, {
  authenticateToken,
  services: app.locals.penyaluranP0Services,
  isEnabled: () => process.env.PENYALURAN_P0_ENABLED === 'true',
  artifactRoot: process.env.PENYALURAN_ARTIFACT_DIR,
  getDb: () => getDb(),
});

export function requireRole(...allowedRoles) {
  return requireAnyRole(...allowedRoles);
}

app.get('/uploads/:filename', authenticateToken, async (req, res) => {
  const uploadPath = resolveUploadPath(uploadDir, req.params.filename);
  if (!uploadPath) {
    return res.status(400).json({ success: false, message: 'Nama berkas tidak valid.' });
  }

  const metadataResolver = req.app.locals.dataAccessRepository?.findUploadMetadata || findUploadMetadata;
  const metadata = await metadataResolver(path.basename(uploadPath));
  if (!metadata) {
    return res.status(404).json({ success: false, message: 'Berkas tidak ditemukan.' });
  }
  if (!canDownloadUpload(req.user, metadata.scope)) {
    return res.status(403).json({ success: false, message: 'Akses berkas dibatasi.' });
  }

  try {
    const [realUploadPath, realUploadRoot] = await Promise.all([
      fs.promises.realpath(uploadPath),
      fs.promises.realpath(uploadDir),
    ]);
    if (!isUploadPathContained(realUploadRoot, realUploadPath)) {
      return res.status(403).json({ success: false, message: 'Akses berkas dibatasi.' });
    }
    return res.sendFile(realUploadPath, { dotfiles: 'deny' }, (error) => {
      if (!error || res.headersSent) return;
      if (error.status === 404) return res.status(404).json({ success: false, message: 'Berkas tidak ditemukan.' });
      return res.status(500).json({ success: false, message: 'Berkas tidak dapat dikirim.' });
    });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return res.status(404).json({ success: false, message: 'Berkas tidak ditemukan.' });
    }
    console.error('Upload download error:', error);
    return res.status(500).json({ success: false, message: 'Berkas tidak dapat dikirim.' });
  }
});

// 1. Login Endpoint
app.post('/api/auth/login', loginRateLimit, async (req, res) => {
  try {
    const email = String(req.body?.email || req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email dan kata sandi wajib diisi' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Email atau kata sandi tidak cocok' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Email atau kata sandi tidak cocok' });
    }

    // Update last login
    await updateUserLastLogin(user.id);

    const jti = randomUUID();
    const tokenPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      division: user.division,
      level: user.level || 'staff',
      jti,
      avatar: user.avatar
    };

    const expiresInSeconds = 60 * 60;
    await createAuthSession({ jti, userId: user.id, expiresAt: new Date(Date.now() + (expiresInSeconds * 1000)).toISOString() });
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: expiresInSeconds });

    res.json({
      success: true,
      message: `Selamat datang, ${user.name}`,
      token,
      user: tokenPayload,
      data: {
        token,
        user: tokenPayload,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan sistem saat proses login' });
  }
});

// 2. Current User Profile Verification (Me)
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
    }
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        division: user.division,
        level: user.level || 'staff',
        avatar: user.avatar,
        last_login: user.last_login
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Logout Endpoint
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  await revokeAuthSession(req.user.jti, req.user.id);
  res.json({ success: true, message: 'Berhasil keluar dari sistem' });
});

// 4. User Management (Admin Only)
app.get('/api/auth/users', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const users = await listUsers();
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.patch('/api/auth/users/:id/access', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const repository = req.app.locals.dataAccessRepository || { updateUserAccess };
    const user = await repository.updateUserAccess(req.params.id, req.body || {});
    if (!user) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan.' });
    }
    return res.json({ success: true, data: user });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// ==========================================
// HIGH-SPEED AGGREGATE STATS APIS (<5ms via Cache)
// ==========================================

// Mustahik Aggregate Stats (KPI cards, charts, breakdowns)
app.get('/api/mustahik/stats', authenticateToken, requireRole('admin', 'penyaluran', 'surveyor', 'keuangan'), cacheMiddleware(60), async (req, res) => {
  try {
    const data = await getMustahikStats();
    res.json({ success: true, data });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Enterprise Data Overview (All entities summary)
app.get('/api/data/overview', authenticateToken, requireRole('admin', 'penyaluran', 'surveyor'), cacheMiddleware(60), async (req, res) => {
  try {
    const data = await getDataOverview();
    res.json({ success: true, data });
  } catch (err) {
    console.error('Overview error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// PENERIMAAN DOMAIN APIS
// ==========================================

// Penerimaan Overview & Dashboard Data (Period-aware)
app.get('/api/penerimaan/overview', authenticateToken, requireRole('admin', 'penerimaan'), cacheMiddleware(15), async (req, res) => {
  try {
    const repository = req.app.locals.dataAccessRepository || { getPenerimaanOverview };
    const overviewFn = repository.getPenerimaanOverview || getPenerimaanOverview;
    const data = await overviewFn({
      period: req.query.period || '30d',
      channel: req.query.channel,
      fund_type: req.query.fund_type,
      start_date: req.query.start_date,
      end_date: req.query.end_date,
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('Penerimaan overview error:', err);
    handlePenerimaanError(res, err, 'Gagal memuat overview penerimaan.');
  }
});

// Penerimaan Transactions List (Cursor-paginated, filtered)
app.get('/api/penerimaan/transaksi', authenticateToken, requireRole('admin', 'penerimaan'), cacheMiddleware(10), async (req, res) => {
  try {
    const repository = req.app.locals.dataAccessRepository || { listPenerimaanTransactions };
    const listFn = repository.listPenerimaanTransactions || listPenerimaanTransactions;
    const data = await listFn(req.query);
    res.json({ success: true, data });
  } catch (err) {
    console.error('List transactions error:', err);
    handlePenerimaanError(res, err, 'Gagal memuat transaksi penerimaan.');
  }
});

// Penerimaan Transaction Detail by ID
app.get('/api/penerimaan/transaksi/:id', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const repository = req.app.locals.dataAccessRepository || { getPenerimaanTransactionById };
    const getFn = repository.getPenerimaanTransactionById || getPenerimaanTransactionById;
    const data = await getFn(req.params.id, getPenerimaanActor(req));
    if (!data) {
      return res.status(404).json({ success: false, message: 'Transaksi penerimaan tidak ditemukan.' });
    }
    res.json({ success: true, data });
  } catch (err) {
    console.error('Get transaction detail error:', err);
    handlePenerimaanError(res, err, 'Gagal memuat detail transaksi penerimaan.');
  }
});

// Penerimaan Bulk Validation (Only policy-eligible transactions)
app.post('/api/penerimaan/transaksi/bulk-validate', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const { transaction_ids, notes } = req.body || {};
    const actor = {
      id: req.user?.id,
      name: req.user?.name || req.user?.username,
      role: req.user?.role,
      division: req.user?.division || (req.user?.role === 'penerimaan' ? 'penerimaan' : undefined),
      level: req.user?.level,
    };
    const repository = req.app.locals.dataAccessRepository || { bulkValidatePenerimaanTransactions };
    const bulkFn = repository.bulkValidatePenerimaanTransactions || bulkValidatePenerimaanTransactions;
    const result = await bulkFn({ transaction_ids, actor, notes });
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Bulk validate error:', err);
    handlePenerimaanError(res, err, 'Gagal memvalidasi transaksi secara massal.');
  }
});

function getPenerimaanActor(req) {
  return {
    id: req.user?.id,
    name: req.user?.name || req.user?.username || 'User Penerimaan',
    role: req.user?.role,
    division: req.user?.division || (req.user?.role === 'penerimaan' ? 'penerimaan' : undefined),
    level: req.user?.level,
    correlation_id: req.headers?.['x-correlation-id'] || null,
  };
}

function handlePenerimaanError(res, err, defaultMessage = 'Terjadi kesalahan pada transaksi penerimaan.') {
  const status = Number(err.status) || (err.message?.includes('tidak ditemukan') ? 404 : 500);
  const requestedCorrelationId = res.req?.headers?.['x-correlation-id'];
  const correlationId = String(requestedCorrelationId || randomUUID()).slice(0, 100);
  res.setHeader('x-correlation-id', correlationId);
  const isClientError = status >= 400 && status < 500;
  res.status(status).json({
    success: false,
    message: isClientError ? (err.message || defaultMessage) : 'Terjadi kesalahan sistem.',
    correlation_id: correlationId,
    ...(isClientError && (err.code || status === 409) ? { code: err.code || 'CONFLICT' } : {}),
  });
}

// 1. Manual Transaction Intake
app.post('/api/penerimaan/transaksi/manual', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const repository = req.app.locals.dataAccessRepository || { createManualPenerimaanTransaction };
    const createFn = repository.createManualPenerimaanTransaction || createManualPenerimaanTransaction;
    const data = await createFn(req.body, actor);
    res.status(201).json({ success: true, data });
  } catch (err) {
    console.error('Create manual transaction error:', err);
    handlePenerimaanError(res, err, 'Gagal mencatat transaksi manual penerimaan.');
  }
});

// 2. Upload Evidence / Bukti Setor
app.post('/api/penerimaan/transaksi/bukti', authenticateToken, requireRole('admin', 'penerimaan'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File bukti transaksi wajib diunggah.' });
    }
    const publicUrl = `/uploads/${req.file.filename}`;
    res.status(201).json({
      success: true,
      data: {
        file_url: publicUrl,
        file_name: req.file.originalname,
        filename: req.file.filename,
        original_name: req.file.originalname,
        size: req.file.size,
        mime_type: req.file.mimetype,
        url: publicUrl,
        attachment_url: publicUrl,
      },
    });
  } catch (err) {
    console.error('Upload bukti error:', err);
    handlePenerimaanError(res, err, 'Gagal mengunggah bukti transaksi.');
  }
});

// 3. Single Transaction Validate
app.post('/api/penerimaan/transaksi/:id/validate', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const repository = req.app.locals.dataAccessRepository || { validatePenerimaanTransactionById };
    const validateFn = repository.validatePenerimaanTransactionById || validatePenerimaanTransactionById;
    const data = await validateFn({
      id: req.params.id,
      actor,
      notes: req.body?.notes,
      expected_version: req.body?.expected_version,
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('Validate transaction error:', err);
    handlePenerimaanError(res, err, 'Gagal memvalidasi transaksi penerimaan.');
  }
});

// 4. Single Transaction Approve
app.post('/api/penerimaan/transaksi/:id/approve', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const repository = req.app.locals.dataAccessRepository || { approvePenerimaanTransactionById };
    const approveFn = repository.approvePenerimaanTransactionById || approvePenerimaanTransactionById;
    const data = await approveFn({
      id: req.params.id,
      actor,
      notes: req.body?.notes,
      expected_version: req.body?.expected_version,
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('Approve transaction error:', err);
    handlePenerimaanError(res, err, 'Gagal menyetujui transaksi penerimaan.');
  }
});

// 5. Single Transaction Reject
app.post('/api/penerimaan/transaksi/:id/reject', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const repository = req.app.locals.dataAccessRepository || { rejectPenerimaanTransactionById };
    const rejectFn = repository.rejectPenerimaanTransactionById || rejectPenerimaanTransactionById;
    const data = await rejectFn({
      id: req.params.id,
      actor,
      reason: req.body?.reason || req.body?.notes,
      expected_version: req.body?.expected_version,
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('Reject transaction error:', err);
    handlePenerimaanError(res, err, 'Gagal menolak transaksi penerimaan.');
  }
});

// 6. Request Clarification
app.post('/api/penerimaan/transaksi/:id/request-clarification', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const repository = req.app.locals.dataAccessRepository || { requestClarificationPenerimaanTransaction };
    const reqFn = repository.requestClarificationPenerimaanTransaction || requestClarificationPenerimaanTransaction;
    const data = await reqFn({
      id: req.params.id,
      actor,
      notes: req.body?.notes,
      expected_version: req.body?.expected_version,
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('Request clarification error:', err);
    handlePenerimaanError(res, err, 'Gagal mengajukan klarifikasi transaksi penerimaan.');
  }
});

// 7. Resolve Clarification
app.post('/api/penerimaan/transaksi/:id/resolve-clarification', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const repository = req.app.locals.dataAccessRepository || { resolveClarificationPenerimaanTransaction };
    const resFn = repository.resolveClarificationPenerimaanTransaction || resolveClarificationPenerimaanTransaction;
    const data = await resFn({
      id: req.params.id,
      actor,
      notes: req.body?.notes,
      expected_version: req.body?.expected_version,
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('Resolve clarification error:', err);
    handlePenerimaanError(res, err, 'Gagal menyelesaikan klarifikasi transaksi penerimaan.');
  }
});

// 8. Reverse Transaction
app.post('/api/penerimaan/transaksi/:id/reverse', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const repository = req.app.locals.dataAccessRepository || { reversePenerimaanTransactionById };
    const revFn = repository.reversePenerimaanTransactionById || reversePenerimaanTransactionById;
    const data = await revFn({
      id: req.params.id,
      actor,
      reason: req.body?.reason || req.body?.notes,
      expected_version: req.body?.expected_version,
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('Reverse transaction error:', err);
    handlePenerimaanError(res, err, 'Gagal membalikkan transaksi penerimaan.');
  }
});

// ==========================================
// PENERIMAAN MUZAKKI & AUDIT DOMAIN APIS
// ==========================================

// 1. List Muzakki (Cursor-paginated, search & filter, role-aware PII masking)
app.get('/api/penerimaan/muzakki', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const repository = req.app.locals.dataAccessRepository || { listMuzakki };
    const listFn = repository.listMuzakki || listMuzakki;
    const data = await listFn({
      search: req.query.search,
      type: req.query.type,
      city: req.query.city,
      cursor: req.query.cursor,
      limit: req.query.limit,
      actor,
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('List muzakki error:', err);
    handlePenerimaanError(res, err, 'Gagal memuat daftar muzakki.');
  }
});

// 2. Duplicate Muzakki Suggestions (MUST precede /:id)
app.get('/api/penerimaan/muzakki/duplicates', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const repository = req.app.locals.dataAccessRepository || { getDuplicateMuzakkiSuggestions };
    const dupFn = repository.getDuplicateMuzakkiSuggestions || getDuplicateMuzakkiSuggestions;
    const data = await dupFn(actor);
    res.json({ success: true, data });
  } catch (err) {
    console.error('Get duplicate muzakki error:', err);
    handlePenerimaanError(res, err, 'Gagal memuat saran duplikat muzakki.');
  }
});

// 3. Get Muzakki by ID (Detail with donation summary & history)
app.get('/api/penerimaan/muzakki/:id', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const repository = req.app.locals.dataAccessRepository || { getMuzakkiById };
    const getFn = repository.getMuzakkiById || getMuzakkiById;
    const data = await getFn(req.params.id, actor);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Data muzakki tidak ditemukan.' });
    }
    res.json({ success: true, data });
  } catch (err) {
    console.error('Get muzakki by ID error:', err);
    handlePenerimaanError(res, err, 'Gagal memuat profil muzakki.');
  }
});

// 4. Create Muzakki Profile
app.post('/api/penerimaan/muzakki', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const repository = req.app.locals.dataAccessRepository || { createMuzakki };
    const createFn = repository.createMuzakki || createMuzakki;
    const data = await createFn(req.body, actor);
    res.status(201).json({ success: true, data });
  } catch (err) {
    console.error('Create muzakki error:', err);
    handlePenerimaanError(res, err, 'Gagal membuat profil muzakki.');
  }
});

// 5. Update Muzakki Profile
app.put('/api/penerimaan/muzakki/:id', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const repository = req.app.locals.dataAccessRepository || { updateMuzakki };
    const updateFn = repository.updateMuzakki || updateMuzakki;
    const data = await updateFn(req.params.id, req.body, actor);
    res.json({ success: true, data });
  } catch (err) {
    console.error('Update muzakki error:', err);
    handlePenerimaanError(res, err, 'Gagal memperbarui profil muzakki.');
  }
});

// 6. Merge Duplicate Muzakki Profiles
app.post('/api/penerimaan/muzakki/merge', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const repository = req.app.locals.dataAccessRepository || { mergeMuzakki };
    const mergeFn = repository.mergeMuzakki || mergeMuzakki;
    const data = await mergeFn({
      primary_id: req.body?.primary_id,
      duplicate_ids: req.body?.duplicate_ids,
      actor,
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('Merge muzakki error:', err);
    handlePenerimaanError(res, err, 'Gagal menggabungkan profil muzakki.');
  }
});

// 7. Audit Trail Logs (Cursor-paginated immutable audit history)
app.get('/api/penerimaan/audit', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const repository = req.app.locals.dataAccessRepository || { listPenerimaanAuditLogs };
    const listFn = repository.listPenerimaanAuditLogs || listPenerimaanAuditLogs;
    const data = await listFn({
      entity_type: req.query.entity_type,
      entity_id: req.query.entity_id,
      actor_id: req.query.actor_id,
      action: req.query.action,
      cursor: req.query.cursor,
      limit: req.query.limit,
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('List penerimaan audit logs error:', err);
    handlePenerimaanError(res, err, 'Gagal memuat log audit penerimaan.');
  }
});

// ==========================================
// PENERIMAAN INGESTION & RECONCILIATION APIS (Task 10)
// ==========================================

// 8. Signed Webhook Ingestion Endpoint
async function handlePenerimaanWebhookIngestion(req, res) {
  try {
    const provider = req.params.provider || 'portal';
    const signature =
      req.headers['x-signature'] ||
      req.headers['x-webhook-signature'] ||
      req.headers['signature'] ||
      req.body?.signature;

    let secret = null;
    try {
      const repository = req.app.locals.dataAccessRepository || {};
      const db = await (repository.getDb ? repository.getDb() : getDb());
      secret = await resolveConfiguredProviderSecret(provider, db);
    } catch (secErr) {
      if (Number(secErr.status) >= 400 && Number(secErr.status) < 500) {
        return res.status(secErr.status).json({ success: false, message: secErr.message });
      }
      console.error('Penerimaan webhook provider secret resolution error:', {
        provider,
        code: secErr.code,
        status: secErr.status,
        message: secErr.message,
      });
      return handlePenerimaanError(res, secErr, 'Gagal memuat konfigurasi webhook penerimaan.');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      return res.status(400).json({
        success: false,
        message: 'Raw request body is missing for webhook signature verification.',
      });
    }

    let isValid = false;
    try {
      isValid = verifyWebhookSignature({
        provider,
        rawBody,
        signature,
        headers: req.headers,
        secret,
      });
    } catch (verifyErr) {
      return res.status(verifyErr.status || 401).json({
        success: false,
        message: verifyErr.message,
      });
    }

    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid or missing webhook signature.' });
    }

    const repository = req.app.locals.dataAccessRepository || {};
    const recordFn = repository.recordRawWebhookEvent || recordRawWebhookEvent;
    const processFn = repository.processRawWebhookEvent || processRawWebhookEvent;

    const idempotencyKey =
      req.body?.idempotency_key ||
      req.headers['x-idempotency-key'] ||
      `${provider}:${req.body?.order_id || req.body?.transaction_id || req.body?.reference || req.body?.provider_ref || Date.now()}`;

    const { event, duplicate } = await recordFn({
      provider,
      idempotency_key: idempotencyKey,
      payload: req.body,
      headers: req.headers,
      signature,
    });

    if (duplicate && event?.status === 'processed') {
      return res.status(200).json({
        success: true,
        message: 'Webhook event already processed (idempotent).',
        duplicate: true,
        data: event,
      });
    }

    // Process event into transaction
    try {
      const result = await processFn(event.id);
      invalidateCache(['req:/api/penerimaan*']);
      res.status(200).json({
        success: true,
        message: result.duplicate ? 'Webhook event already processed (idempotent).' : 'Webhook processed successfully.',
        duplicate: Boolean(result.duplicate),
        data: result,
      });
    } catch (procErr) {
      console.error('Webhook processing error:', procErr);
      res.status(422).json({
        success: false,
        message: `Webhook recorded but processing failed: ${procErr.message}`,
        event_id: event.id,
      });
    }
  } catch (err) {
    console.error('Webhook ingestion error:', err);
    handlePenerimaanError(res, err, 'Gagal menerima webhook penerimaan.');
  }
}

app.post('/api/penerimaan/webhook/:provider', handlePenerimaanWebhookIngestion);
app.post('/api/penerimaan/portal/callback', (req, res) => {
  req.params.provider = 'portal';
  return handlePenerimaanWebhookIngestion(req, res);
});

// 9. List Raw Webhook Ingestion Events
app.get('/api/penerimaan/ingestion/events', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const repository = req.app.locals.dataAccessRepository || {};
    const listFn = repository.listRawWebhookEvents || listRawWebhookEvents;
    const data = await listFn(req.query);
    res.json({ success: true, data });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal memuat log raw events webhook.');
  }
});

// 10. Retry Ingestion Event
app.post('/api/penerimaan/ingestion/events/:id/retry', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const repository = req.app.locals.dataAccessRepository || {};
    const retryFn = repository.retryRawWebhookEvent || retryRawWebhookEvent;
    const data = await retryFn(req.params.id, actor);
    invalidateCache(['req:/api/penerimaan*']);
    res.json({ success: true, message: 'Event berhasil diproses ulang.', data });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal memproses ulang webhook event.');
  }
});

// 11. Bulk Transaction Import (CSV / XLSX)
app.post('/api/penerimaan/transaksi/import', authenticateToken, requireRole('admin', 'penerimaan'), importUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File spreadsheet (.csv atau .xlsx) wajib diunggah.' });
    }
    const actor = getPenerimaanActor(req);
    const channel = req.body?.channel || 'bank_transfer';
    const repository = req.app.locals.dataAccessRepository || {};
    const importFn = repository.processTransactionImport || processTransactionImport;
    const result = await importFn({
      filename: req.file.originalname,
      channel,
      fileBuffer: req.file.buffer,
      actor,
    });
    invalidateCache(['req:/api/penerimaan*']);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal mengimpor transaksi penerimaan.');
  }
});

// 12. Get Import Job Status
app.get('/api/penerimaan/transaksi/import/:id', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const repository = req.app.locals.dataAccessRepository || {};
    const getFn = repository.getImportJobById || getImportJobById;
    const data = await getFn(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Job import tidak ditemukan.' });
    }
    res.json({ success: true, data });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal memuat status job import.');
  }
});

// 13. Reconciliation Batches: List & Create
app.get('/api/penerimaan/rekonsiliasi/batches', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const repository = req.app.locals.dataAccessRepository || {};
    const listFn = repository.listReconciliationBatches || listReconciliationBatches;
    const data = await listFn(req.query);
    res.json({ success: true, data });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal memuat daftar batch rekonsiliasi.');
  }
});

app.post('/api/penerimaan/rekonsiliasi/batches', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const repository = req.app.locals.dataAccessRepository || {};
    const createFn = repository.createReconciliationBatch || createReconciliationBatch;
    const data = await createFn(req.body, actor);
    invalidateCache(['req:/api/penerimaan*']);
    res.status(201).json({ success: true, data });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal membuat batch rekonsiliasi.');
  }
});

// 14. Reconciliation Batch Detail
app.get('/api/penerimaan/rekonsiliasi/batches/:id', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const repository = req.app.locals.dataAccessRepository || {};
    const getFn = repository.getReconciliationBatchById || getReconciliationBatchById;
    const data = await getFn(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Batch rekonsiliasi tidak ditemukan.' });
    }
    res.json({ success: true, data });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal memuat detail batch rekonsiliasi.');
  }
});

// 15. Import Bank Statement into Batch
app.post('/api/penerimaan/rekonsiliasi/batches/:id/import', authenticateToken, requireRole('admin', 'penerimaan'), importUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File rekening koran mutasi bank (.csv / .xlsx) wajib diunggah.' });
    }
    const actor = getPenerimaanActor(req);
    const repository = req.app.locals.dataAccessRepository || {};
    const importFn = repository.importStatementLines || importStatementLines;
    const data = await importFn({
      batchId: req.params.id,
      fileBuffer: req.file.buffer,
      filename: req.file.originalname,
      actor,
    });
    invalidateCache(['req:/api/penerimaan*']);
    res.status(200).json({ success: true, data });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal mengimpor rekening koran bank.');
  }
});

// 16. Auto-match Statement Lines
app.post('/api/penerimaan/rekonsiliasi/batches/:id/auto-match', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const repository = req.app.locals.dataAccessRepository || {};
    const matchFn = repository.autoMatchBatchStatements || autoMatchBatchStatements;
    const data = await matchFn(req.params.id, actor);
    invalidateCache(['req:/api/penerimaan*']);
    res.status(200).json({ success: true, data });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal menjalankan auto-match rekonsiliasi.');
  }
});

// 17. Manual Match
app.post('/api/penerimaan/rekonsiliasi/batches/:id/match', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const repository = req.app.locals.dataAccessRepository || {};
    const matchFn = repository.matchStatementLine || matchStatementLine;
    const data = await matchFn({
      batchId: req.params.id,
      statementLineId: req.body.statement_line_id,
      statement_line_id: req.body.statement_line_id,
      statementLineIds: req.body.statement_line_ids,
      statement_line_ids: req.body.statement_line_ids,
      transactionId: req.body.transaction_id,
      transaction_id: req.body.transaction_id,
      transactionIds: req.body.transaction_ids,
      transaction_ids: req.body.transaction_ids,
      expectedVersion: req.body.expected_version,
      expected_version: req.body.expected_version,
      notes: req.body.notes,
      reason: req.body.reason,
      actor,
    });
    invalidateCache(['req:/api/penerimaan*']);
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('Match statement line error:', err);
    handlePenerimaanError(res, err, 'Gagal melakukan pencocokan manual rekonsiliasi.');
  }
});

// 18. Unmatch
app.post('/api/penerimaan/rekonsiliasi/batches/:id/unmatch/:matchId', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const repository = req.app.locals.dataAccessRepository || {};
    const unmatchFn = repository.unmatchStatementLine || unmatchStatementLine;
    const data = await unmatchFn({
      batchId: req.params.id,
      matchId: req.params.matchId,
      notes: req.body?.notes,
      reason: req.body?.reason,
      actor,
    });
    invalidateCache(['req:/api/penerimaan*']);
    res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('Unmatch statement line error:', err);
    handlePenerimaanError(res, err, 'Gagal membatalkan pencocokan transaksi.');
  }
});

// 19. Close Reconciliation Batch (Leader / Admin only)
app.post('/api/penerimaan/rekonsiliasi/batches/:id/close', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const repository = req.app.locals.dataAccessRepository || {};
    const closeFn = repository.closeReconciliationBatch || closeReconciliationBatch;
    const data = await closeFn({
      batchId: req.params.id,
      notes: req.body?.notes,
      reason: req.body?.reason,
      actor,
    });
    invalidateCache(['req:/api/penerimaan*']);
    res.status(200).json({ success: true, data });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal menutup batch rekonsiliasi.');
  }
});

// ==========================================
// PENERIMAAN REPORTING & EXPORT APIS (Task 11)
// ==========================================

// 20. Reporting Summary & Executive KPIs
app.get('/api/penerimaan/laporan', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const perm = canViewPenerimaanReport({ actor });
    if (!perm.allowed) {
      return res.status(403).json({ success: false, message: perm.reason });
    }
    const repository = req.app.locals.dataAccessRepository || {};
    const reportFn = repository.getPenerimaanReportSummary || getPenerimaanReportSummary;
    const data = await reportFn(req.query);
    res.json({ success: true, data });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal memuat laporan penerimaan.');
  }
});

// 21. Generate Report Job
app.post(['/api/penerimaan/laporan/generate', '/api/penerimaan/laporan/export'], authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const perm = canExportPenerimaanReport({ actor });
    if (!perm.allowed) {
      return res.status(403).json({ success: false, message: perm.reason });
    }

    const format = String(req.body?.format || '').toLowerCase().trim();
    if (!['xlsx', 'pdf'].includes(format)) {
      return res.status(400).json({
        success: false,
        message: `Format ekspor "${req.body?.format}" tidak didukung. Format yang didukung: xlsx, pdf.`,
      });
    }

    const repository = req.app.locals.dataAccessRepository || {};
    const createJobFn = repository.createPenerimaanExportJob || createPenerimaanExportJob;
    const normalizedFilters = normalizeReportFilters(req.body);

    const job = await createJobFn({
      jobType: 'penerimaan_report',
      format,
      filters: normalizedFilters,
      actor,
    });

    // Schedule background processing
    processPenerimaanExportJob(job.job_uuid, { repository }).catch((err) => {
      console.error(`Background export job failed for ${job.job_uuid}:`, err?.message || err);
    });

    res.status(202).json({
      success: true,
      data: {
        id: job.job_uuid,
        status: job.status,
        download_url: `/api/penerimaan/laporan/export/${job.job_uuid}`,
      },
    });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal membuat job ekspor laporan penerimaan.');
  }
});

// 22. Export Report (By Job ID only, strictly validated)
const handlePenerimaanReportExport = async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const perm = canExportPenerimaanReport({ actor });
    if (!perm.allowed) {
      return res.status(403).json({ success: false, message: perm.reason });
    }

    const jobId = req.params.id;
    if (!jobId) {
      return res.status(404).json({ success: false, message: 'Job ID ekspor diperlukan.' });
    }

    const repository = req.app.locals.dataAccessRepository || {};
    const getJobFn = repository.getPenerimaanExportJob || getPenerimaanExportJob;

    const job = await getJobFn(jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Export job tidak ditemukan.' });
    }

    // Authorization check: non-admin can only download their own job, and jobs with missing creator are denied to non-admin
    const isAdmin = actor.role === 'admin' || actor.level === 'admin';
    if (!isAdmin && (!job.created_by_id || Number(job.created_by_id) !== Number(actor.id))) {
      return res.status(403).json({ success: false, message: 'Anda tidak memiliki izin untuk mengunduh job ekspor ini.' });
    }

    // State check
    if (job.status === 'queued' || job.status === 'processing') {
      return res.status(409).json({
        success: false,
        code: 'EXPORT_JOB_PENDING',
        message: 'Job ekspor sedang diproses atau dalam antrean.',
        data: job,
      });
    }

    if (job.status === 'failed') {
      return res.status(422).json({
        success: false,
        code: 'EXPORT_JOB_FAILED',
        message: `Job ekspor gagal: ${job.error_message || 'Terjadi kesalahan sistem'}`,
        data: job,
      });
    }

    if (job.status !== 'completed' || !job.artifact_path) {
      return res.status(409).json({
        success: false,
        code: 'EXPORT_JOB_PENDING',
        message: 'Dokumen ekspor belum siap.',
        data: job,
      });
    }

    // Security check: ensure artifact path is strictly within export directory
    const exportDir = path.resolve(getExportDirectory());
    const resolvedPath = path.resolve(job.artifact_path);
    const relative = path.relative(exportDir, resolvedPath);
    const isContained = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
    if (!isContained || !fs.existsSync(resolvedPath)) {
      return res.status(404).json({
        success: false,
        message: 'File artefak ekspor tidak ditemukan di penyimpanan server.',
      });
    }

    const format = String(job.format || 'pdf').toLowerCase().trim();
    const contentType = format === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const fileName = job.file_name || `Laporan-Penerimaan-${job.job_uuid}.${format}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('x-job-id', job.job_uuid);

    const stream = fs.createReadStream(resolvedPath);
    stream.on('error', (streamErr) => {
      console.error('Artifact streaming error:', streamErr);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Gagal membaca artefak ekspor.' });
      }
    });
    return stream.pipe(res);
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal mengekspor laporan penerimaan.');
  }
};

app.get('/api/penerimaan/laporan/export', authenticateToken, requireRole('admin', 'penerimaan'), (req, res) => {
  return res.status(410).json({
    success: false,
    code: 'EXPORT_ENDPOINT_DEPRECATED',
    message: 'Endpoint ekspor sinkron telah kedaluwarsa. Gunakan POST /api/penerimaan/laporan/generate (atau POST /api/penerimaan/laporan/export) untuk memulai job ekspor, lalu GET /api/penerimaan/laporan/export/:id untuk mengunduh artefak.',
  });
});


app.get('/api/penerimaan/laporan/export/:id', authenticateToken, requireRole('admin', 'penerimaan'), handlePenerimaanReportExport);
app.get('/api/penerimaan/laporan/jobs/:id', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const repository = req.app.locals.dataAccessRepository || {};
    const getJobFn = repository.getPenerimaanExportJob || getPenerimaanExportJob;
    const job = await getJobFn(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Export job tidak ditemukan.' });
    }

    const isAdmin = actor.role === 'admin' || actor.level === 'admin';
    if (!isAdmin && (!job.created_by_id || Number(job.created_by_id) !== Number(actor.id))) {
      return res.status(403).json({ success: false, message: 'Anda tidak memiliki akses ke job ekspor ini.' });
    }

    res.json({
      success: true,
      data: {
        id: job.job_uuid,
        status: job.status,
        format: job.format,
        file_name: job.file_name,
        file_size: job.file_size,
        download_url: `/api/penerimaan/laporan/export/${job.job_uuid}`,
        error_message: job.error_message,
        created_at: job.created_at,
        completed_at: job.completed_at,
      },
    });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal memeriksa status job ekspor.');
  }
});

// ==========================================
// PENERIMAAN SETTINGS & MASTER DATA APIS
// ==========================================

// 23. Settings: Get & Update
app.get('/api/penerimaan/pengaturan', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const repository = req.app.locals.dataAccessRepository || {};
    const getFn = repository.getPenerimaanSettings || getPenerimaanSettings;
    const data = await getFn();
    res.json({ success: true, data });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal memuat pengaturan penerimaan.');
  }
});

app.put('/api/penerimaan/pengaturan', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const perm = canManagePenerimaanSettings({ actor });
    if (!perm.allowed) {
      return res.status(403).json({ success: false, message: perm.reason });
    }
    const repository = req.app.locals.dataAccessRepository || {};
    const updateFn = repository.updatePenerimaanSettings || updatePenerimaanSettings;
    const data = await updateFn(req.body, actor);
    invalidateCache(['req:/api/penerimaan*']);
    res.json({ success: true, data });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal memperbarui pengaturan penerimaan.');
  }
});

// 24. Master Data Channels
app.get('/api/penerimaan/master-data/channels', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const repository = req.app.locals.dataAccessRepository || {};
    const listFn = repository.listPenerimaanChannels || listPenerimaanChannels;
    const data = await listFn();
    res.json({ success: true, data });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal memuat daftar kanal penerimaan.');
  }
});

app.post('/api/penerimaan/master-data/channels', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const perm = canManagePenerimaanSettings({ actor });
    if (!perm.allowed) {
      return res.status(403).json({ success: false, message: perm.reason });
    }
    const repository = req.app.locals.dataAccessRepository || {};
    const createFn = repository.createPenerimaanChannel || createPenerimaanChannel;
    const data = await createFn(req.body, actor);
    invalidateCache(['req:/api/penerimaan*']);
    res.status(201).json({ success: true, data });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal menambahkan kanal penerimaan.');
  }
});

app.put('/api/penerimaan/master-data/channels/:id', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const perm = canManagePenerimaanSettings({ actor });
    if (!perm.allowed) {
      return res.status(403).json({ success: false, message: perm.reason });
    }
    const repository = req.app.locals.dataAccessRepository || {};
    const updateFn = repository.updatePenerimaanChannel || updatePenerimaanChannel;
    const data = await updateFn(req.params.id, req.body, actor);
    invalidateCache(['req:/api/penerimaan*']);
    res.json({ success: true, data });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal memperbarui kanal penerimaan.');
  }
});

// 25. Master Data Accounts
app.get('/api/penerimaan/master-data/accounts', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const repository = req.app.locals.dataAccessRepository || {};
    const listFn = repository.listPenerimaanAccounts || listPenerimaanAccounts;
    const data = await listFn();
    res.json({ success: true, data });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal memuat daftar rekening penerimaan.');
  }
});

app.post('/api/penerimaan/master-data/accounts', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const perm = canManagePenerimaanSettings({ actor });
    if (!perm.allowed) {
      return res.status(403).json({ success: false, message: perm.reason });
    }
    const repository = req.app.locals.dataAccessRepository || {};
    const createFn = repository.createPenerimaanAccount || createPenerimaanAccount;
    const data = await createFn(req.body, actor);
    invalidateCache(['req:/api/penerimaan*']);
    res.status(201).json({ success: true, data });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal menambahkan rekening penerimaan.');
  }
});

app.put('/api/penerimaan/master-data/accounts/:id', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const perm = canManagePenerimaanSettings({ actor });
    if (!perm.allowed) {
      return res.status(403).json({ success: false, message: perm.reason });
    }
    const repository = req.app.locals.dataAccessRepository || {};
    const updateFn = repository.updatePenerimaanAccount || updatePenerimaanAccount;
    const data = await updateFn(req.params.id, req.body, actor);
    invalidateCache(['req:/api/penerimaan*']);
    res.json({ success: true, data });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal memperbarui rekening penerimaan.');
  }
});

// 26. Master Data Fund Categories
app.get('/api/penerimaan/master-data/fund-categories', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const repository = req.app.locals.dataAccessRepository || {};
    const listFn = repository.listPenerimaanFundCategories || listPenerimaanFundCategories;
    const data = await listFn();
    res.json({ success: true, data });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal memuat kategori dana penerimaan.');
  }
});

app.post('/api/penerimaan/master-data/fund-categories', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const perm = canManagePenerimaanSettings({ actor });
    if (!perm.allowed) {
      return res.status(403).json({ success: false, message: perm.reason });
    }
    const repository = req.app.locals.dataAccessRepository || {};
    const createFn = repository.createPenerimaanFundCategory || createPenerimaanFundCategory;
    const data = await createFn(req.body, actor);
    invalidateCache(['req:/api/penerimaan*']);
    res.status(201).json({ success: true, data });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal membuat kategori dana penerimaan.');
  }
});

app.put('/api/penerimaan/master-data/fund-categories/:id', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const perm = canManagePenerimaanSettings({ actor });
    if (!perm.allowed) {
      return res.status(403).json({ success: false, message: perm.reason });
    }
    const repository = req.app.locals.dataAccessRepository || {};
    const updateFn = repository.updatePenerimaanFundCategory || updatePenerimaanFundCategory;
    const data = await updateFn(req.params.id, req.body, actor);
    invalidateCache(['req:/api/penerimaan*']);
    res.json({ success: true, data });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal memperbarui kategori dana penerimaan.');
  }
});

// 27. Master Data Providers
app.get('/api/penerimaan/master-data/providers', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const repository = req.app.locals.dataAccessRepository || {};
    const listFn = repository.listPenerimaanProviderConfigs || listPenerimaanProviderConfigs;
    const data = await listFn();
    res.json({ success: true, data });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal memuat konfigurasi provider penerimaan.');
  }
});

app.put('/api/penerimaan/master-data/providers/:id', authenticateToken, requireRole('admin', 'penerimaan'), async (req, res) => {
  try {
    const actor = getPenerimaanActor(req);
    const perm = canManagePenerimaanSettings({ actor });
    if (!perm.allowed) {
      return res.status(403).json({ success: false, message: perm.reason });
    }
    const repository = req.app.locals.dataAccessRepository || {};
    const updateFn = repository.updatePenerimaanProviderConfig || updatePenerimaanProviderConfig;
    const data = await updateFn(req.params.id, req.body, actor);
    invalidateCache(['req:/api/penerimaan*']);
    res.json({ success: true, data });
  } catch (err) {
    handlePenerimaanError(res, err, 'Gagal memperbarui konfigurasi provider penerimaan.');
  }
});

// ==========================================
// PENYALURAN DOMAIN APIS
// ==========================================

// Aggregated Penerimaan Funds for Penyaluran (Posted-only)
app.get('/api/penyaluran/penerimaan-funds', authenticateToken, requireRole('admin', 'penyaluran', 'penerimaan'), async (req, res) => {
  try {
    const repository = req.app.locals.dataAccessRepository || {};
    const aggFn = repository.getPenerimaanAggregatesForPenyaluran || getPenerimaanAggregatesForPenyaluran;
    const data = await aggFn(req.query);
    res.json({ success: true, data });
  } catch (err) {
    console.error('Penyaluran penerimaan-funds error:', err);
    res.status(500).json({ success: false, message: 'Gagal memuat agregasi dana penerimaan untuk penyaluran.' });
  }
});

// Penyaluran Overview & Dashboard Data (Period-aware)
app.get('/api/penyaluran/overview', authenticateToken, requireRole('admin', 'penyaluran', 'surveyor'), cacheMiddleware(30), async (req, res) => {
  try {
    const data = await getPenyaluranOverview(req.query.period || '30d');
    res.json({ success: true, data });
  } catch (err) {
    console.error('Penyaluran overview error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Penyaluran By 13 Kecamatan Kota Tangerang (Geospatial)
app.get('/api/penyaluran/by-kecamatan', authenticateToken, requireRole('admin', 'penyaluran', 'surveyor'), cacheMiddleware(30), async (req, res) => {
  try {
    const data = await getPenyaluranByKecamatan();
    res.json({ success: true, data });
  } catch (err) {
    console.error('Penyaluran by kecamatan error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Read-only Penyaluran transaction journal from PPD records
app.get('/api/penyaluran/transaksi', authenticateToken, requireRole('admin', 'penyaluran', 'surveyor'), cacheMiddleware(15), async (req, res) => {
  try {
    const data = await listPenyaluranTransactions({
      status: req.query.status,
      program: req.query.program,
      kecamatan: req.query.kecamatan,
      search: req.query.search,
    });
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    console.error('Transaction journal error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Master data is visible to operational users; only admin can mutate configuration.
app.get('/api/penyaluran/master-data', authenticateToken, requireRole('admin', 'penyaluran', 'surveyor'), async (req, res) => {
  try {
    const data = await listMasterData(req.query.category);
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/penyaluran/master-data', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const id = await createMasterData(req.body);
    invalidateCache();
    res.status(201).json({ success: true, data: { id } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/penyaluran/master-data/:id', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const updated = await updateMasterData(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, message: 'Data master tidak ditemukan.' });
    invalidateCache();
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/public/master-data', async (req, res) => {
  try {
    const category = String(req.query.category || '');
    if (!['program', 'asnaf', 'dokumen'].includes(category)) return res.status(422).json({ success: false, message: 'Kategori tidak tersedia.' });
    const data = await listMasterData(category);
    res.json({ success: true, data: data.filter((item) => item.is_active) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5 Pilar Programs & Initiatives
app.get('/api/penyaluran/program', authenticateToken, requireRole('admin', 'penyaluran', 'surveyor'), cacheMiddleware(30), async (req, res) => {
  try {
    const data = await getPilarPrograms();
    res.json({ success: true, data });
  } catch (err) {
    console.error('Pilar programs error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create Pilar Initiative
app.post('/api/penyaluran/program/initiatives', authenticateToken, requireRole('admin', 'penyaluran'), async (req, res) => {
  try {
    const id = await addPilarInitiative(req.body);
    invalidateCache();
    res.status(201).json({ success: true, data: { id }, message: 'Inisiatif program berhasil ditambahkan' });
  } catch (err) {
    console.error('Add initiative error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update Pilar Initiative
app.put('/api/penyaluran/program/initiatives/:id', authenticateToken, requireRole('admin', 'penyaluran'), async (req, res) => {
  try {
    const ok = await updatePilarInitiative(req.params.id, req.body);
    if (!ok) return res.status(404).json({ success: false, message: 'Inisiatif tidak ditemukan' });
    invalidateCache();
    res.json({ success: true, message: 'Inisiatif program berhasil diperbarui' });
  } catch (err) {
    console.error('Update initiative error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete Pilar Initiative
app.delete('/api/penyaluran/program/initiatives/:id', authenticateToken, requireRole('admin', 'penyaluran'), async (req, res) => {
  try {
    await deletePilarInitiative(req.params.id);
    invalidateCache();
    res.json({ success: true, message: 'Inisiatif program berhasil dihapus' });
  } catch (err) {
    console.error('Delete initiative error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Mustahik Stage Counts
app.get('/api/mustahik/stages/count', authenticateToken, requireRole('admin', 'penyaluran', 'surveyor', 'keuangan'), cacheMiddleware(15), async (req, res) => {
  try {
    const data = await getMustahikStageCounts();
    res.json({ success: true, data });
  } catch (err) {
    console.error('Stage counts error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Submit Mustahik Decision (Advance workflow / Reject)
app.post('/api/mustahik/:id/decision', authenticateToken, requireRole('penyaluran'), legacyPenyaluranWriteGuard('decision'), async (req, res) => {
  try {
    const db = req.app?.locals?.db || req.db;
    const result = await submitMustahikDecision(req.params.id, req.body, req.user, db);
    invalidateCache();
    res.json(result);
  } catch (err) {
    console.error('Decision error:', err);
    const restricted = err.message.includes('hanya dapat') || err.message.includes('tidak dapat') || err.message.includes('wewenang');
    const invalid = err.message.includes('wajib');
    res.status(err.status || (restricted ? 403 : invalid ? 422 : 500)).json({ success: false, message: err.message, code: err.code });
  }
});

app.get('/api/mustahik/:id/approvals', authenticateToken, requireRole('penyaluran', 'surveyor'), async (req, res) => {
  try {
    const data = await getApprovalDecisions({ mustahik_id: req.params.id });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/penyaluran/audit-decisions', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const data = await getApprovalDecisions({
      action: req.query.action,
      stage: req.query.stage,
      actor_id: req.query.actor_id,
      from: req.query.from,
      to: req.query.to,
    });
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Batch Import Mustahik
app.post('/api/mustahik/import', authenticateToken, requireRole('admin', 'penyaluran'), legacyPenyaluranWriteGuard('import'), async (req, res) => {
  try {
    const items = req.body.items || (Array.isArray(req.body) ? req.body : []);
    const result = await importMustahikBatch(items);
    invalidateCache();
    res.json(result);
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Laporan Penyaluran Catalog & Insights
app.get('/api/penyaluran/laporan', authenticateToken, requireRole('admin', 'penyaluran', 'surveyor'), cacheMiddleware(30), async (req, res) => {
  try {
    const data = await getLaporanList(req.query);
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Laporan list error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Generate New Laporan
app.post('/api/penyaluran/laporan/generate', authenticateToken, requireRole('admin', 'penyaluran'), async (req, res) => {
  try {
    const result = await generateLaporan(req.body);
    invalidateCache();
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    console.error('Generate laporan error:', err);
    const status = Number(err.status) >= 400 && Number(err.status) < 500 ? Number(err.status) : 500;
    res.status(status).json({ success: false, message: err.message, ...(err.code ? { code: err.code } : {}) });
  }
});

function safeExportFileToken(value) {
  const token = String(value || 'laporan').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
  return token || 'laporan';
}

function sanitizeExportRows(rows) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (typeof value === 'string' && /^\s*[=+\-@]/.test(value)) return [key, `'${value}`];
    return [key, value];
  })));
}

function getExportQueryFilters(query = {}) {
  const filters = { ...query };
  delete filters.format;
  delete filters.title;
  delete filters.category;
  delete filters.scope;
  if (filters.filters !== undefined) {
    let nested = filters.filters;
    if (typeof nested === 'string') {
      try { nested = JSON.parse(nested); } catch {
        const error = new Error('Parameter filters harus berupa JSON yang valid.');
        error.status = 400;
        error.code = 'INVALID_REPORT_FILTER';
        throw error;
      }
    }
    delete filters.filters;
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) {
      const error = new Error('Parameter filters harus berupa objek.');
      error.status = 400;
      error.code = 'INVALID_REPORT_FILTER';
      throw error;
    }
    Object.assign(filters, nested);
  }
  return filters;
}

// Export Laporan Data (Excel .xlsx, PDF .pdf, CSV, or JSON)
app.get('/api/penyaluran/laporan/export/:id', authenticateToken, requireRole('admin', 'penyaluran'), async (req, res) => {
  try {
    const requestedFormat = req.query.format;
    const format = requestedFormat === undefined
      ? 'xlsx'
      : typeof requestedFormat === 'string' ? requestedFormat.toLowerCase() : '';
    if (!['xlsx', 'excel', 'pdf', 'json', 'csv'].includes(format)) {
      return res.status(400).json({ success: false, message: 'Format ekspor tidak didukung.', code: 'INVALID_EXPORT_FORMAT' });
    }
    const repository = req.app.locals.dataAccessRepository || { exportLaporanData };
    const exportOptions = { actor: req.user, filters: getExportQueryFilters(req.query) };
    const auditExport = () => (req.app.locals.dataAccessRepository?.appendActivityLog || appendActivityLog)({
      actor: req.user,
      action: 'REPORT_EXPORT',
      target: `laporan:${req.params.id}`,
      title: 'Ekspor laporan penyaluran',
      description: `Format: ${format}`,
    });

    if (format === 'excel' || format === 'xlsx') {
      const exportResult = repository.getLaporanExportData
        ? await repository.getLaporanExportData(req.params.id, exportOptions)
        : await getLaporanExportData(req.params.id, exportOptions);
      const mustahikList = sanitizeExportRows(exportResult.rows);
      const report = exportResult.report;
      const reportMeta = {
        id: req.params.id,
        title: report.title,
        category: report.category,
        period: report.period,
        scope: report.scope,
      };
      const excelBuffer = await generateExcelReport(reportMeta, mustahikList);
      await auditExport();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="Laporan-Penyaluran-BAZNAS-${safeExportFileToken(req.params.id)}.xlsx"`);
      return res.send(excelBuffer);
    }

    if (format === 'pdf') {
      const exportResult = repository.getLaporanExportData
        ? await repository.getLaporanExportData(req.params.id, exportOptions)
        : await getLaporanExportData(req.params.id, exportOptions);
      const mustahikList = sanitizeExportRows(exportResult.rows);
      const report = exportResult.report;
      const reportMeta = {
        id: req.params.id,
        title: report.title,
        category: report.category,
        period: report.period,
        scope: report.scope,
      };
      const pdfBuffer = await generatePdfReport(reportMeta, mustahikList);
      await auditExport();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="Laporan-Penyaluran-BAZNAS-${safeExportFileToken(req.params.id)}.pdf"`);
      return res.send(pdfBuffer);
    }

    if (format === 'json') {
      const reportData = await (repository.exportLaporanData ? repository.exportLaporanData(req.params.id, 'json', exportOptions) : exportLaporanData(req.params.id, 'json', exportOptions));
      await auditExport();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="laporan-${safeExportFileToken(req.params.id)}.json"`);
      return res.json(reportData);
    }

    // Default CSV
    const csvContent = await (repository.exportLaporanData ? repository.exportLaporanData(req.params.id, 'csv', exportOptions) : exportLaporanData(req.params.id, 'csv', exportOptions));
    await auditExport();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="laporan-${safeExportFileToken(req.params.id)}.csv"`);
    res.send(csvContent);
  } catch (err) {
    console.error('Export laporan error:', err);
    const status = Number(err.status) >= 400 && Number(err.status) < 500 ? Number(err.status) : 500;
    res.status(status).json({ success: false, message: status === 500 ? 'Gagal mengekspor laporan.' : err.message, code: err.code });
  }
});

// Activity Logs
app.get('/api/activity-logs', authenticateToken, requireRole('admin', 'penyaluran', 'surveyor'), cacheMiddleware(15), async (req, res) => {
  try {
    const data = await getActivityLogs(req.query.mustahik_id, parseInt(req.query.limit || '20', 10));
    res.json({ success: true, data });
  } catch (err) {
    console.error('Activity logs error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 1. PUBLIC PORTAL APIS
// ==========================================

export function publicIntakeCutoverGuard(options = {}) {
  return (req, res, next) => {
    const cutoverOptions = {
      cutoverAt: options.cutoverAt ?? process.env.PENYALURAN_P0_CUTOVER_AT,
      now: options.now ?? new Date(),
    };
    const cutoverActive = isP0CutoverActive(cutoverOptions);
    const p0Enabled = typeof options.isP0Enabled === 'function' ? options.isP0Enabled(req) : isPenyaluranP0Enabled();
    if (cutoverActive && !p0Enabled) {
      return res.status(503).json(new P0Error('P0_PUBLIC_INTAKE_UNAVAILABLE', 'Intake P0 sedang tidak tersedia.', { status: 503 }).toJSON());
    }
    req.useP0PublicIntake = cutoverActive;
    return next();
  };
}

const publicP0Upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 + 1, files: 5, fields: 40, parts: 45, fieldSize: 256 * 1024 },
});

// Keep the public form available. Only the writer changes at cutover.
app.post('/api/public/pengajuan', publicApplicationRateLimit, publicIntakeCutoverGuard(), (req, res, next) => {
  const parser = req.useP0PublicIntake ? publicP0Upload : publicLegacyUpload;
  parser.any()(req, res, (error) => {
    if (error) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        const field = error.field ? ` pada bidang "${error.field}"` : '';
        return res.status(422).json({
          success: false,
          code: 'UPLOAD_VALIDATION_FAILED',
          message: `Ukuran berkas${field} melebihi batas 5 MiB.`,
        });
      }
      // Preserve the established legacy upload contract while keeping P0
      // parser failures generic so parser internals are not exposed.
      if (!req.useP0PublicIntake && error.code === 'UPLOAD_VALIDATION_FAILED') {
        return res.status(error.status || 422).json({ success: false, message: error.message });
      }
      return res.status(error.status || 422).json({
        success: false, code: error.code || 'UPLOAD_VALIDATION_FAILED',
        message: 'Jenis atau ukuran dokumen tidak valid.',
      });
    }
    return next();
  });
}, async (req, res) => {
  const uploadedFiles = req.files || [];
  try {
    validateSuratPermohonanInput(req.body || {});
    if (req.useP0PublicIntake) {
      const db = req.app.locals.db || await getDb();
      const actor = await resolveP0PublicIntakeActor(db, process.env.PENYALURAN_P0_PUBLIC_ACTOR_ID);
      const payload = Object.fromEntries(Object.entries(normalizePublicApplicant(req.body || {})).filter(([field]) => P0_INTAKE_FIELDS.includes(field)));
      payload.asnaf = null;
      const create = req.app.locals.penyaluranP0Services?.createP0Mustahik || createP0Mustahik;
      const result = await create(payload, {
        db, actor, files: uploadedFiles,
        uploadDir: req.app.locals.publicP0UploadDir || uploadDir,
      }, {
        idempotency_key: req.get('Idempotency-Key') || req.get('X-Idempotency-Key') || undefined,
        correlation_id: req.get('X-Correlation-Id') || undefined,
        allow_derived_idempotency: true,
      });
      invalidateCache();
      return res.status(result?.replayed ? 200 : 201).json({
        success: true, data: result.data,
        message: 'Pengajuan permohonan bantuan berhasil dikirim.',
      });
    }

    if (uploadedFiles.length > 5) {
      await Promise.all(uploadedFiles.map((f) => fs.promises.unlink(f.path).catch(() => {})));
      return res.status(422).json({
        success: false,
        code: 'UPLOAD_VALIDATION_FAILED',
        message: 'Maksimal lima dokumen dapat diunggah.',
      });
    }

    for (const file of uploadedFiles) {
      if (file.size > 5 * 1024 * 1024) {
        await Promise.all(uploadedFiles.map((f) => fs.promises.unlink(f.path).catch(() => {})));
        return res.status(422).json({
          success: false,
          code: 'UPLOAD_VALIDATION_FAILED',
          message: `Ukuran berkas "${file.originalname}" pada bidang "${file.fieldname}" melebihi batas 5 MiB.`,
        });
      }
      let buffer;
      try {
        buffer = await fs.promises.readFile(file.path);
      } catch {
        await Promise.all(uploadedFiles.map((f) => fs.promises.unlink(f.path).catch(() => {})));
        return res.status(422).json({
          success: false,
          code: 'UPLOAD_VALIDATION_FAILED',
          message: 'Data dokumen tidak valid.',
        });
      }
      let validated;
      try {
        validated = validateArtifactBytes(buffer);
      } catch {
        await Promise.all(uploadedFiles.map((f) => fs.promises.unlink(f.path).catch(() => {})));
        return res.status(422).json({
          success: false,
          code: 'UPLOAD_VALIDATION_FAILED',
            message: `Jenis dokumen pada bidang "${file.fieldname}" tidak sesuai dengan isi berkas. Gunakan PDF, JPG, atau PNG.`,
        });
      }
      if (file.mimetype && file.mimetype !== validated.mimeType) {
        await Promise.all(uploadedFiles.map((f) => fs.promises.unlink(f.path).catch(() => {})));
        return res.status(422).json({
          success: false,
          code: 'UPLOAD_VALIDATION_FAILED',
            message: `Jenis dokumen pada bidang "${file.fieldname}" tidak sesuai dengan isi berkas. Gunakan PDF, JPG, atau PNG.`,
        });
      }
      const ext = path.extname(file.originalname).toLowerCase();
      const expectedExts = UPLOAD_EXTENSIONS_BY_MIME[validated.mimeType] || [];
      if (!expectedExts.includes(ext)) {
        await Promise.all(uploadedFiles.map((f) => fs.promises.unlink(f.path).catch(() => {})));
        return res.status(422).json({
          success: false,
          code: 'UPLOAD_VALIDATION_FAILED',
          message: `Ekstensi berkas "${file.originalname}" tidak sesuai dengan isi dokumen (${validated.mimeType}).`,
        });
      }
    }

    const payload = normalizePublicApplicant(req.body || {});
    delete payload.asnaf;
    const result = await req.app.locals.dataAccessRepository.createPublicApplication(payload, uploadedFiles);
    invalidateCache();
    return res.status(201).json({ success: true, data: result, message: 'Pengajuan permohonan bantuan berhasil dikirim.' });
  } catch (err) {
    if (!req.useP0PublicIntake) {
      await Promise.all(uploadedFiles.map((f) => fs.promises.unlink(f.path).catch(() => {})));
    }
    if (err.code === 'VALIDATION_FAILED') {
      return res.status(422).json({ success: false, code: err.code, message: err.message, field_errors: err.field_errors });
    }
    if (req.useP0PublicIntake) {
      if (err instanceof P0Error) return res.status(err.status).json(err.toJSON());
      return res.status(500).json({ success: false, code: 'P0_PUBLIC_INTAKE_FAILED', message: 'Pengajuan belum dapat disimpan.' });
    }
    console.error('Public application error:', err);
    return res.status(err.status || 500).json({ success: false, message: err.message, code: err.code });
  }
});

const publicSuratPermohonanRateLimit = rateLimit(createFixedWindowLimiter({ limit: 30, windowMs: 15 * 60 * 1000 }));

app.post('/api/public/surat-permohonan', publicSuratPermohonanRateLimit, (req, res) => {
  try {
    const validated = validateSuratPermohonanInput(req.body);
    return streamSuratPermohonanPdf(validated, res);
  } catch (err) {
    if (err.code === 'VALIDATION_FAILED') {
      return res.status(err.status || 422).json({
        success: false,
        code: 'VALIDATION_FAILED',
        message: err.message,
        field_errors: err.field_errors,
      });
    }
    console.error('Public surat permohonan error:', err);
    return res.status(500).json({ success: false, message: 'Gagal menghasilkan surat permohonan.' });
  }
});

export function toPublicTrackingResult(data) {
  const mustahik = data.mustahik || {};

  return {
    mustahik: {
      file_no: mustahik.file_no,
    },
    status: data.status,
    is_rejected: Boolean(data.is_rejected),
    timeline: (data.timeline || []).map((item) => ({
      phase: item.phase,
      date: item.date,
      status: item.status,
    })),
  };
}

// Public Tracking by file_no, NIK, or phone
app.get('/api/public/lacak/:query', publicTrackingRateLimit, async (req, res) => {
  try {
    const query = String(req.params.query || '').trim();
    if (query.length < 8) {
      return res.status(422).json({ success: false, message: 'Kata kunci pelacakan tidak valid.' });
    }
    const data = await req.app.locals.dataAccessRepository.trackApplication(query);
    if (!data) {
      return res.status(404).json({
        success: false,
        message: 'Pengajuan tidak ditemukan.'
      });
    }
    res.json({ success: true, data: toPublicTrackingResult(data) });
  } catch (err) {
    const rawId = req.headers['x-correlation-id'];
    const correlationId = (typeof rawId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawId))
      ? rawId
      : randomUUID();
    console.error(`Track error [${correlationId}]: ${err?.name || "Error"}`);
    res.setHeader('x-correlation-id', correlationId);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan sistem.', correlation_id: correlationId });
  }
});

// ==========================================
// 2. MUSTAHIK ADMIN & MANAGEMENT APIS
// ==========================================

// Export 60 Master Columns JSON (Cached for high throughput)
app.get('/api/mustahik/export/data', authenticateToken, requireRole('admin', 'penyaluran'), async (req, res) => {
  try {
    const data = await exportMustahikData();
    await (req.app.locals.dataAccessRepository?.appendActivityLog || appendActivityLog)({
      actor: req.user,
      action: 'MUSTAHIK_EXPORT',
      target: 'mustahik:all',
      title: 'Ekspor data mustahik',
      description: `Jumlah rekaman: ${data.length}`,
    });
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// List all mustahik with query filter support (Cached per query)
app.get('/api/mustahik', authenticateToken, requireRole('admin', 'penyaluran', 'surveyor', 'keuangan'), cacheMiddleware(30), async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      program: req.query.program,
      search: req.query.search
    };
    const repository = req.app.locals.dataAccessRepository || {};
    const data = await (repository.listMustahik || listMustahik)({ ...filters, ppd_only: req.user?.role === 'keuangan' });
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    console.error('List mustahik error:', err);
    res.status(500).json({ success: false, message: 'Data mustahik tidak dapat dimuat.' });
  }
});

// Detail Mustahik (with relations)
app.get('/api/mustahik/:id', authenticateToken, requireRole('admin', 'penyaluran', 'surveyor', 'keuangan'), async (req, res) => {
  try {
    const repository = req.app.locals.dataAccessRepository || {};
    const data = await (repository.getMustahikById || getMustahikById)(req.params.id, { ppdOnly: req.user?.role === 'keuangan' });
    if (!data) return res.status(404).json({ success: false, message: 'Mustahik tidak ditemukan' });
    res.json({ success: true, data });
  } catch (err) {
    console.error('Get mustahik error:', err);
    res.status(500).json({ success: false, message: 'Data mustahik tidak dapat dimuat.' });
  }
});

// Create Mustahik
app.post('/api/mustahik', authenticateToken, requireRole('admin', 'penyaluran'), legacyPenyaluranWriteGuard('create'), async (req, res) => {
  try {
    const db = req.app?.locals?.db || req.db;
    const sanitizedBody = {};
    for (const col of LEGACY_MUSTAHIK_WRITABLE_COLUMNS) {
      if (req.body && req.body[col] !== undefined) {
        sanitizedBody[col] = req.body[col];
      }
    }
    const id = await createMustahik(sanitizedBody, req.user?.id, db);
    invalidateCache();
    res.status(201).json({ success: true, data: { id }, message: 'Data mustahik berhasil ditambahkan' });
  } catch (err) {
    console.error('Create mustahik error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update Mustahik
app.put('/api/mustahik/:id', authenticateToken, requireRole('admin', 'penyaluran'), legacyPenyaluranWriteGuard('update'), async (req, res) => {
  try {
    const db = req.app?.locals?.db || req.db;
    if (req.body.status !== undefined) {
      const action = req.body.action || (req.body.status === 'Ditolak' ? 'reject' : 'approve');
      const result = await submitMustahikDecision(req.params.id, {
        ...req.body,
        action,
        target_status: req.body.status,
        notes: req.body.notes || req.body.reason || `Status diperbarui ke ${req.body.status}.`,
      }, req.user, db);
      invalidateCache();
      return res.json(result);
    }
    const sanitizedBody = {};
    for (const col of LEGACY_MUSTAHIK_WRITABLE_COLUMNS) {
      if (req.body && req.body[col] !== undefined) {
        sanitizedBody[col] = req.body[col];
      }
    }
    const ok = await updateMustahik(req.params.id, sanitizedBody, db);
    if (!ok) return res.status(404).json({ success: false, message: 'Mustahik tidak ditemukan atau tidak ada perubahan' });
    invalidateCache();
    res.json({ success: true, message: 'Data mustahik berhasil diperbarui' });
  } catch (err) {
    console.error('Update mustahik error:', err);
    res.status(err.status || 500).json({ success: false, message: err.message, code: err.code });
  }
});

// Delete Mustahik (Permanently Disabled - HTTP 405)
app.delete('/api/mustahik/:id', legacyHardDeleteGuard);

// Audited Archive & Restore Mustahik
async function handleArchiveEndpoint(req, res) {
  try {
    const db = req.app?.locals?.db || req.db;
    const result = await archiveCase({ actor: req.user, db }, Number(req.params.id), {
      reason: req.body?.reason || req.body?.note,
      expected_status: req.body?.expected_status,
      expected_version: req.body?.expected_version,
      idempotency_key: req.get('Idempotency-Key') || req.get('X-Idempotency-Key') || req.body?.idempotency_key,
      correlation_id: req.get('X-Correlation-Id') || req.body?.correlation_id,
    });
    invalidateCache();
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof P0Error) {
      return res.status(err.status).json(err.toJSON());
    }
    res.status(err.status || 500).json({ success: false, message: err.message, code: err.code });
  }
}

async function handleRestoreEndpoint(req, res) {
  try {
    const db = req.app?.locals?.db || req.db;
    const result = await restoreCase({ actor: req.user, db }, Number(req.params.id), {
      reason: req.body?.reason || req.body?.note,
      expected_status: req.body?.expected_status,
      expected_version: req.body?.expected_version,
      idempotency_key: req.get('Idempotency-Key') || req.get('X-Idempotency-Key') || req.body?.idempotency_key,
      correlation_id: req.get('X-Correlation-Id') || req.body?.correlation_id,
    });
    invalidateCache();
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof P0Error) {
      return res.status(err.status).json(err.toJSON());
    }
    res.status(err.status || 500).json({ success: false, message: err.message, code: err.code });
  }
}

// Canonical Admin Endpoints
app.post('/api/admin/penyaluran/mustahik/:id/archive', authenticateToken, requireRole('admin'), handleArchiveEndpoint);
app.post('/api/admin/penyaluran/mustahik/:id/restore', authenticateToken, requireRole('admin'), handleRestoreEndpoint);

// Compatibility Alias Endpoints
app.post('/api/mustahik/:id/archive', authenticateToken, requireRole('admin'), handleArchiveEndpoint);
app.post('/api/mustahik/:id/restore', authenticateToken, requireRole('admin'), handleRestoreEndpoint);

// ==========================================
// 3. ASSESSMENT, MPZIS, PPD, WA APIS
// ==========================================

// Add Assessment (F-BPP/04)
const handleAssessment = async (req, res) => {
  try {
    const assessmentId = await addAssessment(req.params.id, req.body, req.user);
    invalidateCache();
    res.status(201).json({ success: true, data: { id: assessmentId }, message: 'Data assessment survey berhasil disimpan' });
  } catch (err) {
    console.error('Add assessment error:', err);
    res.status(err.status || 500).json({ success: false, message: err.message, code: err.code });
  }
};
app.post('/api/mustahik/:id/assessment', authenticateToken, requireRole('admin', 'penyaluran', 'surveyor'), legacyPenyaluranWriteGuard('assessment'), handleAssessment);
app.post('/api/mustahik/:id/assessments', authenticateToken, requireRole('admin', 'penyaluran', 'surveyor'), legacyPenyaluranWriteGuard('assessment'), handleAssessment);

// Add MPZIS (F-BPP/06)
app.post('/api/mustahik/:id/mpzis', authenticateToken, requireRole('admin', 'penyaluran'), legacyPenyaluranWriteGuard('mpzis'), async (req, res) => {
  try {
    const mpzisId = await addMpzis(req.params.id, req.body, req.user);
    invalidateCache();
    res.status(201).json({ success: true, data: { id: mpzisId }, message: 'Data persetujuan MPZIS berhasil disimpan' });
  } catch (err) {
    console.error('Add MPZIS error:', err);
    res.status(err.status || 500).json({ success: false, message: err.message, code: err.code });
  }
});

// Add PPD (F-PKP/03)
app.post('/api/mustahik/:id/ppd', authenticateToken, requireRole('admin', 'penyaluran'), legacyPenyaluranWriteGuard('ppd'), async (req, res) => {
  try {
    const ppdId = await addPpd(req.params.id, req.body, req.user);
    invalidateCache();
    res.status(201).json({ success: true, data: { id: ppdId }, message: 'Data pengajuan dana (PPD/FPD) berhasil disimpan' });
  } catch (err) {
    console.error('Add PPD error:', err);
    res.status(err.status || 500).json({ success: false, message: err.message, code: err.code });
  }
});

// Trigger WhatsApp Notification (5 Phases)
app.post('/api/mustahik/:id/whatsapp', authenticateToken, requireRole('admin', 'penyaluran', 'surveyor'), legacyPenyaluranWriteGuard('whatsapp'), async (req, res) => {
  try {
    const mustahik = await getMustahikById(req.params.id);
    if (!mustahik) {
      return res.status(404).json({ success: false, message: 'Mustahik tidak ditemukan' });
    }

    const phase = req.body.phase || mustahik.status || 'Diajukan';
    const waInfo = generateWaMessage(phase, mustahik);

    if (req.body.custom_message) {
      waInfo.message = req.body.custom_message;
      const phone = waInfo.phone;
      const encoded = encodeURIComponent(req.body.custom_message);
      waInfo.url = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    }

    const logId = await addWaLog({
      mustahik_id: mustahik.id,
      phone: waInfo.phone || mustahik.phone,
      phase,
      message: waInfo.message,
      wa_url: waInfo.url,
      status: 'sent'
    });

    invalidateCache();

    res.json({
      success: true,
      data: {
        log_id: logId,
        phone: waInfo.phone,
        phase,
        message: waInfo.message,
        wa_url: waInfo.url
      },
      message: 'Notifikasi WhatsApp berhasil digenerate'
    });
  } catch (err) {
    console.error('WhatsApp notify error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get WhatsApp Logs
app.get('/api/mustahik/:id/whatsapp', authenticateToken, requireRole('admin', 'penyaluran', 'surveyor'), async (req, res) => {
  try {
    const logs = await getWaLogs(req.params.id);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// 4. DOCUMENTS & GENERAL UPLOADS
// ==========================================

// General Single File Upload
app.post('/api/upload', authenticateToken, requireRole('admin', 'penyaluran', 'surveyor'), legacyPenyaluranWriteGuard('upload'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Tidak ada file yang diunggah' });
  res.json({
    success: true,
    data: {
      filename: req.file.filename,
      original_name: req.file.originalname,
      url: `/uploads/${req.file.filename}`
    }
  });
});

// Add Mustahik Document
app.post('/api/mustahik/:id/documents', authenticateToken, requireRole('admin', 'penyaluran', 'surveyor'), legacyPenyaluranWriteGuard('documents'), async (req, res) => {
  try {
    const filename = normalizeUploadFilename(req.body?.filename);
    if (!filename) {
      return res.status(400).json({ success: false, message: 'Nama berkas tidak valid.' });
    }
    const expectedFileUrl = `/uploads/${filename}`;
    if (req.body?.file_url && req.body.file_url !== expectedFileUrl) {
      return res.status(400).json({ success: false, message: 'URL berkas tidak valid.' });
    }
    const metadata = await findUploadMetadata(filename);
    if (metadata) {
      return res.status(409).json({ success: false, message: 'Berkas sudah dimiliki atau terdaftar pada ruang lingkup lain.' });
    }
    const docId = await addDocument(req.params.id, { ...req.body, filename, file_url: expectedFileUrl });
    invalidateCache();
    res.status(201).json({ success: true, data: { id: docId }, message: 'Dokumen berhasil disimpan' });
  } catch (err) {
    console.error('Add document error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// List Mustahik Documents
app.get('/api/mustahik/:id/documents', authenticateToken, requireRole('admin', 'penyaluran', 'surveyor', 'keuangan'), async (req, res) => {
  try {
    const docs = await getDocuments(req.params.id);
    res.json({ success: true, data: docs });
  } catch (err) {
    console.error('Get documents error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.use((err, req, res, _next) => {
  if (req.path === '/api/public/surat-permohonan' && err?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, code: 'BODY_TOO_LARGE', message: 'Data draft surat melebihi batas 100 KiB.' });
  }
  if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && err?.status === 400)) {
    return res.status(400).json({ success: false, code: 'MALFORMED_BODY', message: 'Body JSON tidak valid.' });
  }
  if (err?.code === 'CORS_ORIGIN_DENIED') {
    return res.status(403).json({ success: false, message: 'Origin tidak diizinkan' });
  }
  if (err instanceof multer.MulterError) {
    const isTooLarge = err.code === 'LIMIT_FILE_SIZE';
    return res.status(isTooLarge ? 413 : 422).json({
      success: false,
      message: isTooLarge ? 'Ukuran file melebihi batas 10 MB.' : 'Unggahan file tidak valid.',
    });
  }
  if (err?.code === 'UPLOAD_VALIDATION_FAILED') {
    return res.status(422).json({ success: false, message: err.message });
  }
  console.error('Unhandled request error:', err?.message || 'Unknown error');
  return res.status(500).json({ success: false, message: 'Terjadi kesalahan sistem.' });
});

export async function startServer(port = PORT, options = {}) {
  const {
    initDbFn = initDb,
    skipAncillaryStartup = false,
    resumeReceiptJobsFn = resumePendingReceiptJobs,
    listenFn = (listenPort, callback) => app.listen(listenPort, callback),
  } = options;
  if (Object.keys(options).length > 0 && process.env.NODE_ENV !== 'test') {
    throw new Error('P0_TEST_SEAMS_REQUIRE_TEST_ENV');
  }
  assertP0CutoverConfiguration();
  await initDbFn();
  if (!skipAncillaryStartup) {
    if (process.env.PENYALURAN_P0_ENABLED === 'true') {
      const configuredReceiptLimit = Number(process.env.PENYALURAN_RECEIPT_STARTUP_MAX_JOBS || 100);
      const receiptLimit = Number.isSafeInteger(configuredReceiptLimit) && configuredReceiptLimit > 0
        ? Math.min(configuredReceiptLimit, 1000)
        : 100;
      // Receipt recovery is part of the P0 readiness contract.  Do not start
      // a P0-enabled listener while recovery cannot validate or reclaim its
      // durable state; the caller/health supervisor can retry startup safely.
      await resumeReceiptJobsFn({ getDb: () => getDb(), artifactRoot: process.env.PENYALURAN_ARTIFACT_DIR, maxJobs: receiptLimit });
    }
    if (process.env.NODE_ENV !== 'test') {
      getProviderSecretEncryptionKey();
    }
    await assertNoPlaintextProviderSecrets();
    await import('./bot.js');
    await runPenerimaanExportStartupMaintenance().catch((err) => {
      console.warn('Pending export jobs resume notice:', err?.message || err);
    });
  }
  return listenFn(port, () => {
    console.log(`====================================================`);
    console.log(`⚡ BAZNAS Data Center V2 API Turbo Server on port ${port}`);
    console.log(`🚀 Compression: Gzip/Deflate enabled`);
    console.log(`⚡ In-Memory Cache: Active (TTL 60s)`);
    console.log(`📊 Aggregates: /api/mustahik/stats & /api/data/overview (<5ms)`);
    console.log(`🩺 Health check: http://localhost:${port}/api/health`);
    console.log(`====================================================`);
  });
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (entryPath === import.meta.url) {
  await startServer();
}

export default app;
