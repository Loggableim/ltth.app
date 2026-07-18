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
  const computeBindGroups = extractSection(bindGroups, 'this.computeBindGroups =', 'this.spriteBindGroup =');
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
  expect(computeBindGroups).toContain('Object.entries(this.computePipelines).map(([name, pipeline])');
  expect(computeBindGroups).toContain('bindingsByPipeline[name].map(binding => resourcesByPipeline[name][binding])');
  expect(spriteBindGroup).toMatch(/binding:\s*0,\s*resource:\s*\{\s*buffer:\s*this\.particleBuffer/);
});

test('maps every named compute pipeline to its intended WGSL entry point', () => {
  const createPipelines = extractDelimitedBlock(source, '_createPipelines() {');
  const computePipelines = extractDelimitedBlock(createPipelines, 'this.computePipelines =');
  const entryPoints = Object.fromEntries(Array.from(
    computePipelines.matchAll(/^\s*(\w+): .*entryPoint: '([^']+)'/gm),
    match => [match[1], match[2]]
  ));

  expect(entryPoints).toEqual({
    clear: 'clearGrid',
    spawn: 'spawnParticles',
    integrate: 'integrateParticles',
    build: 'buildGrid',
    solveToScratch: 'resolveCollisions',
    clearGridOnly: 'clearGridOnly',
    buildScratch: 'buildGrid',
    solveToPrimary: 'resolveCollisions',
    compact: 'compactActiveParticles',
    finalize: 'finalizeIndirect'
  });
});

