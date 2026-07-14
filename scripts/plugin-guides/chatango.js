'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'chatango',
  route: '/plugins/chatango/ui.html',
  topic: ['Raumname, Widget-Position und Chat-Thema', 'room name, widget position, and chat theme', 'nombre de sala, posición del widget y tema del chat', 'nom de salon, position du widget et thème du chat'],
  test: ['die lokale Widget-Vorschau mit einem Platzhalterraum', 'the local widget preview with a placeholder room', 'la vista previa local con una sala de marcador', 'l’aperçu local du widget avec un salon fictif'],
  expected: ['das Widget zeigt die gewählte Position ohne einen externen Chat zu öffnen', 'the widget shows the chosen position without opening an external chat', 'el widget muestra la posición elegida sin abrir un chat externo', 'le widget montre la position choisie sans ouvrir de chat externe'],
  options: { requirement: 'network', safety: 'credentials', overlay: '/plugins/chatango/ui.html', related: ['clarityhud', 'spotlight'] }
});
