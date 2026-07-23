const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ELEMENT_COLORS = Object.freeze({
  Ember: 'red',
  Tide: 'blue',
  Grove: 'green',
  Gale: 'white',
  Volt: 'yellow',
  Lunar: 'dark'
});
const EYES = [
  'human', 'cute_dark', 'cute_light', 'angry_blue', 'angry_green',
  'angry_red', 'psycho_dark', 'psycho_light', 'blue', 'red', 'yellow'
];
const MOUTHS = [
  'mouth_closed_happy', 'mouthA', 'mouthB', 'mouthC', 'mouthD',
  'mouthE', 'mouthF', 'mouthG', 'mouthH', 'mouthI', 'mouthJ'
];
const DETAILS = [
  'antenna_large', 'antenna_small', 'ear', 'ear_round',
  'eye', 'horn_large', 'horn_small'
];

class KenneyMonsterBuilder {
  constructor({ assetDir, dataDir, logger = null }) {
    this.assetDir = assetDir;
    this.dataDir = dataDir;
    this.logger = logger;
  }

  build({ seed, element }) {
    if (!seed || !element) throw new Error('STREAM_MONSTERS_KENNEY_INPUT_REQUIRED');
    const selection = this.select(seed, element);
    const signature = crypto.createHash('sha256')
      .update(JSON.stringify(selection))
      .digest('hex')
      .slice(0, 16);
    const filename = `kenney-${signature}.svg`;
    const outputDir = path.join(this.dataDir, 'streammonsters', 'monster-art');
    const absolutePath = path.join(outputDir, filename);
    fs.mkdirSync(outputDir, { recursive: true });
    if (!fs.existsSync(absolutePath)) {
      fs.writeFileSync(absolutePath, this.compose(selection), 'utf8');
    }
    return {
      visualSource: 'kenney',
      visualKey: `kenney:${signature}`,
      absolutePath,
      publicUrl: `/api/streammonsters/art/${filename}`,
      selection
    };
  }

  select(seed, element) {
    const color = ELEMENT_COLORS[element] || 'blue';
    const pick = (namespace, values) => values[this.hash(`${seed}:${namespace}`) % values.length];
    return {
      color,
      body: `body_${color}${pick('body', ['A', 'B', 'C', 'D', 'E', 'F'])}.png`,
      arm: `arm_${color}${pick('arm', ['A', 'B', 'C', 'D', 'E'])}.png`,
      leg: `leg_${color}${pick('leg', ['A', 'B', 'C', 'D', 'E'])}.png`,
      eye: `eye_${pick('eye', EYES)}.png`,
      mouth: `${pick('mouth', MOUTHS)}.png`,
      detail: `detail_${color}_${pick('detail', DETAILS)}.png`
    };
  }

  compose(selection) {
    const layers = [
      selection.leg,
      selection.arm,
      selection.body,
      selection.detail,
      selection.eye,
      selection.mouth
    ].map(filename => {
      const absolutePath = path.resolve(this.assetDir, 'PNG', 'Default', filename);
      const relative = path.relative(path.resolve(this.assetDir), absolutePath);
      if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(absolutePath)) {
        throw new Error(`STREAM_MONSTERS_KENNEY_ASSET_MISSING:${filename}`);
      }
      const data = fs.readFileSync(absolutePath).toString('base64');
      return `<image href="data:image/png;base64,${data}" x="0" y="0" width="1024" height="1024" preserveAspectRatio="none"/>`;
    });
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">',
      ...layers,
      '</svg>'
    ].join('');
  }

  hash(value) {
    let hash = 2166136261;
    for (const char of String(value)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
}

module.exports = KenneyMonsterBuilder;
module.exports.ELEMENT_COLORS = ELEMENT_COLORS;
