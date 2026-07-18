const fs = require('fs');
const path = require('path');

const SOURCE_PATH = path.join(__dirname, '..', 'plugins', 'webgpu-emoji-rain', 'gpu', 'webgpu-emoji-engine.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

test('uses two buffered collision solves and never renders an impact pulse', () => {
  const dispatch = source.slice(source.indexOf('const computeDispatches = ['), source.indexOf('compute.end()'));
  const collisionPipeline = [
    "['integrate', particleDispatch]",
    "['build', particleDispatch]",
    "['solveToScratch', particleDispatch]",
    "['buildScratch', particleDispatch]",
    "['solveToPrimary', particleDispatch]",
    "['compact', particleDispatch]",
    "['finalize', 1]"
  ];
  expect(source).toContain('fn collisionRadius');
  expect(source).toContain('fn integrateParticles');
  expect(source).toContain('fn resolveCollisions');
  expect(source).toContain('fn compactActiveParticles');
  for (const stage of collisionPipeline) expect(dispatch).toContain(stage);
  const stagePositions = collisionPipeline.map(stage => dispatch.indexOf(stage));
  for (let index = 1; index < stagePositions.length; index++) {
    expect(stagePositions[index]).toBeGreaterThan(stagePositions[index - 1]);
  }
  expect(source).toContain('this.collisionBuffer');
  expect(source).not.toContain('impactSpeed =');
  expect(source).not.toContain('input.impact > 0.001');
  expect(source).not.toContain('particle.params0.w * 0.14');
});
