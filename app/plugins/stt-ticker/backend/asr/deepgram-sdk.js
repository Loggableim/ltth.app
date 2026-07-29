let cachedSdk = null;

function loadDeepgramSdk() {
  if (cachedSdk) return cachedSdk;

  try {
    const sdk = require('@deepgram/sdk');
    if (typeof sdk?.DeepgramClient !== 'function') {
      cachedSdk = {
        available: false,
        reasonCode: 'deepgram_sdk_invalid',
        DeepgramClient: null,
        DeepgramError: null
      };
    } else {
      cachedSdk = {
        available: true,
        reasonCode: null,
        DeepgramClient: sdk.DeepgramClient,
        DeepgramError: typeof sdk.DeepgramError === 'function' ? sdk.DeepgramError : null
      };
    }
  } catch (error) {
    cachedSdk = {
      available: false,
      reasonCode: 'deepgram_sdk_unavailable',
      DeepgramClient: null,
      DeepgramError: null
    };
  }

  return cachedSdk;
}

function getDeepgramSdkStatus() {
  const sdk = loadDeepgramSdk();
  return {
    available: sdk.available,
    reasonCode: sdk.reasonCode
  };
}

function createDeepgramClient(apiKey) {
  const sdk = loadDeepgramSdk();
  if (!sdk.available) {
    const error = new Error('Deepgram SDK is unavailable');
    error.code = sdk.reasonCode;
    throw error;
  }
  return new sdk.DeepgramClient({ apiKey });
}

function isDeepgramError(error) {
  const sdk = loadDeepgramSdk();
  return Boolean(sdk.DeepgramError && error instanceof sdk.DeepgramError);
}

module.exports = {
  createDeepgramClient,
  getDeepgramSdkStatus,
  isDeepgramError
};
