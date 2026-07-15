# Clerk Session Persistence and Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Clerk authentication automatically after a desktop-app restart and grant subscriber-only store access from verified Clerk Billing claims.

**Architecture:** The browser client uses the existing `ltth.app/auth/` session as the durable credential and starts the established bridge once when local restoration fails. The Express store middleware derives access only from an already verified Clerk JWT's signed `pla` and `fea` claims, then merges non-billing admin and closed-beta grants.

**Tech Stack:** Node.js/CommonJS, Express, `jsonwebtoken`, Clerk session JWTs, Jest, Supertest, jsdom.

## Global Constraints

- Do not persist a Clerk bearer token in `localStorage`, the database, or a plugin directory.
- Do not require `CLERK_SECRET_KEY` in a local LTTH installation.
- Interpret `pla`/`fea` only after the existing JWT signature and origin verification passes.
- `u:free` and `o:free` are free; every other valid scoped `pla` is a paid subscriber plan.
- Preserve admin/closed-beta metadata grants; metadata must never downgrade a paid Billing claim.

---

## File Structure

- `app/modules/clerk-store-auth.js`: normalize verified Billing claims and merge entitlement sources.
- `app/public/js/clerk-store-auth.js`: one guarded automatic bridge recovery per page load.
- `app/test/clerk-store-auth.test.js`: unit coverage for Billing normalization and access merging.
- `app/test/plugin-store-routes.test.js`: server-side subscriber install regression.
- `app/test/clerk-auth-bridge.test.js`: jsdom regression for automatic recovery and loop prevention.

### Task 1: Derive Entitlements from Signed Clerk Billing Claims

**Files:**
- Modify: `app/modules/clerk-store-auth.js:319-498`
- Modify: `app/test/clerk-store-auth.test.js`

**Interfaces:**
- Produces `extractBillingEntitlementFromClaims(claims)`, returning `{ present, paid, plan, features, source }`.
- Produces `mergeStoreAccess(...values)`, returning `{ groups, closedBetaPlugins, features }`.
- Updates `loadStoreEntitlements(userId, options)` to return Billing-first `license` and merged `access`.

- [ ] **Step 1: Write failing unit tests**

Add these tests to `app/test/clerk-store-auth.test.js`:

```js
it('maps a signed paid Clerk Billing plan to subscriber access', async () => {
  const { loadStoreEntitlements } = require('../modules/clerk-store-auth');
  const result = await loadStoreEntitlements('user_paid', {
    sessionClaims: { pla: 'u:premium', fea: 'u:premium_plugins,u:priority_support' }
  });

  assert.strictEqual(result.license.active, true);
  assert.strictEqual(result.license.plan, 'premium');
  assert.strictEqual(result.license.source, 'clerk-billing');
  assert.deepStrictEqual(result.access.groups, ['subscriber']);
  assert.deepStrictEqual(result.access.features, ['premium_plugins', 'priority_support']);
});

it('maps a signed free Clerk Billing plan without subscriber access', async () => {
  const { loadStoreEntitlements } = require('../modules/clerk-store-auth');
  const result = await loadStoreEntitlements('user_free', { sessionClaims: { pla: 'u:free', fea: '' } });

  assert.strictEqual(result.license.plan, 'free');
  assert.strictEqual(result.license.source, 'clerk-billing');
  assert.strictEqual(result.access.groups.includes('subscriber'), false);
});

it('merges admin and closed-beta metadata into paid Billing access', async () => {
  const { loadStoreEntitlements } = require('../modules/clerk-store-auth');
  const result = await loadStoreEntitlements('user_admin', {
    sessionClaims: { pla: 'u:premium' },
    clerkClient: { users: { getUser: async () => ({
      privateMetadata: { ltthAccess: { groups: ['admin', 'closed-beta'], closedBetaPlugins: ['sidekick'] } }
    }) } }
  });

  assert.deepStrictEqual(result.access.groups, ['subscriber', 'admin', 'closed-beta']);
  assert.deepStrictEqual(result.access.closedBetaPlugins, ['sidekick']);
});
```

- [ ] **Step 2: Prove the tests are red**

Run `cd app; npm test -- --runInBand test/clerk-store-auth.test.js`.

Expected: FAIL because `pla` and `fea` are ignored, and neither `license.source` nor `access.features` exists.

- [ ] **Step 3: Implement minimal Billing normalization**

Add these helpers immediately after `normalizeStoreAccess()` in `app/modules/clerk-store-auth.js`:

```js
function normalizeClerkPlan(value) {
  const match = cleanEnvValue(value).toLowerCase().match(/^[uo]:([a-z0-9][a-z0-9_-]*)$/);
  return match ? match[1] : null;
}

function normalizeClerkFeatures(value) {
  return normalizeList(String(value || '').replace(/\b[uo]:/g, ''));
}

function extractBillingEntitlementFromClaims(claims = {}) {
  const plan = normalizeClerkPlan(claims.pla);
  const features = normalizeClerkFeatures(claims.fea);
  return { present: Boolean(plan), paid: Boolean(plan && plan !== 'free'), plan, features, source: plan ? 'clerk-billing' : null };
}
```

