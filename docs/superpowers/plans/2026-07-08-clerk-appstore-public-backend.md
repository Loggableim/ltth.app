# LTTH Clerk Appstore Public-JWT Implementation Plan

> **Status:** Implemented and verified. This file records the work that was completed to remove the per-install Clerk secret requirement from the LTTH app store.

**Goal:** Make the LTTH app store work on every install without requiring `LTTH_STORE_CLERK_SECRET_KEY` or `CLERK_SECRET_KEY`.

**Architecture:** The installed app uses the Clerk publishable key and public JWT verification material only. The local server verifies Clerk session tokens with `CLERK_JWT_KEY` or Clerk JWKS, stores the raw token in an HttpOnly cookie, and treats authenticated users as eligible for the default official-store entitlement.

**Tech Stack:** Express 4, `jsonwebtoken`, the existing Clerk browser SDK, Jest, Supertest.

---

### Task 1: Public store config

**Files:**
- Modified: `app/modules/clerk-store-auth.js`
- Modified: `app/public/js/clerk-store-auth.js`
- Modified: `app/public/auth/clerk/callback.html`
- Modified: `auth/bridge.js`
- Modified: `auth/index.html`
- Modified: `app/test/clerk-store-auth.test.js`
- Modified: `app/test/clerk-auth-bridge.test.js`

- [x] Expose the store with public publishable-key configuration only.
- [x] Remove the secret-gated setup error from the client path.
- [x] Keep the auth bridge and embedded Clerk UI working with the public config.

### Task 2: Public JWT verification and session persistence

**Files:**
- Modified: `app/modules/clerk-store-auth.js`
- Modified: `app/routes/plugin-routes.js`
- Modified: `app/test/clerk-store-auth.test.js`
- Modified: `app/test/plugin-store-routes.test.js`

- [x] Verify Clerk session tokens locally with `CLERK_JWT_KEY` or Clerk JWKS.
- [x] Store the verified session token as a raw HttpOnly cookie.
- [x] Accept either the Authorization header or the cookie on store requests.
- [x] Clear invalid cookies on auth failure.

### Task 3: Make the store usable after sign-in

**Files:**
- Modified: `app/modules/clerk-store-auth.js`
- Modified: `app/test/clerk-store-auth.test.js`
- Modified: `app/test/plugin-store-routes.test.js`

- [x] Default authenticated store accounts to the beta-free entitlement when no explicit entitlement exists.
- [x] Keep install/update permission checks for subscriber and closed-beta plugins intact.
- [x] Preserve the existing license-claim route as a compatibility path.

### Task 4: Verify the rollout

**Commands run:**

```powershell
cd app
npm test -- --runInBand --silent test/clerk-store-auth.test.js test/clerk-auth-bridge.test.js test/plugin-store-routes.test.js test/plugin-manager-listing.test.js
npm run lint
node --check app/modules/clerk-store-auth.js
node --check app/routes/plugin-routes.js
node --check app/public/js/clerk-store-auth.js
node --check auth/bridge.js
```

**Result:** All targeted Jest suites passed, ESLint passed, and the JavaScript syntax checks passed.

### Remaining Notes

- `CLERK_SECRET_KEY` and `LTTH_STORE_CLERK_SECRET_KEY` are now optional legacy values only.
- The earlier central-backend concept is not required for the current working app store.
