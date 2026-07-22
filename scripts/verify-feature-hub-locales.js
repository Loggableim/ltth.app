'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const store = JSON.parse(fs.readFileSync(path.join(root, 'plugin-store.json'), 'utf8'));
const ids = ['talking-heads', 'stt-ticker', 'music-bot', 'toptier', 'openshock'];
const errors = [];

for (const id of ids) {
  const plugin = store.plugins.find((item) => item.id === id);
  if (!plugin) {
    errors.push(`Missing feature-hub source plugin: ${id}`);
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

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('OK: feature-hub source descriptions are complete for EN, ES, and FR.');
}
