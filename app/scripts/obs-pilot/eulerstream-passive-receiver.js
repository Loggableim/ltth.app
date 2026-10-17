'use strict';

const { projectSuperFanDisplayMessage } = require('../../plugins/clarityhud/lib/superfan-classifier');
const { projectViewerXpAvatarUrl } = require('../../modules/public-overlay-payload-projection');

const ALLOWED_TARGET = 'marry_backup';
const ALLOWED_ENDPOINT = 'wss://ws.eulerstream.com';
const API_KEY_ENV = 'EULER_FALLBACK_API_KEY';
const MAX_CAPTURE_MS = 10 * 60 * 1000;
const MAX_FRAME_BYTES = 1024 * 1024;
const CONSOLE_METHODS = ['debug', 'info', 'log', 'warn', 'error'];
const ALLOWED_SOCKET_ERROR_CODES = new Set([
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'EAI_AGAIN', 'ECONNREFUSED',
  'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND', 'EPIPE', 'ETIMEDOUT',
  'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
]);
const CLOSE_REASON_BY_CODE = new Map([
  [1000, 'normal'], [1011, 'server-error'], [4005, 'stream-ended'],
  [4006, 'no-messages-timeout'], [4400, 'invalid-options'], [4401, 'auth-rejected'],
  [4403, 'permission-denied'], [4404, 'stream-not-live'], [4429, 'rate-limited'],
  [4500, 'upstream-closed'], [4555, 'max-lifetime'], [4556, 'webcast-fetch-error'],
  [4557, 'room-info-fetch-error']
]);

function projectSocketErrorCode(error) {
  return typeof error?.code === 'string' && ALLOWED_SOCKET_ERROR_CODES.has(error.code)
    ? error.code
    : 'unknown';
}

function projectCloseDiagnostic(code) {
  const validCode = Number.isInteger(code) && code >= 1000 && code <= 4999 ? code : null;
  if (validCode === null) return null;
  return Object.freeze({
    event: 'close',
    code: validCode,
    reasonClass: CLOSE_REASON_BY_CODE.get(validCode) || 'unknown'
  });
}

function formatDiagnostic(result) {
  if (!result?.diagnostic) return '';
  return JSON.stringify({ status: result.status, diagnostic: result.diagnostic });
}

function isSingleApiKey(value) {
  return typeof value === 'string' &&
    value.length >= 32 &&
    value === value.trim() &&
    !/[\s,]/.test(value);
}

function validateWebSocketUrl(urlValue, target, apiKey) {
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    return false;
  }

  const queryKeys = Array.from(url.searchParams.keys()).sort();
  return url.protocol === 'wss:' &&
    url.origin === ALLOWED_ENDPOINT &&
    url.hostname === 'ws.eulerstream.com' &&
    url.pathname === '/' &&
    !url.port &&
    !url.username &&
    !url.password &&
    !url.hash &&
    url.searchParams.get('uniqueId') === target &&
    url.searchParams.get('apiKey') === apiKey &&
    url.searchParams.getAll('apiKey').length === 1 &&
    queryKeys.length === 2 &&
    queryKeys[0] === 'apiKey' &&
    queryKeys[1] === 'uniqueId';
}

function projectApprovedDto(message) {
  const projected = projectSuperFanDisplayMessage(message, projectViewerXpAvatarUrl);
  if (!projected || !['superfan', 'superfan-join'].includes(projected.eventType)) return null;
  if (typeof projected.displayName !== 'string' ||
      !projected.displayName.trim() ||
      projected.displayName.length > 80 ||
      /[\u0000-\u001f\u007f]/.test(projected.displayName)) return null;

  const dto = {
    eventType: projected.eventType,
    displayName: projected.displayName
  };

  if (projected.level !== undefined) {
    if (!Number.isInteger(projected.level) || projected.level < 0 || projected.level > 999) return null;
    dto.level = projected.level;
  }

  if (projected.profilePictureUrl !== undefined) {
    const approvedAvatar = projectViewerXpAvatarUrl(projected.profilePictureUrl);
    if (!approvedAvatar || approvedAvatar !== projected.profilePictureUrl) return null;
    dto.profilePictureUrl = approvedAvatar;
  }

  return Object.freeze(dto);
}

function decodeQuietly(decodeFrame, bytes) {
  const original = Object.create(null);
  for (const method of CONSOLE_METHODS) {
    original[method] = console[method];
    console[method] = () => {};
  }

  try {
    return decodeFrame(bytes);
  } finally {
    for (const method of CONSOLE_METHODS) console[method] = original[method];
  }
}

