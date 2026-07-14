'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'data-source',
  route: '/plugins/data-source/ui.html',
  topic: ['Datenquelle, Feldzuordnung und Aktualisierungsintervall', 'data source, field mapping, and refresh interval', 'fuente de datos, asignación de campos e intervalo de actualización', 'source de données, mappage des champs et intervalle de mise à jour'],
  test: ['eine lokale Beispieldatenquelle', 'a local example data source', 'una fuente de datos de ejemplo local', 'une source de données locale d’exemple'],
  expected: ['die Vorschau zeigt die Testfelder, ohne einen Fremdserver anzufragen', 'the preview shows test fields without requesting an external server', 'la vista previa muestra campos de prueba sin consultar un servidor externo', 'l’aperçu affiche les champs de test sans interroger de serveur externe'],
  options: { requirement: 'api', safety: 'credentials', related: ['api-bridge', 'streamalchemy'] }
});
