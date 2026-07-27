'use strict';

const { JSDOM } = require('jsdom');
const {
  createStableOverlayRoutingUI
} = require('../public/js/stable-overlay-routing');

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body)
  };
}

function activeClaim(username = 'pup.cid') {
  return {
    username,
    displayUsername: username,
    state: 'active',
    claimedAt: '2026-07-27T10:00:00.000Z',
    releaseRequestedAt: null,
    reusableAfter: null,
    updatedAt: '2026-07-27T10:00:00.000Z'
  };
}

function cooldownClaim(username = 'old.name') {
  return {
    ...activeClaim(username),
    state: 'cooldown',
    releaseRequestedAt: '2026-07-27T10:30:00.000Z',
    reusableAfter: '2026-08-03T10:30:00.000Z',
    updatedAt: '2026-07-27T10:30:00.000Z'
  };
}

function accountPayload(overrides = {}) {
  return {
    success: true,
    account: {
      claims: [activeClaim(), cooldownClaim()],
      devices: [{
        deviceId: 'd-local',
        label: 'Studio PC',
        createdAt: '2026-07-27T09:00:00.000Z',
        lastSeenAt: '2026-07-27T10:00:30.000Z',
        revokedAt: null
      }],
      lease: {
        active: true,
        deviceId: 'd-local',
        instanceId: 'instance-1',
        revision: 3,
        updatedAt: '2026-07-27T10:00:30.000Z',
        expiresAt: '2026-07-27T10:02:30.000Z'
      }
    },
    defaultUsername: 'pup.cid',
    ...overrides
  };
}

function harness(overrides = {}) {
  const dom = new JSDOM('<section id="stable-routing-root"></section>', {
    url: 'http://127.0.0.1:3000/dashboard.html#settings'
  });
  const requests = [];
  let currentAccount = accountPayload();
  let currentStatus = {
    success: true,
    status: {
      state: 'active',
      revision: 3,
      lastSuccessfulHeartbeat: '2026-07-27T10:00:30.000Z'
    }
  };
  let mutationFailure = null;
  const mutationFailuresByUrl = new Map();
  let accountFailure = null;
  const fetchImpl = jest.fn(async (url, options = {}) => {
    requests.push({
      url,
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body
    });
    if (url === '/api/stable-overlay-routing/status') {
      return jsonResponse(currentStatus);
    }
    if (url === '/api/status') {
      return jsonResponse({
        isConnected: true,
        username: 'Pup.Cid'
      });
    }
    if (url === '/api/stable-overlay-routing/account') {
      if (accountFailure) {
        return jsonResponse(accountFailure.body, accountFailure.status);
      }
      return jsonResponse(currentAccount);
    }
    if (mutationFailuresByUrl.has(url)) {
      const failure = mutationFailuresByUrl.get(url);
      mutationFailuresByUrl.delete(url);
      return jsonResponse(failure.body, failure.status);
    }
    if (mutationFailure) {
      return jsonResponse(mutationFailure.body, mutationFailure.status);
    }
    return jsonResponse({ success: true });
  });
  const getFreshToken = jest.fn().mockResolvedValue('fresh-clerk-token');
  const signIn = jest.fn();
  const notify = jest.fn();
  const copyApi = {
    copy: jest.fn().mockResolvedValue(
      'https://overlay.ltth.app/pup.cid/goals/overlay'
    ),
    copyTemporary: jest.fn().mockResolvedValue(
      'https://quiet-river.trycloudflare.com/goals/overlay'
    )
  };
  const ui = createStableOverlayRoutingUI({
    root: dom.window.document.getElementById('stable-routing-root'),
    fetchImpl,
    getFreshToken,
    signIn,
    notify,
    copyApi,
    translate: (_key, fallback) => fallback,
    now: () => Date.parse('2026-07-27T10:01:00.000Z')
  });

  return {
    dom,
    ui,
    requests,
    fetchImpl,
    getFreshToken,
    signIn,
    notify,
    copyApi,
    setAccount(value) {
      currentAccount = value;
    },
    setStatus(value) {
      currentStatus = value;
    },
    failNextMutation(body, status = 409) {
      mutationFailure = { body, status };
    },
    failMutation(url, body, status = 409) {
      mutationFailuresByUrl.set(url, { body, status });
    },
    failAccount(body, status = 503) {
      accountFailure = { body, status };
    },
    get(selector) {
      return dom.window.document.querySelector(selector);
    },
    async click(selector) {
      this.get(selector).click();
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise(resolve => setImmediate(resolve));
        if (!this.ui.state.busy) break;
      }
    }
  };
}

