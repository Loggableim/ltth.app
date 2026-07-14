'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "sidekick",
  "route": "/plugins/sidekick/ui.html",
  "topic": {
    "de": "Assistentenmodus, Kontextquelle und Antwortkanal",
    "en": "assistant mode, context source, and response channel",
    "es": "modo asistente, fuente de contexto y canal de respuesta",
    "fr": "mode assistant, source de contexte et canal de réponse"
  },
  "test": {
    "de": "eine lokale Vorschauanfrage ohne Modellzugang",
    "en": "a local preview request without model access",
    "es": "una solicitud de vista previa local sin acceso a modelo",
    "fr": "une requête d’aperçu locale sans accès au modèle"
  },
  "expected": {
    "de": "die UI bestätigt die Konfiguration, ohne einen externen Dienst anzurufen",
    "en": "the UI confirms the configuration without calling an external service",
    "es": "la UI confirma la configuración sin llamar a un servicio externo",
    "fr": "l’UI confirme la configuration sans appeler de service externe"
  },
  "requirement": "network",
  "safety": "credentials",
  "mode": "ui",
  "overlay": "/plugins/sidekick/overlay/sidekick-hud.html",
  "related": [
    "interactive-story",
    "api-bridge"
  ],
  "copy": {
    "de": {
      "title": "Sidekick",
      "summary": "Sidekick richtet Assistentenmodus, Kontextquelle und Antwortkanal ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "die UI bestätigt die Konfiguration, ohne einen externen Dienst anzurufen",
      "requirements": "LTTH Dashboard; externe Endpunkte bleiben in dieser Anleitung getrennt. Dieser konkrete Sidekick-Ablauf behandelt Assistentenmodus, Kontextquelle und Antwortkanal.",
      "safety": "Keine echten API-Schlüssel oder Konten eingeben; Platzhalter bleiben Platzhalter. Dieser konkrete Sidekick-Ablauf behandelt Assistentenmodus, Kontextquelle und Antwortkanal.",
      "troubleshooting": "Wenn Assistentenmodus, Kontextquelle und Antwortkanal nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "interactive-story",
        "api-bridge"
      ]
    },
    "en": {
      "title": "Sidekick",
      "summary": "Sidekick configures assistant mode, context source, and response channel with a safe local check instead of a LIVE trigger.",
      "firstResult": "the UI confirms the configuration without calling an external service",
      "requirements": "LTTH Dashboard; external endpoints remain disconnected in this guide. This Sidekick workflow specifically covers assistant mode, context source, and response channel.",
      "safety": "Do not enter real API keys or accounts; placeholders stay placeholders. This Sidekick workflow specifically covers assistant mode, context source, and response channel.",
      "troubleshooting": "If assistant mode, context source, and response channel is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "interactive-story",
        "api-bridge"
      ]
    },
    "es": {
      "title": "Sidekick",
      "summary": "Sidekick configura modo asistente, fuente de contexto y canal de respuesta mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "la UI confirma la configuración sin llamar a un servicio externo",
      "requirements": "El panel de LTTH; los extremos externos permanecen desconectados en esta guía. Este flujo concreto de Sidekick trata modo asistente, fuente de contexto y canal de respuesta.",
      "safety": "No introduzcas claves API ni cuentas reales; los marcadores siguen siendo marcadores. Este flujo concreto de Sidekick trata modo asistente, fuente de contexto y canal de respuesta.",
      "troubleshooting": "Si modo asistente, fuente de contexto y canal de respuesta no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "interactive-story",
        "api-bridge"
      ]
    },
    "fr": {
      "title": "Sidekick",
      "summary": "Sidekick configure mode assistant, source de contexte et canal de réponse avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "l’UI confirme la configuration sans appeler de service externe",
      "requirements": "Le tableau de bord LTTH ; les points externes restent déconnectés dans ce guide. Ce flux spécifique de Sidekick couvre mode assistant, source de contexte et canal de réponse.",
      "safety": "Ne saisissez aucune clé API ni compte réel ; les espaces réservés restent des espaces réservés. Ce flux spécifique de Sidekick couvre mode assistant, source de contexte et canal de réponse.",
      "troubleshooting": "Si mode assistant, source de contexte et canal de réponse n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "interactive-story",
        "api-bridge"
      ]
    }
  },
  "steps": [
    {
      "id": "sidekick-card",
      "copy": {
        "de": {
          "title": "Sidekick Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Sidekick Card von Assistentenmodus, Kontextquelle und Antwortkanal. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Sidekick Card im Testprofil konfigurieren - Assistentenmodus, Kontextquelle und Antwortkanal"
        },
        "en": {
          "title": "Configure Sidekick Card in the test profile",
          "body": "Work in the visible Sidekick Card area of assistant mode, context source, and response channel. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Sidekick Card in the test profile - assistant mode, context source, and response channel"
        },
        "es": {
          "title": "Configura Sidekick Card en el perfil de prueba",
          "body": "Trabaja en el area visible Sidekick Card de modo asistente, fuente de contexto y canal de respuesta. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Sidekick Card en el perfil de prueba - modo asistente, fuente de contexto y canal de respuesta"
        },
        "fr": {
          "title": "Configurez Sidekick Card dans le profil de test",
          "body": "Travaillez dans la zone visible Sidekick Card de mode assistant, source de contexte et canal de réponse. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Sidekick Card dans le profil de test - mode assistant, source de contexte et canal de réponse"
        }
      },
      "capture": {
        "route": "/plugins/sidekick/ui.html",
        "assertVisible": "#tab-status",
        "focusText": {
          "de": "Sidekick Card im Testprofil konfigurieren",
          "en": "Configure Sidekick Card in the test profile",
          "es": "Configura Sidekick Card en el perfil de prueba",
          "fr": "Configurez Sidekick Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "sidekick-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/sidekick/ui.html",
        "instructions": {
          "de": {
            "title": "Sidekick Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Sidekick Card von Assistentenmodus, Kontextquelle und Antwortkanal. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Sidekick Card in the test profile",
            "body": "Work in the visible Sidekick Card area of assistant mode, context source, and response channel. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Sidekick Card en el perfil de prueba",
            "body": "Trabaja en el area visible Sidekick Card de modo asistente, fuente de contexto y canal de respuesta. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Sidekick Card dans le profil de test",
            "body": "Travaillez dans la zone visible Sidekick Card de mode assistant, source de contexte et canal de réponse. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/sidekick/ui.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#tab-status"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/sidekick/ui.html"
          },
          {
            "type": "visible",
            "selector": "#tab-status"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#tab-status",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "assistant-mode",
      "copy": {
        "de": {
          "title": "Assistant Mode im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Assistant Mode von Assistentenmodus, Kontextquelle und Antwortkanal. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Assistant Mode im Testprofil konfigurieren - Assistentenmodus, Kontextquelle und Antwortkanal"
        },
        "en": {
          "title": "Configure Assistant Mode in the test profile",
          "body": "Work in the visible Assistant Mode area of assistant mode, context source, and response channel. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Assistant Mode in the test profile - assistant mode, context source, and response channel"
        },
        "es": {
          "title": "Configura Assistant Mode en el perfil de prueba",
          "body": "Trabaja en el area visible Assistant Mode de modo asistente, fuente de contexto y canal de respuesta. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Assistant Mode en el perfil de prueba - modo asistente, fuente de contexto y canal de respuesta"
        },
        "fr": {
          "title": "Configurez Assistant Mode dans le profil de test",
          "body": "Travaillez dans la zone visible Assistant Mode de mode assistant, source de contexte et canal de réponse. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Assistant Mode dans le profil de test - mode assistant, source de contexte et canal de réponse"
        }
      },
      "capture": {
        "route": "/plugins/sidekick/ui.html",
        "assertVisible": "#host-asr-language",
        "focusText": {
          "de": "Assistant Mode im Testprofil konfigurieren",
          "en": "Configure Assistant Mode in the test profile",
          "es": "Configura Assistant Mode en el perfil de prueba",
          "fr": "Configurez Assistant Mode dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "assistant-mode"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/sidekick/ui.html",
        "instructions": {
          "de": {
            "title": "Assistant Mode im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Assistant Mode von Assistentenmodus, Kontextquelle und Antwortkanal. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Assistant Mode in the test profile",
            "body": "Work in the visible Assistant Mode area of assistant mode, context source, and response channel. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Assistant Mode en el perfil de prueba",
            "body": "Trabaja en el area visible Assistant Mode de modo asistente, fuente de contexto y canal de respuesta. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Assistant Mode dans le profil de test",
            "body": "Travaillez dans la zone visible Assistant Mode de mode assistant, source de contexte et canal de réponse. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/sidekick/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#host-asr-language"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/sidekick/ui.html"
          },
          {
            "type": "visible",
            "selector": "#host-asr-language"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#host-asr-language",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "context-source",
      "copy": {
        "de": {
          "title": "Context Source im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Context Source von Assistentenmodus, Kontextquelle und Antwortkanal. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Context Source im Testprofil konfigurieren - Assistentenmodus, Kontextquelle und Antwortkanal"
        },
        "en": {
          "title": "Configure Context Source in the test profile",
          "body": "Work in the visible Context Source area of assistant mode, context source, and response channel. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Context Source in the test profile - assistant mode, context source, and response channel"
        },
        "es": {
          "title": "Configura Context Source en el perfil de prueba",
          "body": "Trabaja en el area visible Context Source de modo asistente, fuente de contexto y canal de respuesta. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Context Source en el perfil de prueba - modo asistente, fuente de contexto y canal de respuesta"
        },
        "fr": {
          "title": "Configurez Context Source dans le profil de test",
          "body": "Travaillez dans la zone visible Context Source de mode assistant, source de contexte et canal de réponse. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Context Source dans le profil de test - mode assistant, source de contexte et canal de réponse"
        }
      },
      "capture": {
        "route": "/plugins/sidekick/ui.html",
        "assertVisible": "#test-message",
        "focusText": {
          "de": "Context Source im Testprofil konfigurieren",
          "en": "Configure Context Source in the test profile",
          "es": "Configura Context Source en el perfil de prueba",
          "fr": "Configurez Context Source dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "context-source"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/sidekick/ui.html",
        "instructions": {
          "de": {
            "title": "Context Source im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Context Source von Assistentenmodus, Kontextquelle und Antwortkanal. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Context Source in the test profile",
            "body": "Work in the visible Context Source area of assistant mode, context source, and response channel. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Context Source en el perfil de prueba",
            "body": "Trabaja en el area visible Context Source de modo asistente, fuente de contexto y canal de respuesta. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Context Source dans le profil de test",
            "body": "Travaillez dans la zone visible Context Source de mode assistant, source de contexte et canal de réponse. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/sidekick/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#test-message"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/sidekick/ui.html"
          },
          {
            "type": "visible",
            "selector": "#test-message"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#test-message",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "local-request",
      "copy": {
        "de": {
          "title": "Local Request lokal testen",
          "body": "Fuehre Local Request nur mit eine lokale Vorschauanfrage ohne Modellzugang im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "die UI bestätigt die Konfiguration, ohne einen externen Dienst anzurufen",
          "alt": "Local Request lokal testen - Assistentenmodus, Kontextquelle und Antwortkanal"
        },
        "en": {
          "title": "Test Local Request locally",
          "body": "Run Local Request only with a local preview request without model access in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the UI confirms the configuration without calling an external service",
          "alt": "Test Local Request locally - assistant mode, context source, and response channel"
        },
        "es": {
          "title": "Prueba Local Request localmente",
          "body": "Ejecuta Local Request solo con una solicitud de vista previa local sin acceso a modelo en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "la UI confirma la configuración sin llamar a un servicio externo",
          "alt": "Prueba Local Request localmente - modo asistente, fuente de contexto y canal de respuesta"
        },
        "fr": {
          "title": "Testez Local Request localement",
          "body": "Executez Local Request uniquement avec une requête d’aperçu locale sans accès au modèle dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "l’UI confirme la configuration sans appeler de service externe",
          "alt": "Testez Local Request localement - mode assistant, source de contexte et canal de réponse"
        }
      },
      "capture": {
        "route": "/plugins/sidekick/ui.html",
        "assertVisible": "#btn-test",
        "focusText": {
          "de": "Local Request lokal testen",
          "en": "Test Local Request locally",
          "es": "Prueba Local Request localmente",
          "fr": "Testez Local Request localement"
        },
        "action": {
          "type": "run-local-preview",
          "stepId": "local-request"
        },
        "expected": {
          "de": "die UI bestätigt die Konfiguration, ohne einen externen Dienst anzurufen",
          "en": "the UI confirms the configuration without calling an external service",
          "es": "la UI confirma la configuración sin llamar a un servicio externo",
          "fr": "l’UI confirme la configuration sans appeler de service externe"
        }
      },
      "workflow": {
        "route": "/plugins/sidekick/ui.html",
        "instructions": {
          "de": {
            "title": "Local Request lokal testen",
            "body": "Fuehre Local Request nur mit eine lokale Vorschauanfrage ohne Modellzugang im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "die UI bestätigt die Konfiguration, ohne einen externen Dienst anzurufen"
          },
          "en": {
            "title": "Test Local Request locally",
            "body": "Run Local Request only with a local preview request without model access in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the UI confirms the configuration without calling an external service"
          },
          "es": {
            "title": "Prueba Local Request localmente",
            "body": "Ejecuta Local Request solo con una solicitud de vista previa local sin acceso a modelo en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "la UI confirma la configuración sin llamar a un servicio externo"
          },
          "fr": {
            "title": "Testez Local Request localement",
            "body": "Executez Local Request uniquement avec une requête d’aperçu locale sans accès au modèle dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "l’UI confirme la configuration sans appeler de service externe"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/sidekick/ui.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#btn-test"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/sidekick/ui.html"
          },
          {
            "type": "visible",
            "selector": "#btn-test"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#btn-test",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "sidekick-overlay",
      "copy": {
        "de": {
          "title": "Sidekick Overlay als Overlay-Vorschau oeffnen",
          "body": "Oeffne die echte Sidekick Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
          "expected": "die UI bestätigt die Konfiguration, ohne einen externen Dienst anzurufen",
          "alt": "Sidekick Overlay als Overlay-Vorschau oeffnen - Assistentenmodus, Kontextquelle und Antwortkanal"
        },
        "en": {
          "title": "Open Sidekick Overlay as an overlay preview",
          "body": "Open the real Sidekick Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
          "expected": "the UI confirms the configuration without calling an external service",
          "alt": "Open Sidekick Overlay as an overlay preview - assistant mode, context source, and response channel"
        },
        "es": {
          "title": "Abre Sidekick Overlay como vista previa de overlay",
          "body": "Abre la superficie real Sidekick Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
          "expected": "la UI confirma la configuración sin llamar a un servicio externo",
          "alt": "Abre Sidekick Overlay como vista previa de overlay - modo asistente, fuente de contexto y canal de respuesta"
        },
        "fr": {
          "title": "Ouvrez Sidekick Overlay comme apercu overlay",
          "body": "Ouvrez la vraie surface Sidekick Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
          "expected": "l’UI confirme la configuration sans appeler de service externe",
          "alt": "Ouvrez Sidekick Overlay comme apercu overlay - mode assistant, source de contexte et canal de réponse"
        }
      },
      "capture": {
        "route": "/plugins/sidekick/overlay/sidekick-hud.html",
        "assertVisible": "#overlay",
        "focusText": {
          "de": "Sidekick Overlay als Overlay-Vorschau oeffnen",
          "en": "Open Sidekick Overlay as an overlay preview",
          "es": "Abre Sidekick Overlay como vista previa de overlay",
          "fr": "Ouvrez Sidekick Overlay comme apercu overlay"
        },
        "action": {
          "type": "open-overlay-preview",
          "stepId": "sidekick-overlay"
        },
        "expected": {
          "de": "die UI bestätigt die Konfiguration, ohne einen externen Dienst anzurufen",
          "en": "the UI confirms the configuration without calling an external service",
          "es": "la UI confirma la configuración sin llamar a un servicio externo",
          "fr": "l’UI confirme la configuration sans appeler de service externe"
        }
      },
      "workflow": {
        "route": "/plugins/sidekick/overlay/sidekick-hud.html",
        "instructions": {
          "de": {
            "title": "Sidekick Overlay als Overlay-Vorschau oeffnen",
            "body": "Oeffne die echte Sidekick Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
            "expected": "die UI bestätigt die Konfiguration, ohne einen externen Dienst anzurufen"
          },
          "en": {
            "title": "Open Sidekick Overlay as an overlay preview",
            "body": "Open the real Sidekick Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
            "expected": "the UI confirms the configuration without calling an external service"
          },
          "es": {
            "title": "Abre Sidekick Overlay como vista previa de overlay",
            "body": "Abre la superficie real Sidekick Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
            "expected": "la UI confirma la configuración sin llamar a un servicio externo"
          },
          "fr": {
            "title": "Ouvrez Sidekick Overlay comme apercu overlay",
            "body": "Ouvrez la vraie surface Sidekick Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
            "expected": "l’UI confirme la configuration sans appeler de service externe"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/sidekick/overlay/sidekick-hud.html"
          },
          {
            "type": "open-overlay-preview",
            "selector": "#overlay"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/sidekick/overlay/sidekick-hud.html"
          },
          {
            "type": "visible",
            "selector": "#overlay"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#overlay",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "sidekick-reset",
      "copy": {
        "de": {
          "title": "Sidekick Reset sicher zuruecksetzen",
          "body": "Entferne nur die Demo-Werte fuer Sidekick Reset, bevor du Assistentenmodus, Kontextquelle und Antwortkanal produktiv vorbereitest.",
          "expected": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "alt": "Sidekick Reset sicher zuruecksetzen - Assistentenmodus, Kontextquelle und Antwortkanal"
        },
        "en": {
          "title": "Reset Sidekick Reset safely",
          "body": "Remove only the demo values for Sidekick Reset before preparing assistant mode, context source, and response channel for production.",
          "expected": "The test profile remains free of production impact.",
          "alt": "Reset Sidekick Reset safely - assistant mode, context source, and response channel"
        },
        "es": {
          "title": "Restablece Sidekick Reset con seguridad",
          "body": "Elimina solo los valores demo de Sidekick Reset antes de preparar modo asistente, fuente de contexto y canal de respuesta para produccion.",
          "expected": "El perfil de prueba permanece sin impacto de producción.",
          "alt": "Restablece Sidekick Reset con seguridad - modo asistente, fuente de contexto y canal de respuesta"
        },
        "fr": {
          "title": "Reinitialisez Sidekick Reset en securite",
          "body": "Supprimez uniquement les valeurs demo de Sidekick Reset avant de preparer mode assistant, source de contexte et canal de réponse pour la production.",
          "expected": "Le profil de test reste sans impact de production.",
          "alt": "Reinitialisez Sidekick Reset en securite - mode assistant, source de contexte et canal de réponse"
        }
      },
      "capture": {
        "route": "/plugins/sidekick/ui.html",
        "assertVisible": "#btn-reset",
        "focusText": {
          "de": "Sidekick Reset sicher zuruecksetzen",
          "en": "Reset Sidekick Reset safely",
          "es": "Restablece Sidekick Reset con seguridad",
          "fr": "Reinitialisez Sidekick Reset en securite"
        },
        "action": {
          "type": "reset-demo-state",
          "stepId": "sidekick-reset"
        },
        "expected": {
          "de": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "en": "The test profile remains free of production impact.",
          "es": "El perfil de prueba permanece sin impacto de producción.",
          "fr": "Le profil de test reste sans impact de production."
        }
      },
      "workflow": {
        "route": "/plugins/sidekick/ui.html",
        "instructions": {
          "de": {
            "title": "Sidekick Reset sicher zuruecksetzen",
            "body": "Entferne nur die Demo-Werte fuer Sidekick Reset, bevor du Assistentenmodus, Kontextquelle und Antwortkanal produktiv vorbereitest.",
            "expected": "Das Testprofil bleibt ohne produktive Auswirkung."
          },
          "en": {
            "title": "Reset Sidekick Reset safely",
            "body": "Remove only the demo values for Sidekick Reset before preparing assistant mode, context source, and response channel for production.",
            "expected": "The test profile remains free of production impact."
          },
          "es": {
            "title": "Restablece Sidekick Reset con seguridad",
            "body": "Elimina solo los valores demo de Sidekick Reset antes de preparar modo asistente, fuente de contexto y canal de respuesta para produccion.",
            "expected": "El perfil de prueba permanece sin impacto de producción."
          },
          "fr": {
            "title": "Reinitialisez Sidekick Reset en securite",
            "body": "Supprimez uniquement les valeurs demo de Sidekick Reset avant de preparer mode assistant, source de contexte et canal de réponse pour la production.",
            "expected": "Le profil de test reste sans impact de production."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/sidekick/ui.html"
          },
          {
            "type": "reset-demo-state",
            "selector": "#btn-reset"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/sidekick/ui.html"
          },
          {
            "type": "visible",
            "selector": "#btn-reset"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#btn-reset",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    }
  ]
});
