#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const PRODUCT_MARKER_START = '// BEGIN STREAM MONSTERS PRODUCT PROJECTION';
const PRODUCT_MARKER_END = '// END STREAM MONSTERS PRODUCT PROJECTION';
const CHANGELOG_MARKER_START = '<!-- BEGIN STREAM MONSTERS PRODUCT PROJECTION -->';
const CHANGELOG_MARKER_END = '<!-- END STREAM MONSTERS PRODUCT PROJECTION -->';

function parseArguments(argv) {
  const options = {
    check: false,
    root: path.resolve(__dirname, '..')
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--check') {
      options.check = true;
    } else if (argument === '--root') {
      const value = argv[index + 1];
      if (!value) throw new Error('--root requires a path');
      options.root = path.resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function readText(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
    .replace(/\r\n?/g, '\n');
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function replaceMarkedBlock(source, start, end, body, insertionPoint) {
  const block = `${start}\n${body}\n${end}`;
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end);
  if (startIndex >= 0 || endIndex >= 0) {
    if (startIndex < 0 || endIndex < startIndex) {
      throw new Error(`Invalid generated block markers: ${start}`);
    }
    return (
      source.slice(0, startIndex) +
      block +
      source.slice(endIndex + end.length)
    );
  }

  const insertionIndex = source.indexOf(insertionPoint);
  if (insertionIndex < 0) {
    throw new Error(`Could not insert generated block after: ${insertionPoint}`);
  }
  const offset = insertionIndex + insertionPoint.length;
  return `${source.slice(0, offset)}\n${block}${source.slice(offset)}`;
}

function publicProjection(contract) {
  return {
    contractVersion: contract.contractVersion,
    id: contract.product.id,
    name: contract.product.name,
    version: contract.product.currentVersion,
    nextVersion: contract.product.nextVersion,
    packageFilename: contract.product.packageFilename,
    rulesVersion: contract.rules.version,
    arenaLabel: contract.rules.arenaLabel,
    access: {
      type: contract.access.type,
      badge: contract.access.badge,
      description: contract.copy.subscription
    },
    defaults: contract.defaults,
    locales: contract.locales
  };
}

function projectManifest(root, contract) {
  const relativePath = 'app/plugins/stream-monsters/plugin.json';
  const manifest = JSON.parse(readText(root, relativePath));
  const descriptions = Object.fromEntries(contract.locales.map(locale => [
    locale,
    `${contract.copy.description[locale]} ${contract.copy.subscription[locale]}`
  ]));
  return {
    relativePath,
    content: jsonText({
      ...manifest,
      id: contract.product.id,
      name: contract.product.name,
      version: contract.product.currentVersion,
      description: descriptions.en,
      descriptions
    })
  };
}

function projectStore(root, contract) {
  const relativePath = 'plugin-store.json';
  const source = readText(root, relativePath);
  const registry = JSON.parse(source);
  const plugin = registry.plugins.find(entry => entry.id === contract.product.id);
  if (!plugin) throw new Error(`Missing Store entry: ${contract.product.id}`);
  plugin.name = Object.fromEntries(
    contract.locales.map(locale => [locale, contract.product.name])
  );
  plugin.description = Object.fromEntries(contract.locales.map(locale => [
    locale,
    `${contract.copy.description[locale]} ${contract.copy.subscription[locale]}`
  ]));
  plugin.version = contract.product.currentVersion;
  plugin.badges = Array.from(new Set([
    ...(plugin.badges || []).filter(badge => badge !== 'subscriber-only'),
    contract.access.badge
  ]));
  plugin.access = {
    type: contract.access.type,
    description: contract.copy.subscription
  };
  plugin.packageUrl = (
    `https://ltth.app/plugin-store/packages/${contract.product.packageFilename}`
  );
  plugin.pricing = contract.access.pricing;
  const idToken = `"id": "${contract.product.id}"`;
  const idIndex = source.indexOf(idToken);
  const startIndex = source.lastIndexOf('{', idIndex);
  if (idIndex < 0 || startIndex < 0) {
    throw new Error(`Could not locate Store entry: ${contract.product.id}`);
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  let endIndex = -1;
  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        endIndex = index + 1;
        break;
      }
    }
  }
  if (endIndex < 0) {
    throw new Error(`Unterminated Store entry: ${contract.product.id}`);
  }
  const rendered = JSON.stringify(plugin, null, 2).replace(/\n/g, '\n    ');
  return {
    relativePath,
    content: `${source.slice(0, startIndex)}${rendered}${source.slice(endIndex)}`
  };
}

function projectGuideMetadata(root, contract) {
  const relativePath = 'scripts/plugin-guides/stream-monsters.js';
  let content = readText(root, relativePath);
  const projection = publicProjection(contract);
  const body = (
    `const PRODUCT_PROJECTION = Object.freeze(${JSON.stringify(projection, null, 2)});`
  );
  content = replaceMarkedBlock(
    content,
    PRODUCT_MARKER_START,
    PRODUCT_MARKER_END,
    body,
    "'use strict';"
  );
  content = content.replace(
    /\n  requirement: '(?:standard|subscriber)',/,
    "\n  requirement: 'subscriber',"
  );
  if (!content.includes('  product: PRODUCT_PROJECTION,')) {
    content = content.replace(
      "module.exports = Object.freeze({\n",
      "module.exports = Object.freeze({\n  product: PRODUCT_PROJECTION,\n"
    );
  }
  return { relativePath, content };
}

