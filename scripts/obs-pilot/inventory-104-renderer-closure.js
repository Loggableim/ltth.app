'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = fs.realpathSync(path.resolve(__dirname, '../..'));
const matrixPath = path.join(ROOT, 'docs/coordination/obs-104-acceptance-matrix.json');
const matrixBytes = fs.readFileSync(matrixPath);
const matrix = JSON.parse(matrixBytes.toString('utf8'));
const LOCALES = matrix.locales;
const STATIC_EXTENSIONS = new Set(['.css', '.js', '.mjs', '.cjs', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.woff', '.woff2', '.ttf', '.otf', '.mp3', '.wav', '.ogg', '.webm', '.mp4']);
const SENSITIVE_PATH = /(?:^|\/)(?:\.env(?:\.|$)|user_configs?|profiles?|logs?|archive|archives|database|databases|uploads?|cache|credentials?)(?:\/|$)|(?:^|\/)[^/]*\.(?:sqlite3?|db)(?:$|\/)/i;

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function safeRecord(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.split('/').includes('..')) {
    throw new Error(`Unsafe path in renderer closure: ${relativePath}`);
  }
  if (SENSITIVE_PATH.test(normalized)) throw new Error(`Sensitive user/runtime path excluded from renderer closure: ${normalized}`);
  const absolute = path.resolve(ROOT, ...normalized.split('/'));
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) throw new Error(`Reparse/symlink dependency is not portable: ${normalized}`);
  if (!stat.isFile()) throw new Error(`Renderer closure path is not a regular file: ${normalized}`);
  const real = fs.realpathSync(absolute);
  const relativeReal = path.relative(ROOT, real);
  if (relativeReal === '..' || relativeReal.startsWith(`..${path.sep}`) || path.isAbsolute(relativeReal)) {
    throw new Error(`Renderer closure escapes repository root: ${normalized}`);
  }
  const bytes = fs.readFileSync(real);
  return { path: normalized, bytes: bytes.length, sha256: sha256(bytes), contents: bytes.toString('utf8') };
}

