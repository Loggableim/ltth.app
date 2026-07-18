const fs = require('fs');
const path = require('path');

const SOURCE_PATH = path.join(__dirname, '..', 'plugins', 'webgpu-emoji-rain', 'gpu', 'webgpu-emoji-engine.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

test('uses two buffered collision solves and never renders an impact pulse', () => {
  const dispatch = source.slice(source.indexOf('const computeDispatches = ['), source.indexOf('compute.end()'));
  expect(source).toContain('fn collisionRadius');
  expect(source).toContain('fn integrateParticles');
  expect(source).toContain('fn resolveCollisions');
  expect(source).toContain('fn compactActiveParticles');
  expect(dispatch).toContain("['integrate', particleDispatch]");
  expect(dispatch).toContain("['solveToScratch', particleDispatch]");
  expect(dispatch).toContain("['buildScratch', particleDispatch]");
  expect(dispatch).toContain("['solveToPrimary', particleDispatch]");
  expect(dispatch).toContain("['compact', particleDispatch]");
  expect(source).toContain('this.collisionBuffer');
  expect(source).not.toContain('impactSpeed =');
  expect(source).not.toContain('input.impact > 0.001');
  expect(source).not.toContain('particle.params0.w * 0.14');
});
