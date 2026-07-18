const fs = require('fs');
const path = require('path');

const SOURCE_PATH = path.join(__dirname, '..', 'plugins', 'webgpu-emoji-rain', 'gpu', 'webgpu-emoji-engine.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

function extractDelimitedBlock(text, marker, open = '{', close = '}') {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Missing source marker: ${marker}`);
  const openIndex = text.indexOf(open, markerIndex);
  if (openIndex < 0) throw new Error(`Missing opening ${open} after: ${marker}`);
  let depth = 0;
  for (let index = openIndex; index < text.length; index++) {
    if (text[index] === open) depth++;
    if (text[index] !== close) continue;
    depth--;
    if (depth === 0) return text.slice(markerIndex, index + 1);
  }
  throw new Error(`Unclosed source block after: ${marker}`);
}

function extractSection(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`Missing source section: ${startMarker}`);
  return text.slice(start, end);
}

const computeShader = extractSection(source, 'const COMPUTE_WGSL', 'const SPRITE_WGSL');
const spriteShader = extractSection(source, 'const SPRITE_WGSL', 'const POST_WGSL');

test('dispatches every buffered solver stage in the required order', () => {
  const dispatches = extractDelimitedBlock(source, 'const computeDispatches =', '[', ']');
  const stageNames = Array.from(dispatches.matchAll(/\['([^']+)',/g), match => match[1]);

  expect(stageNames).toEqual([
    'clear',
    'spawn',
    'integrate',
    'build',
    'solveToScratch',
    'clearGridOnly',
    'buildScratch',
    'solveToPrimary',
    'compact',
    'finalize'
  ]);
});

test('maps primary and scratch buffers explicitly for both solver directions', () => {
  const bindGroups = extractDelimitedBlock(source, '_createBindGroups() {');
  const primaryResources = extractDelimitedBlock(bindGroups, 'const primaryResources =');
  const scratchResources = extractDelimitedBlock(bindGroups, 'const scratchResources =');
  const bindingsByPipeline = extractDelimitedBlock(bindGroups, 'const bindingsByPipeline =');
  const resourcesByPipeline = extractDelimitedBlock(bindGroups, 'const resourcesByPipeline =');
  const spriteBindGroup = extractDelimitedBlock(bindGroups, 'this.spriteBindGroup = this.device.createBindGroup(');

  expect(primaryResources).toMatch(/0:\s*\{\s*binding:\s*0,\s*resource:\s*\{\s*buffer:\s*this\.particleBuffer/);
  expect(primaryResources).toMatch(/10:\s*\{\s*binding:\s*10,\s*resource:\s*\{\s*buffer:\s*this\.collisionBuffer/);
  expect(scratchResources).toMatch(/0:\s*\{\s*binding:\s*0,\s*resource:\s*\{\s*buffer:\s*this\.collisionBuffer/);
  expect(scratchResources).toMatch(/10:\s*\{\s*binding:\s*10,\s*resource:\s*\{\s*buffer:\s*this\.particleBuffer/);

  expect(bindingsByPipeline).toContain('solveToScratch: [0, 1, 2, 3, 10]');
  expect(bindingsByPipeline).toContain('buildScratch: [0, 1, 2, 3]');
  expect(bindingsByPipeline).toContain('solveToPrimary: [0, 1, 2, 3, 10]');
  expect(resourcesByPipeline).toContain('solveToScratch: primaryResources');
  expect(resourcesByPipeline).toContain('buildScratch: scratchResources');
  expect(resourcesByPipeline).toContain('solveToPrimary: scratchResources');
  expect(resourcesByPipeline).toContain('compact: primaryResources');
  expect(spriteBindGroup).toMatch(/binding:\s*0,\s*resource:\s*\{\s*buffer:\s*this\.particleBuffer/);
});

test('copies collision-disabled particles and isolates counter mutation to compaction', () => {
  const resolve = extractDelimitedBlock(computeShader, 'fn resolveCollisions');
  const clearGridOnly = extractDelimitedBlock(computeShader, 'fn clearGridOnly');
  const compact = extractDelimitedBlock(computeShader, 'fn compactActiveParticles');
  const counterIncrements = computeShader.match(/atomicAdd\(&counters\[0\]/g) || [];

  expect(resolve).toMatch(/frame\.collisionScale <= 0\.0[\s\S]*solvedParticles\[index\] = particle;\s*return;/);
  expect(clearGridOnly).toContain('atomicStore(&gridHeads[index], -1);');
  expect(clearGridOnly.match(/atomicStore\(/g)).toHaveLength(1);
  expect(clearGridOnly).not.toMatch(/counters|activeIndices|indirectArgs/);
  expect(counterIncrements).toHaveLength(1);
  expect(compact).toContain('atomicAdd(&counters[0], 1u)');
});

test('bounds neighbour cells without clamping and caps each cell scan at eight entries', () => {
  const resolve = extractDelimitedBlock(computeShader, 'fn resolveCollisions');
  const scanCaps = Array.from(resolve.matchAll(/checked\s*<\s*(\d+)u/g), match => Number(match[1]));

  expect(resolve).toMatch(/var oy: i32 = max\(-reach\.y, -i32\(home\.y\)\); oy <= min\(reach\.y,/);
  expect(resolve).toMatch(/var ox: i32 = max\(-reach\.x, -i32\(home\.x\)\); ox <= min\(reach\.x,/);
  expect(resolve).not.toMatch(/clamp\s*\(\s*i32\s*\(\s*home\./);
  expect(scanCaps).toEqual([8]);
  expect(resolve).toContain('let minDistance = radius + collisionRadius(other);');
});

test('keeps the impact ABI field zero and out of sprite geometry and fragments', () => {
  const integrate = extractDelimitedBlock(computeShader, 'fn integrateParticles');
  const encodeParticle = extractDelimitedBlock(source, '_encodeParticle(particle) {');

  expect(integrate).toContain('particle.params0.w = 0.0;');
  expect(encodeParticle).toContain('floats[11] = 0;');
  expect(spriteShader).not.toMatch(/\bimpact\b/);
  expect(spriteShader).not.toContain('particle.params0.w * 0.14');
});
