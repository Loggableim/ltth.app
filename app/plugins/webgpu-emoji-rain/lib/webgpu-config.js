'use strict';

const {
  DEFAULT_ANIMAL_COMMANDS,
  normalizeAnimalCommandSettings
} = require('../../../modules/emoji-rain-animal-commands');

const WEBGPU_EMOJI_RAIN_IMAGE_PREFIXES = [
  '/webgpu-emoji-rain/uploads/',
  '/uploads/webgpu-emoji-rain/',
  '/plugins/webgpu-emoji-rain/uploads/'
];

const DEFAULT_WEBGPU_CONFIG = Object.freeze({
  enabled: true,
  obs_hud_enabled: true,
  obs_hud_width: 1920,
  obs_hud_height: 1080,
  target_fps: 60,
  renderer_profile: 'hybrid',
  effect_intensity: 72,
  quality_preset: 'auto',
  adaptive_quality: true,
  enable_glow: true,
  enable_particles: true,
  enable_depth: true,
  enable_bloom: true,
  enable_trails: true,
  enable_soft_shadows: true,
  gpu_collisions_enabled: true,
  visual_mode: 'premium_stage',
  pupcid_defaults_version: 1,
  spawn_area_preset: 'full',
  width_px: 1920,
  height_px: 1080,
  emoji_set: ['💧', '💙', '💚', '💜', '❤️', '🩵', '✨', '🌟', '🔥', '🎉'],
  use_custom_images: false,
  image_urls: [],
  effect: 'bounce',
  toaster_mode: false,
  physics_gravity_y: 0.88,
  physics_air: 0.028,
  physics_friction: 0.11,
  physics_restitution: 0.62,
  physics_wind_strength: 0.0005,
  physics_wind_variation: 0.0003,
  wind_enabled: false,
  wind_strength: 50,
  wind_direction: 'auto',
  floor_enabled: true,
  bounce_enabled: true,
  bounce_height: 0.62,
  bounce_damping: 0.15,
  color_mode: 'cool',
  color_intensity: 0.4,
  rainbow_enabled: false,
  rainbow_speed: 1,
  pixel_enabled: false,
  pixel_size: 4,
  superfan_burst_enabled: true,
  animal_commands: DEFAULT_ANIMAL_COMMANDS,
  animal_commands_allow_team_members: true,
  animal_command_user_cooldown_ms: 60000,
  animal_command_superfan_cooldown_ms: 15000,
  animal_command_global_cooldown_ms: 15000,
  superfan_burst_intensity: 3.8,
  superfan_burst_duration: 2000,
  fps_optimization_enabled: true,
  fps_sensitivity: 0.8,
  adaptive_resolution_enabled: true,
  adaptive_resolution_min_fps: 50,
  adaptive_resolution_target_fps: 60,
  adaptive_resolution_max_scale: 1,
  adaptive_resolution_min_scale: 0.58,
  adaptive_resolution_step_down: 0.06,
  adaptive_resolution_step_up: 0.02,
  adaptive_resolution_cooldown_ms: 1200,
  emoji_min_size_px: 38,
  emoji_max_size_px: 80,
  emoji_rotation_speed: 0.035,
  emoji_lifetime_ms: 7600,
  emoji_fade_duration_ms: 1100,
  max_emojis_on_screen: 320,
  rate_limit_enabled: true,
  rate_limit_emojis_per_second: 40,
  like_count_divisor: 22,
  like_min_emojis: 1,
  like_max_emojis: 10,
  gift_base_emojis: 4,
  gift_coin_multiplier: 0.08,
  gift_max_emojis: 36,
  gift_balls_enabled: false,
  gift_ball_min_size_px: 44,
  gift_ball_max_size_px: 128,
  gift_ball_price_reference_coins: 1000,
  gift_ball_min_despawn_ms: 9000,
  gift_ball_max_despawn_ms: 20000,
  gift_ball_despawn_per_coin_ms: 25,
  gift_ball_despawn_multiplier: 1,
  gift_ball_base_count: 1,
  gift_ball_series_count_divisor: 3,
  gift_ball_max_count: 24,
  gift_ball_tier_thresholds_enabled: false,
  gift_ball_tier_size_1: 44,
  gift_ball_tier_size_2: 80,
  gift_ball_tier_size_3: 150,
  gift_ball_tier_size_4: 300,
  gift_ball_tier_size_5: 700,
  gift_ball_tier_size_6: 5000,
  heart_balloons_enabled: true,
  heart_balloon_like_divisor: 1,
  heart_balloon_min_hearts: 5,
  heart_balloon_max_hearts: 16,
  heart_balloon_profile_every: 5,
  heart_balloon_pop_y: 0.5,
  heart_balloon_wind_strength: 0.45,
  heart_balloon_test_count: 8,
  sticker_enabled: true,
  sticker_base_count: 5,
  sticker_fan_level_multiplier: 3,
  sticker_max_count: 30,
  sticker_user_cooldown_ms: 10000,
  sticker_superfan_cooldown_ms: 5000,
  sticker_superfan_burst_enabled: true
});

