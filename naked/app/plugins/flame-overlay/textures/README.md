# Texture Assets for Flame Overlay

This directory contains texture assets used by the WebGL flame overlay renderer.

## Existing Textures

### nzw.png (138KB)
- **Type:** Noise texture
- **Size:** Variable (currently standard resolution)
- **Usage:** Base noise for turbulence and distortion effects
- **Format:** PNG with RGB channels
- **Wrapping:** Repeat (tileable)

### firetex.png (7.8KB)
- **Type:** Fire profile gradient
- **Size:** Likely 256x256 or similar
- **Usage:** Fire color gradient and intensity profile
- **Format:** PNG with alpha channel
- **Wrapping:** Clamp to edge

## Recommended High-Quality Textures (Future Enhancement)

For optimal visual quality when `useHighQualityTextures: true`, consider creating:

### noise-hq.png (To Be Created)
- **Recommended Size:** 1024x1024 pixels
- **Type:** High-resolution tileable Perlin/Worley noise combination
- **Channels:** RGBA
- **Purpose:** Provides finer detail for 4K and high-resolution displays
- **Generation:** Use Blender, Substance Designer, or procedural noise generation
- **Requirements:**
  - Seamlessly tileable on all edges
  - Good frequency distribution across multiple octaves
  - Grayscale noise in RGB channels (R=Perlin, G=Worley, B=Combined)
  - Alpha channel can be used for additional variation

### gradient-lut.png (To Be Created)
- **Recommended Size:** 256x4 pixels (or 256x1 for single palette)
- **Type:** Gradient Look-Up Texture (LUT) for fire/energy colors
- **Purpose:** Provides advanced color mapping options
- **Palettes (4 rows):**
  1. **Fire:** Red → Orange → Yellow → White (traditional fire)
  2. **Cold Fire:** Blue → Cyan → White (energy/magic effects)
  3. **Toxic:** Green → Yellow-Green → White (poison/acid effects)
  4. **Plasma:** Purple → Pink → White (electric/plasma effects)
- **Usage in shader:** `texture2D(uGradientLUT, vec2(intensity, paletteIndex/4.0))`

## Current Fallback Behavior

When high-quality textures are not available:
- System uses existing `nzw.png` and `firetex.png`
- Shader automatically scales frequency to compensate
- `useHighQualityTextures` config flag is ignored if files don't exist
- Performance remains optimal with standard textures

## Creating Your Own Textures

### Noise Texture Guidelines
1. **Tileable:** Ensure seamless wrapping using:
   - Blender: Enable "Seamless" on noise texture node
   - GIMP: Use Tile filter
   - Photoshop: Use Offset filter and manual retouching
2. **Frequency:** Mix multiple noise frequencies (1x, 2x, 4x, 8x base)
3. **Format:** Save as PNG-24 for quality, optimize with pngcrush if needed

### Fire Profile Guidelines
1. **Vertical gradient:** Bottom (dark/transparent) to Top (bright)
2. **Radial profile:** Center (bright) to Edges (dark)
3. **Alpha channel:** Use for fade-out at extremes
4. **Size:** 512x512 recommended for smooth gradients

## File Naming Convention

- `*-hq.png`: High-quality variants for 2K/4K rendering
- `*-lut.png`: Look-up textures for color/gradient mapping
- `*.png`: Standard resolution textures (fallback)

## Performance Notes

- **Standard textures (current):** ~145KB total, < 1ms load time
- **With HQ textures:** Estimated ~2-3MB total, still acceptable for web
- **GPU memory:** HQ textures use ~4-6MB VRAM vs ~1MB for standard
- **Recommendation:** Provide both standard and HQ variants, auto-select based on canvas resolution

## Attribution

Original textures created by PupCid for Little TikTool Helper.
License: CC-BY-NC-4.0 (Non-Commercial)
