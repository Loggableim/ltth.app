'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const matrixPath = path.join(ROOT, 'docs/coordination/obs-104-acceptance-matrix.json');
const transferPath = path.join(ROOT, 'docs/coordination/obs-sidekick-pilot-transfer-manifest.json');
const matrixBytes = fs.readFileSync(matrixPath);
const transferBytes = fs.readFileSync(transferPath);
const matrix = JSON.parse(matrixBytes.toString('utf8'));
const transfer = JSON.parse(transferBytes.toString('utf8'));
const guestPaths = new Set(transfer.effectiveTransfer.files.map((entry) => entry.path));
const plugins = [...new Set(matrix.items.map((item) => item.plugin))].sort();
const locales = [...matrix.locales];

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function record(filePath, guestPath) {
  const absolutePath = path.join(ROOT, filePath);
  const contents = fs.readFileSync(absolutePath);
  return {
    path: filePath.replace(/\\/g, '/'),
    bytes: contents.length,
    sha256: sha256(contents),
    guestTransferPath: guestPath,
    includedInCurrentSidekickTransfer: guestPaths.has(guestPath)
  };
}

function resolveHtmlAsset(fromFile, reference) {
  const clean = reference.split(/[?#]/)[0];
  if (/^(?:https?:|\/\/)/i.test(clean)) return { external: clean };
  if (clean.startsWith('/plugins/viewer-leaderboard/')) {
    return { filePath: `app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/${clean.slice('/plugins/viewer-leaderboard/'.length)}` };
  }
  if (clean.startsWith('/plugins/')) return { filePath: `app/plugins/${clean.slice('/plugins/'.length)}` };
  if (clean === '/socket.io/socket.io.js') return { filePath: 'app/node_modules/socket.io/client-dist/socket.io.js' };
  if (clean === 'default-config.js' && fromFile === 'app/plugins/flame-overlay/renderer/index.html') {
    return { filePath: 'app/plugins/flame-overlay/default-config.js', route: '/flame-overlay/default-config.js' };
  }
  if (clean === '/flame-overlay/default-config.js') return { filePath: 'app/plugins/flame-overlay/default-config.js' };
  if (clean.startsWith('/flame-overlay/')) return { filePath: `app/plugins/flame-overlay/${clean.slice('/flame-overlay/'.length)}` };
  if (clean.startsWith('/openshock/')) return { filePath: `app/plugins/openshock/overlay/${clean.slice('/openshock/'.length)}` };
  if (clean.startsWith('/quiz-show/')) return { filePath: `app/plugins/quiz-show/${clean.slice('/quiz-show/'.length)}` };
  if (clean === '/visual-fx-frame-webgpu/default-config.js') return { filePath: 'app/plugins/visual-fx-frame-webgpu/default-config.js' };
  if (clean.startsWith('/visual-fx-frame-webgpu/')) {
    return { filePath: `app/plugins/visual-fx-frame-webgpu/renderer/${clean.slice('/visual-fx-frame-webgpu/'.length)}` };
  }
  if (clean.startsWith('/overlay/talking-heads/')) {
    return { filePath: `app/plugins/talking-heads/${clean.slice('/overlay/talking-heads/'.length)}` };
  }
  if (clean.startsWith('/js/') || clean.startsWith('/css/') || clean.startsWith('/fonts/')) {
    return { filePath: `app/public/${clean.slice(1)}` };
  }
  if (clean.startsWith('/')) return { filePath: `app/public/${clean.slice(1)}` };
  return { filePath: path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), clean)) };
}

const evidenceSourcePaths = [...new Set(matrix.items.flatMap((item) => item.evidenceSources))].sort();
const evidenceSources = evidenceSourcePaths.map((filePath) => {
  const guestPath = `pilot/${filePath}`;
  return record(filePath, guestPath);
});
const localeAssets = plugins.flatMap((plugin) => locales.map((locale) => {
  const filePath = `app/plugins/${plugin}/locales/${locale}.json`;
  return record(filePath, `pilot/${filePath}`);
}));

const htmlReferences = [];
for (const filePath of evidenceSourcePaths.filter((item) => /\.html?$/i.test(item))) {
  const html = fs.readFileSync(path.join(ROOT, filePath), 'utf8');
  for (const match of html.matchAll(/\b(?:src|href)\s*=\s*['"]([^'"]+)['"]/gi)) {
    const resolved = resolveHtmlAsset(filePath, match[1]);
    if (resolved.external) {
      htmlReferences.push({ from: filePath, reference: match[1], kind: 'external', status: 'must-remain-blocked-offline' });
      continue;
    }
    const file = record(resolved.filePath, `pilot/${resolved.filePath}`);
    htmlReferences.push({
      from: filePath,
      reference: match[1],
      kind: 'local-static',
      path: file.path,
      bytes: file.bytes,
      sha256: file.sha256,
      includedInCurrentSidekickTransfer: file.includedInCurrentSidekickTransfer,
      ...(resolved.route ? { route: resolved.route } : {})
    });
  }
}

