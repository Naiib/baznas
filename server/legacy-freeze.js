/**
 * Legacy Penerimaan Module Freeze & Feature Flag Policy
 * During the migration and rebuild of Divisi Penerimaan, legacy modules are placed into READ-ONLY mode.
 * Any write or mutation operations on legacy artifacts are rejected.
 */

const DEFAULT_FREEZE_NOTICE = 'Mode Baca-Saja: Modul Penerimaan sedang dalam proses migrasi & rebuild. Penambahan/perubahan data melalui antarmuka lama dinonaktifkan.';

export function isLegacyPenerimaanFrozen() {
  if (process.env.LEGACY_PENERIMAAN_READONLY === 'false') {
    return false;
  }
  return true;
}

export function getLegacyPenerimaanFreezeNotice() {
  return DEFAULT_FREEZE_NOTICE;
}

export function legacyPenerimaanReadOnlyGuard(req, res, next) {
  if (isLegacyPenerimaanFrozen()) {
    return res.status(403).json({
      success: false,
      frozen: true,
      message: DEFAULT_FREEZE_NOTICE,
    });
  }
  return next();
}
