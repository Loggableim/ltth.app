'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "chatango",
  "route": "/plugins/chatango/ui.html",
  "topic": {
    "de": "Raumname, Widget-Position und Chat-Thema",
    "en": "room name, widget position, and chat theme",
    "es": "nombre de sala, posición del widget y tema del chat",
    "fr": "nom de salon, position du widget et thème du chat"
  },
  "test": {
    "de": "die lokale Widget-Vorschau mit einem Platzhalterraum",
    "en": "the local widget preview with a placeholder room",
    "es": "la vista previa local con una sala de marcador",
    "fr": "l’aperçu local du widget avec un salon fictif"
  },
  "expected": {
    "de": "das Widget zeigt die gewählte Position ohne einen externen Chat zu öffnen",
    "en": "the widget shows the chosen position without opening an external chat",
    "es": "el widget muestra la posición elegida sin abrir un chat externo",
    "fr": "le widget montre la position choisie sans ouvrir de chat externe"
  },
  "requirement": "network",
  "safety": "credentials",
  "mode": "ui",
  "overlay": "/plugins/chatango/ui.html",
  "related": [
    "clarityhud",
    "spotlight"
  ],
  "copy": {
    "de": {
      "title": "Chatango Integration",
      "summary": "Chatango Integration richtet Raumname, Widget-Position und Chat-Thema ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "das Widget zeigt die gewählte Position ohne einen externen Chat zu öffnen",
      "requirements": "LTTH Dashboard; externe Endpunkte bleiben in dieser Anleitung getrennt. Dieser konkrete Chatango Integration-Ablauf behandelt Raumname, Widget-Position und Chat-Thema.",
      "safety": "Keine echten API-Schlüssel oder Konten eingeben; Platzhalter bleiben Platzhalter. Dieser konkrete Chatango Integration-Ablauf behandelt Raumname, Widget-Position und Chat-Thema.",
      "troubleshooting": "Wenn Raumname, Widget-Position und Chat-Thema nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "clarityhud",
        "spotlight"
      ]
    },
    "en": {
      "title": "Chatango Integration",
      "summary": "Chatango Integration configures room name, widget position, and chat theme with a safe local check instead of a LIVE trigger.",
      "firstResult": "the widget shows the chosen position without opening an external chat",
      "requirements": "LTTH Dashboard; external endpoints remain disconnected in this guide. This Chatango Integration workflow specifically covers room name, widget position, and chat theme.",
      "safety": "Do not enter real API keys or accounts; placeholders stay placeholders. This Chatango Integration workflow specifically covers room name, widget position, and chat theme.",
      "troubleshooting": "If room name, widget position, and chat theme is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "clarityhud",
        "spotlight"
      ]
    },
    "es": {
      "title": "Chatango Integration",
      "summary": "Chatango Integration configura nombre de sala, posición del widget y tema del chat mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "el widget muestra la posición elegida sin abrir un chat externo",
      "requirements": "El panel de LTTH; los extremos externos permanecen desconectados en esta guía. Este flujo concreto de Chatango Integration trata nombre de sala, posición del widget y tema del chat.",
      "safety": "No introduzcas claves API ni cuentas reales; los marcadores siguen siendo marcadores. Este flujo concreto de Chatango Integration trata nombre de sala, posición del widget y tema del chat.",
      "troubleshooting": "Si nombre de sala, posición del widget y tema del chat no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "clarityhud",
        "spotlight"
      ]
    },
    "fr": {
      "title": "Chatango Integration",
      "summary": "Chatango Integration configure nom de salon, position du widget et thème du chat avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "le widget montre la position choisie sans ouvrir de chat externe",
      "requirements": "Le tableau de bord LTTH ; les points externes restent déconnectés dans ce guide. Ce flux spécifique de Chatango Integration couvre nom de salon, position du widget et thème du chat.",
      "safety": "Ne saisissez aucune clé API ni compte réel ; les espaces réservés restent des espaces réservés. Ce flux spécifique de Chatango Integration couvre nom de salon, position du widget et thème du chat.",
      "troubleshooting": "Si nom de salon, position du widget et thème du chat n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "clarityhud",
        "spotlight"
      ]
    }
  },
  "steps": [
    {
      "id": "chatango-card",
      "copy": {
        "de": {
          "title": "Chatango Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Chatango Card von Raumname, Widget-Position und Chat-Thema. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Chatango Card im Testprofil konfigurieren - Raumname, Widget-Position und Chat-Thema"
        },
        "en": {
          "title": "Configure Chatango Card in the test profile",
          "body": "Work in the visible Chatango Card area of room name, widget position, and chat theme. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Chatango Card in the test profile - room name, widget position, and chat theme"
        },
        "es": {
          "title": "Configura Chatango Card en el perfil de prueba",
          "body": "Trabaja en el area visible Chatango Card de nombre de sala, posición del widget y tema del chat. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Chatango Card en el perfil de prueba - nombre de sala, posición del widget y tema del chat"
        },
        "fr": {
          "title": "Configurez Chatango Card dans le profil de test",
          "body": "Travaillez dans la zone visible Chatango Card de nom de salon, position du widget et thème du chat. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Chatango Card dans le profil de test - nom de salon, position du widget et thème du chat"
        }
      },
      "capture": {
        "route": "/plugins/chatango/ui.html",
        "assertVisible": "#config-form",
        "focusText": {
          "de": "Chatango Card im Testprofil konfigurieren",
          "en": "Configure Chatango Card in the test profile",
          "es": "Configura Chatango Card en el perfil de prueba",
          "fr": "Configurez Chatango Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "chatango-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/chatango/ui.html",
        "instructions": {
          "de": {
            "title": "Chatango Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Chatango Card von Raumname, Widget-Position und Chat-Thema. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Chatango Card in the test profile",
            "body": "Work in the visible Chatango Card area of room name, widget position, and chat theme. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Chatango Card en el perfil de prueba",
            "body": "Trabaja en el area visible Chatango Card de nombre de sala, posición del widget y tema del chat. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Chatango Card dans le profil de test",
            "body": "Travaillez dans la zone visible Chatango Card de nom de salon, position du widget et thème du chat. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/chatango/ui.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#config-form"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/chatango/ui.html"
          },
          {
            "type": "visible",
            "selector": "#config-form"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#config-form",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "room-placeholder",
      "copy": {
        "de": {
          "title": "Room Placeholder im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Room Placeholder von Raumname, Widget-Position und Chat-Thema. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Room Placeholder im Testprofil konfigurieren - Raumname, Widget-Position und Chat-Thema"
        },
        "en": {
          "title": "Configure Room Placeholder in the test profile",
          "body": "Work in the visible Room Placeholder area of room name, widget position, and chat theme. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Room Placeholder in the test profile - room name, widget position, and chat theme"
        },
        "es": {
          "title": "Configura Room Placeholder en el perfil de prueba",
          "body": "Trabaja en el area visible Room Placeholder de nombre de sala, posición del widget y tema del chat. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Room Placeholder en el perfil de prueba - nombre de sala, posición del widget y tema del chat"
        },
        "fr": {
          "title": "Configurez Room Placeholder dans le profil de test",
          "body": "Travaillez dans la zone visible Room Placeholder de nom de salon, position du widget et thème du chat. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Room Placeholder dans le profil de test - nom de salon, position du widget et thème du chat"
        }
      },
      "capture": {
        "route": "/plugins/chatango/ui.html",
        "assertVisible": "#roomHandle",
        "focusText": {
          "de": "Room Placeholder im Testprofil konfigurieren",
          "en": "Configure Room Placeholder in the test profile",
          "es": "Configura Room Placeholder en el perfil de prueba",
          "fr": "Configurez Room Placeholder dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "room-placeholder"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/chatango/ui.html",
        "instructions": {
          "de": {
            "title": "Room Placeholder im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Room Placeholder von Raumname, Widget-Position und Chat-Thema. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Room Placeholder in the test profile",
            "body": "Work in the visible Room Placeholder area of room name, widget position, and chat theme. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Room Placeholder en el perfil de prueba",
            "body": "Trabaja en el area visible Room Placeholder de nombre de sala, posición del widget y tema del chat. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Room Placeholder dans le profil de test",
            "body": "Travaillez dans la zone visible Room Placeholder de nom de salon, position du widget et thème du chat. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/chatango/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#roomHandle"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/chatango/ui.html"
          },
          {
            "type": "visible",
            "selector": "#roomHandle"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#roomHandle",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "widget-position",
      "copy": {
        "de": {
          "title": "Widget Position im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Widget Position von Raumname, Widget-Position und Chat-Thema. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Widget Position im Testprofil konfigurieren - Raumname, Widget-Position und Chat-Thema"
        },
        "en": {
          "title": "Configure Widget Position in the test profile",
          "body": "Work in the visible Widget Position area of room name, widget position, and chat theme. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Widget Position in the test profile - room name, widget position, and chat theme"
        },
        "es": {
          "title": "Configura Widget Position en el perfil de prueba",
          "body": "Trabaja en el area visible Widget Position de nombre de sala, posición del widget y tema del chat. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Widget Position en el perfil de prueba - nombre de sala, posición del widget y tema del chat"
        },
        "fr": {
          "title": "Configurez Widget Position dans le profil de test",
          "body": "Travaillez dans la zone visible Widget Position de nom de salon, position du widget et thème du chat. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Widget Position dans le profil de test - nom de salon, position du widget et thème du chat"
        }
      },
      "capture": {
        "route": "/plugins/chatango/ui.html",
        "assertVisible": "#widgetPosition",
        "focusText": {
          "de": "Widget Position im Testprofil konfigurieren",
          "en": "Configure Widget Position in the test profile",
          "es": "Configura Widget Position en el perfil de prueba",
          "fr": "Configurez Widget Position dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "widget-position"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/chatango/ui.html",
        "instructions": {
          "de": {
            "title": "Widget Position im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Widget Position von Raumname, Widget-Position und Chat-Thema. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Widget Position in the test profile",
            "body": "Work in the visible Widget Position area of room name, widget position, and chat theme. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Widget Position en el perfil de prueba",
            "body": "Trabaja en el area visible Widget Position de nombre de sala, posición del widget y tema del chat. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Widget Position dans le profil de test",
            "body": "Travaillez dans la zone visible Widget Position de nom de salon, position du widget et thème du chat. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/chatango/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#widgetPosition"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/chatango/ui.html"
          },
          {
            "type": "visible",
            "selector": "#widgetPosition"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#widgetPosition",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "widget-preview",
      "copy": {
        "de": {
          "title": "Widget Preview lokal testen",
          "body": "Fuehre Widget Preview nur mit die lokale Widget-Vorschau mit einem Platzhalterraum im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "das Widget zeigt die gewählte Position ohne einen externen Chat zu öffnen",
          "alt": "Widget Preview lokal testen - Raumname, Widget-Position und Chat-Thema"
        },
        "en": {
          "title": "Test Widget Preview locally",
          "body": "Run Widget Preview only with the local widget preview with a placeholder room in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the widget shows the chosen position without opening an external chat",
          "alt": "Test Widget Preview locally - room name, widget position, and chat theme"
        },
        "es": {
          "title": "Prueba Widget Preview localmente",
          "body": "Ejecuta Widget Preview solo con la vista previa local con una sala de marcador en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "el widget muestra la posición elegida sin abrir un chat externo",
          "alt": "Prueba Widget Preview localmente - nombre de sala, posición del widget y tema del chat"
        },
        "fr": {
          "title": "Testez Widget Preview localement",
          "body": "Executez Widget Preview uniquement avec l’aperçu local du widget avec un salon fictif dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "le widget montre la position choisie sans ouvrir de chat externe",
          "alt": "Testez Widget Preview localement - nom de salon, position du widget et thème du chat"
        }
      },
      "capture": {
        "route": "/plugins/chatango/ui.html",
        "assertVisible": "#btn-preview",
        "focusText": {
          "de": "Widget Preview lokal testen",
          "en": "Test Widget Preview locally",
          "es": "Prueba Widget Preview localmente",
          "fr": "Testez Widget Preview localement"
        },
        "action": {
          "type": "run-local-preview",
          "stepId": "widget-preview"
        },
        "expected": {
          "de": "das Widget zeigt die gewählte Position ohne einen externen Chat zu öffnen",
          "en": "the widget shows the chosen position without opening an external chat",
          "es": "el widget muestra la posición elegida sin abrir un chat externo",
          "fr": "le widget montre la position choisie sans ouvrir de chat externe"
        }
      },
      "workflow": {
        "route": "/plugins/chatango/ui.html",
        "instructions": {
          "de": {
            "title": "Widget Preview lokal testen",
            "body": "Fuehre Widget Preview nur mit die lokale Widget-Vorschau mit einem Platzhalterraum im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "das Widget zeigt die gewählte Position ohne einen externen Chat zu öffnen"
          },
          "en": {
            "title": "Test Widget Preview locally",
            "body": "Run Widget Preview only with the local widget preview with a placeholder room in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the widget shows the chosen position without opening an external chat"
          },
          "es": {
            "title": "Prueba Widget Preview localmente",
            "body": "Ejecuta Widget Preview solo con la vista previa local con una sala de marcador en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "el widget muestra la posición elegida sin abrir un chat externo"
          },
          "fr": {
            "title": "Testez Widget Preview localement",
            "body": "Executez Widget Preview uniquement avec l’aperçu local du widget avec un salon fictif dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "le widget montre la position choisie sans ouvrir de chat externe"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/chatango/ui.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#btn-preview"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/chatango/ui.html"
          },
          {
            "type": "visible",
            "selector": "#btn-preview"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#btn-preview",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "chatango-review",
      "copy": {
        "de": {
          "title": "Chatango Review lokal testen",
          "body": "Fuehre Chatango Review nur mit die lokale Widget-Vorschau mit einem Platzhalterraum im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "das Widget zeigt die gewählte Position ohne einen externen Chat zu öffnen",
          "alt": "Chatango Review lokal testen - Raumname, Widget-Position und Chat-Thema"
        },
        "en": {
          "title": "Test Chatango Review locally",
          "body": "Run Chatango Review only with the local widget preview with a placeholder room in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the widget shows the chosen position without opening an external chat",
          "alt": "Test Chatango Review locally - room name, widget position, and chat theme"
        },
        "es": {
          "title": "Prueba Chatango Review localmente",
          "body": "Ejecuta Chatango Review solo con la vista previa local con una sala de marcador en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "el widget muestra la posición elegida sin abrir un chat externo",
          "alt": "Prueba Chatango Review localmente - nombre de sala, posición del widget y tema del chat"
        },
        "fr": {
          "title": "Testez Chatango Review localement",
          "body": "Executez Chatango Review uniquement avec l’aperçu local du widget avec un salon fictif dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "le widget montre la position choisie sans ouvrir de chat externe",
          "alt": "Testez Chatango Review localement - nom de salon, position du widget et thème du chat"
        }
      },
      "capture": {
        "route": "/plugins/chatango/ui.html",
        "assertVisible": "#close-preview-btn",
        "focusText": {
          "de": "Chatango Review lokal testen",
          "en": "Test Chatango Review locally",
          "es": "Prueba Chatango Review localmente",
          "fr": "Testez Chatango Review localement"
        },
        "action": {
          "type": "run-local-preview",
          "allowClick": true,
          "clickSelector": "#btn-preview",
          "stepId": "chatango-review"
        },
        "expected": {
          "de": "das Widget zeigt die gewählte Position ohne einen externen Chat zu öffnen",
          "en": "the widget shows the chosen position without opening an external chat",
          "es": "el widget muestra la posición elegida sin abrir un chat externo",
          "fr": "le widget montre la position choisie sans ouvrir de chat externe"
        }
      },
      "workflow": {
        "route": "/plugins/chatango/ui.html",
        "instructions": {
          "de": {
            "title": "Chatango Review lokal testen",
            "body": "Fuehre Chatango Review nur mit die lokale Widget-Vorschau mit einem Platzhalterraum im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "das Widget zeigt die gewählte Position ohne einen externen Chat zu öffnen"
          },
          "en": {
            "title": "Test Chatango Review locally",
            "body": "Run Chatango Review only with the local widget preview with a placeholder room in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the widget shows the chosen position without opening an external chat"
          },
          "es": {
            "title": "Prueba Chatango Review localmente",
            "body": "Ejecuta Chatango Review solo con la vista previa local con una sala de marcador en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "el widget muestra la posición elegida sin abrir un chat externo"
          },
          "fr": {
            "title": "Testez Chatango Review localement",
            "body": "Executez Chatango Review uniquement avec l’aperçu local du widget avec un salon fictif dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "le widget montre la position choisie sans ouvrir de chat externe"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/chatango/ui.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#btn-preview"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/chatango/ui.html"
          },
          {
            "type": "visible",
            "selector": "#close-preview-btn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#close-preview-btn",
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
