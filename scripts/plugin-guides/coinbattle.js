'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "coinbattle",
  "route": "/plugins/coinbattle/ui.html",
  "topic": {
    "de": "Münzwerte, Kampfmodus und Match-Start",
    "en": "coin values, battle mode, and match start",
    "es": "valores de monedas, modo de batalla e inicio de partida",
    "fr": "valeurs des pièces, mode de combat et démarrage du match"
  },
  "test": {
    "de": "ein lokales Testmatch",
    "en": "a local test match",
    "es": "una partida de prueba local",
    "fr": "un match de test local"
  },
  "expected": {
    "de": "die Spielansicht zeigt ein gestartetes Demo-Match ohne LIVE-Ereignis",
    "en": "the game view shows a started demo match without a LIVE event",
    "es": "la vista de juego muestra una partida demo iniciada sin evento LIVE",
    "fr": "la vue de jeu montre un match démo démarré sans événement LIVE"
  },
  "requirement": "obs",
  "safety": "obs",
  "mode": "ui",
  "overlay": "/plugins/coinbattle/overlay/overlay.html",
  "related": [
    "game-engine",
    "quiz-show"
  ],
  "copy": {
    "de": {
      "title": "CoinBattle",
      "summary": "CoinBattle richtet Münzwerte, Kampfmodus und Match-Start ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "die Spielansicht zeigt ein gestartetes Demo-Match ohne LIVE-Ereignis",
      "requirements": "LTTH Dashboard; für die Ausgabe zusätzlich eine OBS-Testszene. Dieser konkrete CoinBattle-Ablauf behandelt Münzwerte, Kampfmodus und Match-Start.",
      "safety": "Nutze eine nicht gesendete OBS-Testszene; LIVE-Ausgaben bleiben deaktiviert. Dieser konkrete CoinBattle-Ablauf behandelt Münzwerte, Kampfmodus und Match-Start.",
      "troubleshooting": "Wenn Münzwerte, Kampfmodus und Match-Start nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "game-engine",
        "quiz-show"
      ]
    },
    "en": {
      "title": "CoinBattle",
      "summary": "CoinBattle configures coin values, battle mode, and match start with a safe local check instead of a LIVE trigger.",
      "firstResult": "the game view shows a started demo match without a LIVE event",
      "requirements": "LTTH Dashboard; use an OBS test scene for output. This CoinBattle workflow specifically covers coin values, battle mode, and match start.",
      "safety": "Use an OBS test scene that is not live; LIVE output remains disabled. This CoinBattle workflow specifically covers coin values, battle mode, and match start.",
      "troubleshooting": "If coin values, battle mode, and match start is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "game-engine",
        "quiz-show"
      ]
    },
    "es": {
      "title": "CoinBattle",
      "summary": "CoinBattle configura valores de monedas, modo de batalla e inicio de partida mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "la vista de juego muestra una partida demo iniciada sin evento LIVE",
      "requirements": "El panel de LTTH y una escena de prueba de OBS para la salida. Este flujo concreto de CoinBattle trata valores de monedas, modo de batalla e inicio de partida.",
      "safety": "Usa una escena de prueba de OBS que no esté al aire; la salida LIVE permanece desactivada. Este flujo concreto de CoinBattle trata valores de monedas, modo de batalla e inicio de partida.",
      "troubleshooting": "Si valores de monedas, modo de batalla e inicio de partida no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "game-engine",
        "quiz-show"
      ]
    },
    "fr": {
      "title": "CoinBattle",
      "summary": "CoinBattle configure valeurs des pièces, mode de combat et démarrage du match avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "la vue de jeu montre un match démo démarré sans événement LIVE",
      "requirements": "Le tableau de bord LTTH et une scène de test OBS pour la sortie. Ce flux spécifique de CoinBattle couvre valeurs des pièces, mode de combat et démarrage du match.",
      "safety": "Utilisez une scène de test OBS non diffusée ; la sortie LIVE reste désactivée. Ce flux spécifique de CoinBattle couvre valeurs des pièces, mode de combat et démarrage du match.",
      "troubleshooting": "Si valeurs des pièces, mode de combat et démarrage du match n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "game-engine",
        "quiz-show"
      ]
    }
  },
  "steps": [
    {
      "id": "coinbattle-card",
      "copy": {
        "de": {
          "title": "Coinbattle Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Coinbattle Card von Münzwerte, Kampfmodus und Match-Start. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Coinbattle Card im Testprofil konfigurieren - Münzwerte, Kampfmodus und Match-Start"
        },
        "en": {
          "title": "Configure Coinbattle Card in the test profile",
          "body": "Work in the visible Coinbattle Card area of coin values, battle mode, and match start. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Coinbattle Card in the test profile - coin values, battle mode, and match start"
        },
        "es": {
          "title": "Configura Coinbattle Card en el perfil de prueba",
          "body": "Trabaja en el area visible Coinbattle Card de valores de monedas, modo de batalla e inicio de partida. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Coinbattle Card en el perfil de prueba - valores de monedas, modo de batalla e inicio de partida"
        },
        "fr": {
          "title": "Configurez Coinbattle Card dans le profil de test",
          "body": "Travaillez dans la zone visible Coinbattle Card de valeurs des pièces, mode de combat et démarrage du match. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Coinbattle Card dans le profil de test - valeurs des pièces, mode de combat et démarrage du match"
        }
      },
      "capture": {
        "route": "/plugins/coinbattle/ui.html",
        "assertVisible": "#control-tab",
        "focusText": {
          "de": "Coinbattle Card im Testprofil konfigurieren",
          "en": "Configure Coinbattle Card in the test profile",
          "es": "Configura Coinbattle Card en el perfil de prueba",
          "fr": "Configurez Coinbattle Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "coinbattle-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/coinbattle/ui.html",
        "instructions": {
          "de": {
            "title": "Coinbattle Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Coinbattle Card von Münzwerte, Kampfmodus und Match-Start. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Coinbattle Card in the test profile",
            "body": "Work in the visible Coinbattle Card area of coin values, battle mode, and match start. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Coinbattle Card en el perfil de prueba",
            "body": "Trabaja en el area visible Coinbattle Card de valores de monedas, modo de batalla e inicio de partida. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Coinbattle Card dans le profil de test",
            "body": "Travaillez dans la zone visible Coinbattle Card de valeurs des pièces, mode de combat et démarrage du match. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/coinbattle/ui.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#control-tab"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/coinbattle/ui.html"
          },
          {
            "type": "visible",
            "selector": "#control-tab"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#control-tab",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "coin-values",
      "copy": {
        "de": {
          "title": "Coin Values im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Coin Values von Münzwerte, Kampfmodus und Match-Start. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Coin Values im Testprofil konfigurieren - Münzwerte, Kampfmodus und Match-Start"
        },
        "en": {
          "title": "Configure Coin Values in the test profile",
          "body": "Work in the visible Coin Values area of coin values, battle mode, and match start. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Coin Values in the test profile - coin values, battle mode, and match start"
        },
        "es": {
          "title": "Configura Coin Values en el perfil de prueba",
          "body": "Trabaja en el area visible Coin Values de valores de monedas, modo de batalla e inicio de partida. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Coin Values en el perfil de prueba - valores de monedas, modo de batalla e inicio de partida"
        },
        "fr": {
          "title": "Configurez Coin Values dans le profil de test",
          "body": "Travaillez dans la zone visible Coin Values de valeurs des pièces, mode de combat et démarrage du match. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Coin Values dans le profil de test - valeurs des pièces, mode de combat et démarrage du match"
        }
      },
      "capture": {
        "route": "/plugins/coinbattle/ui.html",
        "assertVisible": "#match-mode",
        "focusText": {
          "de": "Coin Values im Testprofil konfigurieren",
          "en": "Configure Coin Values in the test profile",
          "es": "Configura Coin Values en el perfil de prueba",
          "fr": "Configurez Coin Values dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "coin-values"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/coinbattle/ui.html",
        "instructions": {
          "de": {
            "title": "Coin Values im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Coin Values von Münzwerte, Kampfmodus und Match-Start. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Coin Values in the test profile",
            "body": "Work in the visible Coin Values area of coin values, battle mode, and match start. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Coin Values en el perfil de prueba",
            "body": "Trabaja en el area visible Coin Values de valores de monedas, modo de batalla e inicio de partida. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Coin Values dans le profil de test",
            "body": "Travaillez dans la zone visible Coin Values de valeurs des pièces, mode de combat et démarrage du match. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/coinbattle/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#match-mode"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/coinbattle/ui.html"
          },
          {
            "type": "visible",
            "selector": "#match-mode"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#match-mode",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "battle-mode",
      "copy": {
        "de": {
          "title": "Battle Mode im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Battle Mode von Münzwerte, Kampfmodus und Match-Start. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Battle Mode im Testprofil konfigurieren - Münzwerte, Kampfmodus und Match-Start"
        },
        "en": {
          "title": "Configure Battle Mode in the test profile",
          "body": "Work in the visible Battle Mode area of coin values, battle mode, and match start. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Battle Mode in the test profile - coin values, battle mode, and match start"
        },
        "es": {
          "title": "Configura Battle Mode en el perfil de prueba",
          "body": "Trabaja en el area visible Battle Mode de valores de monedas, modo de batalla e inicio de partida. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Battle Mode en el perfil de prueba - valores de monedas, modo de batalla e inicio de partida"
        },
        "fr": {
          "title": "Configurez Battle Mode dans le profil de test",
          "body": "Travaillez dans la zone visible Battle Mode de valeurs des pièces, mode de combat et démarrage du match. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Battle Mode dans le profil de test - valeurs des pièces, mode de combat et démarrage du match"
        }
      },
      "capture": {
        "route": "/plugins/coinbattle/ui.html",
        "assertVisible": "#btn-start-simulation",
        "focusText": {
          "de": "Battle Mode im Testprofil konfigurieren",
          "en": "Configure Battle Mode in the test profile",
          "es": "Configura Battle Mode en el perfil de prueba",
          "fr": "Configurez Battle Mode dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "battle-mode"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/coinbattle/ui.html",
        "instructions": {
          "de": {
            "title": "Battle Mode im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Battle Mode von Münzwerte, Kampfmodus und Match-Start. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Battle Mode in the test profile",
            "body": "Work in the visible Battle Mode area of coin values, battle mode, and match start. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Battle Mode en el perfil de prueba",
            "body": "Trabaja en el area visible Battle Mode de valores de monedas, modo de batalla e inicio de partida. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Battle Mode dans le profil de test",
            "body": "Travaillez dans la zone visible Battle Mode de valeurs des pièces, mode de combat et démarrage du match. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/coinbattle/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#btn-start-simulation"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/coinbattle/ui.html"
          },
          {
            "type": "visible",
            "selector": "#btn-start-simulation"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#btn-start-simulation",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "demo-match",
      "copy": {
        "de": {
          "title": "Demo Match lokal testen",
          "body": "Fuehre Demo Match nur mit ein lokales Testmatch im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "die Spielansicht zeigt ein gestartetes Demo-Match ohne LIVE-Ereignis",
          "alt": "Demo Match lokal testen - Münzwerte, Kampfmodus und Match-Start"
        },
        "en": {
          "title": "Test Demo Match locally",
          "body": "Run Demo Match only with a local test match in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the game view shows a started demo match without a LIVE event",
          "alt": "Test Demo Match locally - coin values, battle mode, and match start"
        },
        "es": {
          "title": "Prueba Demo Match localmente",
          "body": "Ejecuta Demo Match solo con una partida de prueba local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "la vista de juego muestra una partida demo iniciada sin evento LIVE",
          "alt": "Prueba Demo Match localmente - valores de monedas, modo de batalla e inicio de partida"
        },
        "fr": {
          "title": "Testez Demo Match localement",
          "body": "Executez Demo Match uniquement avec un match de test local dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "la vue de jeu montre un match démo démarré sans événement LIVE",
          "alt": "Testez Demo Match localement - valeurs des pièces, mode de combat et démarrage du match"
        }
      },
      "capture": {
        "route": "/plugins/coinbattle/ui.html",
        "assertVisible": "#current-leaderboard",
        "focusText": {
          "de": "Demo Match lokal testen",
          "en": "Test Demo Match locally",
          "es": "Prueba Demo Match localmente",
          "fr": "Testez Demo Match localement"
        },
        "action": {
          "type": "run-local-preview",
          "stepId": "demo-match"
        },
        "expected": {
          "de": "die Spielansicht zeigt ein gestartetes Demo-Match ohne LIVE-Ereignis",
          "en": "the game view shows a started demo match without a LIVE event",
          "es": "la vista de juego muestra una partida demo iniciada sin evento LIVE",
          "fr": "la vue de jeu montre un match démo démarré sans événement LIVE"
        }
      },
      "workflow": {
        "route": "/plugins/coinbattle/ui.html",
        "instructions": {
          "de": {
            "title": "Demo Match lokal testen",
            "body": "Fuehre Demo Match nur mit ein lokales Testmatch im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "die Spielansicht zeigt ein gestartetes Demo-Match ohne LIVE-Ereignis"
          },
          "en": {
            "title": "Test Demo Match locally",
            "body": "Run Demo Match only with a local test match in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the game view shows a started demo match without a LIVE event"
          },
          "es": {
            "title": "Prueba Demo Match localmente",
            "body": "Ejecuta Demo Match solo con una partida de prueba local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "la vista de juego muestra una partida demo iniciada sin evento LIVE"
          },
          "fr": {
            "title": "Testez Demo Match localement",
            "body": "Executez Demo Match uniquement avec un match de test local dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "la vue de jeu montre un match démo démarré sans événement LIVE"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/coinbattle/ui.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#current-leaderboard"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/coinbattle/ui.html"
          },
          {
            "type": "visible",
            "selector": "#current-leaderboard"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#current-leaderboard",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "battle-overlay",
      "copy": {
        "de": {
          "title": "Die echte Coinbattle-URL als OBS-Browserquelle kopieren",
          "body": "Kopiere die sichtbare OBS Browser Source URL aus der Coinbattle-Konfiguration. Erst ein lokales Testmatch fuellt das Overlay; eine leere Overlay-Leinwand wird nicht als Spielansicht ausgegeben.",
          "expected": "Die konkrete Browserquellen-URL ist sichtbar und kann vor dem Testmatch kopiert werden.",
          "alt": "Die echte Coinbattle-URL als OBS-Browserquelle kopieren - Münzwerte, Kampfmodus und Match-Start"
        },
        "en": {
          "title": "Copy the real Coinbattle URL into an OBS Browser Source",
          "body": "Copy the visible OBS Browser Source URL from the Coinbattle configuration. Only a local test match populates the overlay; an empty overlay canvas is not presented as game output.",
          "expected": "The concrete Browser Source URL is visible and can be copied before the test match.",
          "alt": "Copy the real Coinbattle URL into an OBS Browser Source - coin values, battle mode, and match start"
        },
        "es": {
          "title": "Copia la URL real de Coinbattle en una fuente de navegador OBS",
          "body": "Copia la URL visible de OBS Browser Source desde la configuracion de Coinbattle. Solo una partida local de prueba llena el overlay; un lienzo vacio no se presenta como salida del juego.",
          "expected": "La URL concreta de la fuente de navegador queda visible y puede copiarse antes de la partida de prueba.",
          "alt": "Copia la URL real de Coinbattle en una fuente de navegador OBS - valores de monedas, modo de batalla e inicio de partida"
        },
        "fr": {
          "title": "Copiez la vraie URL Coinbattle dans une source navigateur OBS",
          "body": "Copiez lURL visible de source navigateur OBS depuis la configuration Coinbattle. Seul un match de test local remplit loverlay ; une toile vide nest pas presentee comme sortie de jeu.",
          "expected": "LURL concrete de source navigateur est visible et peut etre copiee avant le match de test.",
          "alt": "Copiez la vraie URL Coinbattle dans une source navigateur OBS - valeurs des pièces, mode de combat et démarrage du match"
        }
      },
      "capture": {
        "route": "/plugins/coinbattle/ui.html",
        "assertVisible": "#overlay-url",
        "focusText": {
          "de": "Die echte Coinbattle-URL als OBS-Browserquelle kopieren",
          "en": "Copy the real Coinbattle URL into an OBS Browser Source",
          "es": "Copia la URL real de Coinbattle en una fuente de navegador OBS",
          "fr": "Copiez la vraie URL Coinbattle dans une source navigateur OBS"
        },
        "action": {
          "type": "open-overlay-preview",
          "stepId": "battle-overlay"
        },
        "expected": {
          "de": "Die konkrete Browserquellen-URL ist sichtbar und kann vor dem Testmatch kopiert werden.",
          "en": "The concrete Browser Source URL is visible and can be copied before the test match.",
          "es": "La URL concreta de la fuente de navegador queda visible y puede copiarse antes de la partida de prueba.",
          "fr": "LURL concrete de source navigateur est visible et peut etre copiee avant le match de test."
        }
      },
      "workflow": {
        "route": "/plugins/coinbattle/ui.html",
        "instructions": {
          "de": {
            "title": "Die echte Coinbattle-URL als OBS-Browserquelle kopieren",
            "body": "Kopiere die sichtbare OBS Browser Source URL aus der Coinbattle-Konfiguration. Erst ein lokales Testmatch fuellt das Overlay; eine leere Overlay-Leinwand wird nicht als Spielansicht ausgegeben.",
            "expected": "Die konkrete Browserquellen-URL ist sichtbar und kann vor dem Testmatch kopiert werden."
          },
          "en": {
            "title": "Copy the real Coinbattle URL into an OBS Browser Source",
            "body": "Copy the visible OBS Browser Source URL from the Coinbattle configuration. Only a local test match populates the overlay; an empty overlay canvas is not presented as game output.",
            "expected": "The concrete Browser Source URL is visible and can be copied before the test match."
          },
          "es": {
            "title": "Copia la URL real de Coinbattle en una fuente de navegador OBS",
            "body": "Copia la URL visible de OBS Browser Source desde la configuracion de Coinbattle. Solo una partida local de prueba llena el overlay; un lienzo vacio no se presenta como salida del juego.",
            "expected": "La URL concreta de la fuente de navegador queda visible y puede copiarse antes de la partida de prueba."
          },
          "fr": {
            "title": "Copiez la vraie URL Coinbattle dans une source navigateur OBS",
            "body": "Copiez lURL visible de source navigateur OBS depuis la configuration Coinbattle. Seul un match de test local remplit loverlay ; une toile vide nest pas presentee comme sortie de jeu.",
            "expected": "LURL concrete de source navigateur est visible et peut etre copiee avant le match de test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/coinbattle/ui.html"
          },
          {
            "type": "open-overlay-preview",
            "selector": "#overlay-url"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/coinbattle/ui.html"
          },
          {
            "type": "visible",
            "selector": "#overlay-url"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#overlay-url",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "match-reset",
      "copy": {
        "de": {
          "title": "Match Reset sicher zuruecksetzen",
          "body": "Entferne nur die Demo-Werte fuer Match Reset, bevor du Münzwerte, Kampfmodus und Match-Start produktiv vorbereitest.",
          "expected": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "alt": "Match Reset sicher zuruecksetzen - Münzwerte, Kampfmodus und Match-Start"
        },
        "en": {
          "title": "Reset Match Reset safely",
          "body": "Remove only the demo values for Match Reset before preparing coin values, battle mode, and match start for production.",
          "expected": "The test profile remains free of production impact.",
          "alt": "Reset Match Reset safely - coin values, battle mode, and match start"
        },
        "es": {
          "title": "Restablece Match Reset con seguridad",
          "body": "Elimina solo los valores demo de Match Reset antes de preparar valores de monedas, modo de batalla e inicio de partida para produccion.",
          "expected": "El perfil de prueba permanece sin impacto de producción.",
          "alt": "Restablece Match Reset con seguridad - valores de monedas, modo de batalla e inicio de partida"
        },
        "fr": {
          "title": "Reinitialisez Match Reset en securite",
          "body": "Supprimez uniquement les valeurs demo de Match Reset avant de preparer valeurs des pièces, mode de combat et démarrage du match pour la production.",
          "expected": "Le profil de test reste sans impact de production.",
          "alt": "Reinitialisez Match Reset en securite - valeurs des pièces, mode de combat et démarrage du match"
        }
      },
      "capture": {
        "route": "/plugins/coinbattle/ui.html",
        "assertVisible": "#btn-end-match",
        "focusText": {
          "de": "Match Reset sicher zuruecksetzen",
          "en": "Reset Match Reset safely",
          "es": "Restablece Match Reset con seguridad",
          "fr": "Reinitialisez Match Reset en securite"
        },
        "action": {
          "type": "reset-demo-state",
          "stepId": "match-reset"
        },
        "expected": {
          "de": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "en": "The test profile remains free of production impact.",
          "es": "El perfil de prueba permanece sin impacto de producción.",
          "fr": "Le profil de test reste sans impact de production."
        }
      },
      "workflow": {
        "route": "/plugins/coinbattle/ui.html",
        "instructions": {
          "de": {
            "title": "Match Reset sicher zuruecksetzen",
            "body": "Entferne nur die Demo-Werte fuer Match Reset, bevor du Münzwerte, Kampfmodus und Match-Start produktiv vorbereitest.",
            "expected": "Das Testprofil bleibt ohne produktive Auswirkung."
          },
          "en": {
            "title": "Reset Match Reset safely",
            "body": "Remove only the demo values for Match Reset before preparing coin values, battle mode, and match start for production.",
            "expected": "The test profile remains free of production impact."
          },
          "es": {
            "title": "Restablece Match Reset con seguridad",
            "body": "Elimina solo los valores demo de Match Reset antes de preparar valores de monedas, modo de batalla e inicio de partida para produccion.",
            "expected": "El perfil de prueba permanece sin impacto de producción."
          },
          "fr": {
            "title": "Reinitialisez Match Reset en securite",
            "body": "Supprimez uniquement les valeurs demo de Match Reset avant de preparer valeurs des pièces, mode de combat et démarrage du match pour la production.",
            "expected": "Le profil de test reste sans impact de production."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/coinbattle/ui.html"
          },
          {
            "type": "reset-demo-state",
            "selector": "#btn-end-match"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/coinbattle/ui.html"
          },
          {
            "type": "visible",
            "selector": "#btn-end-match"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#btn-end-match",
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
