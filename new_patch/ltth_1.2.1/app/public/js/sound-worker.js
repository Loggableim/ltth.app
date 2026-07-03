/**
 * Web Worker for Sound Processing
 *
 * Handles:
 * - Sound downloading
 * - Sound validation
 * - Audio format detection
 * - Metadata extraction
 */

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

/**
 * Download multiple sounds in parallel
 */
async function batchDownload(sounds) {
  const results = [];

  for (let i = 0; i < sounds.length; i++) {
    const sound = sounds[i];

    try {
      self.postMessage({
        type: 'batch_progress',
        current: i + 1,
        total: sounds.length,
        url: sound.url
      });

      const response = await fetch(sound.url);
      if (!response.ok) continue;

      const blob = await response.blob();
      if (!blob.type.startsWith('audio/')) continue;

      results.push({
        id: sound.id,
        url: sound.url,
        blob,
        size: blob.size
      });
    } catch (error) {
      // Skip failed downloads
      console.error('Batch download error:', error);
    }
  }

  self.postMessage({
    type: 'batch_complete',
    results
  });
}
