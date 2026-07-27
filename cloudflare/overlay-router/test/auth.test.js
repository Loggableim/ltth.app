import { beforeAll, describe, expect, it } from 'vitest';
import {
  AUTH_ERROR_CODES,
  AuthenticationError,
  authenticateClerkManagementRequest,
  authenticateDeviceRequest,
  authenticateOverlayAdminRequest,
  createClerkJwtVerifier,
  hashDeviceCredential
} from './src/auth.js';

const NOW_SECONDS = 1785146400;
const CLERK_ISSUER = 'https://clerk.overlay.test';
const MANAGEMENT_URL =
  'https://overlay.ltth.app/_ltth/v1/account';
const DEVICE_URL =
  'https://overlay.ltth.app/_ltth/v1/device/status';

let primaryKeys;
let rotatedKeys;
let attackerKeys;

function encodeBase64Url(value) {
  const bytes = typeof value === 'string'
    ? new TextEncoder().encode(value)
    : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
}

async function createSigningKeys(kid) {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['sign', 'verify']
  );
  return {
    privateKey: keyPair.privateKey,
    publicJwk: {
      ...await crypto.subtle.exportKey('jwk', keyPair.publicKey),
      alg: 'RS256',
      kid,
      use: 'sig'
    }
  };
}

async function signJwt(payload, signingKeys = primaryKeys, header = {}) {
  const protectedHeader = {
    alg: 'RS256',
    kid: signingKeys.publicJwk.kid,
    typ: 'JWT',
    ...header
  };
  const signingInput = [
    encodeBase64Url(JSON.stringify(protectedHeader)),
    encodeBase64Url(JSON.stringify(payload))
  ].join('.');
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    signingKeys.privateKey,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${encodeBase64Url(signature)}`;
}

function validClaims(overrides = {}) {
  return {
    iss: CLERK_ISSUER,
    sub: 'user-owner',
    azp: 'https://app.ltth.test',
    iat: NOW_SECONDS - 30,
    nbf: NOW_SECONDS - 30,
    exp: NOW_SECONDS + 300,
    ...overrides
  };
}

function createJwksFetch(...keySets) {
  let callIndex = 0;
  return {
    fetch: async () => {
      const keys = keySets[Math.min(callIndex, keySets.length - 1)];
      callIndex += 1;
      return new Response(JSON.stringify({ keys }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    },
    get callCount() {
      return callIndex;
    }
  };
}

function createVerifier(fetchImpl, overrides = {}) {
  return createClerkJwtVerifier({
    issuer: CLERK_ISSUER,
    jwksUrl: 'https://clerk.overlay.test/.well-known/jwks.json',
    authorizedParties: ['https://app.ltth.test'],
    fetch: fetchImpl,
    now: () => NOW_SECONDS * 1000,
    ...overrides
  });
}

async function expectAuthFailure(operation, code, status) {
  try {
    await operation();
    throw new Error('Expected authentication to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error.code).toBe(code);
    expect(error.status).toBe(status);
  }
}

beforeAll(async () => {
  [primaryKeys, rotatedKeys, attackerKeys] = await Promise.all([
    createSigningKeys('primary'),
    createSigningKeys('rotated'),
    createSigningKeys('attacker')
  ]);
});

describe('Clerk management authentication', () => {
  it('verifies a bearer session and returns only the Clerk identity and claims', async () => {
    const jwks = createJwksFetch([primaryKeys.publicJwk]);
    const token = await signJwt(validClaims());
    const request = new Request(MANAGEMENT_URL, {
      headers: { authorization: `Bearer ${token}` }
    });

    const auth = await authenticateClerkManagementRequest(request, {
      CLERK_ISSUER,
      CLERK_JWKS_URL:
        'https://clerk.overlay.test/.well-known/jwks.json',
      CLERK_AUTHORIZED_PARTIES: 'https://app.ltth.test'
    }, {
      fetch: jwks.fetch,
      now: () => NOW_SECONDS * 1000
    });

    expect(auth.clerkUserId).toBe('user-owner');
    expect(auth.claims.sub).toBe('user-owner');
    expect(Object.keys(auth).sort()).toEqual(['claims', 'clerkUserId']);
  });

  it('rejects a token signed by a key outside the configured JWKS', async () => {
    const jwks = createJwksFetch([primaryKeys.publicJwk]);
    const verifier = createVerifier(jwks.fetch);
    const token = await signJwt(
      validClaims(),
      attackerKeys,
      { kid: primaryKeys.publicJwk.kid }
    );

    await expectAuthFailure(
      () => verifier.verifyToken(token),
      AUTH_ERROR_CODES.CLERK_UNAUTHORIZED,
      401
    );
  });

  it.each([
    ['issuer', { iss: 'https://attacker.invalid' }],
    ['authorized party', { azp: 'https://attacker.invalid' }],
    ['audience fallback', {
      azp: undefined,
      aud: ['https://attacker.invalid']
    }]
  ])('rejects a mismatched %s', async (_name, overrides) => {
    const jwks = createJwksFetch([primaryKeys.publicJwk]);
    const verifier = createVerifier(jwks.fetch);
    const token = await signJwt(validClaims(overrides));

    await expectAuthFailure(
      () => verifier.verifyToken(token),
      AUTH_ERROR_CODES.CLERK_UNAUTHORIZED,
      401
    );
  });

  it('accepts an authorized audience when azp is absent', async () => {
    const jwks = createJwksFetch([primaryKeys.publicJwk]);
    const verifier = createVerifier(jwks.fetch);
    const token = await signJwt(validClaims({
      azp: undefined,
      aud: ['https://app.ltth.test']
    }));

    const claims = await verifier.verifyToken(token);

    expect(claims.sub).toBe('user-owner');
  });

  it.each([
    ['expired', { exp: NOW_SECONDS - 6 }],
    ['not active yet', { nbf: NOW_SECONDS + 6 }]
  ])('rejects a token that is %s', async (_name, overrides) => {
    const jwks = createJwksFetch([primaryKeys.publicJwk]);
    const verifier = createVerifier(jwks.fetch);
    const token = await signJwt(validClaims(overrides));

    await expectAuthFailure(
      () => verifier.verifyToken(token),
      AUTH_ERROR_CODES.CLERK_UNAUTHORIZED,
      401
    );
  });

  it('rejects symmetric and unrecognized token algorithms before key use', async () => {
    const jwks = createJwksFetch([primaryKeys.publicJwk]);
    const verifier = createVerifier(jwks.fetch);
    const header = encodeBase64Url(JSON.stringify({
      alg: 'HS256',
      kid: primaryKeys.publicJwk.kid,
      typ: 'JWT'
    }));
    const payload = encodeBase64Url(JSON.stringify(validClaims()));
    const token = `${header}.${payload}.${encodeBase64Url('not-a-signature')}`;

    await expectAuthFailure(
      () => verifier.verifyToken(token),
      AUTH_ERROR_CODES.CLERK_UNAUTHORIZED,
      401
    );
    expect(jwks.callCount).toBe(0);
  });

  it.each([
    ['missing', { sub: undefined }],
    ['blank', { sub: '   ' }]
  ])('rejects a %s subject', async (_name, overrides) => {
    const jwks = createJwksFetch([primaryKeys.publicJwk]);
    const verifier = createVerifier(jwks.fetch);
    const token = await signJwt(validClaims(overrides));

    await expectAuthFailure(
      () => verifier.verifyToken(token),
      AUTH_ERROR_CODES.CLERK_UNAUTHORIZED,
      401
    );
  });

  it('refreshes a cached JWKS once for rotation and bounds later unknown kids', async () => {
    const jwks = createJwksFetch(
      [primaryKeys.publicJwk],
      [rotatedKeys.publicJwk]
    );
    const verifier = createVerifier(jwks.fetch);
    const firstToken = await signJwt(validClaims());
    const rotatedToken = await signJwt(validClaims(), rotatedKeys);
    const firstUnknownToken = await signJwt(
      validClaims(),
      attackerKeys,
      { kid: 'random-unknown-a' }
    );
    const secondUnknownToken = await signJwt(
      validClaims(),
      attackerKeys,
      { kid: 'random-unknown-b' }
    );

    await verifier.verifyToken(firstToken);
    const rotatedClaims = await verifier.verifyToken(rotatedToken);
    await expectAuthFailure(
      () => verifier.verifyToken(firstUnknownToken),
      AUTH_ERROR_CODES.CLERK_UNAUTHORIZED,
      401
    );
    await expectAuthFailure(
      () => verifier.verifyToken(firstUnknownToken),
      AUTH_ERROR_CODES.CLERK_UNAUTHORIZED,
      401
    );
    await expectAuthFailure(
      () => verifier.verifyToken(secondUnknownToken),
      AUTH_ERROR_CODES.CLERK_UNAUTHORIZED,
      401
    );

    expect(rotatedClaims.sub).toBe('user-owner');
    expect(jwks.callCount).toBe(2);
  });

  it('reuses a non-expired JWKS cache entry for the same kid', async () => {
    const jwks = createJwksFetch([primaryKeys.publicJwk]);
    const verifier = createVerifier(jwks.fetch);
    const firstToken = await signJwt(validClaims());
    const secondToken = await signJwt(validClaims({ sub: 'user-second' }));

    await verifier.verifyToken(firstToken);
    const secondClaims = await verifier.verifyToken(secondToken);

    expect(secondClaims.sub).toBe('user-second');
    expect(jwks.callCount).toBe(1);
  });

  it('requires a strict Authorization bearer value and does not read cookies', async () => {
    const jwks = createJwksFetch([primaryKeys.publicJwk]);
    const env = {
      CLERK_ISSUER,
      CLERK_JWKS_URL:
        'https://clerk.overlay.test/.well-known/jwks.json',
      CLERK_AUTHORIZED_PARTIES: 'https://app.ltth.test'
    };
    const request = new Request(MANAGEMENT_URL, {
      headers: { cookie: 'session=secret-token' }
    });

    await expectAuthFailure(
      () => authenticateClerkManagementRequest(request, env, {
        fetch: jwks.fetch,
        now: () => NOW_SECONDS * 1000
      }),
      AUTH_ERROR_CODES.CLERK_UNAUTHORIZED,
      401
    );
    expect(jwks.callCount).toBe(0);
  });
});

describe('device authentication', () => {
  it('hashes the credential and optional pepper as UTF-8 SHA-256', async () => {
    await expect(
      hashDeviceCredential('device-secret', 'pepper')
    ).resolves.toBe(
      'cc9402c0c6f457164896969115f3b1f85536710d431927fd8e1b2188d42d77c6'
    );
    await expect(
      hashDeviceCredential('device-secret', 'other-pepper')
    ).resolves.toBe(
      '5e730546701e756a797dcb0be3f30d8b287e7f2924d7d6360c9f532f5e625314'
    );
  });

  it('authenticates an active device without returning its stored hash', async () => {
    const repository = {
      async findDeviceById() {
        return {
          deviceId: 'device-a',
          clerkUserId: 'user-owner',
          tokenHash:
            'cc9402c0c6f457164896969115f3b1f85536710d431927fd8e1b2188d42d77c6',
          revokedAt: null
        };
      }
    };
    const request = new Request(DEVICE_URL, {
      headers: { authorization: 'Bearer device-secret' }
    });

    const auth = await authenticateDeviceRequest(request, {
      repository,
      deviceId: 'device-a',
      expectedClerkUserId: 'user-owner',
      pepper: 'pepper'
    });

    expect(auth).toEqual({
      clerkUserId: 'user-owner',
      deviceId: 'device-a'
    });
    expect(JSON.stringify(auth)).not.toContain('cc9402');
  });

  it.each([
    ['missing device', null, 'user-owner'],
    ['revoked device', {
      deviceId: 'device-a',
      clerkUserId: 'user-owner',
      tokenHash:
        'cc9402c0c6f457164896969115f3b1f85536710d431927fd8e1b2188d42d77c6',
      revokedAt: '2026-07-27T10:00:00.000Z'
    }, 'user-owner'],
    ['hash mismatch', {
      deviceId: 'device-a',
      clerkUserId: 'user-owner',
      tokenHash:
        '481cfa521202ee714a39a3d08d50dccf1e73856e2e5807b7760fe8249b430525',
      revokedAt: null
    }, 'user-owner'],
    ['cross-account request', {
      deviceId: 'device-a',
      clerkUserId: 'user-owner',
      tokenHash:
        'cc9402c0c6f457164896969115f3b1f85536710d431927fd8e1b2188d42d77c6',
      revokedAt: null
    }, 'user-other']
  ])('uses the same neutral failure for a %s', async (
    _name,
    device,
    expectedClerkUserId
  ) => {
    const repository = {
      async findDeviceById() {
        return device;
      }
    };
    const request = new Request(DEVICE_URL, {
      headers: { authorization: 'Bearer device-secret' }
    });

    await expectAuthFailure(
      () => authenticateDeviceRequest(request, {
        repository,
        deviceId: 'device-a',
        expectedClerkUserId,
        pepper: 'pepper'
      }),
      AUTH_ERROR_CODES.DEVICE_UNAUTHORIZED,
      401
    );
  });

  it('requires the device credential in Authorization rather than a Clerk or cookie fallback', async () => {
    const repository = {
      async findDeviceById() {
        throw new Error('Repository must not be read without a bearer value');
      }
    };
    const request = new Request(DEVICE_URL, {
      headers: {
        cookie: 'device=device-secret',
        'x-ltth-device-token': 'device-secret'
      }
    });

    await expectAuthFailure(
      () => authenticateDeviceRequest(request, {
        repository,
        deviceId: 'device-a',
        pepper: 'pepper'
      }),
      AUTH_ERROR_CODES.DEVICE_UNAUTHORIZED,
      401
    );
  });
});

describe('administrative authorization', () => {
  it('requires both a valid Clerk session and an allowlisted subject', async () => {
    const jwks = createJwksFetch([primaryKeys.publicJwk]);
    const token = await signJwt(validClaims());
    const request = new Request(
      'https://overlay.ltth.app/_ltth/v1/admin/claims/name/release',
      { method: 'POST', headers: { authorization: `Bearer ${token}` } }
    );
    const env = {
      CLERK_ISSUER,
      CLERK_JWKS_URL:
        'https://clerk.overlay.test/.well-known/jwks.json',
      CLERK_AUTHORIZED_PARTIES: 'https://app.ltth.test',
      OVERLAY_ADMIN_CLERK_USER_IDS: 'user-other, user-owner'
    };

    const auth = await authenticateOverlayAdminRequest(request, env, {
      fetch: jwks.fetch,
      now: () => NOW_SECONDS * 1000
    });

    expect(auth.clerkUserId).toBe('user-owner');
  });

  it('returns a stable forbidden result for a valid non-admin Clerk session', async () => {
    const jwks = createJwksFetch([primaryKeys.publicJwk]);
    const token = await signJwt(validClaims());
    const request = new Request(
      'https://overlay.ltth.app/_ltth/v1/admin/claims/name/release',
      { method: 'POST', headers: { authorization: `Bearer ${token}` } }
    );
    const env = {
      CLERK_ISSUER,
      CLERK_JWKS_URL:
        'https://clerk.overlay.test/.well-known/jwks.json',
      CLERK_AUTHORIZED_PARTIES: 'https://app.ltth.test',
      OVERLAY_ADMIN_CLERK_USER_IDS: 'user-other'
    };

    await expectAuthFailure(
      () => authenticateOverlayAdminRequest(request, env, {
        fetch: jwks.fetch,
        now: () => NOW_SECONDS * 1000
      }),
      AUTH_ERROR_CODES.ADMIN_FORBIDDEN,
      403
    );
  });
});
