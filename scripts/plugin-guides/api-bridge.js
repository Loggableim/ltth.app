'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'api-bridge',
  route: '/api/bridge/info',
  topic: ['lokale Aktionen, Ereignisse und die API-Bridge', 'local actions, events, and the API bridge', 'acciones locales, eventos y la API Bridge', 'actions locales, événements et l’API Bridge'],
  test: ['GET /api/bridge/info und eine harmlose Action-Abfrage', 'GET /api/bridge/info and a harmless action lookup', 'GET /api/bridge/info y una consulta de acción inocua', 'GET /api/bridge/info et une lecture d’action inoffensive'],
  expected: ['die Antwort beschreibt die verfügbare Bridge, ohne eine Aktion auszuführen', 'the response describes the available bridge without executing an action', 'la respuesta describe el puente disponible sin ejecutar una acción', 'la réponse décrit le bridge disponible sans exécuter d’action'],
  options: { requirement: 'api', safety: 'credentials', mode: 'api', related: ['data-source', 'gcce'] }
});