const PROFILES = new Set(['hybrid', 'cinematic', 'neon']);
const QUALITY_PRESETS = new Set(['auto', 'performance', 'balanced', 'high']);

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function normalizeWebGPUConfig(input = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const config = { ...DEFAULT_WEBGPU_CONFIG, ...source };
  Object.assign(config, normalizeAnimalCommandSettings(source, {
    strict: options.strict === true,
    imagePathPrefixes: WEBGPU_EMOJI_RAIN_IMAGE_PREFIXES
  }));
  config.renderer_profile = PROFILES.has(config.renderer_profile) ? config.renderer_profile : 'hybrid';
  config.quality_preset = QUALITY_PRESETS.has(config.quality_preset) ? config.quality_preset : 'auto';
  config.effect_intensity = clamp(config.effect_intensity, 0, 100, 72);
  config.max_emojis_on_screen = Math.round(clamp(config.max_emojis_on_screen, 32, 4096, 320));
  config.rate_limit_emojis_per_second = Math.round(clamp(config.rate_limit_emojis_per_second, 1, 500, 40));
  config.obs_hud_width = Math.round(clamp(config.obs_hud_width, 320, 7680, 1920));
  config.obs_hud_height = Math.round(clamp(config.obs_hud_height, 180, 4320, 1080));
  config.width_px = Math.round(clamp(config.width_px, 320, 7680, config.obs_hud_width));
  config.height_px = Math.round(clamp(config.height_px, 180, 4320, config.obs_hud_height));
  config.target_fps = Math.round(clamp(config.target_fps, 15, 240, 60));
  config.physics_gravity_y = clamp(config.physics_gravity_y, -2, 4, 0.88);
  config.physics_air = clamp(config.physics_air, 0, 1, 0.028);
  config.physics_friction = clamp(config.physics_friction, 0, 1, 0.11);
  config.physics_restitution = clamp(config.physics_restitution, 0, 1.5, 0.62);
  config.bounce_height = clamp(config.bounce_height, 0, 1.5, config.physics_restitution);
  config.bounce_damping = clamp(config.bounce_damping, 0, 1, 0.15);
  config.wind_strength = clamp(config.wind_strength, 0, 100, 50);
  config.physics_wind_strength = clamp(config.physics_wind_strength, 0, 1, 0.0005);
  config.physics_wind_variation = clamp(config.physics_wind_variation, 0, 1, 0.0003);
  config.color_intensity = clamp(config.color_intensity, 0, 1, 0.4);
  config.rainbow_speed = clamp(config.rainbow_speed, 0.05, 10, 1);
  config.pixel_size = Math.round(clamp(config.pixel_size, 1, 16, 4));
  config.emoji_min_size_px = Math.round(clamp(config.emoji_min_size_px, 8, 512, 38));
  config.emoji_max_size_px = Math.round(clamp(config.emoji_max_size_px, config.emoji_min_size_px, 1024, 80));
  config.emoji_rotation_speed = clamp(config.emoji_rotation_speed, 0, 2, 0.035);
  config.emoji_lifetime_ms = Math.round(clamp(config.emoji_lifetime_ms, 250, 120000, 7600));
  config.emoji_fade_duration_ms = Math.round(clamp(config.emoji_fade_duration_ms, 0, 30000, 1100));
  config.superfan_burst_intensity = clamp(config.superfan_burst_intensity, 1, 10, 3.8);
  config.superfan_burst_duration = Math.round(clamp(config.superfan_burst_duration, 0, 30000, 2000));
  config.heart_balloon_pop_y = clamp(config.heart_balloon_pop_y, 0.05, 0.95, 0.5);
  config.heart_balloon_wind_strength = clamp(config.heart_balloon_wind_strength, 0, 3, 0.45);
  config.adaptive_resolution_min_fps = Math.round(clamp(config.adaptive_resolution_min_fps, 10, 240, 50));
  config.adaptive_resolution_target_fps = Math.round(clamp(config.adaptive_resolution_target_fps, config.adaptive_resolution_min_fps, 240, 60));
  config.adaptive_resolution_max_scale = clamp(config.adaptive_resolution_max_scale, 0.25, 1, 1);
  config.adaptive_resolution_min_scale = clamp(config.adaptive_resolution_min_scale, 0.25, config.adaptive_resolution_max_scale, 0.58);
  config.adaptive_resolution_step_down = clamp(config.adaptive_resolution_step_down, 0.005, 0.25, 0.06);
  config.adaptive_resolution_step_up = clamp(config.adaptive_resolution_step_up, 0.002, 0.25, 0.02);
  config.adaptive_resolution_cooldown_ms = Math.round(clamp(config.adaptive_resolution_cooldown_ms, 100, 30000, 1200));
  config.wind_direction = ['auto', 'left', 'right'].includes(config.wind_direction) ? config.wind_direction : 'auto';
  config.color_mode = ['off', 'warm', 'cool', 'neon', 'pastel'].includes(config.color_mode) ? config.color_mode : 'cool';
  for (const key of [
    'enabled', 'obs_hud_enabled', 'adaptive_quality', 'enable_glow', 'enable_particles',
    'enable_depth', 'enable_bloom', 'enable_trails', 'enable_soft_shadows',
    'gpu_collisions_enabled', 'use_custom_images', 'toaster_mode', 'wind_enabled',
    'floor_enabled', 'bounce_enabled', 'rainbow_enabled', 'pixel_enabled',
    'superfan_burst_enabled', 'fps_optimization_enabled', 'adaptive_resolution_enabled',
    'rate_limit_enabled', 'gift_balls_enabled', 'gift_ball_tier_thresholds_enabled',
    'heart_balloons_enabled', 'sticker_enabled', 'sticker_superfan_burst_enabled'
  ]) {
    config[key] = config[key] !== false;
  }
  return config;
}

function createDefaultWebGPUConfig() {
  return normalizeWebGPUConfig();
}

module.exports = { DEFAULT_WEBGPU_CONFIG, createDefaultWebGPUConfig, normalizeWebGPUConfig };
