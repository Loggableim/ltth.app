const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getTemplate } = require('./catalog');

const ELEMENTS = ['Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar'];
const VARIANTS = ['standard', 'charged'];

class ArtPoolService {
  constructor({
    store,
    generationService,
    dataDir,
    logger = null,
    emit = () => {},
    now = () => Date.now()
  }) {
    this.store = store;
    this.generationService = generationService;
    this.dataDir = dataDir;
    this.logger = logger;
    this.emit = emit;
    this.now = now;
    this.running = false;
  }

  normalizeTarget(value) {
    return Math.max(1, Math.min(8, Number.parseInt(value, 10) || 1));
  }

  activeCombinations() {
    const mapped = new Set(
      this.store.getGiftMappings()
        .filter(mapping => mapping.effect === 'spawn')
        .map(mapping => mapping.element)
        .filter(element => ELEMENTS.includes(element))
    );
    return [...mapped].flatMap(element => VARIANTS.map(variant => ({ element, variant })));
  }

  coverage(targetPerVariant = 3, combinations = null) {
    const target = this.normalizeTarget(targetPerVariant);
    const requested = Array.isArray(combinations) ? combinations : this.activeCombinations();
    const rows = this.store.getArtPoolCoverage();
    return requested.map(combination => {
      const row = rows.find(entry => (
        entry.element === combination.element && entry.variant === combination.variant
      ));
      return {
        element: combination.element,
        variant: combination.variant,
        ready: row?.ready || 0,
        consumed: row?.consumed || 0,
        target
      };
    });
  }

  async prepare({ targetPerVariant = 3, combinations = null, templateIds = null } = {}) {
    if (this.running) throw new Error('STREAM_MONSTERS_POOL_ALREADY_RUNNING');
    this.running = true;
    const target = this.normalizeTarget(targetPerVariant);
    const requested = Array.isArray(combinations) && combinations.length
      ? combinations.filter(item => ELEMENTS.includes(item.element) && VARIANTS.includes(item.variant))
      : this.activeCombinations();
    const templates = Array.isArray(templateIds)
      ? templateIds.map(getTemplate).filter(Boolean)
      : [];
    const jobs = [];
    try {
      for (const combination of requested) {
        const missing = Math.max(0, target - this.store.getArtPoolReadyCount(
          combination.element,
          combination.variant
        ));
        const evolutionTarget = this.store.getOldestKenneyMonster(
          combination.element,
          combination.variant
        );
        const relevantTemplates = templates.filter(template => template.element === combination.element);
        for (let index = 0; index < missing; index += 1) {
          const template = relevantTemplates.length ? relevantTemplates[index % relevantTemplates.length] : null;
          jobs.push(await this.prepareOne({ ...combination, templateId: template?.templateId || null }, index));
        }
        if (evolutionTarget) {
          jobs.push(await this.prepareOne(combination, missing, evolutionTarget.monster_id));
        }
      }
      const coverage = this.coverage(target, requested);
      return { targetPerVariant: target, jobs, coverage };
    } finally {
      this.running = false;
    }
  }

  async prepareOne({ element, variant, templateId = null }, index, evolutionMonsterId = null) {
    const recipeKey = `streammonster:${element.toLowerCase()}:${variant}:${this.now()}:${index}`;
    const prompt = [
      `Single original cute ${templateId || element} ${element} Stream Monster creature, ${variant} cosmetic variant.`,
      'Full body game collectible, crystalline fantasy style, centered, clear silhouette.',
      'Transparent background, no text, no logo, no watermark.'
    ].join(' ');
    try {
      const generated = await this.generationService.generateImage({
        recipeKey,
        prompt,
        negativePrompt: 'text, logo, watermark, frame, background, copyrighted character',
        rarity: variant === 'charged' ? 'Legendary' : 'Rare'
      });
      if (!generated?.imageUrl || generated.provider === 'placeholder') {
        throw new Error('STREAM_MONSTERS_AI_PROVIDER_UNAVAILABLE');
      }
      const materialized = await this.materialize(generated.imageUrl, {
        element,
        variant,
        provider: generated.provider
      });
      const poolEntry = this.store.addArtPoolSkin({
        element,
        variant,
        provider: generated.provider || 'unknown',
        imageUrl: materialized.publicUrl,
        visualKey: materialized.visualKey,
        templateId,
        createdAtMs: this.now()
      });
      if (!evolutionMonsterId) return poolEntry;
      const consumed = this.store.consumeArtPoolSkin(
        element,
        variant,
        evolutionMonsterId,
        this.now()
      );
      const evolved = this.store.evolveMonsterVisual(evolutionMonsterId, {
        imageUrl: consumed.image_url,
        visualKey: consumed.visual_key
      });
      if (evolved) {
        this.emit('streammonsters:monster_visual_evolved', {
          userId: evolved.user_id,
          monster: evolved,
          previousVisualSource: 'kenney',
          visualSource: 'ai'
        });
      }
      return { ...consumed, evolvedMonsterId: evolved?.monster_id || null };
    } catch (error) {
      this.logger?.warn?.(`[STREAM MONSTERS] Art pool ${element}:${variant} skipped: ${error.message}`);
      return { element, variant, status: 'failed', error: error.message };
    }
  }

  async materialize(imageUrl, { element, variant, provider }) {
    let buffer;
    let extension = '.png';
    if (String(imageUrl).startsWith('data:')) {
      const match = String(imageUrl).match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) throw new Error('STREAM_MONSTERS_AI_IMAGE_INVALID');
      const mediaType = match[1].toLowerCase().replace('jpeg', 'jpg');
      if (!['png', 'jpg', 'webp'].includes(mediaType)) {
        throw new Error('STREAM_MONSTERS_AI_IMAGE_INVALID');
      }
      extension = `.${mediaType}`;
      buffer = Buffer.from(match[2], 'base64');
    } else {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(`STREAM_MONSTERS_AI_IMAGE_DOWNLOAD_${response.status}`);
      const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const extensions = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/webp': '.webp'
      };
      extension = extensions[contentType];
      if (!extension) throw new Error('STREAM_MONSTERS_AI_IMAGE_INVALID');
      buffer = Buffer.from(await response.arrayBuffer());
    }
    if (!this.isSupportedImage(buffer, extension)) {
      throw new Error('STREAM_MONSTERS_AI_IMAGE_INVALID');
    }
    const signature = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 20);
    const filename = `ai-${element.toLowerCase()}-${variant}-${signature}${extension}`;
    const outputDir = path.join(this.dataDir, 'streammonsters', 'monster-art');
    const absolutePath = path.join(outputDir, filename);
    fs.mkdirSync(outputDir, { recursive: true });
    if (!fs.existsSync(absolutePath)) fs.writeFileSync(absolutePath, buffer);
    return {
      absolutePath,
      publicUrl: `/api/streammonsters/art/${filename}`,
      visualKey: `ai:${provider || 'unknown'}:${signature}`
    };
  }

  isSupportedImage(buffer, extension) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12 || buffer.length > 10 * 1024 * 1024) return false;
    if (extension === '.png') {
      return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (extension === '.jpg') {
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (extension === '.webp') {
      return buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    }
    return false;
  }

  consume(element, variant) {
    return this.store.consumeArtPoolSkin(element, variant, null, this.now());
  }

  consumeForTemplate(element, variant, templateId) {
    return this.store.consumeArtPoolSkinForTemplate(element, variant, templateId || null, null, this.now());
  }
}

module.exports = ArtPoolService;
module.exports.ELEMENTS = ELEMENTS;
module.exports.VARIANTS = VARIANTS;