const anchors = [
  'app/server.js',
  'app/package.json',
  'app/package-lock.json',
  'app/routes/plugin-routes.js',
  'app/modules/plugin-loader.js',
  'app/modules/public-overlay-registry.js',
  'app/public/js/i18n-client.js',
  'app/node_modules/socket.io/dist/index.js',
  'app/node_modules/socket.io/client-dist/socket.io.js',
  'app/node_modules/socket.io-client/dist/socket.io.js'
].map((filePath) => record(filePath, `pilot/${filePath}`));

const externalReferences = htmlReferences.filter((item) => item.kind === 'external');
const localAssetRefs = htmlReferences.filter((item) => item.kind === 'local-static');
const distinctStaticPaths = new Map(localAssetRefs.map((item) => [item.path, item]));
const sourceAndAssetPaths = new Set([...evidenceSourcePaths, ...distinctStaticPaths.keys()]);
const sourceAndAssetBytes = [...sourceAndAssetPaths].reduce((total, filePath) => total + fs.statSync(path.join(ROOT, filePath)).size, 0);
const statuses = Object.fromEntries([...new Set(matrix.items.map((item) => item.status))].sort().map((status) => [status, matrix.items.filter((item) => item.status === status).length]));

const output = {
  schemaVersion: 1,
  status: 'read-only-source-inventory-no-payload-built-no-guest-run',
  matrix: {
    path: 'docs/coordination/obs-104-acceptance-matrix.json',
    sha256: sha256(matrixBytes),
    cases: matrix.items.length,
    plugins: plugins.length,
    locales,
    statusCounts: statuses
  },
  currentSidekickTransfer: {
    path: 'docs/coordination/obs-sidekick-pilot-transfer-manifest.json',
    sourceManifestSha256: sha256(transferBytes),
    effectiveFiles: transfer.effectiveTransfer.files.length,
    includes104EvidenceSources: evidenceSources.some((item) => item.includedInCurrentSidekickTransfer),
    includes104LocaleAssets: localeAssets.some((item) => item.includedInCurrentSidekickTransfer),
    existingNormalizedContractSha256: 'f9750454f55466d648197ea74c536d716cebde8491b3a1d35e5109993413ed5b',
    existingNormalizedFileCount: 2651,
    existingNormalizedBytes: 490389602
  },
  rendererFiles: {
    evidenceSourceCount: evidenceSources.length,
    evidenceSourceBytes: evidenceSources.reduce((total, item) => total + item.bytes, 0),
    evidenceSources,
    directLocalHtmlAssetReferenceCount: localAssetRefs.length,
    distinctDirectLocalHtmlAssets: distinctStaticPaths.size,
    directLocalHtmlAssetBytes: [...distinctStaticPaths.values()].reduce((total, item) => total + item.bytes, 0),
    sourcePlusDirectAssetUnionCount: sourceAndAssetPaths.size,
    sourcePlusDirectAssetUnionBytes: sourceAndAssetBytes,
    directLocalHtmlAssets: [...distinctStaticPaths.values()].sort((a, b) => a.path.localeCompare(b.path)),
    externalHtmlReferences: externalReferences
  },
  localeAssets: {
    expectedCount: plugins.length * locales.length,
    foundCount: localeAssets.length,
    bytes: localeAssets.reduce((total, item) => total + item.bytes, 0),
    files: localeAssets
  },
  runtimeAnchors: anchors,
  closureLimits: [
    'HTML src/href references only; JavaScript imports, CSS url(), dynamic asset construction, API routes and socket producers require separate review.',
    'The 100-case matrix has no OBS runner; the existing run-pilot.js is Sidekick-specific.',
    'The existing documentation-capture fixture links modules and node_modules to the host checkout and is not a ready guest transfer bundle.',
    'Do not include app/.env, user_configs, logs, archives, databases or other user/runtime state in a product payload.'
  ]
};

if (matrix.items.length !== 100 || plugins.length !== 25 || localeAssets.length !== 100) {
  throw new Error('100-case renderer inventory counts do not match the current acceptance matrix');
}
if (evidenceSources.some((item) => item.includedInCurrentSidekickTransfer)
  || localeAssets.some((item) => item.includedInCurrentSidekickTransfer)) {
  throw new Error('Current Sidekick transfer unexpectedly includes 100-case product sources/locales');
}
if (localAssetRefs.some((item) => !fs.existsSync(path.join(ROOT, item.path)))) {
  throw new Error('A direct local HTML asset reference did not resolve to a source file');
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
