const fs = require('fs');
const ModelCatalog = require('../model-catalog');

const HISTORY_POLL_ATTEMPTS = 120;
const HISTORY_POLL_DELAY_MS = 250;

class LocalComfyProvider {
  constructor({
    config = {},
    getConfig = null,
    getRuntimeBaseUrl = null,
    acquireRuntimeActivity = null,
    fetchImpl = global.fetch,
    dataDir = null,
    logger = null,
    catalog = new ModelCatalog(),
    fsImpl = fs,
    delayImpl = delay => new Promise(resolve => setTimeout(resolve, delay))
  } = {}) {
    this.id = 'localComfy';
    this.config = config;
    this.getConfig = getConfig;
    this.getRuntimeBaseUrl = getRuntimeBaseUrl;
    this.acquireRuntimeActivity = acquireRuntimeActivity;
    this.fetch = fetchImpl;
    this.dataDir = dataDir;
    this.logger = logger;
    this.catalog = catalog;
    this.fs = fsImpl;
    this.delay = delayImpl;
    this.generationQueue = Promise.resolve();
  }

  resolveConfig() {
    return typeof this.getConfig === 'function' ? (this.getConfig() || {}) : (this.config || {});
  }

  resolvePreset(config = this.resolveConfig()) {
    return this.catalog.resolveConfigPreset(config);
  }

  resolveBaseUrl(config = this.resolveConfig()) {
    const managedBaseUrl = typeof this.getRuntimeBaseUrl === 'function'
      ? this.getRuntimeBaseUrl()
      : null;
    return managedBaseUrl || config.comfyUrl;
  }

  async withRuntimeActivity(operation) {
    const release = typeof this.acquireRuntimeActivity === 'function'
      ? this.acquireRuntimeActivity()
      : null;
    try {
      return await operation();
    } finally {
      if (typeof release === 'function') await release();
    }
  }

  async checkStatus() {
    const config = this.resolveConfig();
    const baseUrl = this.resolveBaseUrl(config);
    return this.withRuntimeActivity(() => this.checkStatusAt(config, baseUrl));
  }

  async checkStatusAt(config, baseUrl) {
    if (!config.enabled) {
      return {
        provider: this.id,
        state: 'disabled',
        model: null,
        detail: 'Local generation is disabled'
      };
    }

    const preset = this.resolvePreset(config);

    try {
      const response = await this.fetch(`${baseUrl}/system_stats`);
      if (!response || !response.ok) {
        return {
          provider: this.id,
          state: 'unreachable',
          model: preset.id,
          lastError: `ComfyUI returned HTTP ${response?.status || 'unknown'}`
        };
      }

      const missing = this.catalog.getMissingFiles({
        preset,
        comfyRootDir: config.comfyRootDir,
        fsImpl: this.fs
      });

      if (missing.length > 0) {
        return {
          provider: this.id,
          state: 'missing_files',
          model: preset.id,
          workflowId: preset.workflowId,
          missing
        };
      }

      return {
        provider: this.id,
        state: 'ready',
        model: preset.id,
        workflowId: preset.workflowId,
        detail: 'ComfyUI is reachable'
      };
    } catch (error) {
      return {
        provider: this.id,
        state: 'unreachable',
        model: preset.id,
        lastError: error.message
      };
    }
  }

  async generate(input = {}) {
    return this.withGenerationSlot(() => this.performGeneration(input));
  }

  async performGeneration(input = {}) {
    const config = this.resolveConfig();
    const baseUrl = this.resolveBaseUrl(config);
    return this.withRuntimeActivity(async () => {
      const preset = this.resolvePreset(config);
      const status = await this.checkStatusAt(config, baseUrl);
      if (status.state !== 'ready') {
        throw new Error(`LOCAL_PROVIDER_NOT_READY:${status.state}`);
      }

      const response = await this.fetch(`${baseUrl}/prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: this.catalog.createWorkflow({
            presetId: preset.id,
            prompt: input.prompt,
            negativePrompt: input.negativePrompt,
            width: Number(config.width) || preset.width,
            height: Number(config.height) || preset.height,
            steps: Number(config.steps) || preset.steps
          }),
          client_id: 'streamalchemy'
        })
      });

      if (!response?.ok) {
        throw new Error(`LOCAL_COMFY_PROMPT_HTTP_${response?.status || 'UNKNOWN'}`);
      }

      const payload = await response.json();
      const promptId = payload?.prompt_id;
      if (!promptId) {
        throw new Error('LOCAL_COMFY_PROMPT_ID_MISSING');
      }

      const history = await this.waitForHistory(baseUrl, promptId);
      const image = this.extractImage(history, promptId);
      if (!image) {
        throw new Error('LOCAL_COMFY_OUTPUT_MISSING');
      }

      const url = new URL('/view', baseUrl);
      url.searchParams.set('filename', image.filename);
      url.searchParams.set('subfolder', image.subfolder || '');
      url.searchParams.set('type', image.type || 'output');

      return {
        imageUrl: url.toString(),
        provider: this.id,
        model: preset.id
      };
    });
  }

  async withGenerationSlot(operation) {
    const previous = this.generationQueue;
    let release;
    this.generationQueue = new Promise(resolve => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async waitForHistory(comfyUrl, promptId) {
    for (let attempt = 0; attempt < HISTORY_POLL_ATTEMPTS; attempt += 1) {
      const response = await this.fetch(`${comfyUrl}/history/${promptId}`);
      if (response?.ok) {
        const payload = await response.json();
        if (payload?.[promptId]) {
          return payload;
        }
      }
      await this.delay(HISTORY_POLL_DELAY_MS);
    }
    throw new Error('LOCAL_COMFY_HISTORY_TIMEOUT');
  }

  extractImage(history, promptId) {
    const outputs = history?.[promptId]?.outputs || {};
    for (const node of Object.values(outputs)) {
      if (Array.isArray(node?.images) && node.images[0]) {
        return node.images[0];
      }
    }
    return null;
  }
}

module.exports = LocalComfyProvider;
