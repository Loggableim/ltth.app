'use strict';

const { WebGPUFireworksEngine } = require('../plugins/webgpu-fireworks/gpu/engine');
const { normalizeConfig } = require('../plugins/webgpu-fireworks/lib/config-schema');

const PRESET_SIZES = {
  '360p': [640, 360],
  '480p': [854, 480],
  '540p': [960, 540],
  '720p': [1280, 720],
  '1080p': [1920, 1080],
  '1440p': [2560, 1440],
  '4k': [3840, 2160]
};
const PRESETS = Object.keys(PRESET_SIZES);

function orientedSize(preset, orientation) {
  const [width, height] = PRESET_SIZES[preset];
  return orientation === 'portrait' ? [height, width] : [width, height];
}

function createEngine(config, renderScale = 1) {
  const previous = {
    document: global.document,
    window: global.window
  };
  const canvas = { style: {} };
  global.window = {
    location: { search: '' },
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  };
  global.document = {
    getElementById: jest.fn(id => id === 'fireworks-canvas' ? canvas : null)
  };

  const engine = new WebGPUFireworksEngine('fireworks-canvas');
  engine.config = normalizeConfig(config);
  engine.renderScale = renderScale;
  engine.renderer = {
    resize: jest.fn(),
    setLogicalSize: jest.fn()
  };

  return {
    engine,
    restore() {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete global[name];
        else global[name] = value;
      }
    }
  };
}

