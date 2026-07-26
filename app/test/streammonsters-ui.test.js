const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function creatorDocument() {
  const html = creatorHtml();
  return new JSDOM(html).window.document;
}

function creatorHtml() {
  return fs.readFileSync(
    path.join(process.cwd(), 'plugins', 'streamalchemy', 'streammonsters-ui.html'),
    'utf8'
  );
}

describe('Stream Monsters Rules v5 creator surface', () => {
  test('renders the canonical Furry library without Art Lab or managed-runtime controls', () => {
    const document = creatorDocument();
    expect(document.getElementById('visual-library')).not.toBeNull();
    expect(document.getElementById('art-lab')).toBeNull();
    expect(document.getElementById('runtimeWizard')).toBeNull();
    expect(document.querySelectorAll('#visualPack option')).toHaveLength(1);
    expect(document.querySelector('#visualPack option').value).toBe('furry');
    expect(creatorHtml()).not.toMatch(
      /\/api\/(?:streamalchemy|streammonsters\/(?:pool|local-runtime))/
    );
  });

  test('renders all Rules v5 duration, alias, layout and renderer controls', () => {
    const document = creatorDocument();
    for (const id of [
      'hatchPreset',
      'eggExpiry',
      'seasonDuration',
      'aliasEggsEnabled',
      'aliasEggsDisabled',
      'landscapeAnchor',
      'landscapeScale',
      'portraitAnchor',
      'portraitScale',
      'rendererQuality',
      'notificationDuration'
    ]) {
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  test('renders exactly five server-persisted audio channels', () => {
    const document = creatorDocument();
    const channels = ['Master', 'Ui', 'Egg', 'Battle', 'Reward'];
    for (const channel of channels) {
      expect(document.getElementById(`audio${channel}Enabled`)).not.toBeNull();
      expect(document.getElementById(`audio${channel}Volume`)).not.toBeNull();
    }
  });
});
