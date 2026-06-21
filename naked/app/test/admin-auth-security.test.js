const { createAdminAuth, isLoopbackAddress } = require('../modules/admin-auth');

function runMiddleware(middleware, reqOverrides = {}) {
  const req = {
    ip: '203.0.113.10',
    socket: {
      remoteAddress: '203.0.113.10'
    },
    headers: {},
    get(name) {
      return this.headers[String(name).toLowerCase()];
    },
    ...reqOverrides
  };

  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };

  const next = jest.fn();
  middleware(req, res, next);
  return { req, res, next };
}

describe('admin auth middleware', () => {
  afterEach(() => {
    delete process.env.LTTH_ADMIN_TOKEN;
  });

  test('allows loopback requests when no admin token is configured', () => {
    const middleware = createAdminAuth();

    const { res, next } = runMiddleware(middleware, {
      ip: '127.0.0.1',
      socket: {
        remoteAddress: '127.0.0.1'
      }
    });

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  test('rejects non-loopback mutation requests when no admin token is configured', () => {
    const middleware = createAdminAuth();

    const { res, next } = runMiddleware(middleware);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/Admin authentication required/);
  });

  test('requires a matching bearer token when an admin token is configured', () => {
    process.env.LTTH_ADMIN_TOKEN = 'correct-token';
    const middleware = createAdminAuth();

    const missing = runMiddleware(middleware);
    expect(missing.next).not.toHaveBeenCalled();
    expect(missing.res.statusCode).toBe(401);

    const invalid = runMiddleware(middleware, {
      headers: {
        authorization: 'Bearer wrong-token'
      }
    });
    expect(invalid.next).not.toHaveBeenCalled();
    expect(invalid.res.statusCode).toBe(403);

    const valid = runMiddleware(middleware, {
      headers: {
        authorization: 'Bearer correct-token'
      }
    });
    expect(valid.next).toHaveBeenCalledTimes(1);
    expect(valid.res.statusCode).toBe(200);
  });

  test('recognizes IPv4 and IPv6 loopback variants', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('192.168.1.20')).toBe(false);
  });
});
