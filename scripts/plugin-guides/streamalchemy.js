'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'streamalchemy',
  route: '/plugins/streamalchemy/ui.html',
  topic: ['Automationsregel, Auslöser und Aktionskette', 'automation rule, trigger, and action chain', 'regla de automatización, disparador y cadena de acciones', 'règle d’automatisation, déclencheur et chaîne d’actions'],
  test: ['einen lokalen Trockenlauf', 'a local dry run', 'una ejecución en seco local', 'un essai à blanc local'],
  expected: ['die Regel protokolliert den Trockenlauf, ohne LIVE-Aktionen auszuführen', 'the rule logs the dry run without executing LIVE actions', 'la regla registra la ejecución en seco sin realizar acciones LIVE', 'la règle journalise l’essai à blanc sans exécuter d’actions LIVE'],
  options: { safety: 'local', overlay: '/plugins/streamalchemy/overlay.html', related: ['api-bridge', 'gcce'] }
});
