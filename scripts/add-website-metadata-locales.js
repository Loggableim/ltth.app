const fs = require('fs');
const path = require('path');

const names = {
  alerts: ['Alert System', 'Alert-System'],
  animazingpal: ['AnimazingPal', 'AnimazingPal'],
  'api-bridge': ['API Bridge', 'API-Bridge'],
  autoUpdater: ['Auto-Updater', 'Auto-Updater'],
  chatCommands: ['Chat Commands', 'Chat-Befehle'],
  dashboard: ['Dashboard', 'Dashboard'],
  flowEngine: ['Flow Engine', 'Flow-Engine'],
  gameEngine: ['Game Engine', 'Game-Engine'],
  goals: ['Goals', 'Goals'],
  multicam: ['Multi-Cam', 'Multi-Cam'],
  oscBridge: ['OSC Bridge', 'OSC-Bridge'],
  overlays: ['Overlays', 'Overlays'],
  'config-import': ['Config Import', 'Konfigurationsimport'],
  pluginSystem: ['Plugin System', 'Plugin-System'],
  security: ['Security', 'Sicherheit'],
  slotMachine: ['Slot Machine', 'Slot Machine'],
  talkingHeads: ['Talking Heads', 'Talking Heads'],
  tikfinityApi: ['TikFinity API', 'TikFinity-API'],
  vdoninja: ['VDO.Ninja', 'VDO.Ninja'],
  viewerXp: ['Viewer XP', 'Viewer-XP']
};

const additions = { en: { 'install.copied': 'Copied', 'footer.support': 'Support' }, de: { 'install.copied': 'Kopiert', 'footer.support': 'Support' }, es: { 'install.copied': 'Copiado', 'footer.support': 'Soporte' }, fr: { 'install.copied': 'Copié', 'footer.support': 'Support' } };
for (const [key, [enName, deName]] of Object.entries(names)) {
  additions.en[`screenshots.${key}.hero.alt`] = `${enName} interface screenshot`;
  additions.en[`screenshots.${key}.hero.caption`] = `${enName} preview`;
  additions.de[`screenshots.${key}.hero.alt`] = `${deName}-Oberfläche – Screenshot`;
  additions.de[`screenshots.${key}.hero.caption`] = `${deName}-Vorschau`;
  additions.es[`screenshots.${key}.hero.alt`] = `Captura de la interfaz de ${enName}`;
  additions.es[`screenshots.${key}.hero.caption`] = `Vista previa de ${enName}`;
  additions.fr[`screenshots.${key}.hero.alt`] = `Capture de l’interface ${enName}`;
  additions.fr[`screenshots.${key}.hero.caption`] = `Aperçu de ${enName}`;
}

for (const [locale, values] of Object.entries(additions)) {
  const file = path.join(__dirname, '..', 'locales', `${locale}.json`);
  const current = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  fs.writeFileSync(file, `${JSON.stringify({ ...current, ...values }, null, 2)}\n`, 'utf8');
}
