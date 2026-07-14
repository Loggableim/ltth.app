'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'interactive-story',
  route: '/plugins/interactive-story/ui.html?demo=1',
  topic: ['Geschichtenmodus, Abstimmung und Modelloption', 'story mode, voting, and model option', 'modo de historia, votación y opción de modelo', 'mode histoire, vote et option de modèle'],
  test: ['eine lokale Testentscheidung ohne API-Schlüssel', 'a local test decision without an API key', 'una decisión de prueba local sin clave API', 'une décision de test locale sans clé API'],
  expected: ['die Abstimmungsoberfläche reagiert, ohne einen externen Modellaufruf auszuführen', 'the voting UI responds without an external model request', 'la interfaz de votación responde sin solicitar un modelo externo', 'l’interface de vote répond sans appel de modèle externe'],
  options: { requirement: 'network', safety: 'credentials', overlay: '/plugins/interactive-story/overlay.html', related: ['quiz-show', 'sidekick'] }
});
