'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'gift-catalog',
  route: '/plugins/gift-catalog/ui.html',
  topic: ['Geschenkkatalog, Coinschwelle und Beispielzuordnung', 'gift catalog, coin threshold, and sample mapping', 'catálogo de regalos, umbral de monedas y asignación de ejemplo', 'catalogue de cadeaux, seuil de pièces et mappage d’exemple'],
  test: ['einen Katalogfilter mit Demodaten', 'a catalog filter with demo data', 'un filtro de catálogo con datos demo', 'un filtre de catalogue avec des données démo'],
  expected: ['die gefilterte Geschenkauswahl wird angezeigt, ohne LIVE-Daten zu laden', 'the filtered gift selection is shown without loading LIVE data', 'la selección filtrada se muestra sin cargar datos LIVE', 'la sélection filtrée est affichée sans charger de données LIVE'],
  options: { safety: 'local', related: ['goals', 'fireworks'] }
});
