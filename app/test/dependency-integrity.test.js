const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
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

describe('production dependency integrity', () => {
  test('reports a partial scoped SDK without exposing its raw load error', () => {
    const projectRoot = createProject({ '@deepgram/sdk': '5.5.0' });
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
    writeDependency(projectRoot, 'express');
    writeDependency(projectRoot, '@deepgram/sdk');

    expect(verifyProductionDependencies(projectRoot)).toEqual({
      valid: true,
      missing: [],
      errors: []
    });
  });

  test('CLI returns failure with package names only for a partial SDK', () => {
    const projectRoot = createProject({ '@deepgram/sdk': '5.5.0' });
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
