# WebGPU Engine für LTTH

Zentrale, production-ready WebGPU-Engine für alle LTTH-Plugins.

## Integrationsanleitung

Die WebGPU-Engine liegt unter `app/modules/webgpu-engine/` und wird beim Server-Start automatisch initialisiert, sofern WebGPU verfügbar ist. Plugins importieren die Engine über den relativen Pfad `../../modules/webgpu-engine/dist/index.js` oder nutzen die Plugin-API. Die Engine prüft beim Start automatisch `navigator.gpu` und meldet via Winston-Logger (this.api.log), ob WebGPU verfügbar ist oder ein Fallback aktiv wird. Plugins erhalten nur eine sichere EngineFacade – direkter Zugriff auf GPUDevice/GPUQueue ist nicht möglich, um Ressourcen-Leaks zu vermeiden. Bei Hot-Reloads wird `hotReloadPlugin(pluginId)` aufgerufen, wodurch alle Plugin-Ressourcen invalidiert und der Leak-Check durchgeführt wird. Plugin-Daten müssen gemäß LTTH-Konventionen über `this.api.getPluginDataDir()` gespeichert werden, nicht im Plugin-Verzeichnis.

## Schnellstart

```javascript
// In einem LTTH-Plugin (main.js)
const { registerPluginRenderer, isEngineAvailable } = require('../../modules/webgpu-engine/dist/index.js');

class MyWebGPUPlugin {
  constructor(api) {
    this.api = api;
  }

  async init() {
    // Prüfen ob WebGPU verfügbar ist
    if (!isEngineAvailable()) {
      this.api.log('WebGPU nicht verfügbar, Plugin deaktiviert', 'warn');
      return;
    }

    // Plugin-Renderer registrieren
    this.registration = await registerPluginRenderer(
      this.api,
      { wantsSurface: true, preferredCanvasSelector: '#my-canvas' },
      {
        onInit: async (ctx) => {
          // Pipeline erstellen
          this.pipeline = await ctx.engine.createPipeline({
            id: 'my-pipeline',
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            // ...
          });
        },
        onFrame: (ctx) => {
          // Render-Logik
          ctx.engine.encodePass((encoder) => {
            // Draw calls
          });
        },
        onHotReload: async (ctx) => {
          // Ressourcen neu erstellen
        },
        onDispose: async (ctx) => {
          // Aufräumen
          if (this.pipeline) this.pipeline.release();
        }
      }
    );
  }

  async destroy() {
    if (this.registration) {
      this.registration.unregister();
    }
  }
}

module.exports = MyWebGPUPlugin;
```

## API-Übersicht

### Engine-Erstellung

```typescript
// Engine erstellen (normalerweise vom Server automatisch)
const engine = await createEngine({
  canvas: canvasElement,          // Optional: HTMLCanvasElement oder OffscreenCanvas
  preferHighPerformance: true     // Optional: GPU-Präferenz
});

// Globale Engine setzen (für Plugin-Zugriff)
setGlobalEngine(engine);
engine.start();
```

### Ressourcen erstellen

```typescript
// Buffer
const buffer = engine.createBuffer({
  size: 1024,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  label: 'my-buffer'
});

// Texture
const texture = engine.createTexture({
  width: 256,
  height: 256,
  format: 'rgba8unorm',
  usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
});

// Texture aus Bild
const texture = await engine.createTextureFromImage(imageElement);
const texture = await engine.createTextureFromBlob(blob);

// Sampler
const sampler = engine.createSampler({
  magFilter: 'linear',
  minFilter: 'linear'
});
```

### Pipeline erstellen

```typescript
const pipeline = await engine.createPipeline({
  id: 'my-pipeline',
  vertexShader: `
    @vertex
    fn main(@location(0) pos: vec2<f32>) -> @builtin(position) vec4<f32> {
      return vec4<f32>(pos, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    @fragment
    fn main() -> @location(0) vec4<f32> {
      return vec4<f32>(1.0, 0.0, 0.0, 1.0);
    }
  `,
  vertexBufferLayouts: [{
    arrayStride: 8,
    attributes: [
      { format: 'float32x2', offset: 0, shaderLocation: 0 }
    ]
  }],
  colorTargetStates: [{ format: engine.getPreferredFormat() }]
});
```

### Render-Befehle

```typescript
engine.encodePass((encoder) => {
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: surface.getCurrentTexture().createView(),
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: 'clear',
      storeOp: 'store'
    }]
  });

  pass.setPipeline(pipeline);
  pass.setVertexBuffer(0, vertexBuffer);
  pass.draw(3);
  pass.end();
});

engine.submit();
```

### Metriken

```typescript
const metrics = engine.getMetrics();
// {
//   frameTime: number,      // ms
//   deltaTime: number,      // seconds
//   fps: number,
//   drawCalls: number,
//   pipelineCount: number,
//   bufferCount: number,
//   textureCount: number,
//   totalMemoryUsage: number,
//   frameCount: number
// }
```

## Browser/Electron-Kompatibilität

- **Chrome/Edge 113+**: Vollständige Unterstützung
- **Electron 25+**: Vollständige Unterstützung (Chromium-basiert)
- **Firefox**: Experimentell (behind flag)
- **Safari**: Teilweise Unterstützung ab macOS Ventura

Falls WebGPU nicht verfügbar ist, gibt `isEngineAvailable()` `false` zurück. Plugins sollten dann entweder auf Canvas 2D ausweichen oder sich selbst deaktivieren.

## Fehlerbehandlung

```typescript
try {
  const pipeline = await engine.createPipeline(descriptor);
} catch (error) {
  if (error instanceof EngineError) {
    switch (error.code) {
      case EngineErrorCode.SHADER_COMPILATION_FAILED:
        this.api.log(`Shader-Fehler: ${error.message}`, 'error');
        break;
      case EngineErrorCode.RESOURCE_CREATION_FAILED:
        this.api.log(`Ressourcen-Fehler: ${error.message}`, 'error');
        break;
      // ...
    }
  }
}
```

## Lizenz

CC-BY-NC-4.0 (wie LTTH-Hauptprojekt)
