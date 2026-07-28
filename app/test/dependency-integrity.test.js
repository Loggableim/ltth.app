const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  BOOT_CRITICAL_DEPENDENCIES,
  verifyProductionDependencies
} = require('../modules/dependency-integrity');

function createProject(dependencies) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-dependency-integrity-'));
  fs.mkdirSync(path.join(projectRoot, 'node_modules'), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, 'package.json'),
    JSON.stringify({ dependencies })
  );
  return projectRoot;
}

function writeDependency(projectRoot, dependency, source = 'module.exports = {};') {
  const dependencyRoot = path.join(projectRoot, 'node_modules', dependency);
  fs.mkdirSync(dependencyRoot, { recursive: true });
  fs.writeFileSync(path.join(dependencyRoot, 'package.json'), JSON.stringify({ main: 'index.js' }));
  fs.writeFileSync(path.join(dependencyRoot, 'index.js'), source);
}

function writeBootCriticalDependencies(projectRoot) {
  for (const dependency of BOOT_CRITICAL_DEPENDENCIES) {
    writeDependency(projectRoot, dependency);
  }
}

describe('production dependency integrity', () => {
  test('reports a partial scoped SDK without exposing its raw load error', () => {
    const projectRoot = createProject({ '@deepgram/sdk': '5.5.0' });
    writeBootCriticalDependencies(projectRoot);
    writeDependency(projectRoot, '@deepgram/sdk', "require('./api/index.js'); module.exports = {};");

    const verification = verifyProductionDependencies(projectRoot);

    expect(verification).toEqual({
      valid: false,
      missing: [],
      errors: ['@deepgram/sdk']
    });
  });

  test('accepts complete declared production dependencies and smoke-tests Deepgram', () => {
    const projectRoot = createProject({
      express: '^4.0.0',
      '@deepgram/sdk': '5.5.0'
    });
    writeBootCriticalDependencies(projectRoot);

    expect(verifyProductionDependencies(projectRoot)).toEqual({
      valid: true,
      missing: [],
      errors: []
    });
  });

  test('does not reuse a cached nested SDK module after it disappears', () => {
    const projectRoot = createProject({ '@deepgram/sdk': '5.5.0' });
    writeBootCriticalDependencies(projectRoot);
    writeDependency(projectRoot, '@deepgram/sdk', "module.exports = require('./api/index.js');");
    const apiDirectory = path.join(projectRoot, 'node_modules', '@deepgram', 'sdk', 'api');
    fs.mkdirSync(apiDirectory, { recursive: true });
    fs.writeFileSync(path.join(apiDirectory, 'index.js'), 'module.exports = {};');

    expect(verifyProductionDependencies(projectRoot).valid).toBe(true);

    fs.rmSync(apiDirectory, { recursive: true, force: true });

    expect(verifyProductionDependencies(projectRoot)).toEqual({
      valid: false,
      missing: [],
      errors: ['@deepgram/sdk']
    });
  });

  test('requires boot-critical packages even when package.json omits them', () => {
    const projectRoot = createProject({});

    const verification = verifyProductionDependencies(projectRoot);

    expect(verification.valid).toBe(false);
    expect(verification.missing).toContain('@deepgram/sdk');
    expect(verification.missing).toContain('express');
  });

  test('rejects a declared package path that is a file instead of a directory', () => {
    const projectRoot = createProject({ 'not-boot-critical': '1.0.0' });
    writeBootCriticalDependencies(projectRoot);
    fs.writeFileSync(path.join(projectRoot, 'node_modules', 'not-boot-critical'), 'not a package directory');

    expect(verifyProductionDependencies(projectRoot)).toEqual({
      valid: false,
      missing: ['not-boot-critical'],
      errors: []
    });
  });

  test('CLI returns failure with package names only for a partial SDK', () => {
    const projectRoot = createProject({ '@deepgram/sdk': '5.5.0' });
    writeBootCriticalDependencies(projectRoot);
    writeDependency(projectRoot, '@deepgram/sdk', "require('./api/index.js'); module.exports = {};");

    const result = spawnSync(process.execPath, [
      path.join(__dirname, '..', 'modules', 'dependency-integrity-cli.js')
    ], {
      cwd: projectRoot,
      encoding: 'utf8'
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('@deepgram/sdk');
    expect(result.stderr).not.toContain('api/index.js');
    expect(result.stderr).not.toMatch(/Error:|stack/i);
  });
});