Extend `normalizeStoreLicense()` to retain a safe `source` string, and extend normalized access with `features`. Add `mergeStoreAccess()` using `normalizeList()` to deduplicate each array. In `loadStoreEntitlements()`, use a valid Billing claim before legacy license metadata: build a `{ active: true, status: 'active', plan, source: 'clerk-billing' }` license; add `subscriber` only when `paid`; fetch the user only to merge non-billing grants. When no `pla` is present, retain the existing beta/metadata fallback unchanged.

- [ ] **Step 4: Prove the tests are green**

Run `cd app; npm test -- --runInBand test/clerk-store-auth.test.js`.

Expected: PASS with all Clerk store-auth tests green.

- [ ] **Step 5: Commit the isolated entitlement change**

```powershell
git add app/modules/clerk-store-auth.js app/test/clerk-store-auth.test.js
git commit -m "fix(auth): derive store access from Clerk Billing claims"
```

### Task 2: Prove Server-Side Subscriber Enforcement

**Files:**
- Modify: `app/test/plugin-store-routes.test.js`
- Modify: `app/routes/plugin-routes.js:203-255` only if Task 1 exposes a route defect.

**Interfaces:**
- Consumes `req.storeAccount.access.groups`, which Task 1 populates with `subscriber` for `pla: 'u:premium'`.
- Produces 200 for a paid subscriber-only install and 403/`SUBSCRIBER_ACCESS_REQUIRED` for `u:free`.

- [ ] **Step 1: Add failing paid/free install regressions**

Add this registry entry to the mocked registry:

```js
{
  id: 'premium-plugin', name: { en: 'Premium Plugin' }, description: { en: 'Subscriber access only' },
  version: '1.0.0', packageUrl: 'https://example.com/premium-plugin.zip',
  channel: 'open-beta', access: { type: 'subscriber' }
}
```

Change `createAuthFixture(overrides = {})` to spread `overrides` into the signed payload. Then add:

```js
it('allows a paid Billing plan to install a subscriber plugin', async () => {
  const { app, authFixture } = createTestApp(tempDir, {}, { pla: 'u:premium' });
  await request(app).post('/api/plugin-store/official/premium-plugin/install')
    .set('Authorization', `Bearer ${authFixture.token}`).set('Origin', 'http://127.0.0.1:3000').expect(200);
});

it('rejects a free Billing plan for a subscriber plugin', async () => {
  const { app, authFixture } = createTestApp(tempDir, {}, { pla: 'u:free' });
  const response = await request(app).post('/api/plugin-store/official/premium-plugin/install')
    .set('Authorization', `Bearer ${authFixture.token}`).set('Origin', 'http://127.0.0.1:3000').expect(403);
  assert.strictEqual(response.body.code, 'SUBSCRIBER_ACCESS_REQUIRED');
});
```

- [ ] **Step 2: Prove the route tests are red**

Run `cd app; npm test -- --runInBand test/plugin-store-routes.test.js`.

Expected: FAIL because the account context does not yet contain Billing-derived subscriber access.

- [ ] **Step 3: Keep the route authorization boundary server-side**

Retain this existing condition as the authority:

```js
if (storePlugin.access?.type === 'subscriber' && !hasSubscriberPluginAccess(req.storeAccount)) {
  return res.status(403).json({ success: false, code: 'SUBSCRIBER_ACCESS_REQUIRED', error: 'This plugin is only available to LTTH subscribers.' });
}
```

If Task 1 makes both tests pass unchanged, do not edit `app/routes/plugin-routes.js`.

- [ ] **Step 4: Prove the route tests are green**

Run `cd app; npm test -- --runInBand test/plugin-store-routes.test.js`.

Expected: PASS; the paid token is accepted and the free token is rejected.

- [ ] **Step 5: Commit the route coverage**

```powershell
git add app/test/plugin-store-routes.test.js app/routes/plugin-routes.js
git commit -m "test(store): cover Clerk Billing subscriber access"
```

### Task 3: Restore the Clerk Session Once Per Page Load

**Files:**
- Modify: `app/public/js/clerk-store-auth.js:1-17, 318-345, 382-423`
- Modify: `app/test/clerk-auth-bridge.test.js`

**Interfaces:**
- Extends `beginBridgeAuth(mode, options)` with `{ automatic: true }`.
- Produces `state.autoRestoreAttempted` and `state.signedOutExplicitly`.
- Consumes the existing `auth/bridge.js`: an active Clerk account session returns a fresh token without credential entry.

- [ ] **Step 1: Add failing jsdom regressions**

Add a test helper that evaluates the source after configuring `StoreAuth.configureForTest({ navigate })`, then add:

