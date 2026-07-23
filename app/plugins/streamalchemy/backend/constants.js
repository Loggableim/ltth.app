const PROMPT_VERSION = 'streamalchemy-v2';

const DEFAULT_CONFIG = {
  enabled: true,
  autoCrafting: true,
  craftingWindowMs: 6000,
  defaultStyle: 'rpg',
  promptVersion: PROMPT_VERSION,
  providerOrder: ['localComfy', 'siliconflow', 'openai', 'lightx', 'placeholder'],
  localGeneration: {
    enabled: true,
    generationMode: 'local_preferred',
    comfyUrl: 'http://127.0.0.1:8188',
    comfyRootDir: '',
    selectedPresetId: 'sdxl_lightning_4step',
    workflowId: 'comfy_sdxl_lightning_4step',
    modelInstallMethod: 'one_click',
    model: 'ByteDance/SDXL-Lightning',
    modelFile: 'sdxl_lightning_4step.safetensors',
    modelDownloadUrl: 'https://huggingface.co/ByteDance/SDXL-Lightning/resolve/main/sdxl_lightning_4step.safetensors?download=true',
    modelDirectory: 'local-models',
    width: 768,
    height: 768,
    steps: 4,
    concurrency: 1
  },
  rateLimit: {
    giftsPerUserPerMinute: 30
  }
};

const STYLE_PRESETS = {
  rpg: { id: 'rpg', label: 'RPG', prompt: 'fantasy RPG game asset' },
  fantasy: { id: 'fantasy', label: 'Fantasy', prompt: 'enchanted fantasy artifact' },
  pixel: { id: 'pixel', label: 'Pixel', prompt: 'clean pixel art icon' },
  anime: { id: 'anime', label: 'Anime', prompt: 'polished anime game icon' },
  cyberpunk: { id: 'cyberpunk', label: 'Cyberpunk', prompt: 'neon cyberpunk item icon' },
  cartoon: { id: 'cartoon', label: 'Cartoon', prompt: 'bright cartoon game item' }
};

const RARITY_TIERS = [
  { name: 'Mythic', min: 5000, color: 'purple' },
  { name: 'Legendary', min: 1000, color: 'gold' },
  { name: 'Rare', min: 100, color: 'silver' },
  { name: 'Common', min: 0, color: 'bronze' }
];

const EVENTS = {
  BASE_ITEM_OBTAINED: 'streamalchemy:base_item_obtained',
  CRAFTING_STARTED: 'streamalchemy:crafting_started',
  ITEM_CRAFTING: 'streamalchemy:item_crafting',
  CRAFTING_COMPLETED: 'streamalchemy:crafting_completed',
  CRAFTING_FAILED: 'streamalchemy:crafting_failed',
  RECIPE_CACHE_HIT: 'streamalchemy:recipe_cache_hit',
  GENERATION_JOB_STARTED: 'streamalchemy:generation_job_started',
  GENERATION_JOB_FAILED: 'streamalchemy:generation_job_failed'
};

module.exports = {
  PROMPT_VERSION,
  DEFAULT_CONFIG,
  STYLE_PRESETS,
  RARITY_TIERS,
  EVENTS
};
