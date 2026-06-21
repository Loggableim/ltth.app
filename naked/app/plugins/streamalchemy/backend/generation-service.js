class GenerationService {
  constructor(store, logger, options = {}) {
    this.store = store;
    this.logger = logger;
    this.providerOrder = options.providerOrder || ['localComfy', 'siliconflow', 'openai', 'lightx', 'placeholder'];
    this.providers = options.providers || {};
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

  async generateImage(input) {
    const failures = [];
    for (const providerId of this.providerOrder) {
      const provider = this.providers[providerId];
      if (!provider) continue;

      const status = await provider.checkStatus();
      if (status.state !== 'ready') continue;

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
        this.logger?.warn?.(`[STREAMALCHEMY] Provider ${provider.id} failed: ${error.message}`);
      }
    }

    const message = failures.map(failure => `${failure.provider}: ${failure.error}`).join('; ');
    throw new Error(message || 'NO_READY_IMAGE_PROVIDER');
  }
}

module.exports = GenerationService;
