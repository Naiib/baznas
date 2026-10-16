const LEGACY_PENERIMAAN_PATHS = new Set([
  '/muzakki',
  '/laporan-penerimaan',
  '/laporan_penerimaan',
]);

export function resolveLegacyPenerimaanPath(pathname) {
  const path = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  if (path === '/penerimaan' || LEGACY_PENERIMAAN_PATHS.has(path)) return 'retired';
  return null;
}
