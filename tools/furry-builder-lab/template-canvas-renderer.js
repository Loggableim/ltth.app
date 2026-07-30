'use strict';

(function initTemplateCanvasRenderer(globalScope, factory) {
  const templateRig = typeof module === 'object' && module.exports
    ? require('./template-rig')
    : globalScope && globalScope.TemplateRig;
  const api = factory(templateRig);

  if (typeof module === 'object' && module.exports) module.exports = api;
  if (globalScope) globalScope.TemplateCanvasRenderer = api;
})(typeof window === 'undefined' ? null : window, function createTemplateCanvasRendererModule(templateRig) {
  function defaultLoadImage(fileName) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image), { once: true });
      image.addEventListener('error', () => reject(new Error(`Could not load template atlas: ${fileName}`)), { once: true });
      image.src = fileName;
    });
  }

  function sourceRect(atlas, cell) {
    return {
      x: (cell % atlas.columns) * atlas.cellSize,
      y: Math.floor(cell / atlas.columns) * atlas.cellSize,
      width: atlas.cellSize,
      height: atlas.cellSize
    };
  }

  function createTemplateCanvasRenderer({ canvas, manifest, loadImage = defaultLoadImage, resolveTemplatePlan } = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') {
      throw new Error('A canvas with a 2D context is required');
    }
    if (!manifest || !manifest.canvas || !manifest.atlases) {
      throw new Error('A face-template manifest is required');
    }
    if (canvas.width !== manifest.canvas.width || canvas.height !== manifest.canvas.height) {
      throw new Error(`Canvas must be ${manifest.canvas.width}x${manifest.canvas.height}`);
    }

    const context = canvas.getContext('2d');
    if (!context) throw new Error('A 2D canvas context is required');

    const resolve = resolveTemplatePlan || (templateRig && templateRig.resolveTemplatePlan);
    if (typeof resolve !== 'function') throw new Error('resolveTemplatePlan is required');

    const assetPromises = new Map();

    function loadAtlas(atlasId) {
      const atlas = manifest.atlases[atlasId];
      if (!atlas) throw new Error(`Unknown template atlas: ${atlasId}`);

      if (!assetPromises.has(atlasId)) {
        const assetPromise = Promise.resolve().then(() => loadImage(atlas.file, atlasId));
        assetPromises.set(atlasId, assetPromise);
      }

      return assetPromises.get(atlasId);
    }

    async function render(templateId, mouthFrame) {
      const plan = resolve(manifest, templateId, mouthFrame);
      const layers = await Promise.all(plan.operations.map(async (operation) => ({
        operation,
        image: await loadAtlas(operation.atlasId)
      })));

      context.clearRect(0, 0, canvas.width, canvas.height);
      for (const { operation, image } of layers) {
        const atlas = manifest.atlases[operation.atlasId];
        const source = sourceRect(atlas, operation.cell);
        const destination = operation.destination;
        context.drawImage(
          image,
          source.x,
          source.y,
          source.width,
          source.height,
          destination.x,
          destination.y,
          destination.width,
          destination.height
        );
      }

      return plan;
    }

    return { render };
  }

  return { createTemplateCanvasRenderer };
});