function attach(socket, event, handler) {
  if (typeof socket.on === 'function') socket.on(event, handler);
  else if (typeof socket.addEventListener === 'function') socket.addEventListener(event, handler);
}

function detach(socket, event, handler) {
  if (typeof socket.off === 'function') socket.off(event, handler);
  else if (typeof socket.removeListener === 'function') socket.removeListener(event, handler);
  else if (typeof socket.removeEventListener === 'function') socket.removeEventListener(event, handler);
}

function runPassiveCapture({ target, apiKey, onDto = () => {} }, dependencies) {
  if (target !== ALLOWED_TARGET || !isSingleApiKey(apiKey) || typeof onDto !== 'function') {
    return Promise.resolve({ status: 'invalid-input', acceptedCount: 0 });
  }

  if (!dependencies ||
      typeof dependencies.createWebSocketUrl !== 'function' ||
      typeof dependencies.WebSocket !== 'function' ||
      typeof dependencies.decodeFrame !== 'function') {
    return Promise.resolve({ status: 'missing-runtime', acceptedCount: 0 });
  }

  let socketUrl;
  try {
    socketUrl = dependencies.createWebSocketUrl({ uniqueId: target, apiKey });
  } catch {
    return Promise.resolve({ status: 'url-error', acceptedCount: 0 });
  }

  if (!validateWebSocketUrl(socketUrl, target, apiKey)) {
    return Promise.resolve({ status: 'url-rejected', acceptedCount: 0 });
  }

  return new Promise((resolve) => {
    let socket = null;
    let settled = false;
    let resolved = false;
    let finalStatus = null;
    let finalDiagnostic = null;
    let acceptedCount = 0;
    let deadlineTimer = null;
    const deadlineAt = Date.now() + MAX_CAPTURE_MS;

    const detachCaptureHandlers = () => {
      if (!socket) return;
      detach(socket, 'open', onOpen);
      detach(socket, 'message', onMessage);
    };

    const detachTransportHandlers = () => {
      if (!socket) return;
      detach(socket, 'error', onError);
      detach(socket, 'close', onClose);
    };

    const resolveOnce = () => {
      if (resolved) return;
      resolved = true;
      detachCaptureHandlers();
      detachTransportHandlers();
      resolve(finalDiagnostic
        ? { status: finalStatus, acceptedCount, diagnostic: finalDiagnostic }
        : { status: finalStatus, acceptedCount });
    };

    const stopSocket = (force) => {
      if (!socket) return;
      try {
        if (force && typeof socket.terminate === 'function') {
          socket.terminate();
        } else if (socket.readyState === 0 || socket.readyState === 1) {
          socket.close(1000, 'passive capture complete');
        }
      } catch {
        // Socket errors are intentionally discarded; no transport details or URL are logged.
      }
    };

    const finish = (status, forceClose = false, diagnostic = null) => {
      if (settled) return;
      settled = true;
      finalStatus = status;
      finalDiagnostic = diagnostic;
      clearTimeout(deadlineTimer);
      detachCaptureHandlers();
      if (forceClose) {
        // Keep a silent error listener installed until ws emits close. In ws 8.21.0,
        // terminate() during CONNECTING emits an asynchronous error before close.
        stopSocket(true);
        return;
      }
      if (status !== 'closed') stopSocket(false);
      resolveOnce();
    };

    const onOpen = () => {};
    const onClose = (code) => {
      if (!settled) {
        finish('closed', false, projectCloseDiagnostic(code));
        return;
      }
      resolveOnce();
    };
    const onError = (error) => finish('socket-error', true, Object.freeze({
      event: 'error',
      code: projectSocketErrorCode(error)
    }));
    const onMessage = (messageEvent) => {
      if (settled) return;
      if (Date.now() >= deadlineAt) {
        finish('deadline', true);
        return;
      }

      const data = messageEvent && Object.prototype.hasOwnProperty.call(messageEvent, 'data')
        ? messageEvent.data
        : messageEvent;
      let bytes;
      let decoded;
      try {
        if (Buffer.isBuffer(data)) {
          if (data.length > MAX_FRAME_BYTES) {
            finish('frame-rejected', true);
            return;
          }
          bytes = new Uint8Array(data);
        } else if (data instanceof ArrayBuffer && data.byteLength <= MAX_FRAME_BYTES) {
          bytes = new Uint8Array(data);
        } else if (ArrayBuffer.isView(data) && data.byteLength <= MAX_FRAME_BYTES) {
          bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        } else {
          finish('frame-rejected', true);
          return;
        }

        decoded = decodeQuietly(dependencies.decodeFrame, bytes);
        const messages = decoded?.protoMessageFetchResult?.messages;
        if (!Array.isArray(messages)) return;

        for (const item of messages) {
          const event = item?.decodedData;
          if (!event || event.type !== 'WebcastBarrageMessage' || !event.data) continue;
          const dto = projectApprovedDto(event.data);
          if (!dto) continue;

          try {
            const callbackResult = onDto(dto);
            if (callbackResult && typeof callbackResult.then === 'function') {
              finish('async-consumer-rejected', true);
              return;
            }
            acceptedCount += 1;
          } catch {
            finish('consumer-error', true);
            return;
          }
        }
      } catch {
        finish('decode-error', true);
      } finally {
        if (bytes) bytes.fill(0);
        bytes = null;
        decoded = null;
      }
    };

    try {
      socket = new dependencies.WebSocket(socketUrl, {
        maxPayload: MAX_FRAME_BYTES,
        perMessageDeflate: false
      });
    } catch {
      finalStatus = 'connect-error';
      resolveOnce();
      return;
    }

    attach(socket, 'open', onOpen);
    attach(socket, 'message', onMessage);
    attach(socket, 'error', onError);
    attach(socket, 'close', onClose);

    deadlineTimer = setTimeout(() => finish('deadline', true), MAX_CAPTURE_MS);
  });
}

