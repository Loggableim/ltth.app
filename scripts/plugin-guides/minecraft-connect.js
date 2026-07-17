'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "minecraft-connect",
  "route": "/plugins/minecraft-connect/minecraft-connect.html",
  "topic": {
    "de": "Serveradresse, Ereignisbindung und Nachrichtenformat",
    "en": "server address, event binding, and message format",
    "es": "dirección del servidor, enlace de eventos y formato de mensaje",
    "fr": "adresse serveur, liaison d’événements et format de message"
  },
  "test": {
    "de": "eine lokale Offline-Nachricht",
    "en": "a local offline message",
    "es": "un mensaje local sin conexión",
    "fr": "un message local hors ligne"
  },
  "expected": {
    "de": "die Konfiguration wird geprüft, ohne einen Minecraft-Server zu kontaktieren",
    "en": "the configuration is checked without contacting a Minecraft server",
    "es": "la configuración se comprueba sin contactar un servidor de Minecraft",
    "fr": "la configuration est contrôlée sans contacter de serveur Minecraft"
  },
  "requirement": "network",
  "safety": "credentials",
  "mode": "ui",
  "overlay": "/plugins/minecraft-connect/overlay/minecraft_overlay.html",
  "overlayWorkflowStepIds": [
    "minecraft-overlay-settings"
  ],
  "related": [
    "osc-bridge",
    "api-bridge"
  ],
  "copy": {
    "de": {
      "title": "Minecraft Connect",
      "summary": "Minecraft Connect richtet Serveradresse, Ereignisbindung und Nachrichtenformat ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "die Konfiguration wird geprüft, ohne einen Minecraft-Server zu kontaktieren",
      "requirements": "LTTH Dashboard; externe Endpunkte bleiben in dieser Anleitung getrennt. Dieser konkrete Minecraft Connect-Ablauf behandelt Serveradresse, Ereignisbindung und Nachrichtenformat.",
      "safety": "Keine echten API-Schlüssel oder Konten eingeben; Platzhalter bleiben Platzhalter. Dieser konkrete Minecraft Connect-Ablauf behandelt Serveradresse, Ereignisbindung und Nachrichtenformat.",
      "troubleshooting": "Wenn Serveradresse, Ereignisbindung und Nachrichtenformat nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "osc-bridge",
        "api-bridge"
      ]
    },
    "en": {
      "title": "Minecraft Connect",
      "summary": "Minecraft Connect configures server address, event binding, and message format with a safe local check instead of a LIVE trigger.",
      "firstResult": "the configuration is checked without contacting a Minecraft server",
      "requirements": "LTTH Dashboard; external endpoints remain disconnected in this guide. This Minecraft Connect workflow specifically covers server address, event binding, and message format.",
      "safety": "Do not enter real API keys or accounts; placeholders stay placeholders. This Minecraft Connect workflow specifically covers server address, event binding, and message format.",
      "troubleshooting": "If server address, event binding, and message format is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "osc-bridge",
        "api-bridge"
      ]
    },
    "es": {
      "title": "Minecraft Connect",
      "summary": "Minecraft Connect configura dirección del servidor, enlace de eventos y formato de mensaje mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "la configuración se comprueba sin contactar un servidor de Minecraft",
      "requirements": "El panel de LTTH; los extremos externos permanecen desconectados en esta guía. Este flujo concreto de Minecraft Connect trata dirección del servidor, enlace de eventos y formato de mensaje.",
      "safety": "No introduzcas claves API ni cuentas reales; los marcadores siguen siendo marcadores. Este flujo concreto de Minecraft Connect trata dirección del servidor, enlace de eventos y formato de mensaje.",
      "troubleshooting": "Si dirección del servidor, enlace de eventos y formato de mensaje no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "osc-bridge",
        "api-bridge"
      ]
    },
    "fr": {
      "title": "Minecraft Connect",
      "summary": "Minecraft Connect configure adresse serveur, liaison d’événements et format de message avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "la configuration est contrôlée sans contacter de serveur Minecraft",
      "requirements": "Le tableau de bord LTTH ; les points externes restent déconnectés dans ce guide. Ce flux spécifique de Minecraft Connect couvre adresse serveur, liaison d’événements et format de message.",
      "safety": "Ne saisissez aucune clé API ni compte réel ; les espaces réservés restent des espaces réservés. Ce flux spécifique de Minecraft Connect couvre adresse serveur, liaison d’événements et format de message.",
      "troubleshooting": "Si adresse serveur, liaison d’événements et format de message n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "osc-bridge",
        "api-bridge"
      ]
    }
  },
  "steps": [
    {
      "id": "minecraft-card",
      "copy": {
        "de": {
          "title": "Minecraft Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Minecraft Card von Serveradresse, Ereignisbindung und Nachrichtenformat. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Minecraft Card im Testprofil konfigurieren - Serveradresse, Ereignisbindung und Nachrichtenformat"
        },
        "en": {
          "title": "Configure Minecraft Card in the test profile",
          "body": "Work in the visible Minecraft Card area of server address, event binding, and message format. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Minecraft Card in the test profile - server address, event binding, and message format"
        },
        "es": {
          "title": "Configura Minecraft Card en el perfil de prueba",
          "body": "Trabaja en el area visible Minecraft Card de dirección del servidor, enlace de eventos y formato de mensaje. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Minecraft Card en el perfil de prueba - dirección del servidor, enlace de eventos y formato de mensaje"
        },
        "fr": {
          "title": "Configurez Minecraft Card dans le profil de test",
          "body": "Travaillez dans la zone visible Minecraft Card de adresse serveur, liaison d’événements et format de message. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Minecraft Card dans le profil de test - adresse serveur, liaison d’événements et format de message"
        }
      },
      "capture": {
        "route": "/plugins/minecraft-connect/minecraft-connect.html",
        "assertVisible": "#commands-tab",
        "focusText": {
          "de": "Minecraft Card im Testprofil konfigurieren",
          "en": "Configure Minecraft Card in the test profile",
          "es": "Configura Minecraft Card en el perfil de prueba",
          "fr": "Configurez Minecraft Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "minecraft-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/minecraft-connect/minecraft-connect.html",
        "instructions": {
          "de": {
            "title": "Minecraft Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Minecraft Card von Serveradresse, Ereignisbindung und Nachrichtenformat. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Minecraft Card in the test profile",
            "body": "Work in the visible Minecraft Card area of server address, event binding, and message format. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Minecraft Card en el perfil de prueba",
            "body": "Trabaja en el area visible Minecraft Card de dirección del servidor, enlace de eventos y formato de mensaje. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Minecraft Card dans le profil de test",
            "body": "Travaillez dans la zone visible Minecraft Card de adresse serveur, liaison d’événements et format de message. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/minecraft-connect/minecraft-connect.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#commands-tab"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": 200
          },
          {
            "type": "url",
            "expected": {
              "path": "/plugins/minecraft-connect/minecraft-connect.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#commands-tab"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#commands-tab",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "offline-address",
      "copy": {
        "de": {
          "title": "Offline Address im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Offline Address von Serveradresse, Ereignisbindung und Nachrichtenformat. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Offline Address im Testprofil konfigurieren - Serveradresse, Ereignisbindung und Nachrichtenformat"
        },
        "en": {
          "title": "Configure Offline Address in the test profile",
          "body": "Work in the visible Offline Address area of server address, event binding, and message format. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Offline Address in the test profile - server address, event binding, and message format"
        },
        "es": {
          "title": "Configura Offline Address en el perfil de prueba",
          "body": "Trabaja en el area visible Offline Address de dirección del servidor, enlace de eventos y formato de mensaje. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Offline Address en el perfil de prueba - dirección del servidor, enlace de eventos y formato de mensaje"
        },
        "fr": {
          "title": "Configurez Offline Address dans le profil de test",
          "body": "Travaillez dans la zone visible Offline Address de adresse serveur, liaison d’événements et format de message. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Offline Address dans le profil de test - adresse serveur, liaison d’événements et format de message"
        }
      },
      "capture": {
        "route": "/plugins/minecraft-connect/minecraft-connect.html",
        "assertVisible": "#wsHost",
        "focusText": {
          "de": "Offline Address im Testprofil konfigurieren",
          "en": "Configure Offline Address in the test profile",
          "es": "Configura Offline Address en el perfil de prueba",
          "fr": "Configurez Offline Address dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "prepare": "open-minecraft-setup-tab",
          "stepId": "offline-address"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/minecraft-connect/minecraft-connect.html",
        "instructions": {
          "de": {
            "title": "Offline Address im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Offline Address von Serveradresse, Ereignisbindung und Nachrichtenformat. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Offline Address in the test profile",
            "body": "Work in the visible Offline Address area of server address, event binding, and message format. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Offline Address en el perfil de prueba",
            "body": "Trabaja en el area visible Offline Address de dirección del servidor, enlace de eventos y formato de mensaje. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Offline Address dans le profil de test",
            "body": "Travaillez dans la zone visible Offline Address de adresse serveur, liaison d’événements et format de message. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/minecraft-connect/minecraft-connect.html"
          },
          {
            "type": "prepare",
            "name": "open-minecraft-setup-tab"
          },
          {
            "type": "set-demo-value",
            "selector": "#wsHost"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": 200
          },
          {
            "type": "url",
            "expected": {
              "path": "/plugins/minecraft-connect/minecraft-connect.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#wsHost"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#wsHost",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "event-format",
      "copy": {
        "de": {
          "title": "Event Format im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Event Format von Serveradresse, Ereignisbindung und Nachrichtenformat. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Event Format im Testprofil konfigurieren - Serveradresse, Ereignisbindung und Nachrichtenformat"
        },
        "en": {
          "title": "Configure Event Format in the test profile",
          "body": "Work in the visible Event Format area of server address, event binding, and message format. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Event Format in the test profile - server address, event binding, and message format"
        },
        "es": {
          "title": "Configura Event Format en el perfil de prueba",
          "body": "Trabaja en el area visible Event Format de dirección del servidor, enlace de eventos y formato de mensaje. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Event Format en el perfil de prueba - dirección del servidor, enlace de eventos y formato de mensaje"
        },
        "fr": {
          "title": "Configurez Event Format dans le profil de test",
          "body": "Travaillez dans la zone visible Event Format de adresse serveur, liaison d’événements et format de message. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Event Format dans le profil de test - adresse serveur, liaison d’événements et format de message"
        }
      },
      "capture": {
        "route": "/plugins/minecraft-connect/minecraft-connect.html",
        "assertVisible": "#chatRelayTargets",
        "focusText": {
          "de": "Event Format im Testprofil konfigurieren",
          "en": "Configure Event Format in the test profile",
          "es": "Configura Event Format en el perfil de prueba",
          "fr": "Configurez Event Format dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "prepare": "open-minecraft-chat-tab",
          "stepId": "event-format"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/minecraft-connect/minecraft-connect.html",
        "instructions": {
          "de": {
            "title": "Event Format im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Event Format von Serveradresse, Ereignisbindung und Nachrichtenformat. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Event Format in the test profile",
            "body": "Work in the visible Event Format area of server address, event binding, and message format. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Event Format en el perfil de prueba",
            "body": "Trabaja en el area visible Event Format de dirección del servidor, enlace de eventos y formato de mensaje. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Event Format dans le profil de test",
            "body": "Travaillez dans la zone visible Event Format de adresse serveur, liaison d’événements et format de message. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/minecraft-connect/minecraft-connect.html"
          },
          {
            "type": "prepare",
            "name": "open-minecraft-chat-tab"
          },
          {
            "type": "set-demo-value",
            "selector": "#chatRelayTargets"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": 200
          },
          {
            "type": "url",
            "expected": {
              "path": "/plugins/minecraft-connect/minecraft-connect.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#chatRelayTargets"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#chatRelayTargets",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "offline-message",
      "copy": {
        "de": {
          "title": "Offline Message lokal testen",
          "body": "Fuehre Offline Message nur mit eine lokale Offline-Nachricht im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "die Konfiguration wird geprüft, ohne einen Minecraft-Server zu kontaktieren",
          "alt": "Offline Message lokal testen - Serveradresse, Ereignisbindung und Nachrichtenformat"
        },
        "en": {
          "title": "Test Offline Message locally",
          "body": "Run Offline Message only with a local offline message in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the configuration is checked without contacting a Minecraft server",
          "alt": "Test Offline Message locally - server address, event binding, and message format"
        },
        "es": {
          "title": "Prueba Offline Message localmente",
          "body": "Ejecuta Offline Message solo con un mensaje local sin conexión en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "la configuración se comprueba sin contactar un servidor de Minecraft",
          "alt": "Prueba Offline Message localmente - dirección del servidor, enlace de eventos y formato de mensaje"
        },
        "fr": {
          "title": "Testez Offline Message localement",
          "body": "Executez Offline Message uniquement avec un message local hors ligne dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "la configuration est contrôlée sans contacter de serveur Minecraft",
          "alt": "Testez Offline Message localement - adresse serveur, liaison d’événements et format de message"
        }
      },
      "capture": {
        "route": "/plugins/minecraft-connect/minecraft-connect.html",
        "assertVisible": "#testActionBtn",
        "focusText": {
          "de": "Offline Message lokal testen",
          "en": "Test Offline Message locally",
          "es": "Prueba Offline Message localmente",
          "fr": "Testez Offline Message localement"
        },
        "action": {
          "type": "run-local-preview",
          "stepId": "offline-message"
        },
        "expected": {
          "de": "die Konfiguration wird geprüft, ohne einen Minecraft-Server zu kontaktieren",
          "en": "the configuration is checked without contacting a Minecraft server",
          "es": "la configuración se comprueba sin contactar un servidor de Minecraft",
          "fr": "la configuration est contrôlée sans contacter de serveur Minecraft"
        }
      },
      "workflow": {
        "route": "/plugins/minecraft-connect/minecraft-connect.html",
        "instructions": {
          "de": {
            "title": "Offline Message lokal testen",
            "body": "Fuehre Offline Message nur mit eine lokale Offline-Nachricht im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "die Konfiguration wird geprüft, ohne einen Minecraft-Server zu kontaktieren"
          },
          "en": {
            "title": "Test Offline Message locally",
            "body": "Run Offline Message only with a local offline message in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the configuration is checked without contacting a Minecraft server"
          },
          "es": {
            "title": "Prueba Offline Message localmente",
            "body": "Ejecuta Offline Message solo con un mensaje local sin conexión en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "la configuración se comprueba sin contactar un servidor de Minecraft"
          },
          "fr": {
            "title": "Testez Offline Message localement",
            "body": "Executez Offline Message uniquement avec un message local hors ligne dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "la configuration est contrôlée sans contacter de serveur Minecraft"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/minecraft-connect/minecraft-connect.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#testActionBtn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": 200
          },
          {
            "type": "url",
            "expected": {
              "path": "/plugins/minecraft-connect/minecraft-connect.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#testActionBtn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#testActionBtn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "minecraft-overlay-settings",
      "copy": {
        "de": {
          "title": "Overlay im Testprofil aktivieren",
          "body": "Öffne den Setup-Tab und prüfe den Schalter „Overlay aktivieren“. Die lokale Browser-Source-URL lautet /plugins/minecraft-connect/overlay/minecraft_overlay.html; verwende ausschließlich das Testprofil.",
          "expected": "Der Schalter „Overlay aktivieren“ ist im Setup-Tab sichtbar und aktiviert.",
          "alt": "Overlay im Testprofil aktivieren – lokale Browser-Source konfigurieren"
        },
        "en": {
          "title": "Enable the overlay in the test profile",
          "body": "Open the Setup tab and review the “Enable overlay” switch. The local browser-source URL is /plugins/minecraft-connect/overlay/minecraft_overlay.html; use the test profile only.",
          "expected": "The “Enable overlay” switch is visible in the Setup tab and enabled.",
          "alt": "Enable the overlay in the test profile – configure the local browser source"
        },
        "es": {
          "title": "Activa la superposición en el perfil de prueba",
          "body": "Abre la pestaña Configuración y revisa el interruptor «Activar superposición». La URL local de la fuente de navegador es /plugins/minecraft-connect/overlay/minecraft_overlay.html; usa únicamente el perfil de prueba.",
          "expected": "El interruptor «Activar superposición» está visible y activado en la pestaña Configuración.",
          "alt": "Activa la superposición en el perfil de prueba: configura la fuente local del navegador"
        },
        "fr": {
          "title": "Activez l’overlay dans le profil de test",
          "body": "Ouvrez l’onglet Configuration et vérifiez l’interrupteur « Activer l’overlay ». L’URL locale de la source navigateur est /plugins/minecraft-connect/overlay/minecraft_overlay.html ; utilisez uniquement le profil de test.",
          "expected": "L’interrupteur « Activer l’overlay » est visible et activé dans l’onglet Configuration.",
          "alt": "Activez l’overlay dans le profil de test – configurez la source navigateur locale"
        }
      },
      "capture": {
        "route": "/plugins/minecraft-connect/minecraft-connect.html",
        "assertVisible": "#overlayEnabled",
        "focusText": {
          "de": "Overlay im Testprofil aktivieren",
          "en": "Enable the overlay in the test profile",
          "es": "Activa la superposición en el perfil de prueba",
          "fr": "Activez l’overlay dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "prepare": "open-minecraft-setup-tab",
          "stepId": "minecraft-overlay-settings"
        },
        "expected": {
          "de": "Der Schalter „Overlay aktivieren“ ist im Setup-Tab sichtbar und aktiviert.",
          "en": "The “Enable overlay” switch is visible in the Setup tab and enabled.",
          "es": "El interruptor «Activar superposición» está visible y activado en la pestaña Configuración.",
          "fr": "L’interrupteur « Activer l’overlay » est visible et activé dans l’onglet Configuration."
        }
      },
      "workflow": {
        "route": "/plugins/minecraft-connect/minecraft-connect.html",
        "instructions": {
          "de": {
            "title": "Overlay im Testprofil aktivieren",
            "body": "Öffne den Setup-Tab und prüfe den Schalter „Overlay aktivieren“. Die lokale Browser-Source-URL lautet /plugins/minecraft-connect/overlay/minecraft_overlay.html; verwende ausschließlich das Testprofil.",
            "expected": "Der Schalter „Overlay aktivieren“ ist im Setup-Tab sichtbar und aktiviert."
          },
          "en": {
            "title": "Enable the overlay in the test profile",
            "body": "Open the Setup tab and review the “Enable overlay” switch. The local browser-source URL is /plugins/minecraft-connect/overlay/minecraft_overlay.html; use the test profile only.",
            "expected": "The “Enable overlay” switch is visible in the Setup tab and enabled."
          },
          "es": {
            "title": "Activa la superposición en el perfil de prueba",
            "body": "Abre la pestaña Configuración y revisa el interruptor «Activar superposición». La URL local de la fuente de navegador es /plugins/minecraft-connect/overlay/minecraft_overlay.html; usa únicamente el perfil de prueba.",
            "expected": "El interruptor «Activar superposición» está visible y activado en la pestaña Configuración."
          },
          "fr": {
            "title": "Activez l’overlay dans le profil de test",
            "body": "Ouvrez l’onglet Configuration et vérifiez l’interrupteur « Activer l’overlay ». L’URL locale de la source navigateur est /plugins/minecraft-connect/overlay/minecraft_overlay.html ; utilisez uniquement le profil de test.",
            "expected": "L’interrupteur « Activer l’overlay » est visible et activé dans l’onglet Configuration."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/minecraft-connect/minecraft-connect.html"
          },
          {
            "type": "prepare",
            "name": "open-minecraft-setup-tab"
          },
          {
            "type": "set-demo-value",
            "selector": "#overlayEnabled"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": 200
          },
          {
            "type": "url",
            "expected": {
              "path": "/plugins/minecraft-connect/minecraft-connect.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#overlayEnabled"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#overlayEnabled",
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