describe('WebGPU Fireworks internal resolution bounds', () => {
  test('normalizes reversed internal preset bounds from low to high', () => {
    expect(normalizeConfig({
      internalMinResolutionPreset: '4k',
      internalMaxResolutionPreset: '540p'
    })).toMatchObject({
      internalMinResolutionPreset: '540p',
      internalMaxResolutionPreset: '4k'
    });

    expect(normalizeConfig({
      internalMinResolutionPreset: '1440p',
      internalMaxResolutionPreset: '720p'
    })).toMatchObject({
      internalMinResolutionPreset: '720p',
      internalMaxResolutionPreset: '1440p'
    });
  });

  test('normalizes invalid and missing bounds through canonical defaults before ordering', () => {
    expect(normalizeConfig({
      internalMinResolutionPreset: 'invalid',
      internalMaxResolutionPreset: 'also-invalid'
    })).toMatchObject({
      internalMinResolutionPreset: '540p',
      internalMaxResolutionPreset: '4k'
    });
    expect(normalizeConfig({ internalMaxResolutionPreset: '360p' })).toMatchObject({
      internalMinResolutionPreset: '360p',
      internalMaxResolutionPreset: '540p'
    });
  });

  test.each([
    {
      name: 'never interprets a minimum above the source as a supersampling request',
      config: {
        resolutionPreset: '360p',
        orientation: 'landscape',
        internalMinResolutionPreset: '1080p',
        internalMaxResolutionPreset: '4k',
        adaptivePerformance: false,
        adaptiveRenderScaleEnabled: false
      },
      renderScale: 0.25,
      expectedInternal: [640, 360],
      expectedLogical: [640, 360]
    },
    {
      name: 'lowers portrait rendering to the hard maximum with adaptive scaling disabled',
      config: {
        resolutionPreset: '4k',
        orientation: 'portrait',
        internalMinResolutionPreset: '360p',
        internalMaxResolutionPreset: '1080p',
        adaptivePerformance: false,
        adaptiveRenderScaleEnabled: false
      },
      renderScale: 2,
      expectedInternal: [1080, 1920],
      expectedLogical: [2160, 3840]
    },
    {
      name: 'keeps a source below an exact floor and ceiling at source size',
      config: {
        resolutionPreset: '480p',
        orientation: 'landscape',
        internalMinResolutionPreset: '720p',
        internalMaxResolutionPreset: '720p',
        adaptivePerformance: true,
        adaptiveRenderScaleEnabled: true,
        minRenderScale: 0.25
      },
      renderScale: 0.25,
      expectedInternal: [854, 480],
      expectedLogical: [854, 480]
    },
    {
      name: 'caps an oversized adaptive result at the configured preset ceiling',
      config: {
        resolutionPreset: '4k',
        orientation: 'landscape',
        internalMinResolutionPreset: '480p',
        internalMaxResolutionPreset: '720p',
        adaptivePerformance: true,
        adaptiveRenderScaleEnabled: true,
        minRenderScale: 0.25
      },
      renderScale: 2,
      expectedInternal: [1280, 720],
      expectedLogical: [3840, 2160]
    }
  ])('$name', ({ config, renderScale, expectedInternal, expectedLogical }) => {
    const client = createEngine(config, renderScale);
    try {
      client.engine.resize();
      expect(client.engine.renderer.resize).toHaveBeenLastCalledWith(...expectedInternal);
      expect(client.engine.renderer.setLogicalSize).toHaveBeenLastCalledWith(...expectedLogical);
    } finally {
      client.restore();
    }
  });

  test('keeps toaster scaling when adaptive performance is off but render scaling is enabled', () => {
    const client = createEngine({
      resolutionPreset: '1080p',
      orientation: 'landscape',
      internalMinResolutionPreset: '360p',
      internalMaxResolutionPreset: '4k',
      adaptivePerformance: false,
      adaptiveRenderScaleEnabled: true,
      toasterMode: true
    });
    try {
      client.engine.resize();
      expect(client.engine.renderer.resize).toHaveBeenLastCalledWith(1248, 702);
    } finally {
      client.restore();
    }
  });

  test('lets an explicit minRenderScale floor win over the toaster target', () => {
    const client = createEngine({
      resolutionPreset: '1080p',
      orientation: 'landscape',
      internalMinResolutionPreset: '360p',
      internalMaxResolutionPreset: '4k',
      adaptivePerformance: false,
      adaptiveRenderScaleEnabled: true,
      toasterMode: true,
      minRenderScale: 0.8
    });
    try {
      client.engine.resize();
      expect(client.engine.renderer.resize).toHaveBeenLastCalledWith(1536, 864);
    } finally {
      client.restore();
    }
  });

  test('keeps source scale when adaptive render scaling is off while still enforcing hard bounds', () => {
    const client = createEngine({
      resolutionPreset: '1080p',
      orientation: 'landscape',
      internalMinResolutionPreset: '720p',
      internalMaxResolutionPreset: '4k',
      adaptivePerformance: true,
      adaptiveRenderScaleEnabled: false,
      toasterMode: true
    }, 0.25);
    try {
      client.engine.resize();
      expect(client.engine.renderer.resize).toHaveBeenLastCalledWith(1920, 1080);
    } finally {
      client.restore();
    }
  });

  test.each([
    ['landscape', [854, 480]],
    ['portrait', [480, 854]]
  ])('handles the non-exact 16:9 480p bound in %s without crossing either axis', (orientation, expected) => {
    const client = createEngine({
      resolutionPreset: '1080p',
      orientation,
      internalMinResolutionPreset: '480p',
      internalMaxResolutionPreset: '480p',
      adaptivePerformance: true,
      adaptiveRenderScaleEnabled: true,
      minRenderScale: 0.25
    }, 0.25);
    try {
      client.engine.resize();
      expect(client.engine.renderer.resize).toHaveBeenLastCalledWith(...expected);
    } finally {
      client.restore();
    }
  });

  test.each(['landscape', 'portrait'])('keeps every valid %s preset combination within source and configured bounds', orientation => {
    for (const sourcePreset of PRESETS) {
      for (let minIndex = 0; minIndex < PRESETS.length; minIndex++) {
        for (let maxIndex = minIndex; maxIndex < PRESETS.length; maxIndex++) {
          const minPreset = PRESETS[minIndex];
          const maxPreset = PRESETS[maxIndex];
          const source = orientedSize(sourcePreset, orientation);
          const minimum = orientedSize(minPreset, orientation);
          const maximum = orientedSize(maxPreset, orientation);
          const effectiveMinimum = [Math.min(source[0], minimum[0]), Math.min(source[1], minimum[1])];
          const effectiveMaximum = [Math.min(source[0], maximum[0]), Math.min(source[1], maximum[1])];

          for (const renderScale of [0.25, 0.65, 1, 2]) {
            const client = createEngine({
              resolutionPreset: sourcePreset,
              orientation,
              internalMinResolutionPreset: minPreset,
              internalMaxResolutionPreset: maxPreset,
              adaptivePerformance: true,
              adaptiveRenderScaleEnabled: true,
              minRenderScale: 0.25
            }, renderScale);
            try {
              client.engine.resize();
              const [width, height] = client.engine.renderer.resize.mock.calls.at(-1);
              expect(width).toBeGreaterThanOrEqual(effectiveMinimum[0]);
              expect(height).toBeGreaterThanOrEqual(effectiveMinimum[1]);
              expect(width).toBeLessThanOrEqual(effectiveMaximum[0]);
              expect(height).toBeLessThanOrEqual(effectiveMaximum[1]);
              expect(client.engine.renderer.setLogicalSize).toHaveBeenLastCalledWith(...source);
            } finally {
              client.restore();
            }
          }
        }
      }
    }
  });
});