function loadRuntimeDependencies() {
  const sdk = require('@eulerstream/euler-websocket-sdk');
  if (sdk.BASE_URL !== ALLOWED_ENDPOINT) {
    throw new Error('runtime-endpoint-rejected');
  }

  const WebSocket = require('ws');
  return {
    createWebSocketUrl: sdk.createWebSocketUrl,
    WebSocket,
    decodeFrame: createRuntimeDecoder(sdk)
  };
}

function createRuntimeDecoder(sdk) {
  return (bytes) => {
    let parsedJson;
    try {
      parsedJson = JSON.parse(Buffer.from(bytes).toString('utf8'));
    } catch {
      return sdk.deserializeWebSocketMessage(bytes, sdk.SchemaVersion.v2);
    }

    const candidates = Array.isArray(parsedJson?.messages)
      ? parsedJson.messages
      : [parsedJson];
    const allowedMessages = [];
    for (const candidate of candidates) {
      const decoded = candidate?.decodedData;
      const event = candidate?.type && candidate?.data
        ? candidate
        : decoded;
      if (event?.type === 'WebcastBarrageMessage' && event.data) {
        allowedMessages.push({ decodedData: { type: event.type, data: event.data } });
      }
    }
    return { protoMessageFetchResult: { messages: allowedMessages } };
  };
}

function parseTargetArgs(args) {
  return args.length === 2 && args[0] === '--target' && args[1] === ALLOWED_TARGET
    ? ALLOWED_TARGET
    : null;
}

function exitCodeForResult(result) {
  if (result.status === 'deadline') return result.acceptedCount > 0 ? 0 : 6;
  if (result.status === 'closed') return 7;
  if (result.status === 'socket-error') return 8;
  if (result.status === 'decode-error') return 9;
  if (result.status === 'frame-rejected') return 10;
  if (result.status === 'consumer-error' || result.status === 'async-consumer-rejected') return 11;
  return 4;
}

async function main(args = process.argv.slice(2), env = process.env) {
  const target = parseTargetArgs(args);
  if (!target || !isSingleApiKey(env[API_KEY_ENV])) {
    process.exitCode = 2;
    return;
  }

  let dependencies;
  try {
    dependencies = loadRuntimeDependencies();
  } catch {
    process.exitCode = 3;
    return;
  }

  const result = await runPassiveCapture({ target, apiKey: env[API_KEY_ENV] }, dependencies);
  if (result.diagnostic) {
    process.stdout.write(`${formatDiagnostic(result)}\n`);
  }
  process.exitCode = exitCodeForResult(result);
}

if (require.main === module) {
  process.exitCode = 7;
  for (const method of CONSOLE_METHODS) console[method] = () => {};
  main().catch(() => {
    process.exitCode = 5;
  });
}

module.exports = {
  ALLOWED_ENDPOINT,
  ALLOWED_SOCKET_ERROR_CODES,
  ALLOWED_TARGET,
  API_KEY_ENV,
  MAX_CAPTURE_MS,
  CLOSE_REASON_BY_CODE,
  createRuntimeDecoder,
  exitCodeForResult,
  formatDiagnostic,
  isSingleApiKey,
  loadRuntimeDependencies,
  projectApprovedDto,
  projectCloseDiagnostic,
  projectSocketErrorCode,
  runPassiveCapture,
  validateWebSocketUrl
};
