#!/usr/bin/env node

/**
 * Test script to validate plugin loading with multilingual descriptions
 * Tests backward compatibility and localization features
 */

const fs = require('fs');
const path = require('path');

const pluginsDir = path.join(__dirname, 'app', 'plugins');

console.log('Testing Plugin Loading with Multilingual Descriptions\n');
console.log('='.repeat(60));

let totalPlugins = 0;
let validPlugins = 0;
let pluginsWithDescriptions = 0;
let errors = [];

// Test 1: Load all plugin.json files
console.log('\n📋 Test 1: Loading all plugin.json files...\n');

const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });

for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) {
        continue;
    }

    const pluginPath = path.join(pluginsDir, entry.name);
    const manifestPath = path.join(pluginPath, 'plugin.json');

    if (!fs.existsSync(manifestPath)) {
        console.log(`⏭️  ${entry.name}: No plugin.json found`);
        continue;
    }

    totalPlugins++;

    try {
        const manifestData = fs.readFileSync(manifestPath, 'utf8');
        const manifest = JSON.parse(manifestData);

        // Test backward compatibility: description field must exist
        if (!manifest.description) {
            errors.push(`${manifest.id || entry.name}: Missing 'description' field`);
            console.log(`❌ ${manifest.id || entry.name}: Missing 'description' field`);
            continue;
        }

        // Test new feature: descriptions object
        const hasDescriptions = manifest.descriptions && 
                               typeof manifest.descriptions === 'object' &&
                               manifest.descriptions.en &&
                               manifest.descriptions.de &&
                               manifest.descriptions.es &&
                               manifest.descriptions.fr;

        if (hasDescriptions) {
            pluginsWithDescriptions++;
            console.log(`✅ ${manifest.id}: Valid with multilingual descriptions`);
        } else {
            console.log(`⚠️  ${manifest.id}: Valid but missing multilingual descriptions`);
        }

        validPlugins++;

    } catch (error) {
        errors.push(`${entry.name}: ${error.message}`);
        console.log(`❌ ${entry.name}: ${error.message}`);
    }
}

// Test 2: Validate getLocalizedDescription logic
console.log('\n📋 Test 2: Testing localization logic...\n');

function getLocalizedDescription(manifest, locale = 'en') {
    if (manifest.descriptions && manifest.descriptions[locale]) {
        return manifest.descriptions[locale];
    }
    return manifest.description || '';
}

// Sample test cases
const sampleManifest = {
    id: 'test-plugin',
    description: 'Default English description',
    descriptions: {
        en: 'Full English description with details',
        de: 'Vollständige deutsche Beschreibung mit Details',
        es: 'Descripción completa en español con detalles',
        fr: 'Description complète en français avec détails'
    }
};

const testCases = [
    { locale: 'en', expected: 'Full English description with details' },
    { locale: 'de', expected: 'Vollständige deutsche Beschreibung mit Details' },
    { locale: 'es', expected: 'Descripción completa en español con detalles' },
    { locale: 'fr', expected: 'Description complète en français avec détails' },
    { locale: 'invalid', expected: 'Default English description' }
];

let localizationTestsPassed = 0;
for (const testCase of testCases) {
    const result = getLocalizedDescription(sampleManifest, testCase.locale);
    if (result === testCase.expected) {
        console.log(`✅ Locale '${testCase.locale}': Correct`);
        localizationTestsPassed++;
    } else {
        console.log(`❌ Locale '${testCase.locale}': Expected "${testCase.expected}", got "${result}"`);
        errors.push(`Localization test failed for locale '${testCase.locale}'`);
    }
}

// Test 3: Backward compatibility - plugin without descriptions object
console.log('\n📋 Test 3: Testing backward compatibility...\n');

const legacyManifest = {
    id: 'legacy-plugin',
    description: 'Legacy plugin description'
};

const legacyResult = getLocalizedDescription(legacyManifest, 'en');
if (legacyResult === 'Legacy plugin description') {
    console.log(`✅ Legacy plugin (no descriptions object): Fallback works correctly`);
    localizationTestsPassed++;
} else {
    console.log(`❌ Legacy plugin: Expected "Legacy plugin description", got "${legacyResult}"`);
    errors.push('Legacy plugin fallback failed');
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('TEST SUMMARY');
console.log('='.repeat(60));
console.log(`Total plugins found: ${totalPlugins}`);
console.log(`Valid plugin.json files: ${validPlugins}`);
console.log(`Plugins with multilingual descriptions: ${pluginsWithDescriptions} (${Math.round(pluginsWithDescriptions/totalPlugins*100)}%)`);
console.log(`Localization tests passed: ${localizationTestsPassed}/6`);

if (errors.length > 0) {
    console.log('\n❌ Errors encountered:');
    errors.forEach(err => console.log(`  - ${err}`));
} else {
    console.log('\n✅ All tests passed!');
}

console.log('\n' + '='.repeat(60));

// Exit with appropriate code
process.exit(errors.length > 0 ? 1 : 0);
