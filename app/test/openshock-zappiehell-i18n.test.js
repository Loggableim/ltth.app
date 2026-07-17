'use strict';

const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'openshock');
const locales = ['de', 'en', 'es', 'fr'];

function read(relativePath) {
  return fs.readFileSync(path.join(pluginRoot, relativePath), 'utf8');
}

function getLeaf(object, key) {
  return key.split('.').reduce((value, part) => value && value[part], object);
}

describe('OpenShock ZappieHell runtime localization', () => {
  test('moves visible goals, event-chain, step, toast, confirmation and ARIA copy behind stable runtime keys', () => {
    const source = read('ui.js');
    const zappieHell = source.slice(source.indexOf('let goals = []'));
    const directRuntimeCopy = [
      "showToast('success', 'Overlay URL copied to clipboard!')",
      "showToast('error', 'Failed to load goals')",
      "showToast('error', 'Failed to load event chains')",
      "showToast('error', 'Please fill in all required fields')",
      "showToast('success', goalId ? 'Goal updated' : 'Goal created')",
      "showToast('error', data.error || 'Failed to save goal')",
      "confirm('Are you sure you want to delete this goal?')",
      "showToast('success', 'Goal deleted')",
      "confirm('Reset this goal to 0 coins?')",
      "showToast('error', 'Please enter a chain name')",
      "showToast('success', chainId ? 'Event chain updated' : 'Event chain created')",
      "showToast('error', data.error || 'Failed to save event chain')",
      "confirm('Are you sure you want to delete this event chain?')",
      "showToast('success', 'Event chain deleted')",
      "confirm('Execute this event chain now as a test?')",
      "showToast('success', 'Event chain execution started')",
      "confirm('Remove this step?')"
    ];

    directRuntimeCopy.forEach((copy) => expect(zappieHell).not.toContain(copy));
    expect(zappieHell).toContain("zappieText('goals.modal_edit'");
    expect(zappieHell).toContain("zappieText('chains.modal_create'");
    expect(zappieHell).toContain("zappieText('steps.modal_edit'");
    expect(zappieHell).toContain("zappieText('overlay.copied'");
    expect(zappieHell).toContain("zappieText('accessibility.edit_goal'");
    expect(zappieHell).toContain("zappieText('accessibility.edit_chain'");
    expect(zappieHell).toContain("zappieText('accessibility.edit_step'");
    expect(zappieHell).toContain("'zappiehell.accessibility.copy_overlay_url'");
    expect(source).toContain('rerenderZappieHellRuntimeCopy();');
  });

  test('provides every used ZappieHell runtime key in DE, EN, ES, and FR', () => {
    const source = read('ui.js');
    const zappieHell = source.slice(source.indexOf('let goals = []'));
    const textKeys = [...zappieHell.matchAll(/zappieText\('([^']+)'/g)]
      .map((match) => `zappiehell.${match[1]}`);
    const errorKeys = [...zappieHell.matchAll(/zappieError\('([^']+)'/g)]
      .map((match) => `zappiehell.${match[1]}`);
    const keys = [...new Set([
      ...textKeys,
      ...errorKeys,
      'zappiehell.accessibility.copy_overlay_url'
    ])];

    expect(keys.length).toBeGreaterThan(20);
    locales.forEach((locale) => {
      const translation = JSON.parse(read(`locales/${locale}.json`));
      keys.forEach((key) => {
        expect(getLeaf(translation, `plugins.openshock.runtime.${key}`)).toEqual(expect.any(String));
      });
    });
  });

  test('uses localized labels for visible audio, Hybrid Shock, and webhook steps', () => {
    const expectedLabels = {
      de: {
        type_audio: 'Audio-/TTS-Aktion',
        type_openshock: 'Hybrid-Shock-Aktion',
        type_webhook: 'Webhook-Aktion ({url})'
      },
      en: {
        type_audio: 'Audio/TTS action',
        type_openshock: 'Hybrid Shock action',
        type_webhook: 'Webhook action ({url})'
      },
      es: {
        type_audio: 'Acción de audio/TTS',
        type_openshock: 'Acción Hybrid Shock',
        type_webhook: 'Acción webhook ({url})'
      },
      fr: {
        type_audio: 'Action audio/TTS',
        type_openshock: 'Action Hybrid Shock',
        type_webhook: 'Action webhook ({url})'
      }
    };

    locales.forEach((locale) => {
      const translation = JSON.parse(read(`locales/${locale}.json`));
      Object.entries(expectedLabels[locale]).forEach(([key, value]) => {
        expect(getLeaf(translation, `plugins.openshock.runtime.zappiehell.steps.${key}`)).toBe(value);
      });
    });
  });
});