describe('Stable overlay routing Network Settings UI', () => {
  test('initializes read-only local state without opening auth or claiming', async () => {
    const deps = harness();
    deps.setStatus({
      success: true,
      status: {
        state: 'offline',
        revision: null,
        lastSuccessfulHeartbeat: null
      }
    });

    await deps.ui.init();

    expect(deps.getFreshToken).not.toHaveBeenCalled();
    expect(deps.requests.map(item => item.url)).toEqual([
      '/api/stable-overlay-routing/status',
      '/api/status'
    ]);
    expect(deps.get('[data-stable-routing-route-status]').textContent)
      .toBe('Offline');
    expect(deps.get('[data-stable-routing-connected]').textContent)
      .toBe('@Pup.Cid');
    expect(deps.get('[data-stable-routing-claim]').disabled).toBe(true);
  });

  test('loads only the signed-in account with a fresh action token', async () => {
    const deps = harness();

    await deps.ui.init();
    await deps.click('[data-stable-routing-refresh]');

    expect(deps.getFreshToken).toHaveBeenCalledWith({ action: 'account' });
    const accountRequest = deps.requests.find(
      item => item.url === '/api/stable-overlay-routing/account'
    );
    expect(accountRequest.headers).toEqual({
      Authorization: 'Bearer fresh-clerk-token'
    });
    expect(deps.get('[data-stable-routing-auth-status]').textContent)
      .toBe('Signed in');
    expect(deps.get('[data-stable-routing-active-device]').textContent)
      .toBe('Studio PC');
    expect(deps.get('[data-stable-routing-default]').textContent)
      .toContain('@pup.cid');
    expect(deps.get('[data-stable-routing-heartbeat]').textContent)
      .toContain('2026');
    expect(deps.get('[data-claim-username="pup.cid"]').textContent)
      .toContain('Default');
  });

  test('never claims automatically and gates the first claim on acknowledgement', async () => {
    const deps = harness();
    deps.setAccount(accountPayload({
      account: {
        claims: [],
        devices: [],
        lease: { active: false }
      },
      defaultUsername: null
    }));
    deps.setStatus({
      success: true,
      status: {
        state: 'unenrolled',
        revision: null,
        lastSuccessfulHeartbeat: null
      }
    });

    await deps.ui.init();
    await deps.click('[data-stable-routing-refresh]');

    expect(deps.requests.filter(item =>
      item.url === '/api/stable-overlay-routing/claims'
    )).toHaveLength(0);
    expect(deps.get('[data-stable-routing-claim-username]').value)
      .toBe('Pup.Cid');
    expect(deps.get('[data-stable-routing-claim]').disabled).toBe(true);

    deps.get('[data-stable-routing-first-claim]').checked = true;
    deps.get('[data-stable-routing-first-claim]').dispatchEvent(
      new deps.dom.window.Event('change', { bubbles: true })
    );
    expect(deps.get('[data-stable-routing-claim]').disabled).toBe(false);

    await deps.click('[data-stable-routing-claim]');

    expect(deps.getFreshToken).toHaveBeenLastCalledWith({ action: 'claim' });
    const mutations = deps.requests.filter(item =>
      item.url !== '/api/stable-overlay-routing/status' &&
      item.url !== '/api/status' &&
      item.url !== '/api/stable-overlay-routing/account'
    );
    expect(mutations).toEqual([
      expect.objectContaining({
        url: '/api/stable-overlay-routing/devices/enroll',
        method: 'POST',
        body: JSON.stringify({ label: 'This LTTH installation' })
      }),
      expect.objectContaining({
        url: '/api/stable-overlay-routing/claims',
        method: 'POST',
        body: JSON.stringify({ username: 'Pup.Cid' })
      })
    ]);
  });

  test('shows a neutral actionable claim conflict without another account identity', async () => {
    const deps = harness();
    deps.setAccount(accountPayload({
      account: {
        claims: [],
        devices: [],
        lease: { active: false }
      },
      defaultUsername: null
    }));
    await deps.ui.init();
    await deps.click('[data-stable-routing-refresh]');
    deps.failNextMutation({
      success: false,
      code: 'claim_conflict',
      error: 'The stable overlay routing request could not be completed.',
      ownerEmail: 'other@example.com'
    });
    deps.get('[data-stable-routing-first-claim]').checked = true;
    deps.get('[data-stable-routing-first-claim]').dispatchEvent(
      new deps.dom.window.Event('change', { bubbles: true })
    );

    await deps.click('[data-stable-routing-claim]');

    expect(deps.get('[data-stable-routing-message]').textContent).toBe(
      'This TikTok username is unavailable. No account identity was disclosed.'
    );
    expect(deps.dom.window.document.body.textContent)
      .not.toContain('other@example.com');
  });

  test('prevents replaying enrollment when claim fails after enrollment succeeds', async () => {
    const deps = harness();
    deps.setAccount(accountPayload({
      account: {
        claims: [],
        devices: [],
        lease: { active: false }
      },
      defaultUsername: null
    }));
    deps.setStatus({
      success: true,
      status: {
        state: 'unenrolled',
        revision: null,
        lastSuccessfulHeartbeat: null
      }
    });
    deps.failMutation('/api/stable-overlay-routing/claims', {
      success: false,
      code: 'claim_conflict',
      error: 'The stable overlay routing request could not be completed.'
    });

    await deps.ui.init();
    await deps.click('[data-stable-routing-refresh]');
    deps.get('[data-stable-routing-first-claim]').checked = true;
    deps.get('[data-stable-routing-first-claim]').dispatchEvent(
      new deps.dom.window.Event('change', { bubbles: true })
    );

    await deps.click('[data-stable-routing-claim]');

    expect(deps.requests.filter(item =>
      item.url === '/api/stable-overlay-routing/devices/enroll'
    )).toHaveLength(1);
    expect(deps.requests.filter(item =>
      item.url === '/api/stable-overlay-routing/claims'
    )).toHaveLength(1);
    expect(deps.get('[data-stable-routing-claim]').disabled).toBe(true);
    expect(deps.get('[data-stable-routing-message]').textContent)
      .toContain('Refresh account state before another change');

    await deps.click('[data-stable-routing-claim]');

    expect(deps.requests.filter(item =>
      item.url === '/api/stable-overlay-routing/devices/enroll'
    )).toHaveLength(1);
  });

  test('keeps a successful mutation distinct when reconciliation fails', async () => {
    const deps = harness();
    await deps.ui.init();
    await deps.click('[data-stable-routing-refresh]');
    deps.failAccount({
      success: false,
      code: 'STABLE_ROUTING_UNAVAILABLE',
      error: 'Stable overlay routing is temporarily unavailable.'
    });

    await deps.click('[data-stable-routing-release="pup.cid"]');
    const input = deps.get('[data-stable-routing-release-input]');
    input.value = 'pup.cid';
    input.dispatchEvent(new deps.dom.window.Event('input', { bubbles: true }));
    await deps.click('[data-stable-routing-release-confirm]');

    expect(deps.requests.filter(item =>
      item.url === '/api/stable-overlay-routing/claims/pup.cid' &&
      item.method === 'DELETE'
    )).toHaveLength(1);
    expect(deps.get('[data-stable-routing-message]').textContent).toBe(
      'Action completed, but account state could not be refreshed. Refresh account state before another change.'
    );
    expect(deps.get('[data-stable-routing-refresh]').disabled).toBe(false);
    expect(deps.get('[data-stable-routing-release="pup.cid"]')).toBeNull();
  });

  test('shows and requires the exact canonical release value when display case differs', async () => {
    const deps = harness();
    deps.setAccount(accountPayload({
      account: {
        ...accountPayload().account,
        claims: [{
          ...activeClaim('pup.cid'),
          displayUsername: 'Pup.Cid'
        }, cooldownClaim()]
      }
    }));
    await deps.ui.init();
    await deps.click('[data-stable-routing-refresh]');

    await deps.click('[data-stable-routing-release="pup.cid"]');
    const input = deps.get('[data-stable-routing-release-input]');
    const confirm = deps.get('[data-stable-routing-release-confirm]');
    expect(deps.get('[data-stable-routing-release-canonical]').textContent)
      .toBe('pup.cid');
    expect(deps.get('[data-claim-username="pup.cid"]').textContent)
      .toContain('@Pup.Cid');
    expect(confirm.disabled).toBe(true);

    input.value = 'PUP.CID';
    input.dispatchEvent(new deps.dom.window.Event('input', { bubbles: true }));
    expect(confirm.disabled).toBe(true);

    input.value = 'pup.cid';
    input.dispatchEvent(new deps.dom.window.Event('input', { bubbles: true }));
    expect(confirm.disabled).toBe(false);
    await deps.click('[data-stable-routing-release-confirm]');

    expect(deps.requests).toContainEqual(expect.objectContaining({
      url: '/api/stable-overlay-routing/claims/pup.cid',
      method: 'DELETE',
      body: JSON.stringify({ username: 'pup.cid' })
    }));

    await deps.click('[data-stable-routing-restore="old.name"]');
    expect(deps.requests).toContainEqual(expect.objectContaining({
      url: '/api/stable-overlay-routing/claims/old.name/restore',
      method: 'POST',
      body: JSON.stringify({})
    }));
    expect(deps.get('[data-claim-username="old.name"]').textContent)
      .toContain('2026');
    expect(deps.dom.window.document.body.textContent)
      .not.toMatch(/user_other|other@example\.com/i);
  });

  test('sets defaults, re-enrolls, and revokes through exact browser routes', async () => {
    const deps = harness();
    deps.setAccount(accountPayload({
      account: {
        ...accountPayload().account,
        claims: [activeClaim(), activeClaim('other.name')]
      }
    }));
    await deps.ui.init();
    await deps.click('[data-stable-routing-refresh]');

    await deps.click('[data-stable-routing-default-action="other.name"]');
    await deps.click('[data-stable-routing-reenroll]');
    await deps.click('[data-stable-routing-revoke="d-local"]');

    expect(deps.requests).toEqual(expect.arrayContaining([
      expect.objectContaining({
        url: '/api/stable-overlay-routing/default-username',
        method: 'PUT',
        body: JSON.stringify({ username: 'other.name' })
      }),
      expect.objectContaining({
        url: '/api/stable-overlay-routing/devices/enroll',
        method: 'POST',
        body: JSON.stringify({ label: 'This LTTH installation' })
      }),
      expect.objectContaining({
        url: '/api/stable-overlay-routing/devices/d-local',
        method: 'DELETE',
        body: JSON.stringify({})
      })
    ]));
  });

  test('keeps stable and temporary copy actions separate with no silent fallback', async () => {
    const deps = harness();
    await deps.ui.init();
    const input = deps.get('[data-stable-routing-overlay-url]');
    input.value = 'http://127.0.0.1:3000/goals/overlay';

    await deps.click('[data-stable-routing-copy-stable]');
    expect(deps.copyApi.copy).toHaveBeenCalledWith(
      input.value,
      expect.objectContaining({
        accountAccess: expect.any(Object)
      })
    );
    expect(deps.copyApi.copyTemporary).not.toHaveBeenCalled();

    deps.copyApi.copy.mockRejectedValueOnce(
      Object.assign(new Error('offline'), { code: 'STABLE_ROUTING_UNAVAILABLE' })
    );
    await deps.click('[data-stable-routing-copy-stable]');
    expect(deps.copyApi.copyTemporary).not.toHaveBeenCalled();
    expect(deps.get('[data-stable-routing-message]').textContent)
      .toContain('No temporary URL was copied');

    await deps.click('[data-stable-routing-copy-temporary]');
    expect(deps.copyApi.copyTemporary).toHaveBeenCalledWith(input.value);
  });

  test('renders disabled and authentication errors transparently', async () => {
    const deps = harness();
    deps.setStatus({
      success: true,
      status: {
        state: 'disabled',
        revision: null,
        lastSuccessfulHeartbeat: null
      }
    });
    await deps.ui.init();

    expect(deps.get('[data-stable-routing-feature-status]').textContent)
      .toBe('Unavailable');
    expect(deps.get('[data-stable-routing-reenroll]').disabled).toBe(true);
    await deps.click('[data-stable-routing-sign-in]');
    expect(deps.signIn).toHaveBeenCalledTimes(1);

    deps.ui.state.status.state = 'active';
    deps.ui.render();
    deps.getFreshToken.mockRejectedValueOnce(new Error('popup closed'));
    await deps.click('[data-stable-routing-refresh]');
    expect(deps.get('[data-stable-routing-auth-status]').textContent)
      .toBe('Sign-in required');
    expect(deps.get('[data-stable-routing-message]').textContent)
      .toBe('Sign in again to manage stable URLs.');

    deps.ui.state.status.state = 'error';
    deps.ui.render();
    expect(deps.get('[data-stable-routing-route-status]').textContent)
      .toBe('Error');
  });

  test('distinguishes a routing outage from an authentication failure', async () => {
    const deps = harness();
    deps.failAccount({
      success: false,
      code: 'STABLE_ROUTING_UNAVAILABLE',
      error: 'Stable overlay routing is temporarily unavailable.'
    });
    await deps.ui.init();

    await deps.click('[data-stable-routing-refresh]');

    expect(deps.get('[data-stable-routing-message]').textContent).toBe(
      'The stable overlay routing request could not be completed.'
    );
  });
});