function projectPublicGuide(root, contract) {
  const relativePath = 'js/streammonsters-guide.js';
  let content = readText(root, relativePath);
  const projection = publicProjection(contract);
  const body = (
    `  const PRODUCT_PROJECTION = Object.freeze(${JSON.stringify(projection, null, 2)});`
  );
  content = replaceMarkedBlock(
    content,
    `  ${PRODUCT_MARKER_START}`,
    `  ${PRODUCT_MARKER_END}`,
    body,
    "  'use strict';"
  );
  content = content.replaceAll('Jackpot Clash', contract.rules.arenaLabel);
  return { relativePath, content };
}

function setHtmlAttribute(openingTag, name, value) {
  const attribute = `${name}="${String(value)}"`;
  const pattern = new RegExp(`\\s${name}="[^"]*"`);
  return pattern.test(openingTag)
    ? openingTag.replace(pattern, ` ${attribute}`)
    : openingTag.replace(/>$/, ` ${attribute}>`);
}

function projectPublicHtml(root, contract) {
  const relativePath = 'streammonsters/index.html';
  let content = readText(root, relativePath);
  const projection = publicProjection(contract);
  const bodyPattern = /<body\b[^>]*>/;
  const currentBody = content.match(bodyPattern)?.[0];
  if (!currentBody) throw new Error('Public guide has no body element');
  const attributes = {
    'data-streammonsters-contract-version': projection.contractVersion,
    'data-streammonsters-version': projection.version,
    'data-streammonsters-rules-version': projection.rulesVersion,
    'data-streammonsters-arena-label': projection.arenaLabel,
    'data-streammonsters-access': projection.access.type,
    'data-streammonsters-hatch-default-ms': projection.defaults.hatchDurationMs,
    'data-streammonsters-portrait-mode': projection.defaults.portraitBattleMode,
    'data-streammonsters-portrait-profile': projection.defaults.portraitProfile,
    'data-streammonsters-locales': projection.locales.join(','),
    'data-streammonsters-package': projection.packageFilename
  };
  const projectedBody = Object.entries(attributes).reduce(
    (openingTag, [name, value]) => setHtmlAttribute(openingTag, name, value),
    currentBody
  );
  content = content.replace(bodyPattern, projectedBody);
  content = content.replace(
    /<p class="sm-kicker" data-streammonsters-arena-label>[^<]*<\/p>/,
    `<p class="sm-kicker" data-streammonsters-arena-label>${projection.arenaLabel}</p>`
  );
  return { relativePath, content };
}

function projectChangelog(root, contract) {
  const relativePath = 'app/CHANGELOG.md';
  let content = readText(root, relativePath);
  const line = (
    `- **Stream Monsters product contract v${contract.contractVersion}**: ` +
    `${contract.product.name} ${contract.product.currentVersion} uses Rules v${contract.rules.version}, ` +
    `${contract.rules.arenaLabel}, the ${contract.defaults.hatchDurationMs / 1000}-second fresh default, ` +
    `portrait profile \`${contract.defaults.portraitProfile}\`, and subscriber-only access. ` +
    `Current package: \`${contract.product.packageFilename}\`; next release: ` +
    `\`${contract.product.nextVersion}\`.`
  );
  content = replaceMarkedBlock(
    content,
    CHANGELOG_MARKER_START,
    CHANGELOG_MARKER_END,
    line,
    '### Added\n'
  );
  content = content.replace(
    '- **Jackpot Clash presentation**:',
    `- **${contract.rules.arenaLabel} presentation**:`
  );
  return { relativePath, content };
}

function buildProjections(root, contract) {
  return [
    projectManifest(root, contract),
    projectStore(root, contract),
    projectGuideMetadata(root, contract),
    projectPublicGuide(root, contract),
    projectPublicHtml(root, contract),
    projectChangelog(root, contract)
  ];
}

function synchronize({ root, check }) {
  const contractPath = path.join(
    root,
    'app/plugins/stream-monsters/product-contract.json'
  );
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const drift = [];
  for (const projection of buildProjections(root, contract)) {
    const destination = path.join(root, projection.relativePath);
    const current = fs.readFileSync(destination, 'utf8').replace(/\r\n?/g, '\n');
    if (current === projection.content) continue;
    if (check) {
      drift.push(projection.relativePath);
    } else {
      fs.writeFileSync(destination, projection.content, 'utf8');
    }
  }
  return drift;
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const drift = synchronize(options);
    if (drift.length > 0) {
      process.stderr.write(
        `Stream Monsters product projection drift:\n${drift.map(file => `- ${file}`).join('\n')}\n`
      );
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      options.check
        ? 'Stream Monsters product projections are synchronized.\n'
        : 'Stream Monsters product projections synchronized.\n'
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  buildProjections,
  parseArguments,
  publicProjection,
  synchronize
};
