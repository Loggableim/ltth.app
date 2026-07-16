function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|si$|feature$)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch (_error) {
    return normalizeText(value);
  }
}

function normalizeRequestKey(value) {
  const trimmed = String(value || '').trim();
  return /^https?:\/\//i.test(trimmed) ? normalizeUrl(trimmed) : normalizeText(trimmed);
}

function providerFromTrack(track = {}) {
  const hint = normalizeText(track.provider || track.extractor_key || track.extractor || track.source);
  const url = String(track.webpage_url || track.url || '');
  if (hint.includes('soundcloud') || /(?:^|\.)soundcloud\.com\//i.test(url)) return 'soundcloud';
  if (hint.includes('youtube') || hint.includes('youtu') || /(?:youtube\.com|youtu\.be)\//i.test(url)) return 'youtube';
  return hint || 'url';
}

function soundCloudPath(value) {
  try {
    const url = new URL(String(value || ''));
    return `${url.hostname.replace(/^www\./, '').toLowerCase()}${url.pathname.replace(/\/+$/, '').toLowerCase()}`;
  } catch (_error) {
    return normalizeText(value);
  }
}

function deriveTrackIdentity(track = {}, fallbackUrl = '') {
  const provider = providerFromTrack({ ...track, url: track.webpage_url || track.url || fallbackUrl });
  const rawId = String(track.providerId || track.id || '').trim();
  let providerId = rawId || null;

  if (provider === 'youtube') {
    providerId = providerId || extractYouTubeId(track.webpage_url || track.url || fallbackUrl);
  } else if (provider === 'soundcloud') {
    providerId = providerId || soundCloudPath(track.webpage_url || track.url || fallbackUrl);
  } else {
    providerId = providerId || normalizeUrl(track.webpage_url || track.url || fallbackUrl);
  }

  const safeProviderId = String(providerId || normalizeUrl(fallbackUrl) || 'unknown');
  return {
    provider,
    providerId: safeProviderId,
    trackKey: `${provider}:${safeProviderId}`,
    youtubeId: provider === 'youtube' ? safeProviderId : null
  };
}

function extractYouTubeId(value) {
  try {
    const url = new URL(String(value || ''));
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || null;
    if (['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      if (url.pathname === '/watch') return url.searchParams.get('v');
      const match = url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/);
      return match ? match[1] : null;
    }
  } catch (_error) {
    // The caller will use another stable fallback.
  }
  return null;
}

module.exports = {
  deriveTrackIdentity,
  extractYouTubeId,
  normalizeRequestKey,
  normalizeText,
  normalizeUrl,
  providerFromTrack
};
