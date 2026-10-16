import path from 'node:path';

export const UPLOAD_SCOPE = Object.freeze({
  PENERIMAAN: 'penerimaan',
  PENYALURAN: 'penyaluran',
});

/**
 * Accept only a single server-generated upload basename.  URL decoding is
 * performed here so encoded separators cannot bypass the path boundary.
 */
export function normalizeUploadFilename(value) {
  let filename;
  try {
    filename = decodeURIComponent(String(value || ''));
  } catch {
    return null;
  }

  if (!filename || filename === '.' || filename === '..' || filename.includes('\0') || /[\\/]/.test(filename)) {
    return null;
  }
  return filename;
}

export function resolveUploadPath(uploadDir, value) {
  const filename = normalizeUploadFilename(value);
  if (!filename) return null;

  const root = path.resolve(uploadDir);
  const candidate = path.resolve(root, filename);
  if (!isUploadPathContained(root, candidate)) return null;
  return candidate;
}

export function isUploadPathContained(uploadDir, candidatePath) {
  const root = path.resolve(uploadDir);
  const candidate = path.resolve(candidatePath);
  const rootWithSeparator = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return candidate !== root && candidate.startsWith(rootWithSeparator);
}

function normalizedRole(user) {
  return String(user?.role || '').trim().toLowerCase();
}

function normalizedDivision(user) {
  return String(user?.division || '').trim().toLowerCase();
}

export function canDownloadUpload(user, scope) {
  const role = normalizedRole(user);
  if (role === 'admin') return true;

  if (scope === UPLOAD_SCOPE.PENERIMAAN) {
    return role === 'penerimaan' || normalizedDivision(user).includes('penerimaan') || normalizedDivision(user).includes('pengumpulan');
  }

  if (scope === UPLOAD_SCOPE.PENYALURAN) {
    return role === 'penyaluran' || role === 'surveyor';
  }

  return false;
}
