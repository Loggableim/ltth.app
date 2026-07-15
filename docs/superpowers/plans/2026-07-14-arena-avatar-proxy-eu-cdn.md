# Arena avatar proxy: TikTok EU CDN support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow current TikTok EU CDN profile images to pass through the Live Arena avatar proxy so players render with their profile images instead of fallback orbs.

**Architecture:** The Live Arena state already serializes each player's signed profile image URL and a same-origin proxy URL. Extend only the proxy's explicit hostname suffix policy to permit `tiktokcdn-eu.com`; the existing overlay continues rendering a circular avatar sprite and keeps its fallback-orb behavior for absent or failed images.

**Tech Stack:** Node.js CommonJS, Jest, Express route registration, native `fetch`.

## Global Constraints

- Modify only `app/plugins/game-engine/main.js` and `app/plugins/game-engine/test/arena-engine.test.js`.
- Permit only the `tiktokcdn-eu.com` hostname suffix in addition to existing approved TikTok CDN suffixes.
- Preserve HTTP(S)-only validation, localhost/private-address rejection, per-redirect validation, image content-type validation, the 2 MiB response limit, and the 5-second timeout.
- Use `runtime/node/node.exe` for test execution.
- Do not change the overlay; its colored orb remains the fallback for unavailable images.

---

### Task 1: Permit and proxy TikTok EU CDN avatar images

**Files:**
- Modify: `app/plugins/game-engine/test/arena-engine.test.js:6594-6614`
- Modify: `app/plugins/game-engine/main.js:35-46`

**Interfaces:**
- Consumes: `GameEnginePlugin._fetchAllowedArenaAvatar(rawUrl)` which validates an initial URL and every redirect before returning the final `fetch` response.
- Produces: successful handling for `https://*.tiktokcdn-eu.com/...` image URLs without allowing any extra hostname classes.

- [ ] **Step 1: Write the failing test**

Add this test immediately after the existing redirect-validation test in `app/plugins/game-engine/test/arena-engine.test.js`:

```js
  it('proxies current TikTok EU CDN avatar hosts as images', async () => {
    const { plugin, routes } = createPlugin();
    const originalFetch = global.fetch;
    const imageBytes = Buffer.from('avatar-image');
    const res = {
      status: jest.fn(() => res),
      json: jest.fn(),
      setHeader: jest.fn(),
      send: jest.fn()
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: jest.fn(() => 'image/webp') },
      arrayBuffer: jest.fn().mockResolvedValue(imageBytes)
    });

    try {
      plugin.registerRoutes();
      await routes['GET /api/game-engine/arena/avatar']({
        query: {
          url: 'https://p16-common-sign.tiktokcdn-eu.com/avatar.webp?x-signature=test'
        }
      }, res);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://p16-common-sign.tiktokcdn-eu.com/avatar.webp?x-signature=test',
        expect.objectContaining({ redirect: 'manual' })
      );
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/webp');
      expect(res.send).toHaveBeenCalledWith(imageBytes);
    } finally {
      global.fetch = originalFetch;
    }
  });
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
& .\runtime\node\node.exe .\app\node_modules\jest\bin\jest.js .\app\plugins\game-engine\test\arena-engine.test.js --runInBand --testNamePattern "proxies current TikTok EU CDN"
```

Expected: `FAIL` because `_assertAllowedArenaAvatarUrl()` rejects `p16-common-sign.tiktokcdn-eu.com`; the route returns HTTP 403 instead of forwarding the mocked image response.

- [ ] **Step 3: Write the minimal implementation**

In `app/plugins/game-engine/main.js`, extend the existing suffix array without changing validation logic:

```js
const AVATAR_PROXY_ALLOWED_HOST_SUFFIXES = [
  'tiktokcdn.com',
  'tiktokcdn-eu.com',
  'tiktokcdn-us.com',
  'bytegoofy.com',
  'tiktok.com',
  'muscdn.com',
  'tiktokv.com'
];
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run the command from Step 2.

Expected: `PASS` with one matching test and no failures.

- [ ] **Step 5: Run focused regression coverage**

Run:

```powershell
& .\runtime\node\node.exe .\app\node_modules\jest\bin\jest.js .\app\plugins\game-engine\test\arena-engine.test.js --runInBand
```

Expected: `PASS`; the existing private redirect test remains green, proving the broader EU suffix did not weaken redirect protections.

- [ ] **Step 6: Verify the running Arena endpoint with a live player URL**

Run:

```powershell
$state = Invoke-RestMethod 'http://127.0.0.1:3000/api/game-engine/arena/state'
$player = $state.players | Where-Object { $_.profilePictureUrl -match 'tiktokcdn-eu\\.com' } | Select-Object -First 1
Invoke-WebRequest ("http://127.0.0.1:3000" + $player.profilePictureProxyUrl) -UseBasicParsing
```

Expected after restarting the local app with the changed plugin: HTTP 200 and an `image/*` content type. The browser overlay then replaces the colored orb with the circular profile image.

- [ ] **Step 7: Commit the scoped implementation**

```powershell
git add -- app/plugins/game-engine/main.js app/plugins/game-engine/test/arena-engine.test.js
git commit -m "fix(game-engine): allow TikTok EU arena avatars"
```
