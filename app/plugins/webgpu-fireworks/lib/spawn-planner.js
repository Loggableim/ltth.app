'use strict';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function createRandom(seed) {
  let state = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function distance(left, right) {
  if (!left || !right) return 1;
  const dx = left.x - right.x;
  const dy = (left.y - right.y) * 1.15;
  return Math.sqrt(dx * dx + dy * dy);
}

class SpawnPlanner {
  constructor(options = {}) {
    this.historyLimit = Math.max(4, Number(options.historyLimit) || 8);
    this.minimumTargetDistance = Math.max(0.08, Number(options.minimumTargetDistance) || 0.18);
    this.targets = [];
    this.origins = [];
  }

  getBounds(orientation = 'landscape') {
    return orientation === 'portrait'
      ? { minX: 0.1, maxX: 0.9, minY: 0.12, maxY: 0.68 }
      : { minX: 0.12, maxX: 0.88, minY: 0.16, maxY: 0.62 };
  }

  plan(options = {}) {
    const seed = Number(options.seed) >>> 0;
    const random = createRandom(seed);
    const bounds = this.getBounds(options.orientation);
    const exact = options.positionMode === 'exact' && options.position;
    const target = exact
      ? {
        x: clamp(Number(options.position.x) || 0.5, 0, 1),
        y: clamp(Number(options.position.y) || 0.5, 0, 1)
      }
      : this.chooseTarget(random, bounds);
    const origin = options.origin
      ? {
        x: clamp(Number(options.origin.x) || 0.5, 0.04, 0.96),
        y: clamp(Number(options.origin.y) || 1, 0.92, 1.08)
      }
      : this.chooseOrigin(random, target);

    this.remember(this.targets, target);
    this.remember(this.origins, origin);
    return { position: target, origin, seed };
  }

  chooseTarget(random, bounds) {
    let best = null;
    let bestDistance = -1;
    for (let attempt = 0; attempt < 16; attempt++) {
      const candidate = {
        x: bounds.minX + random() * (bounds.maxX - bounds.minX),
        y: bounds.minY + random() * (bounds.maxY - bounds.minY)
      };
      const nearest = this.targets.length
        ? Math.min(...this.targets.map(previous => distance(candidate, previous)))
        : 1;
      if (nearest >= this.minimumTargetDistance) return candidate;
      if (nearest > bestDistance) {
        best = candidate;
        bestDistance = nearest;
      }
    }
    return best || { x: 0.5, y: 0.42 };
  }

  chooseOrigin(random, target) {
    let best = null;
    let bestDistance = -1;
    for (let attempt = 0; attempt < 12; attempt++) {
      const direction = ((attempt + Math.floor(random() * 2)) % 2 === 0) ? -1 : 1;
      const offset = 0.12 + random() * 0.2;
      const candidate = { x: clamp(target.x + direction * offset, 0.06, 0.94), y: 1.02 };
      const nearest = this.origins.length
        ? Math.min(...this.origins.slice(-4).map(previous => Math.abs(candidate.x - previous.x)))
        : 1;
      if (nearest >= 0.1) return candidate;
      if (nearest > bestDistance) {
        best = candidate;
        bestDistance = nearest;
      }
    }
    return best || { x: clamp(1 - target.x, 0.08, 0.92), y: 1.02 };
  }

  planFinale(count, options = {}) {
    const total = Math.max(1, Math.min(40, Math.floor(Number(count) || 1)));
    const seed = Number(options.seed) >>> 0;
    const bounds = this.getBounds(options.orientation);
    const columns = Math.min(6, Math.max(3, Math.ceil(Math.sqrt(total))));
    const rows = Math.ceil(total / columns);
    const plans = [];
    for (let index = 0; index < total; index++) {
      const random = createRandom(seed + index * 0x9e3779b9);
      const column = index % columns;
      const row = Math.floor(index / columns);
      const xStep = (bounds.maxX - bounds.minX) / columns;
      const yStep = (bounds.maxY - bounds.minY) / Math.max(1, rows);
      const position = {
        x: bounds.minX + xStep * (column + 0.5) + (random() - 0.5) * xStep * 0.42,
        y: bounds.minY + yStep * (row + 0.5) + (random() - 0.5) * yStep * 0.32
      };
      plans.push(this.plan({
        seed: seed + index * 2654435761,
        orientation: options.orientation,
        positionMode: 'exact',
        position
      }));
    }
    return plans;
  }

  remember(collection, value) {
    collection.push(value);
    if (collection.length > this.historyLimit) collection.splice(0, collection.length - this.historyLimit);
  }
}

module.exports = { SpawnPlanner, createRandom, distance };
