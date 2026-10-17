'use strict';

const fs = require('fs');
const path = require('path');
const { isClosedBetaPlugin } = require('./lib/published-plugin-catalog');

const DEFAULT_ROOT = path.resolve(__dirname, '..');
const FEATURE_HUB_SOURCE_IDS = ['talking-heads', 'stt-ticker', 'music-bot', 'toptier', 'openshock'];

function verifyFeatureHubLocales(root = DEFAULT_ROOT) {
  const store = JSON.parse(fs.readFileSync(path.join(root, 'plugin-store.json'), 'utf8'));
  const errors = [];

  for (const id of FEATURE_HUB_SOURCE_IDS) {
    const plugin = store.plugins.find((item) => item.id === id);
    if (!plugin) {
      if (!isClosedBetaPlugin(root, id)) {
        errors.push(`Missing feature-hub source plugin: ${id}`);
      }
      continue;
    }
    for (const locale of ['en', 'es', 'fr']) {
      const description = plugin.description?.[locale];
      if (!description || !description.trim()) errors.push(`Missing ${locale} feature-hub description: ${id}`);
      if (locale !== 'en' && plugin.description?.de && description === plugin.description.de) {
        errors.push(`Unlocalized ${locale} feature-hub description: ${id}`);
      }
    }
  }

  const englishMustNotBeGerman = ['toptier'];
  for (const id of englishMustNotBeGerman) {
    const plugin = store.plugins.find((item) => item.id === id);
    if (plugin?.description?.en && /\b(mit|und|als|für|zwischen|wähle)\b/i.test(plugin.description.en)) {
      errors.push(`German copy remains in English feature-hub description: ${id}`);
    }
  }

  for (const page of ['features/index.html', 'features-en.html', 'features-es.html', 'features-fr.html']) {
    const source = fs.readFileSync(path.join(root, page), 'utf8');
    if (/[\t ]+\r?\n/.test(source)) errors.push(`Generated feature hub has trailing whitespace: ${page}`);
  }

  return errors;
}

function main() {
  const errors = verifyFeatureHubLocales();
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('OK: feature-hub source descriptions are complete for EN, ES, and FR.');
  }
}

if (require.main === module) main();

module.exports = { verifyFeatureHubLocales };
