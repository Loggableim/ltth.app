/**
 * Web Worker for Sound Processing
 *
 * Handles:
 * - Sound downloading
 * - Sound validation
 * - Audio format detection
 * - Metadata extraction
 */

importScripts('/js/frontend-logger.js');
const log = self.FrontendLogger.createLogger('SoundWorker');

self.addEventListener('message', async (event) => {
  const { type, data } = event.data;

  try {
    switch (type) {
      case 'download':
        await downloadSound(data.url, data.id);
        break;

      case 'validate':
        await validateSound(data.url, data.id);
        break;

      case 'batch_download':
        await batchDownload(data.sounds);
        break;

      default:
        self.postMessage({ type: 'error', error: 'Unknown command type' });
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error.message,
      id: data.id
    });
  }
});

/**
 * Download and validate a sound
 */
async function downloadSound(url, id) {
  try {
    self.postMessage({ type: 'progress', id, status: 'downloading' });

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();

    // Validate audio type
    if (!blob.type.startsWith('audio/')) {
      throw new Error('Invalid audio format');
    }

    self.postMessage({
      type: 'complete',
      id,
      blob,
      size: blob.size,
      mimeType: blob.type,
      url
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      id,
      error: error.message
    });
  }
}

/**
 * Validate a sound without downloading full file
 */
async function validateSound(url, id) {
  try {
    const response = await fetch(url, { method: 'HEAD' });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type');
    const contentLength = response.headers.get('content-length');

    if (!contentType || !contentType.startsWith('audio/')) {
      throw new Error('Invalid audio format');
    }

    self.postMessage({
      type: 'validated',
      id,
      valid: true,
      mimeType: contentType,
      size: parseInt(contentLength || '0', 10)
    });
  } catch (error) {
    self.postMessage({
      type: 'validated',
      id,
      valid: false,
      error: error.message
    });
  }
}

/** Per-download timeout in milliseconds. */
const BATCH_DOWNLOAD_TIMEOUT_MS = 15000;

/** Maximum retry attempts per item in a batch download. */
const BATCH_MAX_RETRIES = 2;

/**
 * Fetch a single URL with an AbortController-based timeout and bounded retries.
 * Returns the Response on success or throws on final failure.
 * @param {string} url
 * @param {number} maxRetries
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, maxRetries) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BATCH_DOWNLOAD_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
      // Only retry on network/timeout errors, not intentional aborts from outside.
      if (attempt < maxRetries) {
        log.warn('Batch download attempt failed, retrying', { url, attempt, error: err.message });
      }
    }
  }
  throw lastError;
}

/**
 * Download multiple sounds sequentially with explicit failure reporting.
 * The batch_complete message includes both successes and failures so callers
 * can distinguish partial failures from full success.
 * @param {Array<{id: *, url: string}>} sounds
 */
async function batchDownload(sounds) {
  const results = [];
  const failures = [];

  for (let i = 0; i < sounds.length; i++) {
    const sound = sounds[i];
    const soundId = sound.id !== undefined ? sound.id : null;

    self.postMessage({
      type: 'batch_progress',
      current: i + 1,
      total: sounds.length,
      url: sound.url
    });

    try {
      const response = await fetchWithRetry(sound.url, BATCH_MAX_RETRIES);

      if (!response.ok) {
        const errMsg = `HTTP ${response.status}`;
        log.error('Batch download HTTP error', { index: i, url: sound.url, id: soundId, status: response.status });
        failures.push({ id: soundId, url: sound.url, error: errMsg, index: i });
        self.postMessage({ type: 'batch_error', index: i, url: sound.url, id: soundId, error: errMsg });
        continue;
      }

      const blob = await response.blob();

      if (!blob.type.startsWith('audio/')) {
        const errMsg = `Invalid audio format: ${blob.type || 'unknown'}`;
        log.error('Batch download invalid MIME', { index: i, url: sound.url, id: soundId, mimeType: blob.type });
        failures.push({ id: soundId, url: sound.url, error: errMsg, index: i });
        self.postMessage({ type: 'batch_error', index: i, url: sound.url, id: soundId, error: errMsg });
        continue;
      }

      results.push({
        id: sound.id,
        url: sound.url,
        blob,
        size: blob.size
      });
    } catch (error) {
      log.error('Batch download error', { index: i, url: sound.url, id: soundId, error: error.message });
      failures.push({ id: soundId, url: sound.url, error: error.message, index: i });
      self.postMessage({ type: 'batch_error', index: i, url: sound.url, id: soundId, error: error.message });
    }
  }

  self.postMessage({
    type: 'batch_complete',
    results,
    failures
  });
}
