# Startup Dependency Self-Healing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the LTTH launcher detect missing or partially broken production dependencies on every start, repair them from the lockfile, and verify the repaired tree before starting the server.

**Architecture:** Keep dependency discovery in `Launcher.verifyCriticalDependencies()`. Read every direct production dependency from `app/package.json` for package-directory checks, and separately load the existing boot-critical CommonJS list plus `@deepgram/sdk` so nested module failures are detected. Centralize reinstall-and-reverify behavior in `checkDependencies()` so every install path has the same post-install gate.

**Tech Stack:** Node.js CommonJS, Jest, `fs`, `path`, npm lockfile-aware installation.

## Global Constraints

- Keep changes scoped to `app/modules/launcher.js` and `app/test/launcher-runtime-paths.test.js`.
- Preserve the existing lockfile-aware `npm ci`/`npm install` behavior.
- Check every direct `package.json.dependencies` entry, including scoped names such as `@deepgram/sdk`.
- Only load boot-critical CommonJS packages; do not require optional or browser-only dependencies.
- Do not modify the user's unrelated dirty worktree changes.
- Production code uses the existing CommonJS style and 4-space indentation in `launcher.js`.

---

### Task 1: Add failing regression coverage for dependency verification

**Files:**
- Modify: `app/test/launcher-runtime-paths.test.js`
- Test: `app/test/launcher-runtime-paths.test.js`

**Interfaces:**
- Consumes: `Launcher.verifyCriticalDependencies()` and `Launcher.checkDependencies()`.
- Produces: tests that fail against the current fixed-directory-only implementation and prove the desired scoped-package and nested-load failure behavior.

- [ ] **Step 1: Replace directory-only fixtures with loadable package fixtures**

Replace the existing `writeCriticalDependencyDirs()` helper with these fixtures:

```js
const BOOT_CRITICAL_DEPENDENCIES = [
  'dotenv',
  'express',
  'socket.io',
  'better-sqlite3',
  'winston',
  '@eulerstream/euler-websocket-sdk',
  'jsonwebtoken',
  'axios',
  'ws',
  '@deepgram/sdk'
];

function writeLoadableDependency(projectRoot, dep, source = 'module.exports = {};') {
  const depPath = path.join(projectRoot, 'node_modules', dep);
  fs.mkdirSync(depPath, { recursive: true });
  fs.writeFileSync(path.join(depPath, 'package.json'), JSON.stringify({ main: 'index.js' }));
  fs.writeFileSync(path.join(depPath, 'index.js'), source);
}

function writeCriticalDependencyDirs(projectRoot) {
  for (const dep of BOOT_CRITICAL_DEPENDENCIES) {
    writeLoadableDependency(projectRoot, dep);
  }
}
```

- [ ] **Step 2: Add a test for all declared scoped dependencies**

Add this test after the existing dependency-state test:

```js
test('detects a declared scoped dependency that is missing from node_modules', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-launcher-scoped-deps-'));
  fs.mkdirSync(path.join(projectRoot, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
    dependencies: {
      express: '^4.0.0',
      '@deepgram/sdk': '5.5.0'
    }
  }));
  fs.writeFileSync(path.join(projectRoot, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }));
  writeLoadableDependency(projectRoot, 'express');

  const verification = createQuietLauncher(projectRoot).verifyCriticalDependencies();

  expect(verification.valid).toBe(false);
  expect(verification.missing).toContain('@deepgram/sdk');
});
```

- [ ] **Step 3: Add a test for a missing nested Deepgram module**

Add this test immediately after the scoped-dependency test:

```js
test('detects a boot-critical package whose nested module is missing', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-launcher-broken-sdk-'));
  fs.mkdirSync(path.join(projectRoot, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
    dependencies: { '@deepgram/sdk': '5.5.0' }
  }));
  fs.writeFileSync(path.join(projectRoot, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }));
  writeCriticalDependencyDirs(projectRoot);
  fs.writeFileSync(
    path.join(projectRoot, 'node_modules', '@deepgram', 'sdk', 'index.js'),
    "require('./api/index.js'); module.exports = {};"
  );

  const verification = createQuietLauncher(projectRoot).verifyCriticalDependencies();

  const details = [
    ...(verification.missing || []),
    ...(verification.errors || [])
  ].join(' ');

  expect(verification.valid).toBe(false);
  expect(details).toContain('@deepgram/sdk');
  expect(details).toContain('api/index.js');
});
```

- [ ] **Step 4: Add tests for post-install verification**

Add these tests after the broken-SDK test:

```js
test('re-verifies dependencies after reinstalling', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-launcher-reverify-'));
  fs.mkdirSync(path.join(projectRoot, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ dependencies: {} }));
  fs.writeFileSync(path.join(projectRoot, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }));

  const launcher = createQuietLauncher(projectRoot);
  launcher.verifyCriticalDependencies = jest
    .fn()
    .mockReturnValueOnce({ valid: false, missing: ['@deepgram/sdk'], errors: [] })
    .mockReturnValueOnce({ valid: true, missing: [], errors: [] });
  launcher.installDependencies = jest.fn(async () => {});

  await launcher.checkDependencies();

  expect(launcher.installDependencies).toHaveBeenCalledTimes(1);
  expect(launcher.verifyCriticalDependencies).toHaveBeenCalledTimes(2);
});

test('throws when dependency verification still fails after reinstalling', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-launcher-reverify-fail-'));
  fs.mkdirSync(path.join(projectRoot, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ dependencies: {} }));
  fs.writeFileSync(path.join(projectRoot, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3 }));

  const launcher = createQuietLauncher(projectRoot);
  launcher.verifyCriticalDependencies = jest.fn(() => ({
    valid: false,
    missing: ['@deepgram/sdk'],
    errors: ['@deepgram/sdk: Cannot find module ./api/index.js']
  }));
  launcher.installDependencies = jest.fn(async () => {});

  await expect(launcher.checkDependencies()).rejects.toThrow('Dependency verification failed after installation');
});
```

- [ ] **Step 5: Run the focused tests and confirm RED**

Run:

```powershell
cd C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\.worktrees\stt-ticker-dependency-hardening\app
npm test -- --runInBand test/launcher-runtime-paths.test.js --silent
```

Expected: FAIL because the current launcher does not read declared dependencies, does not load `@deepgram/sdk`, and does not reverify after installation.

### Task 2: Implement generalized startup verification and repair gating

**Files:**
- Modify: `app/modules/launcher.js:271-402`
- Test: `app/test/launcher-runtime-paths.test.js`

**Interfaces:**
- Consumes: `package.json.dependencies`, existing `installDependencies()`, and existing `checkDependencies()` state logic.
- Produces: `verifyCriticalDependencies()` returning `{ valid, missing, errors }`; `checkDependencies()` that reinstalls and verifies before returning.

- [ ] **Step 1: Add declared-dependency discovery and critical loadability checks**

Replace the existing fixed-directory-only method with this implementation:

