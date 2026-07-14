'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'multicam',
  route: '/plugins/multicam/ui.html',
  topic: ['Kameraquelle, Szenenregel und Umschaltbedingung', 'camera source, scene rule, and switch condition', 'fuente de cámara, regla de escena y condición de cambio', 'source caméra, règle de scène et condition de bascule'],
  test: ['eine nicht sendende OBS-Testszene', 'an OBS test scene that is not live', 'una escena de prueba de OBS que no está al aire', 'une scène de test OBS non diffusée'],
  expected: ['die Regel wird gespeichert, ohne OBS zu schalten', 'the rule is saved without switching OBS', 'la regla se guarda sin cambiar OBS', 'la règle est enregistrée sans basculer OBS'],
  options: { requirement: 'obs', safety: 'obs', related: ['vdoninja', 'clarityhud'] }
});