```js
it('starts exactly one automatic bridge restoration when local restoration fails', async () => {
  const { window, redirects } = createStoreAuthDom();
  window.fetch = async (url) => url === '/api/plugin-store/config'
    ? jsonResponse({ success: true, clerkEnabled: true, publishableKey: 'pk_test', authBridgeUrl: 'https://ltth.app/auth/' })
    : jsonResponse({ success: false, code: 'AUTH_REQUIRED' }, 401);

  window.eval(readAppFile('public', 'js', 'clerk-store-auth.js'));
  window.StoreAuth.configureForTest({ navigate: (url) => redirects.push(url) });
  await window.StoreAuth.init();
  await window.StoreAuth.init();

  assert.strictEqual(redirects.length, 1);
  const bridgeUrl = new URL(redirects[0]);
  assert.strictEqual(bridgeUrl.origin, 'https://ltth.app');
  assert.strictEqual(bridgeUrl.searchParams.get('mode'), 'sign-in');
  assert.strictEqual(bridgeUrl.searchParams.get('return_to'), 'http://127.0.0.1:3000/auth/clerk/callback.html');
});
```

Add a second test that calls `window.StoreAuth.signOut()`, resolves the DELETE request, and asserts no automatic redirect is requested while the manual sign-in card contains `[data-store-auth-mode="sign-in"]`.

- [ ] **Step 2: Prove the browser test is red**

Run `cd app; npm test -- --runInBand test/clerk-auth-bridge.test.js`.

Expected: FAIL because `configureForTest` and automatic recovery do not exist.

- [ ] **Step 3: Implement guarded automatic recovery**

Add the state fields and navigation seam:

```js
const state = {
  initialized: false, initializing: null, config: null, signedIn: false,
  bridgeToken: '', account: null, storeMode: 'store', listeners: [],
  autoRestoreAttempted: false, signedOutExplicitly: false, navigate: null
};

function navigate(url) {
  if (typeof state.navigate === 'function') return state.navigate(url);
  return window.location.assign(url);
}
```

Make `beginBridgeAuth()` accept `options = {}` and finish with `navigate(bridgeUrl.toString())`. In `init()`, capture `const restored = await restoreBridgeSession()`. If `restored` is false, `signedOutExplicitly` is false, and `autoRestoreAttempted` is false, set the guard and call `beginBridgeAuth('sign-in', { automatic: true })`; otherwise render the existing signed-out UI. In `clearBridgeSession()`, set `signedOutExplicitly = true` before deleting the cookie. Add this test-only API beside the existing public methods:

```js
configureForTest(options = {}) {
  state.navigate = typeof options.navigate === 'function' ? options.navigate : null;
}
```

Do not write a bearer token outside the existing `sessionStorage` short-term handoff.

- [ ] **Step 4: Prove the browser test is green**

Run `cd app; npm test -- --runInBand test/clerk-auth-bridge.test.js`.

Expected: PASS; recovery redirects once, no loop occurs, and explicit sign-out leaves manual sign-in available.

- [ ] **Step 5: Commit session restoration**

```powershell
git add app/public/js/clerk-store-auth.js app/test/clerk-auth-bridge.test.js
git commit -m "fix(auth): restore Clerk session after app restart"
```

### Task 4: Cross-Component Verification

**Files:**
- Verify only: the three changed production files and their focused tests.

**Interfaces:**
- Confirms verified paid claims yield `subscriber`, free claims do not, and an absent local token triggers one bridge attempt.

- [ ] **Step 1: Run all targeted tests**

```powershell
cd app
npm test -- --runInBand --silent test/clerk-store-auth.test.js test/clerk-auth-bridge.test.js test/plugin-store-routes.test.js test/plugin-manager-listing.test.js
```

Expected: exit code 0 and no failing test.

- [ ] **Step 2: Run syntax and lint checks**

```powershell
cd app
node --check modules/clerk-store-auth.js
node --check routes/plugin-routes.js
node --check public/js/clerk-store-auth.js
npm run lint
```

Expected: every command exits 0.

- [ ] **Step 3: Inspect the scoped final diff**

```powershell
git diff --check HEAD~3..HEAD -- app/modules/clerk-store-auth.js app/routes/plugin-routes.js app/public/js/clerk-store-auth.js app/test/clerk-store-auth.test.js app/test/plugin-store-routes.test.js app/test/clerk-auth-bridge.test.js
git status --short
```

Expected: no whitespace errors and no changed file outside the Clerk/store scope.

- [ ] **Step 4: Commit a verification correction only if one changed code**

```powershell
git add app/modules/clerk-store-auth.js app/routes/plugin-routes.js app/public/js/clerk-store-auth.js app/test/clerk-store-auth.test.js app/test/plugin-store-routes.test.js app/test/clerk-auth-bridge.test.js
git commit -m "fix(auth): verify Clerk session and billing flow"
```

Run this command only if verification required a tracked-file correction.

## Plan Self-Review

- Spec coverage: Task 3 covers automatic, guarded restart recovery without durable bearer-token storage. Tasks 1 and 2 cover verified `pla`/`fea` handling, free-versus-paid access, and server enforcement. Task 1 preserves admin and closed-beta grants.
- Placeholder scan: the plan contains no deferred implementation markers or undefined interfaces.
- Type consistency: Task 1's `license` and `access` objects are consumed by Task 2; Task 3 changes only browser restoration and does not alter that server contract.
