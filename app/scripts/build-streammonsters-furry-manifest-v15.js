const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {
  TEMPLATE_CATALOG,
  getEvolutionAssetPath
} = require('../plugins/streamalchemy/backend/streammonsters/catalog');

const pluginDir = path.join(__dirname, '..', 'plugins', 'streamalchemy');
const manifestPath = path.join(
  pluginDir,
  'assets',
  'streammonsters',
  'furry',
  'manifest.json'
);

// The base forms were keyed from these flat production backgrounds. Keeping
// the exact source colors in the manifest lets the regression test distinguish
// genuine chroma residue from intentional saturated element colors.
const BASE_BACKGROUND_RGB = Object.freeze({
  ashfang: [7, 247, 15],
  cinder: [10, 236, 20],
  embergrin: [7, 240, 20],
  pyrra: [6, 237, 21],
  ripple: [8, 237, 20],
  brine: [9, 234, 18],
  reefbite: [5, 244, 12],
  axi: [7, 241, 16],
  mosswhisker: [12, 233, 24],
  cloverhop: [249, 4, 229],
  oakheart: [250, 3, 231],
  fernmask: [249, 2, 232],
  zephyr: [249, 2, 237],
  skyrend: [246, 3, 233],
  cirrus: [249, 3, 234],
  gusttail: [251, 5, 230],
  pulse: [13, 235, 23],
  neonclaw: [8, 235, 19],
  ampjack: [8, 237, 24],
  flashstep: [10, 237, 24],
  selene: [12, 238, 25],
  umbra: [11, 238, 18],
  lumen: [8, 237, 15],
  tsuki: [9, 234, 26]
});

function sha256(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function readRgbaPng(filename) {
  const buffer = fs.readFileSync(filename);
  const chunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    chunks.push({ type, data: buffer.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  const header = chunks.find(chunk => chunk.type === 'IHDR')?.data;
  if (!header || header[8] !== 8 || header[9] !== 6) {
    throw new Error(`Expected an 8-bit RGBA PNG: ${filename}`);
  }
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  if (width !== 1024 || height !== 1024) {
    throw new Error(`Expected 1024x1024: ${filename} is ${width}x${height}`);
  }
  const source = zlib.inflateSync(Buffer.concat(
    chunks.filter(chunk => chunk.type === 'IDAT').map(chunk => chunk.data)
  ));
  const stride = width * 4;
  const rgba = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = source[y * (stride + 1)];
    const input = source.subarray((y * (stride + 1)) + 1, (y + 1) * (stride + 1));
    const output = rgba.subarray(y * stride, (y + 1) * stride);
    const previous = y ? rgba.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? output[x - 4] : 0;
      const above = previous ? previous[x] : 0;
      const upperLeft = previous && x >= 4 ? previous[x - 4] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? above
            : filter === 3 ? Math.floor((left + above) / 2)
              : paeth(left, above, upperLeft);
      output[x] = (input[x] + predictor) & 255;
    }
  }
  return {
    width,
    height,
    rgba,
    chunkTypes: chunks.map(chunk => chunk.type)
  };
}

function round(value) {
  return Number(value.toFixed(4));
}

function analyzeImage(filename) {
  const image = readRgbaPng(filename);
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  let visible = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = image.rgba[((y * image.width) + x) * 4 + 3];
      if (alpha <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (alpha > 200) visible += 1;
    }
  }
  if (maxX < 0 || maxY < 0) throw new Error(`No visible subject: ${filename}`);
  const trimRect = {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
  const centerX = (minX + maxX) / 2;
  return {
    trimRect,
    pivot: {
      x: round(centerX / image.width),
      y: round(maxY / image.height)
    },
    hitAnchor: {
      x: round(centerX / image.width),
      y: round((minY + (trimRect.height * 0.43)) / image.height)
    },
    effectAnchor: {
      x: round((minX + (trimRect.width * 0.74)) / image.width),
      y: round((minY + (trimRect.height * 0.46)) / image.height)
    },
    opaqueFraction: round(visible / (image.width * image.height))
  };
}

function publicAssetToFilename(publicPath) {
  return path.join(pluginDir, publicPath.replace(/^\/plugins\/streamalchemy\//, ''));
}

function buildAsset(template, stage) {
  const publicPath = getEvolutionAssetPath(template, stage);
  const filename = publicAssetToFilename(publicPath);
  if (!fs.existsSync(filename)) throw new Error(`Missing furry form: ${filename}`);
  const analysis = analyzeImage(filename);
  const asset = {
    templateId: template.templateId,
    name: template.name,
    stage,
    element: template.element,
    species: template.species,
    assetPath: publicPath.replace('/plugins/streamalchemy/', ''),
    promptVersion: stage === 1 ? 'furry-v1-chat' : 'furry-v1.5-evolution-chat',
    generator: 'OpenAI Chat image generation',
    dimensions: [1024, 1024],
    sha256: sha256(filename),
    ...analysis,
    facing: 'center'
  };
  if (stage === 1) asset.backgroundRgb = BASE_BACKGROUND_RGB[template.templateId];
  return asset;
}

function main() {
  const assets = TEMPLATE_CATALOG.flatMap(template => [1, 2, 3]
    .map(stage => buildAsset(template, stage)));
  const manifest = {
    schemaVersion: 2,
    assetVersion: 'furry-1.5.0',
    pack: 'furry',
    productionMode: 'bundled-only',
    promptVersion: 'furry-v1.5-evolution-chat',
    generator: 'OpenAI Chat image generation',
    assets
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

main();
