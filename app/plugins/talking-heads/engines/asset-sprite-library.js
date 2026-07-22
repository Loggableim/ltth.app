const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const FRAME_NAMES = ['idle_neutral', 'blink', 'speak_closed', 'speak_mid', 'speak_open'];

const BOBA_ANIMALS = [
  'Axolotl', 'Bear', 'Bull', 'Bunny', 'Dog', 'Duck', 'Fox', 'Frog', 'Giraffe', 'Goat',
  'Monkey', 'Octopus', 'Otter', 'Parrot', 'Pig', 'Pinguin', 'Raccoon', 'Seal', 'Snake', 'Spider'
];

const KENNEY_BODIES = [
  'blueA', 'blueB', 'blueC', 'blueD', 'blueE', 'blueF',
  'darkA', 'darkB', 'darkC', 'darkD', 'darkE', 'darkF',
  'greenA', 'greenB', 'greenC', 'greenD', 'greenE', 'greenF',
  'redA', 'redB', 'redC', 'redD', 'redE', 'redF',
  'whiteA', 'whiteB', 'whiteC', 'whiteD', 'whiteE', 'whiteF',
  'yellowA', 'yellowB', 'yellowC', 'yellowD', 'yellowE', 'yellowF'
];

const KENNEY_EYES = [
  'angry_blue', 'angry_green', 'angry_red', 'blue', 'cute_dark', 'cute_light', 'dead',
  'human', 'human_blue', 'human_green', 'human_red', 'psycho_dark', 'psycho_light', 'red', 'yellow'
];

const RGS_HEADS = ['head1', 'head2', 'head3'];
const RGS_HAIRS = ['hair1', 'hair2', 'hair3'];
const RGS_EYES = ['eyes1', 'eyes2', 'eyes3', 'eyes4', 'eyes5', 'eyes6', 'eyes7'];
const RGS_MOUTHS = ['mouth1', 'mouth2', 'mouth3', 'mouth4', 'mouth5', 'mouth6', 'mouth7', 'mouth8'];

class AssetSpriteLibrary {
  constructor({ assetRoot, dataDir, logger } = {}) {
    this.assetRoot = assetRoot || path.join(__dirname, '..', 'assets', 'asset-packs');
    this.dataDir = dataDir;
    this.logger = logger;
  }

  getCatalog() {
    return {
      packs: [
        {
          id: 'boba',
          name: 'Boba Animals',
          characters: BOBA_ANIMALS,
          options: {}
        },
        {
          id: 'kenney',
          name: 'Kenney Monster Builder',
          characters: KENNEY_BODIES,
          options: { body: KENNEY_BODIES, eye: KENNEY_EYES }
        },
        {
          id: 'rgs',
          name: 'Vector Character Builder',
          characters: RGS_HEADS,
          options: { head: RGS_HEADS, hair: RGS_HAIRS, eyes: RGS_EYES, mouth: RGS_MOUTHS }
        }
      ]
    };
  }

  getRandomSelection(random = Math.random) {
    const selections = this._getLotterySelectionPool();
    return selections[Math.min(selections.length - 1, Math.floor(this._randomUnit(random) * selections.length))];
  }

  getLotteryCandidates(count = 3, random = Math.random) {
    const pool = this._getLotterySelectionPool();
    const candidates = [];
    const requestedCount = Math.max(1, Math.min(Number(count) || 3, pool.length));

    while (candidates.length < requestedCount) {
      const index = Math.min(pool.length - 1, Math.floor(this._randomUnit(random) * pool.length));
      candidates.push(pool.splice(index, 1)[0]);
    }
    return candidates;
  }

  _getLotterySelectionPool() {
    const boba = BOBA_ANIMALS.map((characterId) => ({ packId: 'boba', characterId, options: {} }));
    const kenney = KENNEY_BODIES.flatMap((characterId) => KENNEY_EYES.map((eye) => ({
      packId: 'kenney',
      characterId,
      options: { eye }
    })));
    const rgs = RGS_HEADS.flatMap((characterId) => RGS_HAIRS.flatMap((hair) =>
      RGS_EYES.flatMap((eyes) => RGS_MOUTHS.map((mouth) => ({
        packId: 'rgs',
        characterId,
        options: { hair, eyes, mouth }
      })))
    ));
    return [...boba, ...kenney, ...rgs];
  }

