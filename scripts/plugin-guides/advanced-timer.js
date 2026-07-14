'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'advanced-timer',
  route: '/plugins/advanced-timer/ui.html',
  topic: ['Timerdauer, Startsignal und Ablaufregeln', 'timer duration, start signal, and flow rules', 'duración, señal de inicio y reglas de flujo del temporizador', 'durée, signal de départ et règles du minuteur'],
  test: ['die lokale Timer-Vorschau', 'the local timer preview', 'la vista previa local del temporizador', 'l’aperçu local du minuteur'],
  expected: ['der Countdown startet mit deinen Demo-Werten', 'the countdown starts with your demo values', 'la cuenta atrás inicia con los valores de demostración', 'le compte à rebours démarre avec vos valeurs de démonstration'],
  options: { requirement: 'obs', safety: 'obs', overlay: '/plugins/advanced-timer/overlay/index.html', related: ['goals', 'game-engine'] }
});
