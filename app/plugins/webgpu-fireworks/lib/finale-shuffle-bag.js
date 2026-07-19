'use strict';

function normalizeStyleIds(values) {
  if (!Array.isArray(values)) return [];

  const uniqueIds = new Set();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const styleId = value.trim();
    if (styleId) uniqueIds.add(styleId);
  }
  return [...uniqueIds].sort();
}

class FinaleShuffleBag {
  constructor(styleProvider, random = Math.random) {
    this.styleProvider = typeof styleProvider === 'function' ? styleProvider : () => [];
    this.random = typeof random === 'function' ? random : Math.random;
    this.membershipSignature = null;
    this.remaining = [];
    this.lastDrawn = null;
  }

  draw() {
    const members = normalizeStyleIds(this.styleProvider());
    const membershipSignature = JSON.stringify(members);

    if (membershipSignature !== this.membershipSignature || this.remaining.length === 0) {
      this.membershipSignature = membershipSignature;
      this.remaining = this.shuffle(members);
      this.avoidBoundaryRepeat();
    }

    if (this.remaining.length === 0) return null;
    this.lastDrawn = this.remaining.shift();
    return this.lastDrawn;
  }

  shuffle(members) {
    const shuffled = [...members];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const randomValue = Number(this.random());
      const boundedRandom = Number.isFinite(randomValue)
        ? Math.min(Math.max(randomValue, 0), 0.9999999999999999)
        : 0;
      const swapIndex = Math.floor(boundedRandom * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  }

  avoidBoundaryRepeat() {
    if (this.remaining.length < 2 || this.remaining[0] !== this.lastDrawn) return;
    [this.remaining[0], this.remaining[1]] = [this.remaining[1], this.remaining[0]];
  }
}

module.exports = { FinaleShuffleBag };