test('copies collision-disabled particles and isolates counter mutation to compaction', () => {
  const integrate = extractDelimitedBlock(computeShader, 'fn integrateParticles');
  const expiry = extractDelimitedBlock(integrate, 'if (particle.life <= 0.0 || outside)');
  const resolve = extractDelimitedBlock(computeShader, 'fn resolveCollisions');
  const clearGridOnly = extractDelimitedBlock(computeShader, 'fn clearGridOnly');
  const compact = extractDelimitedBlock(computeShader, 'fn compactActiveParticles');
  const counterIncrements = computeShader.match(/atomicAdd\(&counters\[0\]/g) || [];

  expect(resolve).toMatch(/frame\.collisionScale <= 0\.0[\s\S]*solvedParticles\[index\] = particle;\s*return;/);
  expect(expiry).toContain('atomicStore(&slotStates[index], 0u);');
  expect(expiry).toMatch(/particle\.flags = particle\.flags & ~1u;[\s\S]*particles\[index\] = particle;[\s\S]*atomicStore\(&slotStates\[index\], 0u\);[\s\S]*return;/);
  expect(clearGridOnly).toContain('atomicStore(&gridHeads[index], -1);');
  expect(clearGridOnly.match(/atomicStore\(/g)).toHaveLength(1);
  expect(clearGridOnly).not.toMatch(/counters|activeIndices|indirectArgs/);
  expect(counterIncrements).toHaveLength(1);
  expect(compact).toContain('atomicAdd(&counters[0], 1u)');
});

test('derives uncapped neighbour reach from the particle and configured maximum radii', () => {
  const resolve = extractDelimitedBlock(computeShader, 'fn resolveCollisions');

  expect(resolve).toContain('radius + frame.maxCollisionRadius');
  expect(resolve).not.toMatch(/min\s*\(\s*2,/);
  expect(resolve).toMatch(/var oy: i32 = max\(-reach\.y, -i32\(home\.y\)\); oy <= min\(reach\.y,/);
  expect(resolve).toMatch(/var ox: i32 = max\(-reach\.x, -i32\(home\.x\)\); ox <= min\(reach\.x,/);
  expect(resolve).not.toMatch(/clamp\s*\(\s*i32\s*\(\s*home\./);
  expect(resolve).not.toMatch(/checked\s*</);
  expect(resolve).not.toContain('for (var checked:');
  expect(resolve).toContain('let minDistance = radius + collisionRadius(other);');
});

test('covers normal 80px emoji contacts that span three 30px cells', () => {
  const radius = 80 * 0.46;
  const requiredReach = Math.ceil((radius + radius) / 30);
  const conservativeReach = Math.ceil((radius + Math.max(128, radius)) / 30);

  expect(requiredReach).toBe(3);
  expect(conservativeReach).toBeGreaterThanOrEqual(requiredReach);
});

test('accumulates every collision from immutable source state before constraining the result', () => {
  const resolve = extractDelimitedBlock(computeShader, 'fn resolveCollisions');

  expect(resolve).toContain('var positionCorrection = vec2<f32>(0.0);');
  expect(resolve).toContain('var velocityCorrection = vec2<f32>(0.0);');
  expect(resolve).not.toContain('particle.position +=');
  expect(resolve).not.toContain('particle.velocity -=');
  expect(resolve).toContain('particle.position = constrainToBounds(particle, particle.position + positionCorrection);');
  expect(resolve).toContain('particle.velocity += velocityCorrection;');
});

test('gives a floor-blocked particle full separation to its movable partner', () => {
  const resolve = extractDelimitedBlock(computeShader, 'fn resolveCollisions');
  const lowerCanMoveDown = false;
  const upperCanMoveUp = true;
  const penetration = 12;
  const upperShare = upperCanMoveUp && !lowerCanMoveDown ? 1 : 0.5;
  const lowerShare = !lowerCanMoveDown && upperCanMoveUp ? 0 : 0.5;

  expect(upperShare).toBe(1);
  expect(lowerShare).toBe(0);
  expect(-penetration * upperShare).toBe(-12);
  expect(penetration * lowerShare).toBe(0);
  expect(resolve).toContain('let selfCanMove = canMoveAlongBounds(particle, radius, normal);');
  expect(resolve).toContain('let otherCanMove = canMoveAlongBounds(other, collisionRadius(other), -normal);');
  expect(resolve).toContain('if (selfCanMove && !otherCanMove) { correctionShare = 1.0; }');
  expect(resolve).toContain('constrainToBounds(particle, particle.position + positionCorrection)');
});

test('keeps a smaller boundary radius for non-colliding stickers', () => {
  const integrate = extractDelimitedBlock(computeShader, 'fn integrateParticles');
  const boundaryRadius = computeShader.includes('fn boundaryRadius')
    ? extractDelimitedBlock(computeShader, 'fn boundaryRadius')
    : '';

  expect(boundaryRadius).toContain('particle.size * select(0.46, 0.38, particle.kind == 5u)');
  expect(integrate).toContain('let radius = boundaryRadius(particle);');
});

test('shares maxCollisionRadius through the fixed 128-byte frame ABI and covers every spawn size', () => {
  const frameUniforms = source.match(/struct FrameUniforms \{[\s\S]*?\n\};/g) || [];
  const createSpawnCommand = extractDelimitedBlock(source, '_createSpawnCommand(options, textureSlot, kind, burst, index, count) {');
  const writeUniforms = extractDelimitedBlock(source, '_writeUniforms(delta, time) {');
  const configuredMaximumRadius = 1024 * 0.46 * 1.18 * 2.4;
  const largestSpawnRadius = 2048 * 0.46 * 1.18 * 2.4;

  expect(frameUniforms).toHaveLength(4);
  for (const frameUniform of frameUniforms) {
    expect(frameUniform).toContain('maxCollisionRadius: f32');
    expect(frameUniform).toContain('padding: f32');
  }
  expect(new Set(frameUniforms.map(frameUniform => frameUniform.replace(/\s+/g, ' ').trim())).size).toBe(1);
  expect(source).toContain('const UNIFORM_SIZE = 128;');
  expect(largestSpawnRadius).toBeGreaterThan(configuredMaximumRadius);
  expect(source).toContain('const MAX_SPAWN_SIZE = 2048;');
  expect(source).toContain('const MAX_DEPTH_SIZE_SCALE = 1.18;');
  expect(source).toContain('const MAX_INTENSITY_SIZE_SCALE = 2.4;');
  expect(writeUniforms).toContain('const maxCollisionRadius = Math.max(128, MAX_SPAWN_SIZE * 0.46 * MAX_DEPTH_SIZE_SCALE * MAX_INTENSITY_SIZE_SCALE);');
  expect(createSpawnCommand).toContain('clamp(options.size, 8, MAX_SPAWN_SIZE, minSize)');
  expect(createSpawnCommand).toContain('Math.min(MAX_DEPTH_SIZE_SCALE, 0.78 + depth * 0.4)');
  expect(createSpawnCommand).toContain('Math.min(MAX_INTENSITY_SIZE_SCALE, Math.max(0.65, intensity))');
  expect(largestSpawnRadius).toBeCloseTo(2667.97056, 5);
  expect(writeUniforms).toContain('floats[30] = maxCollisionRadius;');
});

test('keeps balloon kinds outside floor constraints during integration and solve', () => {
  const integrate = extractDelimitedBlock(computeShader, 'fn integrateParticles');
  const canMoveAlongBounds = extractDelimitedBlock(computeShader, 'fn canMoveAlongBounds');
  const constrainToBounds = extractDelimitedBlock(computeShader, 'fn constrainToBounds');
  const floorConstrained = computeShader.includes('fn isFloorConstrained')
    ? extractDelimitedBlock(computeShader, 'fn isFloorConstrained')
    : '';

  expect(computeShader).toContain('return kind == 1u || kind == 12u;');
  expect(floorConstrained).toContain('!isBalloon(particle.kind)');
  expect(floorConstrained).not.toContain('particle.kind != 3u');
  expect(integrate).toContain('if (isFloorConstrained(particle) && particle.position.y > frame.floorY - radius)');
  expect(canMoveAlongBounds).toContain('if (isFloorConstrained(particle) && direction.y > 0.0');
  expect(constrainToBounds).toContain('if (isFloorConstrained(particle))');
});

test('allocates, clears, trims and releases the fixed-capacity collision scratch buffer', () => {
  const createBuffers = extractDelimitedBlock(source, '_createBuffers() {');
  const collisionAllocation = extractDelimitedBlock(createBuffers, 'this.collisionBuffer = this.device.createBuffer(');
  const clear = extractDelimitedBlock(source, '    clear() {');
  const clearCapacityTail = extractDelimitedBlock(source, '_clearCapacityTail(startIndex) {');
  const release = extractDelimitedBlock(source, '_releaseGPUResources() {');
  const releasedResources = extractDelimitedBlock(release, 'const resources =', '[', ']');

  expect(collisionAllocation).toContain("label: 'emoji-particles-collision-scratch'");
  expect(collisionAllocation).toContain('size: GPU_CAPACITY * PARTICLE_STRIDE');
  expect(collisionAllocation).toContain('usage: U.STORAGE | U.COPY_DST | U.COPY_SRC');
  expect(clear).toContain('writeBuffer(this.particleBuffer, 0, new Uint8Array(GPU_CAPACITY * PARTICLE_STRIDE))');
  expect(clear).toContain('writeBuffer(this.collisionBuffer, 0, new Uint8Array(GPU_CAPACITY * PARTICLE_STRIDE))');
  expect(clearCapacityTail).toContain('writeBuffer(this.particleBuffer, startIndex * PARTICLE_STRIDE, new Uint8Array(tailCount * PARTICLE_STRIDE))');
  expect(clearCapacityTail).toContain('writeBuffer(this.collisionBuffer, startIndex * PARTICLE_STRIDE, new Uint8Array(tailCount * PARTICLE_STRIDE))');
  expect(releasedResources).toMatch(/this\.particleBuffer,\s*this\.collisionBuffer,/);
});

test('keeps the impact ABI field zero and out of sprite geometry and fragments', () => {
  const integrate = extractDelimitedBlock(computeShader, 'fn integrateParticles');
  const encodeParticle = extractDelimitedBlock(source, '_encodeParticle(particle) {');

  expect(integrate).toContain('particle.params0.w = 0.0;');
  expect(encodeParticle).toContain('floats[11] = 0;');
  expect(spriteShader).not.toMatch(/\bimpact\b/);
  expect(spriteShader).not.toContain('particle.params0.w * 0.14');
});
