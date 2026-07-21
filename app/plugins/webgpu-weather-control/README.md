# WebGPU Weather Control

This is an independent, opt-in Weather Control surface for the future WebGPU renderer. It owns the `webgpu-weather` API, socket, Flow, GCCE, database and localization namespaces; it does not call into the classic Weather Control runtime.

The overlay is deliberately transparent and renderer-free in version 1.0.0. It exposes configuration and diagnostics plumbing only. A GPU renderer is introduced separately, so this plugin never falls back to a Canvas2D renderer.

On its first synchronous startup the plugin can import compatible classic settings and gift mappings in one SQLite transaction. The imported installation starts disabled, with a fresh API key, no permanent effects and community gamification/HUD disabled.