```js
    getDeclaredProductionDependencies() {
        const packageJsonPath = path.join(this.projectRoot, 'package.json');
        try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            return Object.keys(packageJson.dependencies || {});
        } catch (error) {
            return { error };
        }
    }

    verifyCriticalDependencies() {
        const bootCriticalDeps = [
            'dotenv',
            'express',
            'socket.io',
            'better-sqlite3',
            'winston',
            '@eulerstream/euler-websocket-sdk',
            'jsonwebtoken',
            'axios',
            'ws',
            '@deepgram/sdk'
        ];
        const declaredDepsResult = this.getDeclaredProductionDependencies();
        const missingDeps = [];
        const errors = [];

        if (declaredDepsResult.error) {
            errors.push(`package.json: ${declaredDepsResult.error.message}`);
            return { valid: false, missing: missingDeps, errors };
        }

        for (const dep of declaredDepsResult) {
            const depPath = path.join(this.projectRoot, 'node_modules', dep);
            if (!fs.existsSync(depPath)) {
                missingDeps.push(dep);
            }
        }

        for (const dep of bootCriticalDeps) {
            const depPath = path.join(this.projectRoot, 'node_modules', dep);
            if (!fs.existsSync(depPath) || missingDeps.includes(dep)) {
                continue;
            }
            try {
                const entryPath = require.resolve(dep, { paths: [this.projectRoot] });
                delete require.cache[entryPath];
                require(entryPath);
            } catch (error) {
                errors.push(`${dep}: ${error.message}`);
            }
        }

        return {
            valid: missingDeps.length === 0 && errors.length === 0,
            missing: missingDeps,
            errors
        };
    }
```

- [ ] **Step 2: Centralize reinstall, post-install verification, and state recording**

Add this method before `checkDependencies()`:

```js
    async reinstallAndVerifyDependencies(successMessage) {
        await this.installDependencies();
        const verification = this.verifyCriticalDependencies();
        if (!verification.valid) {
            const details = [...verification.missing, ...verification.errors].join('; ');
            this.log.error(`Dependency verification failed after installation: ${details}`);
            throw new Error(`Dependency verification failed after installation: ${details}`);
        }

        this.writeDependencyState();
        this.log.newLine();
        this.log.success(successMessage);
    }
```

- [ ] **Step 3: Route every install path through the post-install gate**

In `checkDependencies()`, replace each direct `installDependencies()` plus
`writeDependencyState()` block with the helper:

```js
        if (!fs.existsSync(nodeModulesPath)) {
            this.log.warn('Dependencies nicht gefunden. Installiere...');
            this.log.newLine();
            await this.reinstallAndVerifyDependencies('Dependencies erfolgreich installiert!');
            return;
        }

        const verification = this.verifyCriticalDependencies();
        if (!verification.valid) {
            const details = [...verification.missing, ...verification.errors].join('; ');
            this.log.warn(`Fehlende oder fehlerhafte Dependencies erkannt: ${details}`);
            this.log.warn('Reinstalliere Dependencies...');
            this.log.newLine();
            await this.reinstallAndVerifyDependencies('Dependencies erfolgreich installiert!');
            return;
        }
```

Replace the package-state reinstall branch with:

```js
            await this.reinstallAndVerifyDependencies('Dependencies aktualisiert!');
```

Keep the existing healthy-state branch unchanged so valid installations do not reinstall at every start.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run:

```powershell
cd C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\.worktrees\stt-ticker-dependency-hardening\app
npm test -- --runInBand test/launcher-runtime-paths.test.js --silent
```

Expected: all launcher tests pass, including the new scoped, nested-load, and post-install verification cases.

### Task 3: Verify the implementation and prepare the branch

**Files:**
- Modify: none beyond Task 1 and Task 2.
- Test: `app/test/launcher-runtime-paths.test.js`, the full Jest suite, lint, and CSS build.

- [ ] **Step 1: Run syntax and focused diff checks**

```powershell
node --check app/modules/launcher.js
git diff --check
```

Expected: both commands exit 0 with no output.

- [ ] **Step 2: Run the full project verification set**

```powershell
cd C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\.worktrees\stt-ticker-dependency-hardening\app
npm test -- --runInBand --silent
npm run lint -- --quiet
npm run build:css
```

Expected: all existing Jest suites pass, ESLint exits 0, and Tailwind CSS builds successfully.

- [ ] **Step 3: Inspect scope and commit the implementation**

```powershell
git status --short
git diff --stat
git add app/modules/launcher.js app/test/launcher-runtime-paths.test.js
git commit -m "fix(launcher): self-heal broken production dependencies"
```

Expected: only the launcher and its focused test are staged and committed; the spec and plan remain as their own documentation commits.
