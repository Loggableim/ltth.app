class GenerationService {
  constructor(store, logger, options = {}) {
    this.store = store;
    this.logger = logger;
    this.providerOrder = options.providerOrder || ['localComfy', 'siliconflow', 'openai', 'lightx', 'placeholder'];
    this.providers = options.providers || {};
    this.getConfig = options.getConfig || null;
  }

  async getProviderStatuses() {
    const statuses = [];
    for (const providerId of this.providerOrder) {
      const provider = this.providers[providerId];
      if (!provider) {
        statuses.push({ provider: providerId, state: 'disabled', detail: 'Provider is not configured' });
        continue;
      }
      statuses.push(await provider.checkStatus());
    }
    return statuses;
  }

  resolveGenerationMode(options = {}) {
    if (options.mode) return options.mode;
    const config = typeof this.getConfig === 'function' ? this.getConfig() : null;
    return config?.localGeneration?.generationMode || null;
  }

  getProviderOrderForMode(mode) {
    if (mode === 'local_strict') {
      return ['localComfy'];
    }
    if (mode === 'remote') {
      return this.providerOrder.filter(providerId => providerId !== 'localComfy');
    }
    return this.providerOrder;
  }

  async generateImage(input, options = {}) {
    const failures = [];
    const mode = this.resolveGenerationMode(options);
    const activeProviderOrder = this.getProviderOrderForMode(mode);

    for (const providerId of activeProviderOrder) {
      const provider = this.providers[providerId];
      if (!provider) continue;

      const status = await provider.checkStatus();
      if (status.state !== 'ready') {
        if (mode === 'local_strict' && providerId === 'localComfy') {
          throw new Error(`LOCAL_PROVIDER_NOT_READY:${status.state}`);
        }
        continue;
      }

      const job = this.store.createGenerationJob({
        recipeKey: input.recipeKey,
        itemId: input.itemId || null,
        status: 'running',
        provider: provider.id,
        model: status.model || null,
        prompt: input.prompt,
        negativePrompt: input.negativePrompt
      });

      try {
        const result = await provider.generate(input);
        if (provider.id === 'placeholder' || result?.provider === 'placeholder') {
          throw new Error('PLACEHOLDER_IS_NOT_GENERATED_ART');
        }
        this.store.updateGenerationJob(job.job_id, {
          status: 'succeeded',
          provider: result.provider,
          model: result.model,
          error: null
        });
        return result;
      } catch (error) {
        failures.push({ provider: provider.id, error: error.message });
        this.store.updateGenerationJob(job.job_id, {
          status: 'failed',
          error: error.message
        });
        this.logger?.warn?.(`[STREAM MONSTERS] Provider ${provider.id} failed: ${error.message}`);
      }
    }

    const message = failures.map(failure => `${failure.provider}: ${failure.error}`).join('; ');
    throw new Error(message || 'NO_READY_IMAGE_PROVIDER');
  }

  async testLocalGeneration() {
    return this.generateImage({
      recipeKey: `local-test:${Date.now()}`,
      prompt: 'Single fantasy RPG item icon, glowing crystal vial, centered, transparent background.',
      negativePrompt: 'text, logo, watermark, blurry',
      rarity: 'Common'
    }, {
      mode: 'local_strict'
    });
  }
}

module.exports = GenerationService;
