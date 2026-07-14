'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'store-admin',
  route: '/dashboard.html?view=plugins',
  topic: ['Store-Ansicht, Quellenfreigabe und Paketstatus', 'store view, source approval, and package status', 'vista de tienda, aprobación de fuentes y estado de paquetes', 'vue du store, approbation des sources et état des paquets'],
  test: ['die lokale Store-Ansicht ohne Community-Quelle', 'the local store view without a community source', 'la vista de tienda local sin fuente comunitaria', 'la vue locale du store sans source communautaire'],
  expected: ['der Store zeigt den sicheren Standardzustand; keine Quelle wird aktiviert', 'the store shows the safe default state; no source is enabled', 'la tienda muestra el estado seguro predeterminado; no se activa ninguna fuente', 'le store affiche l’état sûr par défaut ; aucune source n’est activée'],
  options: { requirement: 'api', safety: 'credentials', mode: 'admin', related: ['config-import', 'api-bridge'] }
});
