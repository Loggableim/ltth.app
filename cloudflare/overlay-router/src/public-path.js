export const RAW_PATH_GUARD_HEADER = 'x-ltth-raw-path-guard';
export const RAW_PATH_GUARD_TOKEN_ENV =
  'OVERLAY_RAW_PATH_GUARD_TOKEN';

const GUARD_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const INVALID_PERCENT_ESCAPE_PATTERN = /%(?![0-9a-f]{2})/i;
const AMBIGUOUS_ENCODED_PATH_PATTERN =
  /%(?:25|2e|2f|5c)/i;

function constantTimeEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function hasTrustedRawPathAttestation(request, env) {
  const expected = env?.[RAW_PATH_GUARD_TOKEN_ENV];
  if (typeof expected !== 'string' ||
      !GUARD_TOKEN_PATTERN.test(expected)) {
    return false;
  }
  const supplied = request?.headers?.get(RAW_PATH_GUARD_HEADER);
  return typeof supplied === 'string' &&
    GUARD_TOKEN_PATTERN.test(supplied) &&
    constantTimeEqual(supplied, expected);
}

export function isUnambiguousPublicPath(pathname) {
  if (typeof pathname !== 'string' ||
      !pathname.startsWith('/') ||
      pathname.includes('\\') ||
      pathname.includes('//') ||
      INVALID_PERCENT_ESCAPE_PATTERN.test(pathname) ||
      AMBIGUOUS_ENCODED_PATH_PATTERN.test(pathname)) {
    return false;
  }
  return !pathname
    .split('/')
    .some((segment) => segment === '.' || segment === '..');
}
