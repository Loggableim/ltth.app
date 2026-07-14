'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "game-engine",
  "route": "/plugins/game-engine/ui.html",
  "topic": {
    "de": "Spielmodus, Queue und Geschenk- oder Chat-Trigger",
    "en": "game mode, queue, and gift or chat trigger",
    "es": "modo de juego, cola y disparador de regalo o chat",
    "fr": "mode de jeu, file et déclencheur cadeau ou chat"
  },
  "test": {
    "de": "eine lokale Runde im Testmodus",
    "en": "a local test round",
    "es": "una ronda local en modo de prueba",
    "fr": "une manche locale en mode test"
  },
  "expected": {
    "de": "die Testqueue wird abgearbeitet und die Spielansicht aktualisiert sich",
    "en": "the test queue is processed and the game view updates",
    "es": "la cola de prueba se procesa y la vista del juego se actualiza",
    "fr": "la file de test est traitée et la vue de jeu se met à jour"
  },
  "requirement": "obs",
  "safety": "obs",
  "mode": "ui",
  "overlay": "/plugins/game-engine/overlay/game-hud.html",
  "related": [
    "coinbattle",
    "quiz-show",
    "gcce"
  ],
  "copy": {
    "de": {
      "title": "LTTH Game Engine",
      "summary": "LTTH Game Engine richtet Spielmodus, Queue und Geschenk- oder Chat-Trigger ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "die Testqueue wird abgearbeitet und die Spielansicht aktualisiert sich",
      "requirements": "LTTH Dashboard; für die Ausgabe zusätzlich eine OBS-Testszene. Dieser konkrete LTTH Game Engine-Ablauf behandelt Spielmodus, Queue und Geschenk- oder Chat-Trigger.",
      "safety": "Nutze eine nicht gesendete OBS-Testszene; LIVE-Ausgaben bleiben deaktiviert. Dieser konkrete LTTH Game Engine-Ablauf behandelt Spielmodus, Queue und Geschenk- oder Chat-Trigger.",
      "troubleshooting": "Wenn Spielmodus, Queue und Geschenk- oder Chat-Trigger nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "coinbattle",
        "quiz-show",
        "gcce"
      ]
    },
    "en": {
      "title": "LTTH Game Engine",
      "summary": "LTTH Game Engine configures game mode, queue, and gift or chat trigger with a safe local check instead of a LIVE trigger.",
      "firstResult": "the test queue is processed and the game view updates",
      "requirements": "LTTH Dashboard; use an OBS test scene for output. This LTTH Game Engine workflow specifically covers game mode, queue, and gift or chat trigger.",
      "safety": "Use an OBS test scene that is not live; LIVE output remains disabled. This LTTH Game Engine workflow specifically covers game mode, queue, and gift or chat trigger.",
      "troubleshooting": "If game mode, queue, and gift or chat trigger is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "coinbattle",
        "quiz-show",
        "gcce"
      ]
    },
    "es": {
      "title": "LTTH Game Engine",
      "summary": "LTTH Game Engine configura modo de juego, cola y disparador de regalo o chat mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "la cola de prueba se procesa y la vista del juego se actualiza",
      "requirements": "El panel de LTTH y una escena de prueba de OBS para la salida. Este flujo concreto de LTTH Game Engine trata modo de juego, cola y disparador de regalo o chat.",
      "safety": "Usa una escena de prueba de OBS que no esté al aire; la salida LIVE permanece desactivada. Este flujo concreto de LTTH Game Engine trata modo de juego, cola y disparador de regalo o chat.",
      "troubleshooting": "Si modo de juego, cola y disparador de regalo o chat no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "coinbattle",
        "quiz-show",
        "gcce"
      ]
    },
    "fr": {
      "title": "LTTH Game Engine",
      "summary": "LTTH Game Engine configure mode de jeu, file et déclencheur cadeau ou chat avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "la file de test est traitée et la vue de jeu se met à jour",
      "requirements": "Le tableau de bord LTTH et une scène de test OBS pour la sortie. Ce flux spécifique de LTTH Game Engine couvre mode de jeu, file et déclencheur cadeau ou chat.",
      "safety": "Utilisez une scène de test OBS non diffusée ; la sortie LIVE reste désactivée. Ce flux spécifique de LTTH Game Engine couvre mode de jeu, file et déclencheur cadeau ou chat.",
      "troubleshooting": "Si mode de jeu, file et déclencheur cadeau ou chat n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "coinbattle",
        "quiz-show",
        "gcce"
      ]
    }
  },
  "steps": [
    {
      "id": "engine-card",
      "copy": {
        "de": {
          "title": "Engine Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Engine Card von Spielmodus, Queue und Geschenk- oder Chat-Trigger. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Engine Card im Testprofil konfigurieren - Spielmodus, Queue und Geschenk- oder Chat-Trigger"
        },
        "en": {
          "title": "Configure Engine Card in the test profile",
          "body": "Work in the visible Engine Card area of game mode, queue, and gift or chat trigger. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Engine Card in the test profile - game mode, queue, and gift or chat trigger"
        },
        "es": {
          "title": "Configura Engine Card en el perfil de prueba",
          "body": "Trabaja en el area visible Engine Card de modo de juego, cola y disparador de regalo o chat. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Engine Card en el perfil de prueba - modo de juego, cola y disparador de regalo o chat"
        },
        "fr": {
          "title": "Configurez Engine Card dans le profil de test",
          "body": "Travaillez dans la zone visible Engine Card de mode de jeu, file et déclencheur cadeau ou chat. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Engine Card dans le profil de test - mode de jeu, file et déclencheur cadeau ou chat"
        }
      },
      "capture": {
        "route": "/plugins/game-engine/ui.html",
        "assertVisible": "#tab-manual-mode",
        "focusText": {
          "de": "Engine Card im Testprofil konfigurieren",
          "en": "Configure Engine Card in the test profile",
          "es": "Configura Engine Card en el perfil de prueba",
          "fr": "Configurez Engine Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "engine-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/game-engine/ui.html",
        "instructions": {
          "de": {
            "title": "Engine Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Engine Card von Spielmodus, Queue und Geschenk- oder Chat-Trigger. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Engine Card in the test profile",
            "body": "Work in the visible Engine Card area of game mode, queue, and gift or chat trigger. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Engine Card en el perfil de prueba",
            "body": "Trabaja en el area visible Engine Card de modo de juego, cola y disparador de regalo o chat. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Engine Card dans le profil de test",
            "body": "Travaillez dans la zone visible Engine Card de mode de jeu, file et déclencheur cadeau ou chat. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/game-engine/ui.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#tab-manual-mode"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/game-engine/ui.html"
          },
          {
            "type": "visible",
            "selector": "#tab-manual-mode"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#tab-manual-mode",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "game-mode",
      "copy": {
        "de": {
          "title": "Game Mode im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Game Mode von Spielmodus, Queue und Geschenk- oder Chat-Trigger. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Game Mode im Testprofil konfigurieren - Spielmodus, Queue und Geschenk- oder Chat-Trigger"
        },
        "en": {
          "title": "Configure Game Mode in the test profile",
          "body": "Work in the visible Game Mode area of game mode, queue, and gift or chat trigger. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Game Mode in the test profile - game mode, queue, and gift or chat trigger"
        },
        "es": {
          "title": "Configura Game Mode en el perfil de prueba",
          "body": "Trabaja en el area visible Game Mode de modo de juego, cola y disparador de regalo o chat. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Game Mode en el perfil de prueba - modo de juego, cola y disparador de regalo o chat"
        },
        "fr": {
          "title": "Configurez Game Mode dans le profil de test",
          "body": "Travaillez dans la zone visible Game Mode de mode de jeu, file et déclencheur cadeau ou chat. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Game Mode dans le profil de test - mode de jeu, file et déclencheur cadeau ou chat"
        }
      },
      "capture": {
        "route": "/plugins/game-engine/ui.html",
        "assertVisible": "#manual-game-type",
        "focusText": {
          "de": "Game Mode im Testprofil konfigurieren",
          "en": "Configure Game Mode in the test profile",
          "es": "Configura Game Mode en el perfil de prueba",
          "fr": "Configurez Game Mode dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "game-mode"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/game-engine/ui.html",
        "instructions": {
          "de": {
            "title": "Game Mode im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Game Mode von Spielmodus, Queue und Geschenk- oder Chat-Trigger. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Game Mode in the test profile",
            "body": "Work in the visible Game Mode area of game mode, queue, and gift or chat trigger. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Game Mode en el perfil de prueba",
            "body": "Trabaja en el area visible Game Mode de modo de juego, cola y disparador de regalo o chat. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Game Mode dans le profil de test",
            "body": "Travaillez dans la zone visible Game Mode de mode de jeu, file et déclencheur cadeau ou chat. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/game-engine/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#manual-game-type"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/game-engine/ui.html"
          },
          {
            "type": "visible",
            "selector": "#manual-game-type"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#manual-game-type",
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
          "body": "Arbeite im sichtbaren Bereich Queue Rule von Spielmodus, Queue und Geschenk- oder Chat-Trigger. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Queue Rule im Testprofil konfigurieren - Spielmodus, Queue und Geschenk- oder Chat-Trigger"
        },
        "en": {
          "title": "Configure Queue Rule in the test profile",
          "body": "Work in the visible Queue Rule area of game mode, queue, and gift or chat trigger. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Queue Rule in the test profile - game mode, queue, and gift or chat trigger"
        },
        "es": {
          "title": "Configura Queue Rule en el perfil de prueba",
          "body": "Trabaja en el area visible Queue Rule de modo de juego, cola y disparador de regalo o chat. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Queue Rule en el perfil de prueba - modo de juego, cola y disparador de regalo o chat"
        },
        "fr": {
          "title": "Configurez Queue Rule dans le profil de test",
          "body": "Travaillez dans la zone visible Queue Rule de mode de jeu, file et déclencheur cadeau ou chat. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Queue Rule dans le profil de test - mode de jeu, file et déclencheur cadeau ou chat"
        }
      },
      "capture": {
        "route": "/plugins/game-engine/ui.html",
        "assertVisible": "#manual-player1-name",
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
        "route": "/plugins/game-engine/ui.html",
        "instructions": {
          "de": {
            "title": "Queue Rule im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Queue Rule von Spielmodus, Queue und Geschenk- oder Chat-Trigger. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Queue Rule in the test profile",
            "body": "Work in the visible Queue Rule area of game mode, queue, and gift or chat trigger. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Queue Rule en el perfil de prueba",
            "body": "Trabaja en el area visible Queue Rule de modo de juego, cola y disparador de regalo o chat. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Queue Rule dans le profil de test",
            "body": "Travaillez dans la zone visible Queue Rule de mode de jeu, file et déclencheur cadeau ou chat. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/game-engine/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#manual-player1-name"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/game-engine/ui.html"
          },
          {
            "type": "visible",
            "selector": "#manual-player1-name"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#manual-player1-name",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "test-round",
      "copy": {
        "de": {
          "title": "Test Round lokal testen",
          "body": "Fuehre Test Round nur mit eine lokale Runde im Testmodus im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "die Testqueue wird abgearbeitet und die Spielansicht aktualisiert sich",
          "alt": "Test Round lokal testen - Spielmodus, Queue und Geschenk- oder Chat-Trigger"
        },
        "en": {
          "title": "Test Test Round locally",
          "body": "Run Test Round only with a local test round in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the test queue is processed and the game view updates",
          "alt": "Test Test Round locally - game mode, queue, and gift or chat trigger"
        },
        "es": {
          "title": "Prueba Test Round localmente",
          "body": "Ejecuta Test Round solo con una ronda local en modo de prueba en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "la cola de prueba se procesa y la vista del juego se actualiza",
          "alt": "Prueba Test Round localmente - modo de juego, cola y disparador de regalo o chat"
        },
        "fr": {
          "title": "Testez Test Round localement",
          "body": "Executez Test Round uniquement avec une manche locale en mode test dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "la file de test est traitée et la vue de jeu se met à jour",
          "alt": "Testez Test Round localement - mode de jeu, file et déclencheur cadeau ou chat"
        }
      },
      "capture": {
        "route": "/plugins/game-engine/ui.html",
        "assertVisible": "#manual-game-controls",
        "focusText": {
          "de": "Test Round lokal testen",
          "en": "Test Test Round locally",
          "es": "Prueba Test Round localmente",
          "fr": "Testez Test Round localement"
        },
        "action": {
          "type": "run-local-preview",
          "prepare": "start-local-manual-game",
          "cleanupSelector": "#end-manual-game",
          "settleMs": 1000,
          "stepId": "test-round"
        },
        "expected": {
          "de": "die Testqueue wird abgearbeitet und die Spielansicht aktualisiert sich",
          "en": "the test queue is processed and the game view updates",
          "es": "la cola de prueba se procesa y la vista del juego se actualiza",
          "fr": "la file de test est traitée et la vue de jeu se met à jour"
        }
      },
      "workflow": {
        "route": "/plugins/game-engine/ui.html",
        "instructions": {
          "de": {
            "title": "Test Round lokal testen",
            "body": "Fuehre Test Round nur mit eine lokale Runde im Testmodus im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "die Testqueue wird abgearbeitet und die Spielansicht aktualisiert sich"
          },
          "en": {
            "title": "Test Test Round locally",
            "body": "Run Test Round only with a local test round in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the test queue is processed and the game view updates"
          },
          "es": {
            "title": "Prueba Test Round localmente",
            "body": "Ejecuta Test Round solo con una ronda local en modo de prueba en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "la cola de prueba se procesa y la vista del juego se actualiza"
          },
          "fr": {
            "title": "Testez Test Round localement",
            "body": "Executez Test Round uniquement avec une manche locale en mode test dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "la file de test est traitée et la vue de jeu se met à jour"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/game-engine/ui.html"
          },
          {
            "type": "prepare",
            "name": "start-local-manual-game"
          },
          {
            "type": "run-local-preview",
            "selector": "#manual-game-controls"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/game-engine/ui.html"
          },
          {
            "type": "visible",
            "selector": "#manual-game-controls"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#manual-game-controls",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "game-hud",
      "copy": {
        "de": {
          "title": "Game HUD als Overlay-Vorschau oeffnen",
          "body": "Oeffne die echte Game HUD-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
          "expected": "die Testqueue wird abgearbeitet und die Spielansicht aktualisiert sich",
          "alt": "Game HUD als Overlay-Vorschau oeffnen - Spielmodus, Queue und Geschenk- oder Chat-Trigger"
        },
        "en": {
          "title": "Open Game HUD as an overlay preview",
          "body": "Open the real Game HUD surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
          "expected": "the test queue is processed and the game view updates",
          "alt": "Open Game HUD as an overlay preview - game mode, queue, and gift or chat trigger"
        },
        "es": {
          "title": "Abre Game HUD como vista previa de overlay",
          "body": "Abre la superficie real Game HUD solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
          "expected": "la cola de prueba se procesa y la vista del juego se actualiza",
          "alt": "Abre Game HUD como vista previa de overlay - modo de juego, cola y disparador de regalo o chat"
        },
        "fr": {
          "title": "Ouvrez Game HUD comme apercu overlay",
          "body": "Ouvrez la vraie surface Game HUD uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
          "expected": "la file de test est traitée et la vue de jeu se met à jour",
          "alt": "Ouvrez Game HUD comme apercu overlay - mode de jeu, file et déclencheur cadeau ou chat"
        }
      },
      "capture": {
        "route": "/plugins/game-engine/overlay/game-hud.html",
        "assertVisible": "#hud",
        "focusText": {
          "de": "Game HUD als Overlay-Vorschau oeffnen",
          "en": "Open Game HUD as an overlay preview",
          "es": "Abre Game HUD como vista previa de overlay",
          "fr": "Ouvrez Game HUD comme apercu overlay"
        },
        "action": {
          "type": "open-overlay-preview",
          "stepId": "game-hud"
        },
        "expected": {
          "de": "die Testqueue wird abgearbeitet und die Spielansicht aktualisiert sich",
          "en": "the test queue is processed and the game view updates",
          "es": "la cola de prueba se procesa y la vista del juego se actualiza",
          "fr": "la file de test est traitée et la vue de jeu se met à jour"
        }
      },
      "workflow": {
        "route": "/plugins/game-engine/overlay/game-hud.html",
        "instructions": {
          "de": {
            "title": "Game HUD als Overlay-Vorschau oeffnen",
            "body": "Oeffne die echte Game HUD-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
            "expected": "die Testqueue wird abgearbeitet und die Spielansicht aktualisiert sich"
          },
          "en": {
            "title": "Open Game HUD as an overlay preview",
            "body": "Open the real Game HUD surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
            "expected": "the test queue is processed and the game view updates"
          },
          "es": {
            "title": "Abre Game HUD como vista previa de overlay",
            "body": "Abre la superficie real Game HUD solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
            "expected": "la cola de prueba se procesa y la vista del juego se actualiza"
          },
          "fr": {
            "title": "Ouvrez Game HUD comme apercu overlay",
            "body": "Ouvrez la vraie surface Game HUD uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
            "expected": "la file de test est traitée et la vue de jeu se met à jour"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/game-engine/overlay/game-hud.html"
          },
          {
            "type": "open-overlay-preview",
            "selector": "#hud"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/game-engine/overlay/game-hud.html"
          },
          {
            "type": "visible",
            "selector": "#hud"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#hud",
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
          "body": "Entferne nur die Demo-Werte fuer Queue Reset, bevor du Spielmodus, Queue und Geschenk- oder Chat-Trigger produktiv vorbereitest.",
          "expected": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "alt": "Queue Reset sicher zuruecksetzen - Spielmodus, Queue und Geschenk- oder Chat-Trigger"
        },
        "en": {
          "title": "Reset Queue Reset safely",
          "body": "Remove only the demo values for Queue Reset before preparing game mode, queue, and gift or chat trigger for production.",
          "expected": "The test profile remains free of production impact.",
          "alt": "Reset Queue Reset safely - game mode, queue, and gift or chat trigger"
        },
        "es": {
          "title": "Restablece Queue Reset con seguridad",
          "body": "Elimina solo los valores demo de Queue Reset antes de preparar modo de juego, cola y disparador de regalo o chat para produccion.",
          "expected": "El perfil de prueba permanece sin impacto de producción.",
          "alt": "Restablece Queue Reset con seguridad - modo de juego, cola y disparador de regalo o chat"
        },
        "fr": {
          "title": "Reinitialisez Queue Reset en securite",
          "body": "Supprimez uniquement les valeurs demo de Queue Reset avant de preparer mode de jeu, file et déclencheur cadeau ou chat pour la production.",
          "expected": "Le profil de test reste sans impact de production.",
          "alt": "Reinitialisez Queue Reset en securite - mode de jeu, file et déclencheur cadeau ou chat"
        }
      },
      "capture": {
        "route": "/plugins/game-engine/ui.html",
        "assertVisible": "#end-manual-game",
        "focusText": {
          "de": "Queue Reset sicher zuruecksetzen",
          "en": "Reset Queue Reset safely",
          "es": "Restablece Queue Reset con seguridad",
          "fr": "Reinitialisez Queue Reset en securite"
        },
        "action": {
          "type": "reset-demo-state",
          "prepare": "start-local-manual-game",
          "settleMs": 1000,
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
        "route": "/plugins/game-engine/ui.html",
        "instructions": {
          "de": {
            "title": "Queue Reset sicher zuruecksetzen",
            "body": "Entferne nur die Demo-Werte fuer Queue Reset, bevor du Spielmodus, Queue und Geschenk- oder Chat-Trigger produktiv vorbereitest.",
            "expected": "Das Testprofil bleibt ohne produktive Auswirkung."
          },
          "en": {
            "title": "Reset Queue Reset safely",
            "body": "Remove only the demo values for Queue Reset before preparing game mode, queue, and gift or chat trigger for production.",
            "expected": "The test profile remains free of production impact."
          },
          "es": {
            "title": "Restablece Queue Reset con seguridad",
            "body": "Elimina solo los valores demo de Queue Reset antes de preparar modo de juego, cola y disparador de regalo o chat para produccion.",
            "expected": "El perfil de prueba permanece sin impacto de producción."
          },
          "fr": {
            "title": "Reinitialisez Queue Reset en securite",
            "body": "Supprimez uniquement les valeurs demo de Queue Reset avant de preparer mode de jeu, file et déclencheur cadeau ou chat pour la production.",
            "expected": "Le profil de test reste sans impact de production."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/game-engine/ui.html"
          },
          {
            "type": "prepare",
            "name": "start-local-manual-game"
          },
          {
            "type": "reset-demo-state",
            "selector": "#end-manual-game"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/game-engine/ui.html"
          },
          {
            "type": "visible",
            "selector": "#end-manual-game"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#end-manual-game",
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
