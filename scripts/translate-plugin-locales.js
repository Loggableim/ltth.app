'use strict';

// Development-time migration only. The application never calls a translation
// service: this script writes reviewed, static locale JSON files.
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  LOCALES,
  applyLocaleValue,
  collectSharedUserFacingEntries,
  parseTranslationResponse,
  protectTokens,
  restoreTokens,
  splitBatchTranslation
} = require('./lib/plugin-locale-translation');

const pluginsRoot = path.join(__dirname, '..', 'app', 'plugins');
const cachePath = path.join(os.tmpdir(), 'ltth-plugin-locale-translation-cache.json');
const limitArg = process.argv.find((argument) => argument.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.slice('--limit='.length)) : Number.POSITIVE_INFINITY;
const concurrencyArg = process.argv.find((argument) => argument.startsWith('--concurrency='));
const concurrency = Math.max(1, Math.min(6, Number(concurrencyArg ? concurrencyArg.slice('--concurrency='.length) : 3)) || 3);
const dryRun = process.argv.includes('--dry-run');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch {
    return {};
  }
}

function writeCache(cache) {
  fs.writeFileSync(cachePath, `${JSON.stringify(cache)}\n`, 'utf8');
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function translatePayload(text, locale) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'auto');
  url.searchParams.set('tl', locale);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);

  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const translation = parseTranslationResponse(await response.json());
      if (!translation.trim()) throw new Error('empty translation response');
      return translation;
    } catch (error) {
      lastError = error;
      await sleep(350 * (attempt + 1));
    }
  }
  throw new Error(`Could not translate to ${locale}: ${lastError.message}`);
}

async function translateBatch(tasks, locale, cache) {
  const prepared = tasks.map((task) => {
    const protectedValue = protectTokens(task.value);
    return { ...task, ...protectedValue, cacheKey: `${locale}\u0000${protectedValue.text}` };
  });
  const translated = new Map();
  const pending = [];
  prepared.forEach((task) => {
    if (cache[task.cacheKey]) {
      translated.set(task.value, restoreTokens(cache[task.cacheKey], task.tokens));
    } else {
      pending.push(task);
    }
  });

  while (pending.length) {
    const batch = [];
    let payloadLength = 0;
    while (pending.length && batch.length < 16) {
      const candidate = pending[0];
      const separatorLength = batch.length ? 40 : 0;
      if (batch.length && payloadLength + separatorLength + candidate.text.length > 3200) break;
      batch.push(pending.shift());
      payloadLength += separatorLength + candidate.text.length;
    }
    if (!batch.length) batch.push(pending.shift());

    const separators = batch.slice(0, -1).map((_, index) => `__LTTH_BATCH_${index}__`);
    const payload = batch.map((task, index) => (index < separators.length
      ? `${task.text}\n${separators[index]}\n`
      : task.text)).join('');
    const response = await translatePayload(payload, locale);
    const values = splitBatchTranslation([[ [response] ]], separators);
    if (values.length !== batch.length) {
      throw new Error(`Translation batch returned ${values.length} values for ${batch.length} source values.`);
    }
    batch.forEach((task, index) => {
      cache[task.cacheKey] = values[index];
      translated.set(task.value, restoreTokens(values[index], task.tokens));
    });
  }
  return translated;
}

async function mapConcurrent(values, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

async function main() {
  const cache = readCache();
  const pluginIds = fs.readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(pluginsRoot, entry.name, 'locales')))
    .map((entry) => entry.name)
    .sort();
  const work = [];
  const bundles = new Map();

  pluginIds.forEach((pluginId) => {
    const localesDir = path.join(pluginsRoot, pluginId, 'locales');
    const localePaths = Object.fromEntries(LOCALES.map((locale) => [locale, path.join(localesDir, `${locale}.json`)]));
    if (LOCALES.some((locale) => !fs.existsSync(localePaths[locale]))) return;
    const locales = Object.fromEntries(LOCALES.map((locale) => [locale, readJson(localePaths[locale])]));
    bundles.set(pluginId, { locales, localePaths });
    collectSharedUserFacingEntries(locales).forEach((entry) => {
      LOCALES.forEach((locale) => work.push({ pluginId, locale, ...entry }));
    });
  });

  const selected = work.slice(0, limit);
  if (dryRun) {
    console.log(`Would translate ${selected.length} static locale values across ${bundles.size} plugin bundles.`);
    return;
  }

  const groups = new Map();
  selected.forEach((task) => {
    const groupKey = `${task.pluginId}\u0000${task.locale}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(task);
  });
  let completed = 0;
  const groupedResults = await mapConcurrent([...groups.values()], async (tasks) => {
    const uniqueTasks = [...new Map(tasks.map((task) => [task.value, task])).values()];
    const translated = await translateBatch(uniqueTasks, tasks[0].locale, cache);
    completed += tasks.length;
    if (completed % 100 === 0 || completed === selected.length) {
      console.log(`Translated ${completed}/${selected.length}`);
      writeCache(cache);
    }
    return tasks.map((task) => ({ ...task, value: translated.get(task.value) }));
  });
  const translations = groupedResults.flat();

  translations.forEach(({ pluginId, locale, key, value }) => {
    applyLocaleValue(bundles.get(pluginId).locales[locale], key, value);
  });
  bundles.forEach(({ locales, localePaths }) => {
    LOCALES.forEach((locale) => writeJson(localePaths[locale], locales[locale]));
  });
  writeCache(cache);
  console.log(`Wrote ${translations.length} static translations to ${bundles.size} plugin locale bundles.`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
