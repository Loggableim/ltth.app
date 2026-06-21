class ExistingServiceProvider {
  constructor({ id, model, hasApiKey, generate }) {
    this.id = id;
    this.model = model;
    this.hasApiKey = hasApiKey;
    this.generateFn = generate;
  }

  async checkStatus() {
    if (!this.hasApiKey()) {
      return {
        provider: this.id,
        state: 'missing_api_key',
        model: this.model
      };
    }
    return {
      provider: this.id,
      state: 'ready',
      model: this.model
    };
  }

  async generate(input) {
    const imageUrl = await this.generateFn(input);
    return {
      imageUrl,
      provider: this.id,
      model: this.model
    };
  }
}

module.exports = {
  ExistingServiceProvider
};
