const ALLOWED_HOST_SUFFIXES = Object.freeze([
  'tiktokcdn.com',
  'tiktokcdn-eu.com',
  'byteimg.com',
  'ibytedtos.com',
  'muscdn.com'
]);
const ALLOWED_CONTENT_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp'
]);
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 2;
const TIMEOUT_MS = 5_000;

function parseAllowedAvatarUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch (_) {
    return null;
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !ALLOWED_HOST_SUFFIXES.some(suffix => (
      hostname === suffix || hostname.endsWith(`.${suffix}`)
    ))
  ) {
    return null;
  }
  url.hash = '';
  return url;
}

function avatarProxyReference(value) {
  const url = parseAllowedAvatarUrl(value);
  if (!url) return null;
  const token = Buffer.from(url.href, 'utf8').toString('base64url');
  const reference = `/api/streammonsters/avatar/${token}`;
  return reference.length <= 512 ? reference : null;
}

function avatarUrlFromToken(token) {
  if (!/^[a-z0-9_-]{16,1024}$/i.test(String(token || ''))) return null;
  try {
    return parseAllowedAvatarUrl(
      Buffer.from(String(token), 'base64url').toString('utf8')
    );
  } catch (_) {
    return null;
  }
}

async function readAvatarBody(response, maximumBytes, controller) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    throw new Error('STREAM_MONSTERS_AVATAR_BODY_UNAVAILABLE');
  }
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      totalBytes += chunk.length;
      if (totalBytes > maximumBytes) {
        controller.abort();
        await reader.cancel().catch(() => {});
        throw new Error('STREAM_MONSTERS_AVATAR_TOO_LARGE');
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock?.();
  }
  return Buffer.concat(chunks, totalBytes);
}

async function fetchAvatar(value, {
  fetchImpl = global.fetch,
  timeoutMs = TIMEOUT_MS,
  maximumBytes = MAX_BYTES
} = {}) {
  let url = parseAllowedAvatarUrl(value);
  if (!url || typeof fetchImpl !== 'function') {
    throw new Error('STREAM_MONSTERS_AVATAR_URL_REJECTED');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();
  try {
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      const response = await fetchImpl(url.href, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif' }
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        const next = location ? parseAllowedAvatarUrl(new URL(location, url).href) : null;
        if (!next) throw new Error('STREAM_MONSTERS_AVATAR_REDIRECT_REJECTED');
        url = next;
        continue;
      }
      if (!response.ok && response.status !== 200) {
        throw new Error(`STREAM_MONSTERS_AVATAR_HTTP_${response.status}`);
      }
      const contentType = String(response.headers.get('content-type') || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
        throw new Error('STREAM_MONSTERS_AVATAR_CONTENT_TYPE_REJECTED');
      }
      const contentLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
        controller.abort();
        throw new Error('STREAM_MONSTERS_AVATAR_TOO_LARGE');
      }
      const body = await readAvatarBody(response, maximumBytes, controller);
      return { body, contentType };
    }
    throw new Error('STREAM_MONSTERS_AVATAR_REDIRECT_LIMIT');
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  avatarProxyReference,
  avatarUrlFromToken,
  fetchAvatar,
  parseAllowedAvatarUrl
};
