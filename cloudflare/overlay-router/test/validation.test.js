import { describe, expect, it } from 'vitest';
import {
  AUTHENTICATED_JSON_MAX_BYTES,
  MANAGEMENT_BODY_SCHEMAS,
  RequestValidationError,
  createNeutralErrorResponse,
  generateRouteKey,
  normalizeTikTokUsername,
  parseAuthenticatedJsonBody,
  parseInternalRouteHost,
  parseQuickTunnelOrigin
} from './src/validation.js';

function expectValidationFailure(operation, code = 'invalid_request') {
  expect(operation).toThrowError(RequestValidationError);
  try {
    operation();
  } catch (error) {
    expect(error.code).toBe(code);
  }
}

async function expectAsyncValidationFailure(operation, code = 'invalid_request') {
  try {
    await operation();
    throw new Error('Expected request validation to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(RequestValidationError);
    expect(error.code).toBe(code);
  }
}

describe('TikTok username validation', () => {
  it('normalizes surrounding space, one leading at sign, compatibility forms, and ASCII case', () => {
    expect(normalizeTikTokUsername('  @Ｆｏｏ_１２.Bar  ')).toBe('foo_12.bar');
    expect(normalizeTikTokUsername('Creator.Name')).toBe('creator.name');
  });

  it.each([
    '',
    ' ',
    '@',
    '@@validname',
    'a',
    'a'.repeat(25),
    '.',
    '..',
    '...',
    '.creator',
    'creator.',
    'creator..name',
    '\u2026',
    'user/name',
    'user\\name',
    'user\u2215name',
    'user\uFF0Fname',
    'user%2fname',
    'user%252fname',
    'user name',
    'user\tname',
    'user\nname',
    'user\u0000name',
    'u\u0455ername',
    '\uFF20username'
  ])('rejects unsafe or non-canonical username %j', (value) => {
    expectValidationFailure(() => normalizeTikTokUsername(value), 'invalid_username');
  });

  it('rejects non-string username input without coercion', () => {
    expectValidationFailure(() => normalizeTikTokUsername({ toString: () => 'validname' }),
      'invalid_username');
  });
});

describe('route key and internal host validation', () => {
  it('generates 128-bit lowercase DNS-safe route keys', () => {
    const first = generateRouteKey();
    const second = generateRouteKey();

    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(second).toMatch(/^[0-9a-f]{32}$/);
    expect(first).not.toBe(second);
  });

  it('accepts only the exact internal route hostname grammar', () => {
    const routeKey = '0123456789abcdef0123456789abcdef';
    expect(parseInternalRouteHost(`r-${routeKey}.ltth.app`)).toBe(routeKey);

    for (const hostname of [
      `r-${routeKey.toUpperCase()}.ltth.app`,
      `R-${routeKey}.ltth.app`,
      `r-${routeKey}.ltth.app.evil.test`,
      `prefix.r-${routeKey}.ltth.app`,
      `r-${routeKey}.ltth.app:443`,
      `r-${routeKey.slice(1)}.ltth.app`,
      `r-${routeKey}0.ltth.app`,
      `r-${routeKey.replace('a', 'g')}.ltth.app`
    ]) {
      expect(parseInternalRouteHost(hostname)).toBeNull();
    }
  });
});

describe('Quick Tunnel origin validation', () => {
  it('returns the canonical origin for an exact HTTPS one-label Quick Tunnel', () => {
    expect(parseQuickTunnelOrigin('https://quiet-river-123.trycloudflare.com'))
      .toBe('https://quiet-river-123.trycloudflare.com');
  });

  it.each([
    'http://quiet-river.trycloudflare.com',
    'https://quiet-river.trycloudflare.com/',
    'https://QUIET-RIVER.trycloudflare.com',
    'https://user@quiet-river.trycloudflare.com',
    'https://user:pass@quiet-river.trycloudflare.com',
    'https://quiet-river.trycloudflare.com:443',
    'https://quiet-river.trycloudflare.com:8443',
    'https://quiet-river.trycloudflare.com/path',
    'https://quiet-river.trycloudflare.com?secret=value',
    'https://quiet-river.trycloudflare.com#fragment',
    'https://two.labels.trycloudflare.com',
    'https://trycloudflare.com',
    'https://quiet-river.trycloudflare.com.evil.test',
    'https://quiet-river.trycloudflare.com%2eevil.test',
    'https://quiet-river.trycloudflare.com@evil.test',
    ' https://quiet-river.trycloudflare.com',
    'https://quiet_river.trycloudflare.com'
  ])('rejects non-exact Quick Tunnel target %j', (value) => {
    expectValidationFailure(() => parseQuickTunnelOrigin(value), 'invalid_tunnel_origin');
  });
});

describe('authenticated JSON body parsing', () => {
  it('normalizes a known management schema and rejects unknown keys', async () => {
    const request = new Request('https://overlay.ltth.app/_ltth/v1/claims', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ username: ' @Creator.Name ' })
    });
    await expect(parseAuthenticatedJsonBody(request, MANAGEMENT_BODY_SCHEMAS.claim))
      .resolves.toEqual({ username: 'creator.name' });

    const hostileRequest = new Request('https://overlay.ltth.app/_ltth/v1/claims', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'creator', clerkUserId: 'victim' })
    });
    await expectAsyncValidationFailure(
      () => parseAuthenticatedJsonBody(hostileRequest, MANAGEMENT_BODY_SCHEMAS.claim)
    );
  });

  it('accepts only exact desktop-generated enrollment material', async () => {
    const validEnrollment = {
      deviceId: 'd-0123456789abcdef0123456789abcdef',
      credential: 'a'.repeat(64),
      label: ' Studio PC '
    };
    const request = new Request(
      'https://overlay.ltth.app/_ltth/v1/devices/enroll',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validEnrollment)
      }
    );

    await expect(parseAuthenticatedJsonBody(
      request,
      MANAGEMENT_BODY_SCHEMAS.deviceEnrollment
    )).resolves.toEqual({
      ...validEnrollment,
      label: 'Studio PC'
    });
  });

  it('enforces enrollment material and instance identifier bounds in management schemas', async () => {
    const enrollmentBase = {
      deviceId: 'd-0123456789abcdef0123456789abcdef',
      credential: 'a'.repeat(64)
    };
    const invalidCases = [
      [MANAGEMENT_BODY_SCHEMAS.deviceEnrollment, {
        ...enrollmentBase,
        label: ''
      }],
      [MANAGEMENT_BODY_SCHEMAS.deviceEnrollment, {
        ...enrollmentBase,
        label: 'x'.repeat(65)
      }],
      [MANAGEMENT_BODY_SCHEMAS.deviceEnrollment, {
        ...enrollmentBase,
        label: 'Studio\nPC'
      }],
      [MANAGEMENT_BODY_SCHEMAS.deviceEnrollment, {
        ...enrollmentBase,
        deviceId: 'bad id',
        label: 'Studio PC'
      }],
      [MANAGEMENT_BODY_SCHEMAS.deviceEnrollment, {
        ...enrollmentBase,
        credential: 'A'.repeat(64),
        label: 'Studio PC'
      }],
      [MANAGEMENT_BODY_SCHEMAS.deviceEnrollment, {
        ...enrollmentBase,
        credential: 'a'.repeat(63),
        label: 'Studio PC'
      }],
      [MANAGEMENT_BODY_SCHEMAS.leaseUpdate, {
        deviceId: 'device-1',
        instanceId: 'x'.repeat(129),
        tunnelOrigin: 'https://valid.trycloudflare.com',
        expectedRevision: 1
      }],
      [MANAGEMENT_BODY_SCHEMAS.leaseUpdate, {
        deviceId: 'device-1',
        instanceId: 'bad instance',
        tunnelOrigin: 'https://valid.trycloudflare.com',
        expectedRevision: 1
      }]
    ];

    for (const [schema, body] of invalidCases) {
      const request = new Request('https://overlay.ltth.app/_ltth/v1/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      await expectAsyncValidationFailure(() => parseAuthenticatedJsonBody(request, schema));
    }
  });

  it('allows an omitted expected revision for initial lease activation', async () => {
    const request = new Request('https://overlay.ltth.app/_ltth/v1/lease', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'device-1',
        instanceId: 'instance-1',
        tunnelOrigin: 'https://valid.trycloudflare.com'
      })
    });

    await expect(parseAuthenticatedJsonBody(request, MANAGEMENT_BODY_SCHEMAS.leaseUpdate))
      .resolves.toEqual({
        deviceId: 'device-1',
        instanceId: 'instance-1',
        tunnelOrigin: 'https://valid.trycloudflare.com'
      });
  });

  it('rejects a supplied zero expected revision', async () => {
    const request = new Request('https://overlay.ltth.app/_ltth/v1/lease', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'device-1',
        instanceId: 'instance-1',
        tunnelOrigin: 'https://valid.trycloudflare.com',
        expectedRevision: 0
      })
    });

    await expectAsyncValidationFailure(
      () => parseAuthenticatedJsonBody(request, MANAGEMENT_BODY_SCHEMAS.leaseUpdate)
    );
  });

  it.each([
    ['malformed JSON', '{"username":'],
    ['array JSON', '["creator"]'],
    ['null JSON', 'null'],
    ['primitive JSON', '"creator"']
  ])('rejects %s', async (_name, body) => {
    const request = new Request('https://overlay.ltth.app/_ltth/v1/claims', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body
    });
    await expectAsyncValidationFailure(
      () => parseAuthenticatedJsonBody(request, MANAGEMENT_BODY_SCHEMAS.claim)
    );
  });

  it('rejects missing JSON content type and bodies above the explicit small limit', async () => {
    const wrongType = new Request('https://overlay.ltth.app/_ltth/v1/claims', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{"username":"creator"}'
    });
    await expectAsyncValidationFailure(
      () => parseAuthenticatedJsonBody(wrongType, MANAGEMENT_BODY_SCHEMAS.claim),
      'unsupported_media_type'
    );

    const oversized = new Request('https://overlay.ltth.app/_ltth/v1/claims', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'creator', padding: 'x'.repeat(AUTHENTICATED_JSON_MAX_BYTES) })
    });
    await expectAsyncValidationFailure(
      () => parseAuthenticatedJsonBody(oversized, MANAGEMENT_BODY_SCHEMAS.claim),
      'payload_too_large'
    );
  });
});

describe('neutral error responses', () => {
  it('returns fixed no-store content without echoing sensitive context', async () => {
    const response = createNeutralErrorResponse(503);
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(body).toBe('Service Unavailable');
    for (const secret of [
      'owner_user_123',
      'device-secret',
      '0123456789abcdef0123456789abcdef',
      'https://hidden.trycloudflare.com',
      'scene=private'
    ]) {
      expect(body).not.toContain(secret);
    }
  });
});
