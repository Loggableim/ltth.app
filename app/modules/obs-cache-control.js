const NO_STORE_CACHE_CONTROL = 'no-store, no-cache, must-revalidate, max-age=0';

function shouldDisableCache(pathname) {
  const normalizedPath = String(pathname || '').toLowerCase();

  return normalizedPath.startsWith('/api/') ||
    normalizedPath.includes('overlay') ||
    normalizedPath.includes('obs-hud') ||
    normalizedPath.endsWith('.html') ||
    normalizedPath.endsWith('.htm') ||
    normalizedPath.endsWith('.js');
}

function applyNoStoreHeaders(res) {
  res.setHeader('Cache-Control', NO_STORE_CACHE_CONTROL);
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

function obsCacheControl(req, res, next) {
  if (['GET', 'HEAD'].includes(req.method) && shouldDisableCache(req.path)) {
    applyNoStoreHeaders(res);
  }

  next();
}

module.exports = {
  NO_STORE_CACHE_CONTROL,
  applyNoStoreHeaders,
  obsCacheControl,
  shouldDisableCache
};