function routeToFile(fromFile, reference, { importPath = false } = {}) {
  const withoutQuery = reference.split(/[?#]/, 1)[0];
  if (!withoutQuery || /^(?:data:|blob:|javascript:|mailto:|tel:|#)/i.test(withoutQuery)) return { ignored: true };
  if (/^(?:https?:)?\/\//i.test(withoutQuery)) return { external: reference };
  if (importPath && !withoutQuery.startsWith('.') && !withoutQuery.startsWith('/')) return { unresolved: reference, reason: 'bare-module-import' };

  let localPath;
  if (withoutQuery.startsWith('/plugins/viewer-leaderboard/')) {
    localPath = `app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/${withoutQuery.slice('/plugins/viewer-leaderboard/'.length)}`;
  } else if (withoutQuery.startsWith('/plugins/')) {
    localPath = `app/plugins/${withoutQuery.slice('/plugins/'.length)}`;
  } else if (withoutQuery === '/socket.io/socket.io.js') {
    localPath = 'app/node_modules/socket.io/client-dist/socket.io.js';
  } else if (fromFile === 'app/plugins/flame-overlay/renderer/index.html' && withoutQuery === 'default-config.js') {
    localPath = 'app/plugins/flame-overlay/default-config.js';
  } else if (fromFile === 'app/plugins/visual-fx-frame-webgpu/renderer/index.html' && withoutQuery === '/visual-fx-frame-webgpu/default-config.js') {
    localPath = 'app/plugins/visual-fx-frame-webgpu/default-config.js';
  } else if (withoutQuery.startsWith('/flame-overlay/')) {
    localPath = `app/plugins/flame-overlay/${withoutQuery.slice('/flame-overlay/'.length)}`;
  } else if (withoutQuery.startsWith('/openshock/')) {
    localPath = `app/plugins/openshock/overlay/${withoutQuery.slice('/openshock/'.length)}`;
  } else if (withoutQuery.startsWith('/quiz-show/')) {
    localPath = `app/plugins/quiz-show/${withoutQuery.slice('/quiz-show/'.length)}`;
  } else if (withoutQuery.startsWith('/visual-fx-frame-webgpu/')) {
    localPath = `app/plugins/visual-fx-frame-webgpu/renderer/${withoutQuery.slice('/visual-fx-frame-webgpu/'.length)}`;
  } else if (withoutQuery.startsWith('/overlay/talking-heads/')) {
    localPath = `app/plugins/talking-heads/${withoutQuery.slice('/overlay/talking-heads/'.length)}`;
  } else if (withoutQuery.startsWith('/js/') || withoutQuery.startsWith('/css/') || withoutQuery.startsWith('/fonts/')) {
    localPath = `app/public/${withoutQuery.slice(1)}`;
  } else if (withoutQuery.startsWith('/') && /\.(?:css|m?js|cjs|json|svg|png|jpe?g|webp|gif|woff2?|ttf|otf|mp3|wav|ogg|webm|mp4)(?:[?#]|$)/i.test(withoutQuery)) {
    localPath = `app/public/${withoutQuery.slice(1)}`;
  } else if (withoutQuery.startsWith('/')) {
    return { unresolved: reference, reason: 'unmapped-root-route' };
  } else if (importPath || /\.(?:css|m?js|cjs|json|svg|png|jpe?g|webp|gif|woff2?|ttf|otf|mp3|wav|ogg|webm|mp4)(?:[?#]|$)/i.test(withoutQuery)) {
    localPath = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), withoutQuery));
  } else {
    return { ignored: true };
  }
  return { path: path.posix.normalize(localPath) };
}

function extractAssetReferences(file) {
  const found = [];
  const ext = path.posix.extname(file.path).toLowerCase();
  if (ext === '.html' || ext === '.htm') {
    for (const match of file.contents.matchAll(/\b(src|href)\s*=\s*(['"])(.*?)\2/gi)) {
      const reference = match[3];
      const targetExt = path.posix.extname(reference.split(/[?#]/, 1)[0]).toLowerCase();
      if (match[1].toLowerCase() === 'src' || STATIC_EXTENSIONS.has(targetExt)) {
        found.push({ reference, kind: `html-${match[1].toLowerCase()}` });
      }
    }
    for (const match of file.contents.matchAll(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi)) found.push({ reference: match[2], kind: 'inline-css-url' });
  } else if (ext === '.css') {
    for (const match of file.contents.matchAll(/@import\s+(?:url\()?\s*(['"])(.*?)\1\s*\)?/gi)) found.push({ reference: match[2], kind: 'css-import' });
    for (const match of file.contents.matchAll(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi)) found.push({ reference: match[2], kind: 'css-url' });
  } else if (['.js', '.mjs', '.cjs'].includes(ext)) {
    for (const match of file.contents.matchAll(/\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?(['"])(.*?)\1|\bimport\(\s*(['"])(.*?)\3\s*\)|\brequire\(\s*(['"])(.*?)\5\s*\)/g)) {
      const reference = match[2] || match[4] || match[6];
      if (reference) found.push({ reference, kind: 'static-js-import', importPath: true });
    }
    for (const match of file.contents.matchAll(/(?:src|href|\.src|backgroundImage)\s*(?:=|:)\s*(['"])(.*?)\1/g)) {
      const reference = match[2];
      if (/\.(?:css|m?js|cjs|json|svg|png|jpe?g|webp|gif|woff2?|ttf|otf|mp3|wav|ogg|webm|mp4)(?:[?#]|$)/i.test(reference)) {
        found.push({ reference, kind: 'static-js-asset' });
      }
    }
  }
  return found;
}

function resolveStaticFile(relativePath) {
  if (path.posix.isAbsolute(relativePath) || relativePath.split('/').includes('..')) {
    throw new Error(`Local dependency escapes repository root: ${relativePath}`);
  }
  const candidates = [relativePath];
  if (!path.posix.extname(relativePath)) {
    for (const extension of ['.js', '.mjs', '.cjs', '.json', '.css']) candidates.push(`${relativePath}${extension}`);
    for (const extension of ['.js', '.mjs', '.cjs', '.json']) candidates.push(`${relativePath}/index${extension}`);
  }
  const existing = [...new Set(candidates.filter((candidate) => fs.existsSync(path.resolve(ROOT, ...candidate.split('/')))))];
  if (existing.length === 1) return existing[0];
  if (existing.length > 1) throw new Error(`Ambiguous extensionless local dependency: ${relativePath}`);
  throw new Error(`Local reference does not resolve to a source file: ${relativePath}`);
}

function extractContracts(files) {
  const http = [];
  const sockets = new Map();
  const external = [];
  const unknown = [];
  const unknownDisposition = {
    'dynamic-http-path': 'Use only a fixed synthetic route pattern with reserved fixture identifiers; live/server data routes remain excluded.',
    'dynamic-dom-asset-reference': 'Runtime asset path is not closed; synthetic fixtures must allow only pinned local paths and reject remote, data, profile, or user-provided URLs.',
    'dynamic-audio-runtime': 'Audio remains disabled; no playback is invoked by the source inventory or CPU fixture.',
    'gpu-runtime-requires-separate-runtime-review': 'GPU behavior is not established by static closure or CPU-only tests; keep the GPU case blocked pending explicit runtime/fallback review.',
    'computed-js-import': 'Computed module targets are unknown; block unless each runtime target is separately allowlisted and hashed.',
    'dynamic-runtime-resource': 'Dynamically created script/worker/socket resource is unknown; block until its exact local path or loopback endpoint is pinned.',
    'non-fetch-http-consumer-requires-manual-review': 'HTTP behavior bypassing fetch inspection requires separate source review before fixture allowlisting.'
  };
  const addUnknown = (file, category, matchIndex, sample) => {
    const line = file.contents.slice(0, Math.max(0, matchIndex)).split(/\r?\n/).length;
    unknown.push({
      source: file.path,
      line,
      category,
      ...(sample ? { sample } : {}),
      disposition: unknownDisposition[category] || 'Not resolved by this static crawler; keep blocked until exact source and data contract are reviewed.'
    });
  };
  for (const file of files) {
    if (!/\.(?:html?|m?js|cjs)$/i.test(file.path)) continue;
    const source = file.contents;
    for (const match of source.matchAll(/\bfetch\(\s*(['"`])([^'"`]*?)\1/g)) {
      const value = match[2];
      http.push({ source: file.path, method: 'fetch', path: value, static: !value.includes('${') });
      if (value.includes('${')) addUnknown(file, 'dynamic-http-path', match.index, value.slice(0, 100));
      if (/^(?:https?:)?\/\//i.test(value)) external.push({ source: file.path, reference: value, status: 'blocked-or-unverified-offline' });
    }
    for (const match of source.matchAll(/\b(?:socket|io|window\.socket)\.(on|once|emit|off)\(\s*(['"])(.*?)\2/g)) {
      const action = match[1];
      const event = match[3];
      if (!sockets.has(event)) sockets.set(event, { event, consumerSources: [], actions: [] });
      const entry = sockets.get(event);
      if (!entry.consumerSources.includes(file.path)) entry.consumerSources.push(file.path);
      if (!entry.actions.includes(action)) entry.actions.push(action);
    }
    for (const match of source.matchAll(/\b(?:listen|on)\(\s*(['"])([a-zA-Z0-9_.:-]+)\1\s*,/g)) {
      const event = match[2];
      if (!sockets.has(event)) sockets.set(event, { event, consumerSources: [], actions: [] });
      const entry = sockets.get(event);
      if (!entry.consumerSources.includes(file.path)) entry.consumerSources.push(file.path);
      if (!entry.actions.includes('on-via-handler')) entry.actions.push('on-via-handler');
    }
    for (const match of source.matchAll(/\b(?:import|require)\s*\(\s*(?!['"])/g)) addUnknown(file, 'computed-js-import', match.index);
    for (const match of source.matchAll(/\b(?:createElement\(['"]script['"]\)|new\s+Worker\s*\(|new\s+WebSocket\s*\(|new\s+EventSource\s*\()/g)) addUnknown(file, 'dynamic-runtime-resource', match.index);
    for (const match of source.matchAll(/\.(?:src|backgroundImage)\s*=|setAttribute\(\s*['"](?:src|href)['"]/g)) addUnknown(file, 'dynamic-dom-asset-reference', match.index);
    for (const match of source.matchAll(/\b(?:new\s+Audio\s*\(|\.play\s*\(\s*\)|AudioContext|webkitAudioContext)\b/g)) addUnknown(file, 'dynamic-audio-runtime', match.index);
    for (const match of source.matchAll(/\bnavigator\.gpu\b|\bWebGL(?:2)?RenderingContext\b|\bgetContext\(\s*['"]webgl/gi)) addUnknown(file, 'gpu-runtime-requires-separate-runtime-review', match.index);
    for (const match of source.matchAll(/\bXMLHttpRequest\b|\baxios\.|\$\.ajax\s*\(/g)) addUnknown(file, 'non-fetch-http-consumer-requires-manual-review', match.index);
  }
  return {
    httpConsumers: http,
    socketEvents: [...sockets.values()].map((entry) => ({ ...entry, actions: entry.actions.sort(), consumerSources: entry.consumerSources.sort() })).sort((a, b) => a.event.localeCompare(b.event)),
    externalReferences: external,
    unresolvedDynamicBehavior: [...new Map(unknown.map((item) => [`${item.source}:${item.category}:${item.sample || ''}:${item.line}`, item])).values()]
  };
}

function scanPlugin(plugin, pluginCases) {
  const roots = [...new Set(pluginCases.flatMap((item) => {
    const entryHtml = [...String(item.entry || '').matchAll(/app\/[a-zA-Z0-9_./-]+\.html?/g)].map((match) => match[0]);
    return entryHtml.length ? entryHtml : item.evidenceSources.filter((value) => /\.html?$/i.test(value));
  }))].sort();
  const visited = new Map();
  const edges = [];
  const unresolved = [];
  const queue = roots.map((relativePath) => ({ relativePath, role: 'matrix-evidence-root' }));
  while (queue.length) {
    const current = queue.shift();
    if (visited.has(current.relativePath)) continue;
    let file;
    try {
      file = safeRecord(current.relativePath);
    } catch (error) {
      unresolved.push({ from: current.relativePath, status: 'blocked', reason: error.message });
      continue;
    }
    visited.set(file.path, { path: file.path, bytes: file.bytes, sha256: file.sha256, roles: [current.role] });
    if (file.path === 'app/node_modules/socket.io/client-dist/socket.io.js') {
      visited.get(file.path).roles.push('prebuilt-browser-bundle-terminal; internal conditional/module refs not treated as browser runtime imports');
      continue;
    }
    for (const reference of extractAssetReferences(file)) {
      const resolved = routeToFile(file.path, reference.reference, { importPath: reference.importPath });
      if (resolved.ignored) continue;
      if (resolved.external) {
        edges.push({ from: file.path, reference: reference.reference, kind: reference.kind, status: 'external-blocked-or-unverified-offline' });
        continue;
      }
      if (resolved.unresolved) {
        unresolved.push({ from: file.path, reference: reference.reference, kind: reference.kind, status: 'unknown-unmapped', reason: resolved.reason });
        continue;
      }
      try {
        const dependencyPath = resolveStaticFile(resolved.path);
        const dependency = safeRecord(dependencyPath);
        edges.push({ from: file.path, to: dependency.path, reference: reference.reference, kind: reference.kind, status: 'local-static-resolved' });
        if (visited.has(dependency.path)) visited.get(dependency.path).roles.push('transitive-static-dependency');
        else queue.push({ relativePath: dependency.path, role: 'transitive-static-dependency' });
      } catch (error) {
        unresolved.push({ from: file.path, reference: reference.reference, kind: reference.kind, status: 'blocked-or-unresolved', reason: error.message });
      }
    }
  }
  const localeAssets = LOCALES.map((locale) => {
    const file = safeRecord(`app/plugins/${plugin}/locales/${locale}.json`);
    return { path: file.path, bytes: file.bytes, sha256: file.sha256, locale };
  });
  for (const entry of [...visited.values()]) entry.roles = [...new Set(entry.roles)].sort();
  const files = [...visited.values()].sort((a, b) => a.path.localeCompare(b.path));
  const contracts = extractContracts(files.filter((file) => !file.path.startsWith('app/node_modules/')).map((file) => safeRecord(file.path)));
  const filesByKind = {
    html: files.filter((file) => /\.html?$/i.test(file.path)).map((file) => file.path),
    scripts: files.filter((file) => /\.(?:m?js|cjs)$/i.test(file.path)).map((file) => file.path),
    stylesheets: files.filter((file) => /\.css$/i.test(file.path)).map((file) => file.path),
    imagesAndFonts: files.filter((file) => /\.(?:svg|png|jpe?g|webp|gif|woff2?|ttf|otf)$/i.test(file.path)).map((file) => file.path),
    audioAndVideo: files.filter((file) => /\.(?:mp3|wav|ogg|webm|mp4)$/i.test(file.path)).map((file) => file.path)
  };
  return {
    plugin,
    caseIds: pluginCases.map((item) => item.caseId).sort(),
    rendererRoots: roots,
    supportingSourceProvenance: [...new Set(pluginCases.flatMap((item) => item.evidenceSources).filter((source) => !visited.has(source)))].sort().map((source) => ({
      path: source,
      includedInRendererClosure: false,
      status: 'matrix-provenance-only; plugin/backend producer behavior not executed or bundled'
    })),
    localeAssets,
    localStaticClosure: files,
    localStaticFilesByKind: filesByKind,
    rendererLocaleFiles: localeAssets.map(({ path, locale, bytes, sha256 }) => ({ path, locale, bytes, sha256 })),
    localStaticClosureBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    dependencyEdges: edges,
    unresolvedOrBlockedReferences: unresolved,
    consumerContracts: contracts,
    caseContracts: pluginCases.map((item) => ({
      caseId: item.caseId,
      locale: item.locale,
      entry: item.entry,
      overlayUrl: item.overlayUrl,
      queryContract: item.queryContract || null,
      trigger: item.trigger || null,
      expectedUpdate: item.update || null,
      negativeContract: item.negative || null,
      gpuPath: item.gpu || null,
      audioPath: item.audio || null,
      externalDependencyClaim: item.external || null,
      status: item.status,
      evidenceSources: item.evidenceSources
    })),
    scopeWarnings: [
      'Closure follows quoted HTML src/href static file references, CSS @import/url(), and literal JS import/require asset specifiers only.',
      'Computed paths, template-based assets, DOM-generated assets, runtime API/socket producers and full plugin startup effects are not proven by this inventory.',
      'Matrix evidenceSources that are backend/plugin producer files are provenance inputs, not renderer roots, and are intentionally not pulled into this renderer-only closure.',
      'Locale files are recorded as case data; this does not prove how the product server merges common and plugin locale dictionaries.'
    ]
  };
}

const pluginNames = [...new Set(matrix.items.map((item) => item.plugin))].sort();
const plugins = pluginNames.map((plugin) => scanPlugin(plugin, matrix.items.filter((item) => item.plugin === plugin)));
const dynamicRiskRegister = [...new Map(plugins.flatMap((plugin) => plugin.consumerContracts.unresolvedDynamicBehavior.map((risk) => ({ ...risk, affectedPlugins: [plugin.plugin] })))
  .map((risk) => [`${risk.source}:${risk.category}:${risk.sample || ''}:${risk.line}`, risk])).values()];
const coarseDynamicGroupCount = new Set(plugins.flatMap((plugin) => plugin.consumerContracts.unresolvedDynamicBehavior
  .map((risk) => `${risk.source}:${risk.category}:${risk.sample || ''}`))).size;
for (const risk of dynamicRiskRegister) {
  risk.affectedPlugins = [...new Set(plugins.flatMap((plugin) => plugin.consumerContracts.unresolvedDynamicBehavior
    .filter((item) => item.source === risk.source && item.category === risk.category && item.sample === risk.sample && item.line === risk.line)
    .map(() => plugin.plugin)))].sort();
}
const output = {
  schemaVersion: 1,
  status: 'static-source-closure-inventory-only-no-payload-no-listener-no-obs',
  generatedAtUtc: new Date().toISOString(),
  matrix: { path: 'docs/coordination/obs-104-acceptance-matrix.json', sha256: sha256(matrixBytes), caseCount: matrix.items.length, pluginCount: pluginNames.length, locales: LOCALES },
  inventoryMethod: {
    hash: 'SHA-256 of every regular local file recorded after repository-root containment and symlink/reparse-point rejection',
    dependencyCoverage: 'quoted HTML src/href; CSS @import/url(); literal JS import/require specifiers; HTTP fetch literals; socket on/once/emit/off string literals',
    noListener: true,
    noFileCopy: true,
    exclusions: ['.env', 'user_configs', 'logs', 'archives', 'databases', 'uploads', 'cache', 'credentials', 'profiles and user runtime data']
  },
  pluginCount: plugins.length,
  caseCount: matrix.items.length,
  coarseDynamicGroupCount,
  dynamicRiskRegisterCount: dynamicRiskRegister.length,
  dynamicRiskRegister,
  plugins
};

if (plugins.length !== 26 || matrix.items.length !== 104) throw new Error('Expected the exact current 26-plugin / 104-case matrix');
if (plugins.some((plugin) => plugin.localStaticClosure.some((file) => SENSITIVE_PATH.test(file.path)))) throw new Error('Sensitive path entered renderer closure');

const outputArgument = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
const outputPath = outputArgument ? path.resolve(outputArgument) : path.join(ROOT, 'docs/coordination/obs-104-renderer-closure.json');
const rootRelative = path.relative(ROOT, outputPath);
if (rootRelative === '..' || rootRelative.startsWith(`..${path.sep}`) || path.isAbsolute(rootRelative)) {
  throw new Error('Output path must remain inside the repository');
}
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, { flag: process.argv.includes('--replace') ? 'w' : 'wx' });
process.stdout.write(`${JSON.stringify({ status: output.status, output: path.relative(ROOT, outputPath), plugins: output.pluginCount, cases: output.caseCount, coarseDynamicGroups: output.coarseDynamicGroupCount, lineSpecificDynamicRisks: output.dynamicRiskRegisterCount, dynamicRiskFamilyOccurrences: plugins.reduce((sum, item) => sum + item.consumerContracts.unresolvedDynamicBehavior.length, 0), unresolved: plugins.reduce((sum, item) => sum + item.unresolvedOrBlockedReferences.length, 0), external: plugins.reduce((sum, item) => sum + item.consumerContracts.externalReferences.length + item.dependencyEdges.filter((edge) => edge.status.startsWith('external-')).length, 0) }, null, 2)}\n`);
