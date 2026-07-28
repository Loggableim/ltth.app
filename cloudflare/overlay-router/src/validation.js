import {
  PRODUCTION_ROUTING_AUTHORITIES,
  classifyRoutingAuthority
} from './authority.js';

export const AUTHENTICATED_JSON_MAX_BYTES = 4096;
export const DEVICE_LABEL_MAX_LENGTH = 64;
export const INSTANCE_ID_MAX_LENGTH = 128;
export const DEVICE_ID_MAX_LENGTH = 128;

const QUICK_TUNNEL_HOST_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]+$/;
const JSON_CONTENT_TYPE_PATTERN =
  /^application\/json(?:\s*;\s*[A-Za-z0-9!#$%&'*+.^_`|~-]+\s*=\s*(?:"[^"]*"|[A-Za-z0-9!#$%&'*+.^_`|~-]+))*\s*$/i;

const NEUTRAL_ERROR_TEXT = Object.freeze({
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  429: 'Too Many Requests',
  502: 'Bad Gateway',
  503: 'Service Unavailable'
});

export class RequestValidationError extends Error {
  constructor(code = 'invalid_request', status = 400) {
    super(code);
    this.name = 'RequestValidationError';
    this.code = code;
    this.status = status;
  }
}

function invalid(code = 'invalid_request', status = 400) {
  throw new RequestValidationError(code, status);
}

export function normalizeTikTokUsername(value) {
  if (typeof value !== 'string') {
    invalid('invalid_username');
  }

  let normalized = value.trim();
  if (normalized.startsWith('@')) {
    normalized = normalized.slice(1);
  }
  normalized = normalized.normalize('NFKC').toLowerCase();

  if (
    normalized.length < 2 ||
    normalized.length > 24 ||
    normalized.split('.').some((segment) => segment.length === 0) ||
    !/^[a-z0-9_.]+$/.test(normalized)
  ) {
    invalid('invalid_username');
  }

  return normalized;
}

export function generateRouteKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function parseInternalRouteHost(
  hostname,
  authorities = PRODUCTION_ROUTING_AUTHORITIES
) {
  const classified = classifyRoutingAuthority(hostname, authorities);
  return classified?.kind === 'proxy' ? classified.routeKey : null;
}

export function parseQuickTunnelOrigin(value) {
  if (typeof value !== 'string' || value.length === 0) {
    invalid('invalid_tunnel_origin');
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    invalid('invalid_tunnel_origin');
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.port !== '' ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    !QUICK_TUNNEL_HOST_PATTERN.test(parsed.hostname) ||
    parsed.origin !== value ||
    new URL(parsed.origin).origin !== value
  ) {
    invalid('invalid_tunnel_origin');
  }

  return parsed.origin;
}

function normalizeDeviceLabel(value) {
  if (typeof value !== 'string') {
    invalid();
  }
  const normalized = value.trim().normalize('NFKC');
  const length = Array.from(normalized).length;
  if (
    length < 1 ||
    length > DEVICE_LABEL_MAX_LENGTH ||
    /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(normalized)
  ) {
    invalid();
  }
  return normalized;
}

function normalizeIdentifier(value, maxLength) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maxLength ||
    !IDENTIFIER_PATTERN.test(value)
  ) {
    invalid();
  }
  return value;
}

function normalizeEnrollmentDeviceId(value) {
  if (
    typeof value !== 'string' ||
    !/^d-[0-9a-f]{32}$/.test(value)
  ) {
    invalid();
  }
  return value;
}

function normalizeEnrollmentCredential(value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value)
  ) {
    invalid();
  }
  return value;
}

function normalizeRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    invalid();
  }
  return value;
}

function field(normalize, required = true) {
  return Object.freeze({ normalize, required });
}

function schema(maxBytes, fields) {
  return Object.freeze({
    maxBytes,
    fields: Object.freeze(fields)
  });
}

export const MANAGEMENT_BODY_SCHEMAS = Object.freeze({
  deviceEnrollment: schema(512, {
    deviceId: field(normalizeEnrollmentDeviceId),
    credential: field(normalizeEnrollmentCredential),
    label: field(normalizeDeviceLabel)
  }),
  claim: schema(256, {
    username: field(normalizeTikTokUsername)
  }),
  claimRelease: schema(256, {
    username: field(normalizeTikTokUsername)
  }),
  empty: schema(64, {}),
  leaseUpdate: schema(1024, {
    deviceId: field((value) => normalizeIdentifier(value, DEVICE_ID_MAX_LENGTH)),
    instanceId: field((value) => normalizeIdentifier(value, INSTANCE_ID_MAX_LENGTH)),
    tunnelOrigin: field(parseQuickTunnelOrigin),
    expectedRevision: field(normalizeRevision, false)
  }),
  leaseClose: schema(512, {
    deviceId: field((value) => normalizeIdentifier(value, DEVICE_ID_MAX_LENGTH)),
    instanceId: field((value) => normalizeIdentifier(value, INSTANCE_ID_MAX_LENGTH)),
    expectedRevision: field(normalizeRevision)
  })
});

async function readBoundedBody(request, maxBytes) {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      invalid();
    }
    if (parsedLength > maxBytes) {
      invalid('payload_too_large', 413);
    }
  }

  if (!request.body) {
    invalid();
  }

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        invalid('payload_too_large', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    invalid();
  }
}

export async function parseAuthenticatedJsonBody(request, selectedSchema) {
  if (
    !request ||
    typeof request.headers?.get !== 'function' ||
    !selectedSchema ||
    typeof selectedSchema !== 'object' ||
    !selectedSchema.fields
  ) {
    invalid();
  }

  const contentType = request.headers.get('content-type') || '';
  if (!JSON_CONTENT_TYPE_PATTERN.test(contentType)) {
    invalid('unsupported_media_type', 415);
  }

  const maxBytes = Math.min(
    selectedSchema.maxBytes || AUTHENTICATED_JSON_MAX_BYTES,
    AUTHENTICATED_JSON_MAX_BYTES
  );
  const source = await readBoundedBody(request, maxBytes);
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    invalid();
  }

  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    invalid();
  }

  const allowedKeys = new Set(Object.keys(selectedSchema.fields));
  for (const key of Object.keys(parsed)) {
    if (!allowedKeys.has(key)) {
      invalid();
    }
  }

  const normalized = {};
  for (const [key, definition] of Object.entries(selectedSchema.fields)) {
    if (!Object.hasOwn(parsed, key)) {
      if (definition.required) {
        invalid();
      }
      continue;
    }
    normalized[key] = definition.normalize(parsed[key]);
  }
  return normalized;
}

export function createNeutralErrorResponse(status = 404) {
  const safeStatus = Object.hasOwn(NEUTRAL_ERROR_TEXT, status) ? status : 404;
  return new Response(NEUTRAL_ERROR_TEXT[safeStatus], {
    status: safeStatus,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'Pragma': 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
