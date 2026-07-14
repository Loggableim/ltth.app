'use strict';

// One-off, mechanical migration from the former catalog array to individual
// guide modules. Keep this script so any future catalog migration is explicit
// and reproducible instead of hand-editing dozens of guide records.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sourcePath = path.join(__dirname, 'plugin-tutorial-source.js');
const guidesRoot = path.join(__dirname, 'plugin-guides');
const source = fs.readFileSync(sourcePath, 'utf8');
const startToken = 'const FACTS = [';
const start = source.indexOf(startToken);
const nextFunction = source.indexOf('function readManifests', start);
const end = source.lastIndexOf('];', nextFunction);

if (start < 0 || nextFunction < 0 || end < start) {
  throw new Error('Unable to locate the legacy FACTS catalog.');
}

function splitTopLevel(value, separator = ',') {
  const parts = [];
  let cursor = 0;
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '\'' || character === '"' || character === '`') {
      quote = character;
    } else if ('([{'.includes(character)) {
      depth += 1;
    } else if (')]}'.includes(character)) {
      depth -= 1;
    } else if (character === separator && depth === 0) {
      parts.push(value.slice(cursor, index).trim());
      cursor = index + 1;
    }
  }
  const finalPart = value.slice(cursor).trim();
  if (finalPart) parts.push(finalPart);
  return parts;
}

function findMatchingParen(value, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = openIndex; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '\'' || character === '"' || character === '`') {
      quote = character;
    } else if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error('Unbalanced fact() expression.');
}

function parseFacts(body) {
  const facts = [];
  let index = 0;
  while (index < body.length) {
    const match = /fact\(/g;
    match.lastIndex = index;
    const found = match.exec(body);
    if (!found) break;
    const openIndex = found.index + 'fact'.length;
    const closeIndex = findMatchingParen(body, openIndex);
    const args = splitTopLevel(body.slice(openIndex + 1, closeIndex));
    if (args.length < 5 || args.length > 6) {
      throw new Error(`Unexpected fact() argument count: ${args.length}`);
    }
    const id = JSON.parse(args[0].replace(/'/g, '"'));
    facts.push({ id, args });
    index = closeIndex + 1;
  }
  return facts;
}

const facts = parseFacts(source.slice(start + startToken.length, end));
if (facts.length !== 38 || new Set(facts.map((fact) => fact.id)).size !== facts.length) {
  throw new Error(`Expected 38 unique guide facts, found ${facts.length}.`);
}

fs.mkdirSync(guidesRoot, { recursive: true });
facts.forEach(({ id, args }) => {
  const [idExpression, route, topic, test, expected, options = '{}'] = args;
  const contents = [
    "'use strict';",
    '',
    '// Canonical guide facts for this plugin. Step wording and captures are',
    '// assembled by the shared documentation renderer.',
    'module.exports = Object.freeze({',
    `  id: ${idExpression},`,
    `  route: ${route},`,
    `  topic: ${topic},`,
    `  test: ${test},`,
    `  expected: ${expected},`,
    `  options: ${options}`,
    '});',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(guidesRoot, `${id}.js`), contents, 'utf8');
});

const indexSource = [
  "'use strict';",
  '',
  '// Explicit inventory: adding or removing a published guide is visible in review.',
  'module.exports = Object.freeze([',
  ...facts.map(({ id }) => `  require('./${id}'),`),
  ']);',
  ''
].join('\n');
fs.writeFileSync(path.join(guidesRoot, 'index.js'), indexSource, 'utf8');

const replacement = [
  "const GUIDE_FACTS = require('./plugin-guides');",
  '',
  'const FACTS = GUIDE_FACTS.map((guide) => fact(',
  '  guide.id,',
  '  guide.route,',
  '  guide.topic,',
  '  guide.test,',
  '  guide.expected,',
  '  guide.options',
  '));'
].join('\n');
fs.writeFileSync(sourcePath, source.slice(0, start) + replacement + '\r\n\r\n' + source.slice(nextFunction), 'utf8');

console.log(`Extracted ${facts.length} guide modules into scripts/plugin-guides/.`);
