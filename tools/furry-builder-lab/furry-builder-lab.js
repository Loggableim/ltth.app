const PARTS = ['heads', 'eyes', 'mouths'];
const CANVAS_SIZE = 1024;
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

function selectedCellOffset(partId, columns, cellWidth, cellHeight) {
  return {
    x: (partId % columns) * cellWidth,
    y: Math.floor(partId / columns) * cellHeight
  };
}

async function drawComposite(canvas, manifest, selection) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('A 2D canvas context is required');

  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  for (const part of PARTS) {
    const image = await loadAtlas(canvas, manifest.atlases[part]);
    const cellWidth = image.width / manifest.columns;
    const cellHeight = image.height / manifest.rows;
    const offset = selectedCellOffset(selection[part], manifest.columns, cellWidth, cellHeight);
    context.drawImage(
      image,
      offset.x,
      offset.y,
      cellWidth,
      cellHeight,
      0,
      0,
      CANVAS_SIZE,
      CANVAS_SIZE
    );
  }
}

module.exports = { drawComposite };
