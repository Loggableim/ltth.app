class LocalComfyProvider {
  constructor({ config = {}, fetchImpl = global.fetch, dataDir = null, logger = null } = {}) {
    this.id = 'localComfy';
    this.config = config;
    this.fetch = fetchImpl;
    this.dataDir = dataDir;
    this.logger = logger;
  }

  async checkStatus() {
    if (!this.config.enabled) {
      return {
        provider: this.id,
        state: 'disabled',
        model: null,
        detail: 'Local generation is disabled'
      };
    }

    try {
      const response = await this.fetch(`${this.config.comfyUrl}/system_stats`);
      if (!response || !response.ok) {
        return {
          provider: this.id,
          state: 'unreachable',
          model: this.config.model || null,
          lastError: `ComfyUI returned HTTP ${response?.status || 'unknown'}`
        };
      }

      return {
        provider: this.id,
        state: 'ready',
        model: this.config.model || null,
        detail: 'ComfyUI is reachable'
      };
    } catch (error) {
      return {
        provider: this.id,
        state: 'unreachable',
        model: this.config.model || null,
        lastError: error.message
      };
    }
  }

  async generate() {
    throw new Error('LOCAL_COMFY_WORKFLOW_NOT_CONFIGURED');
  }
}

module.exports = LocalComfyProvider;
