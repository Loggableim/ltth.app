'use strict';

// The public tutorial catalog is assembled from the complete contracts that
// live in scripts/plugin-guides/<id>.js. This file intentionally performs
// inventory validation and runtime composition only; no guide prose, selectors
// or workflow steps belong here.
const fs = require('fs');
const path = require('path');
const { createGuideDefinition } = require('./plugin-guides/definition');
const { collectGuideUiInventory, collectPluginIntegrationInventory } = require('./lib/plugin-guide-ui-inventory');

const LOCALES = ['de', 'en', 'es', 'fr'];
const GUIDE_MODULES = require('./plugin-guides');

function readManifests(repoRoot) {
  const roots = [
    path.join(repoRoot, 'app', 'plugins'),
    path.join(repoRoot, 'plugin-store', 'sources')
  ];
  const manifests = roots.flatMap((pluginRoot) => fs.readdirSync(pluginRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(pluginRoot, entry.name, 'plugin.json')))
    .map((entry) => JSON.parse(fs.readFileSync(path.join(pluginRoot, entry.name, 'plugin.json'), 'utf8'))))
    .filter((manifest) => manifest.id !== 'store-admin');
  const duplicate = manifests.find((manifest, index) => manifests.findIndex((candidate) => candidate.id === manifest.id) !== index);
  if (duplicate) throw new Error(`Duplicate plugin tutorial manifest id: ${duplicate.id}`);
  return manifests.sort((left, right) => left.id.localeCompare(right.id));
}

function readStoreAdmin(repoRoot) {
  const store = JSON.parse(fs.readFileSync(path.join(repoRoot, 'plugin-store.json'), 'utf8'));
  return store.plugins.find((plugin) => plugin.id === 'store-admin') || {
    id: 'store-admin',
    name: 'Store Admin',
    version: 'current',
    devStatus: 'admin-only'
  };
}

function assertLocalized(contract, name, valueType = 'object') {
  for (const locale of LOCALES) {
    if (!contract[locale] || typeof contract[locale] !== valueType) {
      throw new Error(`Guide contract ${name} is missing locale ${locale}`);
    }
  }
}

function assertGuideContract(guide) {
  if (!guide || !guide.id || !guide.route || !guide.copy || !Array.isArray(guide.steps)) {
    throw new Error(`Incomplete guide contract for ${guide?.id || 'unknown guide'}`);
  }
  assertLocalized(guide.copy, `${guide.id}.copy`);
  assertLocalized(guide.topic, `${guide.id}.topic`, 'string');
  assertLocalized(guide.test, `${guide.id}.test`, 'string');
  if (!guide.steps.length) throw new Error(`Guide contract ${guide.id} has no workflow steps`);
  for (const step of guide.steps) {
    if (!step.id || !step.capture?.route || !step.capture?.assertVisible || !step.capture?.action) {
      throw new Error(`Incomplete workflow step in ${guide.id}`);
    }
    assertLocalized(step.copy, `${guide.id}.${step.id}.copy`);
  }
}

function buildGuides(repoRoot) {
  const manifests = readManifests(repoRoot);
  const byId = new Map(GUIDE_MODULES.map((guide) => [guide.id, guide]));
  const expectedIds = [...manifests.map((manifest) => manifest.id), 'store-admin'].sort();
  const definedIds = [...byId.keys()].sort();
  if (JSON.stringify(expectedIds) !== JSON.stringify(definedIds)) {
    const missing = expectedIds.filter((id) => !byId.has(id));
    const stale = definedIds.filter((id) => !expectedIds.includes(id));
    throw new Error(`Tutorial definition inventory mismatch. Missing: ${missing.join(', ') || 'none'}; stale: ${stale.join(', ') || 'none'}`);
  }

  const storeAdmin = readStoreAdmin(repoRoot);
  return [...manifests, storeAdmin].map((record) => {
    const contract = byId.get(record.id);
    assertGuideContract(contract);
    const name = contract.copy.en.title;
    const overlay = contract.overlay || null;
    const steps = contract.steps;
    const copy = contract.copy;
    return {
      id: record.id,
      name,
      version: record.version || 'current',
      devStatus: record.devStatus || record.accessType || 'available',
      category: record.category || 'plugin',
      copy,
      related: contract.related || [],
      overlay,
      capture: { fixture: { profile: `docs-${record.id}`, externalPolicy: 'blocked', mode: contract.mode || 'ui' } },
      steps,
      definition: createGuideDefinition({
        name,
        version: record.version || 'current',
        entry: contract,
        copy,
        steps,
        overlay,
        inventory: collectGuideUiInventory(repoRoot, { definition: { activation: { route: contract.route } } }),
        integrationInventory: collectPluginIntegrationInventory(repoRoot, record.id, contract.route)
      })
    };
  }).sort((left, right) => left.name.localeCompare(right.name));
}

module.exports = { LOCALES, buildGuides };
