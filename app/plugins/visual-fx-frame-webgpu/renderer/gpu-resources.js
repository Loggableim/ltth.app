(function registerGPUResources(root, factory) {
  const ResourceArena = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = ResourceArena;
  if (root) root.VisualFxGPUResources = ResourceArena;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createGPUResources() {
  class GPUResourceArena {
    constructor(device) {
      this.device = device;
      this.resources = new Set();
    }

    createBuffer(label, size, usage, initialData = null) {
      const buffer = this.device.createBuffer({
        label,
        size: Math.max(4, Math.ceil(size / 4) * 4),
        usage
      });
      if (initialData) this.device.queue.writeBuffer(buffer, 0, initialData);
      this.resources.add(buffer);
      return buffer;
    }

    createSimulationBuffers(profile) {
      const particleStride = 48;
      const fieldCells = profile.fieldResolution * profile.fieldResolution;
      const buffers = {
        uniforms: this.createBuffer(
          'visual-fx-uniforms',
          128,
          GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        ),
        field: this.createBuffer(
          'visual-fx-field',
          fieldCells * 16,
          GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        ),
        particles: this.createBuffer(
          'visual-fx-particles',
          profile.maxParticles * particleStride,
          GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        ),
        lightning: this.createBuffer(
          'visual-fx-lightning',
          profile.lightningBranches * 32,
          GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        ),
        particleIndirect: this.createBuffer(
          'visual-fx-particle-indirect',
          16,
          GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
          new Uint32Array([6, profile.maxParticles, 0, 0])
        )
      };
      return buffers;
    }

    track(resource) {
      if (resource) this.resources.add(resource);
      return resource;
    }

    destroy() {
      for (const resource of this.resources) resource?.destroy?.();
      this.resources.clear();
    }
  }

  return GPUResourceArena;
});