  _randomUnit(random) {
    const value = Number(random());
    return Number.isFinite(value) ? Math.min(0.999999999, Math.max(0, value)) : 0;
  }

  normalizeSelection({ packId, characterId, options } = {}) {
    const normalizedOptions = options && typeof options === 'object' ? options : {};
    const requestedPack = String(packId || '').toLowerCase();

    if (requestedPack === 'kenney') {
      const body = KENNEY_BODIES.includes(characterId) ? characterId : KENNEY_BODIES[0];
      return {
        packId: 'kenney',
        characterId: body,
        options: {
          eye: KENNEY_EYES.includes(normalizedOptions.eye) ? normalizedOptions.eye : 'human'
        }
      };
    }

    if (requestedPack === 'rgs') {
      const head = RGS_HEADS.includes(characterId) ? characterId : RGS_HEADS[0];
      return {
        packId: 'rgs',
        characterId: head,
        options: {
          hair: RGS_HAIRS.includes(normalizedOptions.hair) ? normalizedOptions.hair : RGS_HAIRS[0],
          eyes: RGS_EYES.includes(normalizedOptions.eyes) ? normalizedOptions.eyes : RGS_EYES[0],
          mouth: RGS_MOUTHS.includes(normalizedOptions.mouth) ? normalizedOptions.mouth : RGS_MOUTHS[0]
        }
      };
    }

    return {
      packId: 'boba',
      characterId: BOBA_ANIMALS.includes(characterId) ? characterId : 'Fox',
      options: {}
    };
  }

  async getSpriteSet(selection) {
    if (!this.dataDir) {
      throw new Error('A plugin data directory is required for local sprite output');
    }

    const normalized = this.normalizeSelection(selection);
    const frameLayers = await this._getFrameLayers(normalized);
    const signature = crypto.createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex')
      .slice(0, 12);
    const outputDir = path.join(this.dataDir, 'avatars');
    await fs.mkdir(outputDir, { recursive: true });

    const sprites = {};
    for (const frameName of FRAME_NAMES) {
      const filename = `asset_${normalized.packId}_${signature}_${frameName}.svg`;
      const outputPath = path.join(outputDir, filename);
      try {
        await fs.access(outputPath);
      } catch {
        const svg = await this._composeSvg(frameLayers[frameName]);
        await fs.writeFile(outputPath, svg, 'utf8');
      }
      sprites[frameName] = `/api/talkingheads/sprite/${filename}`;
    }

    return { ...normalized, sprites };
  }

  async _getFrameLayers(selection) {
    if (selection.packId === 'kenney') {
      return this._getKenneyLayers(selection);
    }
    if (selection.packId === 'rgs') {
      return this._getRgsLayers(selection);
    }
    return this._getBobaLayers(selection);
  }

  async _getBobaLayers({ characterId }) {
    const animalDir = path.join(this.assetRoot, 'boba', 'animals', characterId);
    const animalRoot = await this._assetDirectory(animalDir, 'Layers');
    const base = await this._requiredFile(animalRoot, [`${characterId}_Base.png`]);
    const eyes = await this._optionalFile(animalRoot, [
      'Eyes_Default.png', 'Eyes_Normal.png', `${characterId}_Eyes_Default.png`, `${characterId}_Eyes_Normal.png`
    ]);
    const blink = await this._optionalFile(animalRoot, [
      'Eyes_Happy.png', 'Eyes_Scared.png', 'Eyes_Default.png',
      `${characterId}_Eyes_Happy.png`, `${characterId}_Eyes_Scared.png`, `${characterId}_Eyes_Default.png`
    ]);
    const brows = await this._optionalFile(animalRoot, ['Brows_Default.png', `${characterId}_Brows_Default.png`]);
    const nose = await this._optionalFile(animalRoot, ['Nose_Default.png', `${characterId}_Nose_Default.png`]);
    const mouthClosed = await this._optionalFile(animalRoot, ['Mouth_Default.png', `${characterId}_Mouth_Default.png`]);
    const mouthMid = await this._optionalFile(animalRoot, [
      'Mouth_Happy.png', 'Mouth_Smile.png', 'Mouth_Default.png',
      `${characterId}_Mouth_Happy.png`, `${characterId}_Mouth_Smile.png`, `${characterId}_Mouth_Default.png`
    ]);
    const localMouthOpen = await this._optionalFile(animalRoot, [
      'Mouth_Scared.png', 'Mouth_Shock.png', 'Mouth_Open.png', 'Mouth_Default.png',
      `${characterId}_Mouth_Scared.png`, `${characterId}_Mouth_Shock.png`, `${characterId}_Mouth_Open.png`, `${characterId}_Mouth_Default.png`
    ]);
    const mouthOpen = localMouthOpen || await this._optionalFile(
      path.join(this.assetRoot, 'boba', 'extras'),
      ['Mouth_Shock.png']
    );
    const facialLayers = [base, eyes, brows, nose];

    return {
      idle_neutral: [...facialLayers, mouthClosed],
      blink: [base, blink, brows, nose, mouthClosed],
      speak_closed: [...facialLayers, mouthClosed],
      speak_mid: [...facialLayers, mouthMid],
      speak_open: [...facialLayers, mouthOpen]
    };
  }

