'use strict';

const { exactLocalUrlExpectation } = require('../lib/guide-overlay-entry-points');

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
const guide = {
  "id": "music-bot",
  "route": "/plugins/music-bot/ui.html",
  "topic": {
    "de": "MPV-Pfad, Anfragequeue und Moderationsregel",
    "en": "MPV path, request queue, and moderation rule",
    "es": "ruta de MPV, cola de solicitudes y regla de moderación",
    "fr": "chemin MPV, file de demandes et règle de modération"
  },
  "test": {
    "de": "eine lokale Beispieldatei in der Queue",
    "en": "a local sample file in the queue",
    "es": "un archivo de ejemplo local en la cola",
    "fr": "un fichier d’exemple local dans la file"
  },
  "expected": {
    "de": "die Queue zeigt den Eintrag; es startet keine externe Suche und keine Wiedergabe",
    "en": "the queue shows the entry; no external search or playback starts",
    "es": "la cola muestra la entrada; no inicia búsqueda externa ni reproducción",
    "fr": "la file affiche l’entrée ; aucune recherche externe ni lecture ne démarre"
  },
  "requirement": "audio",
  "safety": "local",
  "mode": "ui",
  "overlay": "/plugins/music-bot/overlay.html",
  "related": [
    "soundboard",
    "tts"
  ],
  "copy": {
    "de": {
      "title": "Music Bot",
      "summary": "Music Bot richtet MPV-Pfad, Anfragequeue und Moderationsregel ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "die Queue zeigt den Eintrag; es startet keine externe Suche und keine Wiedergabe",
      "requirements": "LTTH Dashboard und ein lokales Audio-Ausgabegerät. Dieser konkrete Music Bot-Ablauf behandelt MPV-Pfad, Anfragequeue und Moderationsregel.",
      "safety": "Verwende ausschließlich Demo-Ereignisse und ein temporäres Testprofil. Dieser konkrete Music Bot-Ablauf behandelt MPV-Pfad, Anfragequeue und Moderationsregel.",
      "troubleshooting": "Wenn MPV-Pfad, Anfragequeue und Moderationsregel nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "soundboard",
        "tts"
      ]
    },
    "en": {
      "title": "Music Bot",
      "summary": "Music Bot configures MPV path, request queue, and moderation rule with a safe local check instead of a LIVE trigger.",
      "firstResult": "the queue shows the entry; no external search or playback starts",
      "requirements": "LTTH Dashboard and a local audio output device. This Music Bot workflow specifically covers MPV path, request queue, and moderation rule.",
      "safety": "Use demo events and a temporary test profile only. This Music Bot workflow specifically covers MPV path, request queue, and moderation rule.",
      "troubleshooting": "If MPV path, request queue, and moderation rule is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "soundboard",
        "tts"
      ]
    },
    "es": {
      "title": "Music Bot",
      "summary": "Music Bot configura ruta de MPV, cola de solicitudes y regla de moderación mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "la cola muestra la entrada; no inicia búsqueda externa ni reproducción",
      "requirements": "El panel de LTTH y un dispositivo de salida de audio local. Este flujo concreto de Music Bot trata ruta de MPV, cola de solicitudes y regla de moderación.",
      "safety": "Usa solo eventos de demostración y un perfil de prueba temporal. Este flujo concreto de Music Bot trata ruta de MPV, cola de solicitudes y regla de moderación.",
      "troubleshooting": "Si ruta de MPV, cola de solicitudes y regla de moderación no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "soundboard",
        "tts"
      ]
    },
    "fr": {
      "title": "Music Bot",
      "summary": "Music Bot configure chemin MPV, file de demandes et règle de modération avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "la file affiche l’entrée ; aucune recherche externe ni lecture ne démarre",
      "requirements": "Le tableau de bord LTTH et un périphérique audio local. Ce flux spécifique de Music Bot couvre chemin MPV, file de demandes et règle de modération.",
      "safety": "Utilisez uniquement des événements de démonstration et un profil de test temporaire. Ce flux spécifique de Music Bot couvre chemin MPV, file de demandes et règle de modération.",
      "troubleshooting": "Si chemin MPV, file de demandes et règle de modération n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "soundboard",
        "tts"
      ]
    }
  },
  "steps": [
    {
      "id": "music-card",
      "copy": {
        "de": {
          "title": "Music Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Music Card von MPV-Pfad, Anfragequeue und Moderationsregel. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Music Card im Testprofil konfigurieren - MPV-Pfad, Anfragequeue und Moderationsregel"
        },
        "en": {
          "title": "Configure Music Card in the test profile",
          "body": "Work in the visible Music Card area of MPV path, request queue, and moderation rule. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Music Card in the test profile - MPV path, request queue, and moderation rule"
        },
        "es": {
          "title": "Configura Music Card en el perfil de prueba",
          "body": "Trabaja en el area visible Music Card de ruta de MPV, cola de solicitudes y regla de moderación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Music Card en el perfil de prueba - ruta de MPV, cola de solicitudes y regla de moderación"
        },
        "fr": {
          "title": "Configurez Music Card dans le profil de test",
          "body": "Travaillez dans la zone visible Music Card de chemin MPV, file de demandes et règle de modération. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Music Card dans le profil de test - chemin MPV, file de demandes et règle de modération"
        }
      },
      "capture": {
        "route": "/plugins/music-bot/ui.html",
        "assertVisible": "#musicbot-onboarding",
        "focusText": {
          "de": "Music Card im Testprofil konfigurieren",
          "en": "Configure Music Card in the test profile",
          "es": "Configura Music Card en el perfil de prueba",
          "fr": "Configurez Music Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "music-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/music-bot/ui.html",
        "instructions": {
          "de": {
            "title": "Music Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Music Card von MPV-Pfad, Anfragequeue und Moderationsregel. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Music Card in the test profile",
            "body": "Work in the visible Music Card area of MPV path, request queue, and moderation rule. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Music Card en el perfil de prueba",
            "body": "Trabaja en el area visible Music Card de ruta de MPV, cola de solicitudes y regla de moderación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Music Card dans le profil de test",
            "body": "Travaillez dans la zone visible Music Card de chemin MPV, file de demandes et règle de modération. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/music-bot/ui.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#musicbot-onboarding"
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
              "path": "/plugins/music-bot/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#musicbot-onboarding"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#musicbot-onboarding",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "mpv-path",
      "copy": {
        "de": {
          "title": "MPV-Pfad im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich MPV-Pfad von MPV-Pfad, Anfragequeue und Moderationsregel. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "MPV-Pfad im Testprofil konfigurieren - MPV-Pfad, Anfragequeue und Moderationsregel"
        },
        "en": {
          "title": "Configure MPV path in the test profile",
          "body": "Work in the visible MPV path area of MPV path, request queue, and moderation rule. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure MPV path in the test profile - MPV path, request queue, and moderation rule"
        },
        "es": {
          "title": "Configura ruta de MPV en el perfil de prueba",
          "body": "Trabaja en el area visible ruta de MPV de ruta de MPV, cola de solicitudes y regla de moderación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura ruta de MPV en el perfil de prueba - ruta de MPV, cola de solicitudes y regla de moderación"
        },
        "fr": {
          "title": "Configurez chemin MPV dans le profil de test",
          "body": "Travaillez dans la zone visible chemin MPV de chemin MPV, file de demandes et règle de modération. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez chemin MPV dans le profil de test - chemin MPV, file de demandes et règle de modération"
        }
      },
      "capture": {
        "route": "/plugins/music-bot/ui.html",
        "assertVisible": "#musicbot-onboarding-settings",
        "focusText": {
          "de": "MPV-Pfad im Testprofil konfigurieren",
          "en": "Configure MPV path in the test profile",
          "es": "Configura ruta de MPV en el perfil de prueba",
          "fr": "Configurez chemin MPV dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "mpv-path"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/music-bot/ui.html",
        "instructions": {
          "de": {
            "title": "MPV-Pfad im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich MPV-Pfad von MPV-Pfad, Anfragequeue und Moderationsregel. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure MPV path in the test profile",
            "body": "Work in the visible MPV path area of MPV path, request queue, and moderation rule. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura ruta de MPV en el perfil de prueba",
            "body": "Trabaja en el area visible ruta de MPV de ruta de MPV, cola de solicitudes y regla de moderación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez chemin MPV dans le profil de test",
            "body": "Travaillez dans la zone visible chemin MPV de chemin MPV, file de demandes et règle de modération. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/music-bot/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#musicbot-onboarding-settings"
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
              "path": "/plugins/music-bot/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#musicbot-onboarding-settings"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#musicbot-onboarding-settings",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "queue-rule",
      "copy": {
        "de": {
          "title": "Queue Rule im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Queue Rule von MPV-Pfad, Anfragequeue und Moderationsregel. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Queue Rule im Testprofil konfigurieren - MPV-Pfad, Anfragequeue und Moderationsregel"
        },
        "en": {
          "title": "Configure Queue Rule in the test profile",
          "body": "Work in the visible Queue Rule area of MPV path, request queue, and moderation rule. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Queue Rule in the test profile - MPV path, request queue, and moderation rule"
        },
        "es": {
          "title": "Configura Queue Rule en el perfil de prueba",
          "body": "Trabaja en el area visible Queue Rule de ruta de MPV, cola de solicitudes y regla de moderación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Queue Rule en el perfil de prueba - ruta de MPV, cola de solicitudes y regla de moderación"
        },
        "fr": {
          "title": "Configurez Queue Rule dans le profil de test",
          "body": "Travaillez dans la zone visible Queue Rule de chemin MPV, file de demandes et règle de modération. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Queue Rule dans le profil de test - chemin MPV, file de demandes et règle de modération"
        }
      },
      "capture": {
        "route": "/plugins/music-bot/ui.html",
        "assertVisible": "#preview-source",
        "focusText": {
          "de": "Queue Rule im Testprofil konfigurieren",
          "en": "Configure Queue Rule in the test profile",
          "es": "Configura Queue Rule en el perfil de prueba",
          "fr": "Configurez Queue Rule dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "queue-rule"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/music-bot/ui.html",
        "instructions": {
          "de": {
            "title": "Queue Rule im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Queue Rule von MPV-Pfad, Anfragequeue und Moderationsregel. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Queue Rule in the test profile",
            "body": "Work in the visible Queue Rule area of MPV path, request queue, and moderation rule. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Queue Rule en el perfil de prueba",
            "body": "Trabaja en el area visible Queue Rule de ruta de MPV, cola de solicitudes y regla de moderación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Queue Rule dans le profil de test",
            "body": "Travaillez dans la zone visible Queue Rule de chemin MPV, file de demandes et règle de modération. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/music-bot/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#preview-source"
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
              "path": "/plugins/music-bot/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#preview-source"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#preview-source",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "sample-queue",
      "copy": {
        "de": {
          "title": "Sample Queue im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Sample Queue von MPV-Pfad, Anfragequeue und Moderationsregel. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Sample Queue im Testprofil konfigurieren - MPV-Pfad, Anfragequeue und Moderationsregel"
        },
        "en": {
          "title": "Configure Sample Queue in the test profile",
          "body": "Work in the visible Sample Queue area of MPV path, request queue, and moderation rule. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Sample Queue in the test profile - MPV path, request queue, and moderation rule"
        },
        "es": {
          "title": "Configura Sample Queue en el perfil de prueba",
          "body": "Trabaja en el area visible Sample Queue de ruta de MPV, cola de solicitudes y regla de moderación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Sample Queue en el perfil de prueba - ruta de MPV, cola de solicitudes y regla de moderación"
        },
        "fr": {
          "title": "Configurez Sample Queue dans le profil de test",
          "body": "Travaillez dans la zone visible Sample Queue de chemin MPV, file de demandes et règle de modération. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Sample Queue dans le profil de test - chemin MPV, file de demandes et règle de modération"
        }
      },
      "capture": {
        "route": "/plugins/music-bot/ui.html",
        "assertVisible": "#request-btn",
        "focusText": {
          "de": "Sample Queue im Testprofil konfigurieren",
          "en": "Configure Sample Queue in the test profile",
          "es": "Configura Sample Queue en el perfil de prueba",
          "fr": "Configurez Sample Queue dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "sample-queue"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/music-bot/ui.html",
        "instructions": {
          "de": {
            "title": "Sample Queue im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Sample Queue von MPV-Pfad, Anfragequeue und Moderationsregel. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Sample Queue in the test profile",
            "body": "Work in the visible Sample Queue area of MPV path, request queue, and moderation rule. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Sample Queue en el perfil de prueba",
            "body": "Trabaja en el area visible Sample Queue de ruta de MPV, cola de solicitudes y regla de moderación. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Sample Queue dans le profil de test",
            "body": "Travaillez dans la zone visible Sample Queue de chemin MPV, file de demandes et règle de modération. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/music-bot/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#request-btn"
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
              "path": "/plugins/music-bot/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#request-btn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#request-btn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "music-overlay",
      "copy": {
        "de": {
          "title": "Music Overlay als Overlay-Vorschau oeffnen",
          "body": "Oeffne die echte Music Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
          "expected": "die Queue zeigt den Eintrag; es startet keine externe Suche und keine Wiedergabe",
          "alt": "Music Overlay als Overlay-Vorschau oeffnen - MPV-Pfad, Anfragequeue und Moderationsregel"
        },
        "en": {
          "title": "Open Music Overlay as an overlay preview",
          "body": "Open the real Music Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
          "expected": "the queue shows the entry; no external search or playback starts",
          "alt": "Open Music Overlay as an overlay preview - MPV path, request queue, and moderation rule"
        },
        "es": {
          "title": "Abre Music Overlay como vista previa de overlay",
          "body": "Abre la superficie real Music Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
          "expected": "la cola muestra la entrada; no inicia búsqueda externa ni reproducción",
          "alt": "Abre Music Overlay como vista previa de overlay - ruta de MPV, cola de solicitudes y regla de moderación"
        },
        "fr": {
          "title": "Ouvrez Music Overlay comme apercu overlay",
          "body": "Ouvrez la vraie surface Music Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
          "expected": "la file affiche l’entrée ; aucune recherche externe ni lecture ne démarre",
          "alt": "Ouvrez Music Overlay comme apercu overlay - chemin MPV, file de demandes et règle de modération"
        }
      },
      "capture": {
        "route": "/plugins/music-bot/overlay.html",
        "assertVisible": "#overlay-root",
        "focusText": {
          "de": "Music Overlay als Overlay-Vorschau oeffnen",
          "en": "Open Music Overlay as an overlay preview",
          "es": "Abre Music Overlay como vista previa de overlay",
          "fr": "Ouvrez Music Overlay comme apercu overlay"
        },
        "action": {
          "type": "open-overlay-preview",
          "stepId": "music-overlay"
        },
        "expected": {
          "de": "die Queue zeigt den Eintrag; es startet keine externe Suche und keine Wiedergabe",
          "en": "the queue shows the entry; no external search or playback starts",
          "es": "la cola muestra la entrada; no inicia búsqueda externa ni reproducción",
          "fr": "la file affiche l’entrée ; aucune recherche externe ni lecture ne démarre"
        }
      },
      "workflow": {
        "route": "/plugins/music-bot/overlay.html",
        "instructions": {
          "de": {
            "title": "Music Overlay als Overlay-Vorschau oeffnen",
            "body": "Oeffne die echte Music Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
            "expected": "die Queue zeigt den Eintrag; es startet keine externe Suche und keine Wiedergabe"
          },
          "en": {
            "title": "Open Music Overlay as an overlay preview",
            "body": "Open the real Music Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
            "expected": "the queue shows the entry; no external search or playback starts"
          },
          "es": {
            "title": "Abre Music Overlay como vista previa de overlay",
            "body": "Abre la superficie real Music Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
            "expected": "la cola muestra la entrada; no inicia búsqueda externa ni reproducción"
          },
          "fr": {
            "title": "Ouvrez Music Overlay comme apercu overlay",
            "body": "Ouvrez la vraie surface Music Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
            "expected": "la file affiche l’entrée ; aucune recherche externe ni lecture ne démarre"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/music-bot/overlay.html"
          },
          {
            "type": "open-overlay-preview",
            "selector": "#overlay-root"
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
              "path": "/plugins/music-bot/overlay.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#overlay-root"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#overlay-root",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "queue-reset",
      "copy": {
        "de": {
          "title": "Queue Reset sicher zuruecksetzen",
          "body": "Entferne nur die Demo-Werte fuer Queue Reset, bevor du MPV-Pfad, Anfragequeue und Moderationsregel produktiv vorbereitest.",
          "expected": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "alt": "Queue Reset sicher zuruecksetzen - MPV-Pfad, Anfragequeue und Moderationsregel"
        },
        "en": {
          "title": "Reset Queue Reset safely",
          "body": "Remove only the demo values for Queue Reset before preparing MPV path, request queue, and moderation rule for production.",
          "expected": "The test profile remains free of production impact.",
          "alt": "Reset Queue Reset safely - MPV path, request queue, and moderation rule"
        },
        "es": {
          "title": "Restablece Queue Reset con seguridad",
          "body": "Elimina solo los valores demo de Queue Reset antes de preparar ruta de MPV, cola de solicitudes y regla de moderación para produccion.",
          "expected": "El perfil de prueba permanece sin impacto de producción.",
          "alt": "Restablece Queue Reset con seguridad - ruta de MPV, cola de solicitudes y regla de moderación"
        },
        "fr": {
          "title": "Reinitialisez Queue Reset en securite",
          "body": "Supprimez uniquement les valeurs demo de Queue Reset avant de preparer chemin MPV, file de demandes et règle de modération pour la production.",
          "expected": "Le profil de test reste sans impact de production.",
          "alt": "Reinitialisez Queue Reset en securite - chemin MPV, file de demandes et règle de modération"
        }
      },
      "capture": {
        "route": "/plugins/music-bot/ui.html",
        "assertVisible": "#clear-btn",
        "focusText": {
          "de": "Queue Reset sicher zuruecksetzen",
          "en": "Reset Queue Reset safely",
          "es": "Restablece Queue Reset con seguridad",
          "fr": "Reinitialisez Queue Reset en securite"
        },
        "action": {
          "type": "reset-demo-state",
          "stepId": "queue-reset"
        },
        "expected": {
          "de": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "en": "The test profile remains free of production impact.",
          "es": "El perfil de prueba permanece sin impacto de producción.",
          "fr": "Le profil de test reste sans impact de production."
        }
      },
      "workflow": {
        "route": "/plugins/music-bot/ui.html",
        "instructions": {
          "de": {
            "title": "Queue Reset sicher zuruecksetzen",
            "body": "Entferne nur die Demo-Werte fuer Queue Reset, bevor du MPV-Pfad, Anfragequeue und Moderationsregel produktiv vorbereitest.",
            "expected": "Das Testprofil bleibt ohne produktive Auswirkung."
          },
          "en": {
            "title": "Reset Queue Reset safely",
            "body": "Remove only the demo values for Queue Reset before preparing MPV path, request queue, and moderation rule for production.",
            "expected": "The test profile remains free of production impact."
          },
          "es": {
            "title": "Restablece Queue Reset con seguridad",
            "body": "Elimina solo los valores demo de Queue Reset antes de preparar ruta de MPV, cola de solicitudes y regla de moderación para produccion.",
            "expected": "El perfil de prueba permanece sin impacto de producción."
          },
          "fr": {
            "title": "Reinitialisez Queue Reset en securite",
            "body": "Supprimez uniquement les valeurs demo de Queue Reset avant de preparer chemin MPV, file de demandes et règle de modération pour la production.",
            "expected": "Le profil de test reste sans impact de production."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/music-bot/ui.html"
          },
          {
            "type": "reset-demo-state",
            "selector": "#clear-btn"
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
              "path": "/plugins/music-bot/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#clear-btn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#clear-btn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    }
  ]
};

function applyWorkflowCorrections(corrections) {
  for (const [id, correction] of Object.entries(corrections)) {
    const step = guide.steps.find((candidate) => candidate.id === id);
    if (!step) throw new Error(`Missing Music Bot guide step: ${id}`);
    const focusText = Object.fromEntries(Object.entries(correction.copy).map(([locale, copy]) => [locale, copy.title]));
    const expected = Object.fromEntries(Object.entries(correction.copy).map(([locale, copy]) => [locale, copy.expected]));
    step.copy = correction.copy;
    step.capture = { ...step.capture, assertVisible: correction.selector, focusText, action: { ...correction.action, stepId: id }, expected };
    step.workflow = {
      ...step.workflow,
      instructions: Object.fromEntries(Object.entries(correction.copy).map(([locale, copy]) => [locale, { title: copy.title, body: copy.body, expected: copy.expected }])),
      operations: [{ type: 'goto', route: step.capture.route }, { type: correction.action.type, selector: correction.operationSelector || correction.action.inputSelector || correction.action.clickSelector || correction.selector }],
      postconditions: [
        { type: 'http-status', expected: 200 },
        { type: 'url', expected: exactLocalUrlExpectation(step.capture.route) },
        { type: 'visible', selector: correction.selector },
        ...(correction.postconditions || []),
        { type: 'console', expected: 'no-errors' }
      ],
      captureRule: { ...step.workflow.captureRule, selector: correction.selector, stateChange: correction.stateChange === true }
    };
  }
}

applyWorkflowCorrections({
  'mpv-path': {
    selector: '#mpv-path',
    action: { type: 'open-local-settings', allowClick: true, clickSelector: '#musicbot-onboarding-settings' },
    operationSelector: '#musicbot-onboarding-settings',
    stateChange: true,
    copy: {
      de: { title: 'Lokalen MPV-Pfad pruefen', body: 'Oeffne die lokalen Einstellungen ueber Zu den Einstellungen und pruefe das optionale MPV-Pfad-Feld. Lasse es leer, wenn kein lokaler Player eingerichtet ist; starte keine Suche oder Wiedergabe.', expected: 'Das echte MPV-Pfad-Feld ist sichtbar, ohne einen Player zu starten oder eine URL aufzurufen.', alt: 'Lokales MPV-Pfad-Feld des Music Bot' },
      en: { title: 'Inspect the local MPV path', body: 'Open local settings through Go to settings and inspect the optional MPV path field. Leave it empty when no local player is configured; start no search or playback.', expected: 'The real MPV path field is visible without starting a player or opening a URL.', alt: 'Music Bot local MPV path field' },
      es: { title: 'Revisa la ruta MPV local', body: 'Abre los ajustes locales con Ir a ajustes y revisa el campo opcional de ruta MPV. Dejalo vacio si no hay reproductor local; no inicies busqueda ni reproduccion.', expected: 'El campo real de ruta MPV es visible sin iniciar un reproductor ni abrir una URL.', alt: 'Campo de ruta MPV local de Music Bot' },
      fr: { title: 'Verifiez le chemin MPV local', body: 'Ouvrez les reglages locaux avec Aller aux reglages et verifiez le champ optionnel de chemin MPV. Laissez-le vide sans lecteur local; ne lancez ni recherche ni lecture.', expected: 'Le vrai champ de chemin MPV est visible sans demarrer de lecteur ni ouvrir d URL.', alt: 'Champ de chemin MPV local Music Bot' }
    }
  },
  'queue-rule': {
    selector: '#duplicate-detection',
    action: { type: 'set-demo-value', prepare: 'open-music-bot-settings' },
    stateChange: true,
    postconditions: [
      { type: 'input-value', selector: '#duplicate-detection', expected: 'non-empty' },
      { type: 'interaction', selector: '#duplicate-detection', expected: { type: 'set-demo-value', changed: true } }
    ],
    copy: {
      de: { title: 'Lokale Dublettenregel pruefen', body: 'Waehle nur eine vorhandene lokale Dublettenregel fuer die Queue. Gib keinen YouTube-Link ein und starte keine Suche, Anfrage oder Wiedergabe.', expected: 'Eine vorhandene lokale Dublettenregel ist ausgewaehlt und kann vor dem Speichern geprueft werden.', alt: 'Lokale Dublettenregel des Music Bot' },
      en: { title: 'Inspect a local duplicate rule', body: 'Select only an existing local duplicate rule for the queue. Do not enter a YouTube link or start search, request, or playback.', expected: 'An existing local duplicate rule is selected and can be reviewed before saving.', alt: 'Music Bot local duplicate rule' },
      es: { title: 'Revisa una regla local de duplicados', body: 'Selecciona solo una regla local existente de duplicados para la cola. No introduzcas un enlace de YouTube ni inicies busqueda, solicitud o reproduccion.', expected: 'Una regla local existente de duplicados queda seleccionada y puede revisarse antes de guardar.', alt: 'Regla local de duplicados de Music Bot' },
      fr: { title: 'Verifiez une regle locale de doublons', body: 'Selectionnez seulement une regle locale existante de doublons pour la file. Nentrez aucun lien YouTube et ne lancez ni recherche, demande ni lecture.', expected: 'Une regle locale existante de doublons est selectionnee et peut etre verifiee avant enregistrement.', alt: 'Regle locale de doublons Music Bot' }
    }
  },
  'sample-queue': {
    selector: '#queue-list',
    action: { type: 'open-plugin-surface' },
    stateChange: false,
    copy: {
      de: { title: 'Leere lokale Queue pruefen', body: 'Pruefe die lokale Queue im frischen Testprofil. Gib keinen Link ein und druecke Song anfordern nicht, damit keine externe YouTube-Suche oder Wiedergabe beginnt.', expected: 'Die echte Queue-Oberflaeche ist sichtbar und bleibt ohne externe Anfrage leer.', alt: 'Leere lokale Music-Bot-Queue' },
      en: { title: 'Inspect the empty local queue', body: 'Inspect the local queue in a fresh test profile. Do not enter a link or press Request song, so no external YouTube search or playback begins.', expected: 'The real queue surface is visible and remains empty without an external request.', alt: 'Empty Music Bot local queue' },
      es: { title: 'Revisa la cola local vacia', body: 'Revisa la cola local en un perfil de prueba nuevo. No introduzcas un enlace ni pulses Solicitar cancion, para que no empiece una busqueda ni reproduccion externa de YouTube.', expected: 'La superficie real de cola es visible y permanece vacia sin una solicitud externa.', alt: 'Cola local vacia de Music Bot' },
      fr: { title: 'Verifiez la file locale vide', body: 'Verifiez la file locale dans un profil de test neuf. Nentrez aucun lien et nappuyez pas sur Demander une chanson, afin quaucune recherche ni lecture YouTube externe ne commence.', expected: 'La vraie surface de file est visible et reste vide sans demande externe.', alt: 'File locale vide Music Bot' }
    }
  }
});

module.exports = Object.freeze(guide);
