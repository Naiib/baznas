/**
 * BAZNAS Data Center - Penerimaan Export Jobs Service
 * Handles asynchronous report generation, atomic worker claiming,
 * and durable artifact storage in private server storage.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  getPenerimaanExportJob,
  markPenerimaanExportJobProcessing,
  completePenerimaanExportJob,
  failPenerimaanExportJob,
  getPenerimaanReportSummary,
  getPenerimaanReportTransactions,
  getPendingPenerimaanExportJobs,
  reclaimStalePenerimaanExportJob,
} from './repository.js';
import {
  generatePenerimaanPdfReport,
  generatePenerimaanExcelReport,
} from './penerimaan-export.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_EXPORT_DIR = path.resolve(__dirname, '..', 'exports');
export const EXPORT_JOB_LEASE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_EXPORT_JOB_ATTEMPTS = 3;

/**
 * Ensures and returns the private directory where export artifacts are stored.
 */
export function getExportDirectory() {
  const dir = path.resolve(process.env.PENERIMAAN_EXPORT_DIR || DEFAULT_EXPORT_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Validates that artifactPath is strictly contained inside exportDir.
 */
export function isContainedInExportDirectory(artifactPath, exportDir = getExportDirectory()) {
  if (!artifactPath || typeof artifactPath !== 'string') return false;
  const resolvedBase = path.resolve(exportDir);
  const resolvedTarget = path.resolve(artifactPath);
  const relative = path.relative(resolvedBase, resolvedTarget);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Bounded retention cleanup for temporary files and aged export artifacts.
 */
export async function cleanupExportDirectory(options = {}) {
  const exportDir = getExportDirectory();
  const maxAgeMs = options.maxAgeMs ?? (24 * 60 * 60 * 1000); // 24 hours default
  const tempMaxAgeMs = options.tempMaxAgeMs ?? EXPORT_JOB_LEASE_TIMEOUT_MS;
  const now = Date.now();
  let removedTemporary = 0;
  let removedArtifacts = 0;
  try {
    const files = await fs.promises.readdir(exportDir);
    for (const file of files) {
      const filePath = path.join(exportDir, file);
      if (!isContainedInExportDirectory(filePath, exportDir)) continue;
      const stat = await fs.promises.stat(filePath).catch(() => null);
      if (!stat || !stat.isFile()) continue;
      const isTemporary = file.endsWith('.tmp');
      const isStale = now - stat.mtimeMs > (isTemporary ? tempMaxAgeMs : maxAgeMs);
      if (isStale) {
        const removed = await fs.promises.unlink(filePath).then(() => true).catch(() => false);
        if (removed) {
          if (isTemporary) removedTemporary++;
          else removedArtifacts++;
        }
      }
    }
  } catch (err) {
    console.warn('Export directory cleanup error:', err.message);
  }
  return { removedTemporary, removedArtifacts };
}

/**
 * Runs non-blocking export maintenance in a deterministic startup order.
 * Cleanup is best-effort, but recovery must not begin until it settles.
 */
export async function runPenerimaanExportStartupMaintenance({
  cleanup = cleanupExportDirectory,
  recover = resumePendingPenerimaanExportJobs,
} = {}) {
  await Promise.resolve().then(() => cleanup()).catch((err) => {
    console.warn('Penerimaan export cleanup notice:', err?.message || err);
  });
  return recover();
}

/**
 * Atomically processes a single queued export job.
 * Claims the job (queued -> processing), executes report compilation,
 * persists the file artifact atomically, and marks the job completed (or failed).
 *
 * @param {string} jobUuid
 * @param {Object} [options]
 * @param {Object} [options.repository]
 * @returns {Promise<Object>} The updated export job record
 */
export async function processPenerimaanExportJob(jobUuid, options = {}) {
  const repo = options.repository || {};
  const getJobFn = repo.getPenerimaanExportJob || getPenerimaanExportJob;
  const markProcessingFn = repo.markPenerimaanExportJobProcessing || markPenerimaanExportJobProcessing;
  const completeJobFn = repo.completePenerimaanExportJob || completePenerimaanExportJob;
  const failJobFn = repo.failPenerimaanExportJob || failPenerimaanExportJob;
  const summaryFn = repo.getPenerimaanReportSummary || getPenerimaanReportSummary;
  const txFn = repo.getPenerimaanReportTransactions || getPenerimaanReportTransactions;
  const generatePdfFn = options.generatePdfReport || generatePenerimaanPdfReport;
  const generateExcelFn = options.generateExcelReport || generatePenerimaanExcelReport;

  const job = await getJobFn(jobUuid);
  if (!job) {
    const err = new Error(`Export job ${jobUuid} tidak ditemukan.`);
    err.status = 404;
    throw err;
  }

  // Idempotency: if already completed, return existing record without regenerating
  if (job.status === 'completed') {
    return job;
  }

  // If already processing or failed, return controlled conflict (409)
  if (job.status === 'processing') {
    const err = new Error('Job ekspor sedang diproses oleh worker lain.');
    err.status = 409;
    err.code = 'EXPORT_JOB_PROCESSING';
    err.job = job;
    throw err;
  }

  if (job.status === 'failed') {
    const err = new Error(`Job ekspor telah gagal: ${job.error_message || 'Gagal'}`);
    err.status = 409;
    err.code = 'EXPORT_JOB_FAILED';
    err.job = job;
    throw err;
  }

  if (job.status !== 'queued') {
    const err = new Error(`Job ekspor dalam status "${job.status}" dan tidak dapat diproses.`);
    err.status = 409;
    err.code = 'EXPORT_JOB_CONFLICT';
    throw err;
  }

  // Atomically claim the job from queued -> processing
  let claimedJob;
  try {
    claimedJob = await markProcessingFn(job.job_uuid, { id: job.created_by_id, name: job.created_by_name });
  } catch (claimErr) {
    const currentJob = await getJobFn(jobUuid).catch(() => null);
    if (currentJob?.status === 'completed') {
      return currentJob;
    }
    throw claimErr;
  }

  const expectedStartedAt = claimedJob?.processing_started_at || null;
  const format = String(job.format || 'pdf').toLowerCase().trim();
  const filters = job.filters || (typeof job.filters_json === 'string' ? JSON.parse(job.filters_json || '{}') : job.filters_json) || {};
  const fileName = job.file_name || `Laporan-Penerimaan-${filters.period || 'all'}-${Date.now()}.${format}`;

  let tempPath = null;
  let targetPath = null;

  try {
    const summary = await summaryFn(filters);
    const transactions = await txFn(filters, { limit: null });

    const meta = {
      ...filters,
      job_uuid: job.job_uuid,
      data_freshness: summary?.meta?.data_freshness || summary?.reports?.[0]?.data_freshness || null,
    };

    let buffer;
    if (format === 'pdf') {
      buffer = await generatePdfFn({
        meta,
        transactions,
        summary: summary?.kpis,
        actor: { id: job.created_by_id, name: job.created_by_name },
      });
    } else {
      buffer = await generateExcelFn({
        meta,
        transactions,
        summary: summary?.kpis,
        actor: { id: job.created_by_id, name: job.created_by_name },
      });
    }

    // Save artifact to private directory using server-generated UUID and atomic rename
    const exportDir = getExportDirectory();
    const artifactFileName = `${crypto.randomUUID()}.${format}`;
    targetPath = path.join(exportDir, artifactFileName);
    tempPath = path.join(exportDir, `.${crypto.randomUUID()}.tmp`);

    await fs.promises.writeFile(tempPath, buffer);
    await fs.promises.rename(tempPath, targetPath);
    tempPath = null;

    const completed = await completeJobFn(job.job_uuid, {
      fileName,
      fileSize: buffer.length,
      artifactPath: targetPath,
      expectedProcessingStartedAt: expectedStartedAt,
    });

    return completed;
  } catch (err) {
    if (tempPath) {
      await fs.promises.unlink(tempPath).catch(() => null);
    }
    if (targetPath) {
      await fs.promises.unlink(targetPath).catch(() => null);
    }
    await failJobFn(job.job_uuid, err.message, { expectedProcessingStartedAt: expectedStartedAt }).catch(() => null);
    throw err;
  }
}

/**
 * Recovers pending export jobs on startup or timeout check:
 * resumes queued jobs and atomically reclaims stale processing jobs.
 */
export async function resumePendingPenerimaanExportJobs(options = {}) {
  const repo = options.repository || {};
  const getPendingFn = repo.getPendingPenerimaanExportJobs || getPendingPenerimaanExportJobs;
  const reclaimFn = repo.reclaimStalePenerimaanExportJob || reclaimStalePenerimaanExportJob;
  const leaseTimeoutMs = options.leaseTimeoutMs ?? EXPORT_JOB_LEASE_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? MAX_EXPORT_JOB_ATTEMPTS;

  let pendingJobs = [];
  try {
    pendingJobs = await getPendingFn();
  } catch (err) {
    console.warn('Failed to query pending export jobs for resume:', err.message);
    return { resumed: 0, failed: 0, skipped: 0 };
  }

  const now = Date.now();
  let resumed = 0;
  let failed = 0;
  let skipped = 0;

  for (const job of pendingJobs) {
    if (job.status === 'processing') {
      const startedAt = job.processing_started_at
        ? new Date(job.processing_started_at).getTime()
        : (job.created_at ? new Date(job.created_at).getTime() : 0);
      const isStale = (now - startedAt) > leaseTimeoutMs;
      if (!isStale) {
        skipped++;
        continue;
      }
      const outcome = await reclaimFn(job.job_uuid, job.processing_started_at, { maxAttempts });
      if (outcome === 'failed') {
        failed++;
      } else if (outcome === 'queued') {
        resumed++;
        processPenerimaanExportJob(job.job_uuid, { repository: repo }).catch(() => null);
      }
    } else if (job.status === 'queued') {
      resumed++;
      processPenerimaanExportJob(job.job_uuid, { repository: repo }).catch(() => null);
    }
  }

  return { resumed, failed, skipped };
}