  async _getKenneyLayers({ characterId, options }) {
    const root = path.join(this.assetRoot, 'kenney', 'PNG', 'Default');
    const body = await this._requiredFile(root, [`body_${characterId}.png`]);
    const eye = await this._requiredFile(root, [`eye_${options.eye}.png`]);
    const blink = await this._requiredFile(root, ['eye_closed_happy.png']);
    const closed = await this._requiredFile(root, ['mouth_closed_happy.png']);
    const mid = await this._requiredFile(root, ['mouthC.png']);
    const open = await this._requiredFile(root, ['mouthA.png']);

    return {
      idle_neutral: [body, eye, closed],
      blink: [body, blink, closed],
      speak_closed: [body, eye, closed],
      speak_mid: [body, eye, mid],
      speak_open: [body, eye, open]
    };
  }

  async _getRgsLayers({ characterId, options }) {
    const root = path.join(this.assetRoot, 'rgs', 'Animated body parts');
    const head = await this._requiredFile(root, [`Heads/${characterId}/idle_0.png`]);
    const hair = await this._requiredFile(root, [`Hairs/${options.hair}/idle_0.png`]);
    const eyes = await this._requiredFile(root, [`Eyes/${options.eyes}/idle_0.png`]);
    const blink = await this._optionalFile(root, [`Eyes/${options.eyes}/idle_3.png`, `Eyes/${options.eyes}/idle_0.png`]);
    const closed = await this._requiredFile(root, [`Mouths/${options.mouth}/idle_0.png`]);
    const mouthIndex = Math.max(0, RGS_MOUTHS.indexOf(options.mouth));
    const midMouth = RGS_MOUTHS[(mouthIndex + 1) % RGS_MOUTHS.length];
    const openMouth = RGS_MOUTHS[(mouthIndex + 2) % RGS_MOUTHS.length];
    const mid = await this._requiredFile(root, [`Mouths/${midMouth}/idle_0.png`]);
    const open = await this._requiredFile(root, [`Mouths/${openMouth}/idle_0.png`]);

    return {
      idle_neutral: [head, hair, eyes, closed],
      blink: [head, hair, blink, closed],
      speak_closed: [head, hair, eyes, closed],
      speak_mid: [head, hair, eyes, mid],
      speak_open: [head, hair, eyes, open]
    };
  }

  async _requiredFile(root, candidates) {
    const result = await this._optionalFile(root, candidates);
    if (!result) {
      throw new Error(`Missing local Talking Heads asset: ${candidates[0]}`);
    }
    return result;
  }

  async _optionalFile(root, candidates) {
    for (const candidate of candidates) {
      const resolved = path.resolve(root, candidate);
      const relative = path.relative(root, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        continue;
      }
      try {
        const stat = await fs.stat(resolved);
        if (stat.isFile()) {
          return resolved;
        }
      } catch {
        // Try the next supported variant.
      }
    }
    return null;
  }

  async _assetDirectory(root, preferredChild) {
    const child = path.join(root, preferredChild);
    try {
      const stat = await fs.stat(child);
      return stat.isDirectory() ? child : root;
    } catch {
      return root;
    }
  }

  async _composeSvg(layerPaths) {
    const layers = [];
    for (const layerPath of layerPaths.filter(Boolean)) {
      const data = await fs.readFile(layerPath);
      layers.push(`<image href="data:image/png;base64,${data.toString('base64')}" x="0" y="0" width="1024" height="1024" preserveAspectRatio="none"/>`);
    }

    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">${layers.join('')}</svg>`;
  }
}

module.exports = AssetSpriteLibrary;
