# Visual FX Frame WEBGPU

Native WebGPU edition of Visual FX Frame for LTTH and OBS browser sources. It is an independent `working-beta` plugin: the original `flame-overlay` plugin, its configuration and its routes remain untouched.

## Renderer

- WebGPU is mandatory; there is no WebGL or Canvas fallback.
- Compute passes simulate the edge field, particles and lightning branches.
- Four compatible effect IDs: `flames`, `particles`, `energy`, `lightning`.
- Three material styles: `realistic`, `neon`, `hybrid`.
- HDR `rgba16float` scene rendering, bright extraction, multi-level Kawase bloom, tone mapping and premultiplied-alpha composition.
- Adaptive `low-load`, `obs-safe` and `max-quality` profiles preserve the configured canvas geometry while scaling internal GPU budgets.
- One automatic recovery attempt is made after WebGPU device loss; a second failure stops rendering and reports `error`.

## Control Room and OBS

- Control Room: `/visual-fx-frame-webgpu/ui`
- OBS overlay: `/visual-fx-frame-webgpu/overlay`
- Runtime status: `/api/visual-fx-frame-webgpu/status`
- Add `?debug=true` to the overlay URL to display renderer initialization errors.
- `obs-safe` is the default profile. Match the OBS browser-source width and height to the selected resolution preset.

The Control Room exposes the same frame, appearance, trigger, gift-rule and preset functions as Visual FX Frame. The import action reads the old settings only after explicit confirmation and writes an independent WebGPU copy.

## Development status

Version `1.0.0` is local-only and disabled by default. It is intentionally absent from `plugin-store.json` and packaged plugin archives until hardware/OBS beta validation is complete.
