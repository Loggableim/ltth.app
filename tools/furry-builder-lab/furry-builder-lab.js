const loadedAtlases = new Map();

function getImageConstructor(canvas) {
  return canvas.ownerDocument?.defaultView?.Image || globalThis.Image;
}

function loadAtlas(canvas, source) {
  if (loadedAtlases.has(source)) return loadedAtlases.get(source);

  const ImageConstructor = getImageConstructor(canvas);
  if (!ImageConstructor) throw new Error('Canvas image loading is unavailable');

  const image = new ImageConstructor();
  const loaded = new Promise((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load atlas: ${source}`));
  });
  loadedAtlases.set(source, loaded);
  image.src = source;
  return loaded;
}

function cellOrigin(cell, columns, cellSize) {
  return {
    x: (cell % columns) * cellSize,
    y: Math.floor(cell / columns) * cellSize
  };
}

function mapNormalizedBounds(bounds, rectangle) {
  return {
    x: rectangle.x + bounds[0] * rectangle.width,
    y: rectangle.y + bounds[1] * rectangle.height,
    width: bounds[2] * rectangle.width,
    height: bounds[3] * rectangle.height
  };
}

function sourceRectangle(item, atlasManifest, cropToBounds) {
  const origin = cellOrigin(item.cell, atlasManifest.columns, atlasManifest.cellSize);
  const cell = {
    x: origin.x,
    y: origin.y,
    width: atlasManifest.cellSize,
    height: atlasManifest.cellSize
  };
  return cropToBounds ? mapNormalizedBounds(item.localBounds, cell) : cell;
}

function slotRectangle(slot, anchorBounds) {
  return {
    x: anchorBounds.x + (slot.center[0] - slot.maxSize[0] / 2) * anchorBounds.width,
    y: anchorBounds.y + (slot.center[1] - slot.maxSize[1] / 2) * anchorBounds.height,
    width: slot.maxSize[0] * anchorBounds.width,
    height: slot.maxSize[1] * anchorBounds.height
  };
}

function fitContain(source, slot) {
  const scale = Math.min(slot.width / source.width, slot.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return {
    x: slot.x + (slot.width - width) / 2,
    y: slot.y + (slot.height - height) / 2,
    width,
    height
  };
}

function validateManifest(atlasManifest, rigManifest) {
  if (rigManifest?.version !== 2) throw new Error('Rig manifest version 2 is required');
  if (!Number.isFinite(rigManifest.canvas?.size) || rigManifest.canvas.size <= 0) {
    throw new Error('Rig canvas size must be positive');
  }
  if (!Number.isInteger(atlasManifest?.columns) || !Number.isInteger(atlasManifest?.rows)) {
    throw new Error('Atlas grid dimensions must be integers');
  }
  if (!Number.isFinite(atlasManifest.cellSize) || atlasManifest.cellSize <= 0) {
    throw new Error('Atlas cellSize must be positive');
  }
}

function buildDrawPlan(atlasManifest, rigManifest, selection) {
  validateManifest(atlasManifest, rigManifest);

  const canvasSize = rigManifest.canvas.size;
  const canvas = { x: 0, y: 0, width: canvasSize, height: canvasSize };
  const resolved = new Map();
  const layers = Object.entries(rigManifest.layers)
    .sort(([, left], [, right]) => left.z - right.z);

  return layers.map(([layerId, layer]) => {
    const selectedId = selection[layerId];
    const item = layer.items?.[selectedId];
    if (!item) throw new RangeError(`Invalid ${layerId} selection: ${selectedId}`);

    const atlas = atlasManifest.atlases?.[layerId];
    if (!atlas) throw new Error(`Missing atlas for layer: ${layerId}`);

    let source;
    let destination;
    let slot;
    let alphaBounds;

    if (layer.attachTo) {
      const anchor = resolved.get(layer.attachTo.layer);
      if (!anchor) throw new Error(`Unresolved attachment layer: ${layer.attachTo.layer}`);
      const slotDefinition = anchor.item.slots?.[layer.attachTo.slot];
      if (!slotDefinition) {
        throw new Error(`Missing slot ${layer.attachTo.slot} on ${layer.attachTo.layer}`);
      }
      if (layer.fit !== 'contain') throw new Error(`Unsupported fit mode: ${layer.fit}`);

      source = sourceRectangle(item, atlasManifest, true);
      slot = slotRectangle(slotDefinition, anchor.alphaBounds);
      destination = fitContain(source, slot);
      alphaBounds = destination;
    } else {
      source = sourceRectangle(item, atlasManifest, false);
      destination = { ...canvas };
      alphaBounds = mapNormalizedBounds(item.localBounds, destination);
    }

    const operation = {
      layer: layerId,
      z: layer.z,
      atlas,
      source,
      destination,
      ...(slot ? { slot } : {})
    };
    resolved.set(layerId, { item, alphaBounds });
    return operation;
  });
}

async function drawComposite(canvas, atlasManifest, rigManifest, selection) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('A 2D canvas context is required');

  const plan = buildDrawPlan(atlasManifest, rigManifest, selection);
  const canvasSize = rigManifest.canvas.size;
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  context.clearRect(0, 0, canvasSize, canvasSize);

  for (const operation of plan) {
    const image = await loadAtlas(canvas, operation.atlas);
    const { source, destination } = operation;
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
}

module.exports = { buildDrawPlan, drawComposite };
