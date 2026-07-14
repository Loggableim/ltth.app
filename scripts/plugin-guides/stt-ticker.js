'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'stt-ticker',
  route: '/plugins/stt-ticker/ui.html',
  topic: ['Sprache, Untertitelmodus und Textstil', 'language, subtitle mode, and text style', 'idioma, modo de subtítulos y estilo de texto', 'langue, mode de sous-titres et style de texte'],
  test: ['einen lokalen Beispielsatz', 'a local sample sentence', 'una frase de ejemplo local', 'une phrase locale d’exemple'],
  expected: ['der Satz erscheint im Ticker ohne Mikrofonaufnahme', 'the sentence appears in the ticker without microphone capture', 'la frase aparece en el ticker sin captura de micrófono', 'la phrase apparaît dans le ticker sans capture micro'],
  options: { requirement: 'obs', safety: 'local', overlay: '/plugins/stt-ticker/overlay/ticker.html', related: ['osc-bridge', 'talking-heads'] }
});
