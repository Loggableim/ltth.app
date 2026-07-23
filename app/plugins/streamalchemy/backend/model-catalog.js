const path = require('path');

const PRESETS = [
  {
    id: 'sdxl_lightning_4step',
    label: 'SDXL Lightning 4-step',
    source: 'ByteDance/SDXL-Lightning',
    sourceUrl: 'https://huggingface.co/ByteDance/SDXL-Lightning',
    installMethod: 'one_click',
    workflowId: 'comfy_sdxl_lightning_4step',
    targetRelativePath: path.join('models', 'checkpoints', 'sdxl_lightning_4step.safetensors'),
    downloadUrl: 'https://huggingface.co/ByteDance/SDXL-Lightning/resolve/main/sdxl_lightning_4step.safetensors?download=true',
    fileName: 'sdxl_lightning_4step.safetensors',
    sizeBytes: 6938040682,
    sha256: 'e0d996ee0013e79d9d3561f50fcafb9a17e3ff07b780358e3b66d67932c4d490',
    license: 'OpenRAIL++',
    minVramMb: 6144,
    recommendedVramMb: 8192,
    width: 768,
    height: 768,
    steps: 4,
    guidanceScale: 0,
    scheduler: 'sgm_uniform',
    samplerName: 'euler',
    notes: 'Fast local checkpoint for modest consumer GPUs.'
  },
  {
    id: 'flux1_schnell',
    label: 'FLUX.1 schnell',
    source: 'black-forest-labs/FLUX.1-schnell',
    sourceUrl: 'https://huggingface.co/black-forest-labs/FLUX.1-schnell',
    installMethod: 'guided',
    workflowId: 'comfy_flux1_schnell',
    targetRelativePath: path.join('models', 'checkpoints', 'flux1-schnell.safetensors'),
    downloadUrl: 'https://huggingface.co/black-forest-labs/FLUX.1-schnell',
    fileName: 'flux1-schnell.safetensors',
    minVramMb: 12288,
    recommendedVramMb: 16384,
    width: 768,
    height: 768,
    steps: 4,
    guidanceScale: 0,
    scheduler: 'simple',
    samplerName: 'euler',
    gated: true,
    notes: 'Higher VRAM guided setup that usually requires manual upstream acceptance and model prep.'
  },
  {
    id: 'sd35_medium',
    label: 'Stable Diffusion 3.5 Medium',
    source: 'stabilityai/stable-diffusion-3.5-medium',
    sourceUrl: 'https://huggingface.co/stabilityai/stable-diffusion-3.5-medium',
    installMethod: 'manual',
    workflowId: 'comfy_sd35_medium',
    targetRelativePath: path.join('models', 'checkpoints', 'sd35_medium.safetensors'),
    downloadUrl: 'https://huggingface.co/stabilityai/stable-diffusion-3.5-medium',
    fileName: 'sd35_medium.safetensors',
    minVramMb: 10240,
    recommendedVramMb: 12288,
    width: 768,
    height: 768,
    steps: 4,
    guidanceScale: 4,
    scheduler: 'normal',
    samplerName: 'euler',
    gated: true,
    notes: 'Manual setup only. Use when you already manage the upstream assets yourself.'
  }
];

class ModelCatalog {
  constructor() {
    this.presets = PRESETS.map(preset => ({ ...preset }));
  }

  listPresets() {
    return this.presets.map(preset => ({ ...preset }));
  }

  getPreset(id) {
    return this.presets.find(preset => preset.id === id) || null;
  }

  getDefaultPreset() {
    return this.getPreset('sdxl_lightning_4step');
  }

  resolveConfigPreset(localGeneration = {}) {
    return this.getPreset(localGeneration.selectedPresetId) || this.getDefaultPreset();
  }

  resolveTargetPath(preset, comfyRootDir) {
    if (!preset || !comfyRootDir) return null;
    return path.resolve(comfyRootDir, preset.targetRelativePath);
  }

  getMissingFiles({ preset, comfyRootDir, fsImpl }) {
    if (!preset || !comfyRootDir || !fsImpl?.existsSync) {
      return [preset?.targetRelativePath].filter(Boolean);
    }
    const targetPath = this.resolveTargetPath(preset, comfyRootDir);
    return fsImpl.existsSync(targetPath) ? [] : [preset.targetRelativePath];
  }

  recommendationStateForPreset(preset, gpu = {}) {
    const vramMb = Number(gpu.vramMb) || 0;
    if (preset.installMethod === 'manual') {
      return vramMb >= preset.minVramMb ? 'manual_only' : 'not_recommended';
    }
    if (vramMb < preset.minVramMb) {
      return 'not_recommended';
    }
    if (preset.installMethod === 'guided') {
      return 'supported_with_warning';
    }
    return 'recommended';
  }

  buildPresetSummary({ preset, comfyRootDir = null, fsImpl = null, gpu = {} }) {
    const missing = this.getMissingFiles({ preset, comfyRootDir, fsImpl });
    const targetPath = this.resolveTargetPath(preset, comfyRootDir);
    return {
      id: preset.id,
      label: preset.label,
      source: preset.source,
      sourceUrl: preset.sourceUrl,
      installMethod: preset.installMethod,
      workflowId: preset.workflowId,
      fileName: preset.fileName,
      targetRelativePath: preset.targetRelativePath,
      targetPath,
      width: preset.width,
      height: preset.height,
      steps: preset.steps,
      notes: preset.notes,
      installed: Boolean(targetPath) && missing.length === 0,
      missing,
      recommendationState: this.recommendationStateForPreset(preset, gpu)
    };
  }

  getUiCatalog(localGeneration = {}, options = {}) {
    const comfyRootDir = localGeneration.comfyRootDir || null;
    const fsImpl = options.fsImpl || null;
    const gpu = options.gpu || {};
    return this.listPresets().map(preset => this.buildPresetSummary({
      preset,
      comfyRootDir,
      fsImpl,
      gpu
    }));
  }

  createWorkflow({ presetId, prompt, negativePrompt, width, height, steps }) {
    const preset = this.getPreset(presetId) || this.getDefaultPreset();
    return {
      '1': {
        class_type: 'CheckpointLoaderSimple',
        inputs: {
          ckpt_name: preset.fileName
        }
      },
      '2': {
        class_type: 'EmptyLatentImage',
        inputs: {
          width: width || preset.width,
          height: height || preset.height,
          batch_size: 1
        }
      },
      '3': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: prompt,
          clip: ['1', 1]
        }
      },
      '4': {
        class_type: 'CLIPTextEncode',
        inputs: {
          text: negativePrompt || '',
          clip: ['1', 1]
        }
      },
      '5': {
        class_type: 'KSampler',
        inputs: {
          seed: 0,
          steps: steps || preset.steps,
          cfg: preset.guidanceScale,
          sampler_name: preset.samplerName,
          scheduler: preset.scheduler,
          denoise: 1,
          model: ['1', 0],
          positive: ['3', 0],
          negative: ['4', 0],
          latent_image: ['2', 0]
        }
      },
      '6': {
        class_type: 'VAEDecode',
        inputs: {
          samples: ['5', 0],
          vae: ['1', 2]
        }
      },
      '9': {
        class_type: 'SaveImage',
        inputs: {
          filename_prefix: `streamalchemy/${preset.id}`,
          images: ['6', 0]
        }
      }
    };
  }
}

module.exports = ModelCatalog;
