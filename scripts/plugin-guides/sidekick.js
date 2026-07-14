'use strict';

// Canonical guide facts for this plugin. Step wording and captures are
// assembled by the shared documentation renderer.
module.exports = Object.freeze({
  id: 'sidekick',
  route: '/plugins/sidekick/ui.html',
  topic: ['Assistentenmodus, Kontextquelle und Antwortkanal', 'assistant mode, context source, and response channel', 'modo asistente, fuente de contexto y canal de respuesta', 'mode assistant, source de contexte et canal de réponse'],
  test: ['eine lokale Vorschauanfrage ohne Modellzugang', 'a local preview request without model access', 'una solicitud de vista previa local sin acceso a modelo', 'une requête d’aperçu locale sans accès au modèle'],
  expected: ['die UI bestätigt die Konfiguration, ohne einen externen Dienst anzurufen', 'the UI confirms the configuration without calling an external service', 'la UI confirma la configuración sin llamar a un servicio externo', 'l’UI confirme la configuration sans appeler de service externe'],
  options: { requirement: 'network', safety: 'credentials', overlay: '/plugins/sidekick/overlay/sidekick-hud.html', related: ['interactive-story', 'api-bridge'] }
});
