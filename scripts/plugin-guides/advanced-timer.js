'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "advanced-timer",
  "route": "/plugins/advanced-timer/ui.html",
  "topic": {
    "de": "Timerdauer, Startsignal und Ablaufregeln",
    "en": "timer duration, start signal, and flow rules",
    "es": "duración, señal de inicio y reglas de flujo del temporizador",
    "fr": "durée, signal de départ et règles du minuteur"
  },
  "test": {
    "de": "die lokale Timer-Vorschau",
    "en": "the local timer preview",
    "es": "la vista previa local del temporizador",
    "fr": "l’aperçu local du minuteur"
  },
  "expected": {
    "de": "der Countdown startet mit deinen Demo-Werten",
    "en": "the countdown starts with your demo values",
    "es": "la cuenta atrás inicia con los valores de demostración",
    "fr": "le compte à rebours démarre avec vos valeurs de démonstration"
  },
  "requirement": "obs",
  "safety": "obs",
  "mode": "ui",
  "overlay": "/plugins/advanced-timer/overlay/index.html",
  "related": [
    "goals",
    "game-engine"
  ],
  "copy": {
    "de": {
      "title": "Advanced Timer",
      "summary": "Advanced Timer richtet Timerdauer, Startsignal und Ablaufregeln ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "der Countdown startet mit deinen Demo-Werten",
      "requirements": "LTTH Dashboard; für die Ausgabe zusätzlich eine OBS-Testszene. Dieser konkrete Advanced Timer-Ablauf behandelt Timerdauer, Startsignal und Ablaufregeln.",
      "safety": "Nutze eine nicht gesendete OBS-Testszene; LIVE-Ausgaben bleiben deaktiviert. Dieser konkrete Advanced Timer-Ablauf behandelt Timerdauer, Startsignal und Ablaufregeln.",
      "troubleshooting": "Wenn Timerdauer, Startsignal und Ablaufregeln nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "goals",
        "game-engine"
      ]
    },
    "en": {
      "title": "Advanced Timer",
      "summary": "Advanced Timer configures timer duration, start signal, and flow rules with a safe local check instead of a LIVE trigger.",
      "firstResult": "the countdown starts with your demo values",
      "requirements": "LTTH Dashboard; use an OBS test scene for output. This Advanced Timer workflow specifically covers timer duration, start signal, and flow rules.",
      "safety": "Use an OBS test scene that is not live; LIVE output remains disabled. This Advanced Timer workflow specifically covers timer duration, start signal, and flow rules.",
      "troubleshooting": "If timer duration, start signal, and flow rules is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "goals",
        "game-engine"
      ]
    },
    "es": {
      "title": "Advanced Timer",
      "summary": "Advanced Timer configura duración, señal de inicio y reglas de flujo del temporizador mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "la cuenta atrás inicia con los valores de demostración",
      "requirements": "El panel de LTTH y una escena de prueba de OBS para la salida. Este flujo concreto de Advanced Timer trata duración, señal de inicio y reglas de flujo del temporizador.",
      "safety": "Usa una escena de prueba de OBS que no esté al aire; la salida LIVE permanece desactivada. Este flujo concreto de Advanced Timer trata duración, señal de inicio y reglas de flujo del temporizador.",
      "troubleshooting": "Si duración, señal de inicio y reglas de flujo del temporizador no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "goals",
        "game-engine"
      ]
    },
    "fr": {
      "title": "Advanced Timer",
      "summary": "Advanced Timer configure durée, signal de départ et règles du minuteur avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "le compte à rebours démarre avec vos valeurs de démonstration",
      "requirements": "Le tableau de bord LTTH et une scène de test OBS pour la sortie. Ce flux spécifique de Advanced Timer couvre durée, signal de départ et règles du minuteur.",
      "safety": "Utilisez une scène de test OBS non diffusée ; la sortie LIVE reste désactivée. Ce flux spécifique de Advanced Timer couvre durée, signal de départ et règles du minuteur.",
      "troubleshooting": "Si durée, signal de départ et règles du minuteur n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "goals",
        "game-engine"
      ]
    }
  },
  "steps": [
    {
      "id": "timer-card",
      "copy": {
        "de": {
          "title": "Timer Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Timer Card von Timerdauer, Startsignal und Ablaufregeln. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Timer Card im Testprofil konfigurieren - Timerdauer, Startsignal und Ablaufregeln"
        },
        "en": {
          "title": "Configure Timer Card in the test profile",
          "body": "Work in the visible Timer Card area of timer duration, start signal, and flow rules. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Timer Card in the test profile - timer duration, start signal, and flow rules"
        },
        "es": {
          "title": "Configura Timer Card en el perfil de prueba",
          "body": "Trabaja en el area visible Timer Card de duración, señal de inicio y reglas de flujo del temporizador. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Timer Card en el perfil de prueba - duración, señal de inicio y reglas de flujo del temporizador"
        },
        "fr": {
          "title": "Configurez Timer Card dans le profil de test",
          "body": "Travaillez dans la zone visible Timer Card de durée, signal de départ et règles du minuteur. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Timer Card dans le profil de test - durée, signal de départ et règles du minuteur"
        }
      },
      "capture": {
        "route": "/plugins/advanced-timer/ui.html",
        "assertVisible": "#tab-timers",
        "focusText": {
          "de": "Timer Card im Testprofil konfigurieren",
          "en": "Configure Timer Card in the test profile",
          "es": "Configura Timer Card en el perfil de prueba",
          "fr": "Configurez Timer Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "timer-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/advanced-timer/ui.html",
        "instructions": {
          "de": {
            "title": "Timer Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Timer Card von Timerdauer, Startsignal und Ablaufregeln. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Timer Card in the test profile",
            "body": "Work in the visible Timer Card area of timer duration, start signal, and flow rules. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Timer Card en el perfil de prueba",
            "body": "Trabaja en el area visible Timer Card de duración, señal de inicio y reglas de flujo del temporizador. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Timer Card dans le profil de test",
            "body": "Travaillez dans la zone visible Timer Card de durée, signal de départ et règles du minuteur. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/advanced-timer/ui.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#tab-timers"
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
              "path": "/plugins/advanced-timer/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#tab-timers"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#tab-timers",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "timer-duration",
      "copy": {
        "de": {
          "title": "Timer Duration im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Timer Duration von Timerdauer, Startsignal und Ablaufregeln. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Timer Duration im Testprofil konfigurieren - Timerdauer, Startsignal und Ablaufregeln"
        },
        "en": {
          "title": "Configure Timer Duration in the test profile",
          "body": "Work in the visible Timer Duration area of timer duration, start signal, and flow rules. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Timer Duration in the test profile - timer duration, start signal, and flow rules"
        },
        "es": {
          "title": "Configura Timer Duration en el perfil de prueba",
          "body": "Trabaja en el area visible Timer Duration de duración, señal de inicio y reglas de flujo del temporizador. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Timer Duration en el perfil de prueba - duración, señal de inicio y reglas de flujo del temporizador"
        },
        "fr": {
          "title": "Configurez Timer Duration dans le profil de test",
          "body": "Travaillez dans la zone visible Timer Duration de durée, signal de départ et règles du minuteur. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Timer Duration dans le profil de test - durée, signal de départ et règles du minuteur"
        }
      },
      "capture": {
        "route": "/plugins/advanced-timer/ui.html",
        "assertVisible": "#initial-duration",
        "focusText": {
          "de": "Timer Duration im Testprofil konfigurieren",
          "en": "Configure Timer Duration in the test profile",
          "es": "Configura Timer Duration en el perfil de prueba",
          "fr": "Configurez Timer Duration dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "timer-duration"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/advanced-timer/ui.html",
        "instructions": {
          "de": {
            "title": "Timer Duration im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Timer Duration von Timerdauer, Startsignal und Ablaufregeln. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Timer Duration in the test profile",
            "body": "Work in the visible Timer Duration area of timer duration, start signal, and flow rules. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Timer Duration en el perfil de prueba",
            "body": "Trabaja en el area visible Timer Duration de duración, señal de inicio y reglas de flujo del temporizador. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Timer Duration dans le profil de test",
            "body": "Travaillez dans la zone visible Timer Duration de durée, signal de départ et règles du minuteur. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/advanced-timer/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#initial-duration"
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
              "path": "/plugins/advanced-timer/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#initial-duration"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#initial-duration",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "start-signal",
      "copy": {
        "de": {
          "title": "Start Signal im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Start Signal von Timerdauer, Startsignal und Ablaufregeln. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Start Signal im Testprofil konfigurieren - Timerdauer, Startsignal und Ablaufregeln"
        },
        "en": {
          "title": "Configure Start Signal in the test profile",
          "body": "Work in the visible Start Signal area of timer duration, start signal, and flow rules. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Start Signal in the test profile - timer duration, start signal, and flow rules"
        },
        "es": {
          "title": "Configura Start Signal en el perfil de prueba",
          "body": "Trabaja en el area visible Start Signal de duración, señal de inicio y reglas de flujo del temporizador. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Start Signal en el perfil de prueba - duración, señal de inicio y reglas de flujo del temporizador"
        },
        "fr": {
          "title": "Configurez Start Signal dans le profil de test",
          "body": "Travaillez dans la zone visible Start Signal de durée, signal de départ et règles du minuteur. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Start Signal dans le profil de test - durée, signal de départ et règles du minuteur"
        }
      },
      "capture": {
        "route": "/plugins/advanced-timer/ui.html",
        "assertVisible": "#timer-mode",
        "focusText": {
          "de": "Start Signal im Testprofil konfigurieren",
          "en": "Configure Start Signal in the test profile",
          "es": "Configura Start Signal en el perfil de prueba",
          "fr": "Configurez Start Signal dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "start-signal"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/advanced-timer/ui.html",
        "instructions": {
          "de": {
            "title": "Start Signal im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Start Signal von Timerdauer, Startsignal und Ablaufregeln. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Start Signal in the test profile",
            "body": "Work in the visible Start Signal area of timer duration, start signal, and flow rules. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Start Signal en el perfil de prueba",
            "body": "Trabaja en el area visible Start Signal de duración, señal de inicio y reglas de flujo del temporizador. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Start Signal dans le profil de test",
            "body": "Travaillez dans la zone visible Start Signal de durée, signal de départ et règles du minuteur. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/advanced-timer/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#timer-mode"
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
              "path": "/plugins/advanced-timer/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#timer-mode"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#timer-mode",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "countdown-preview",
      "copy": {
        "de": {
          "title": "Lokalen Countdown auf dem Timer-Dashboard pruefen",
          "body": "Oeffne „Create Timer“, gib den lokalen Demo-Namen und die Dauer ein und klicke auf „Create Timer“. Die Aufnahme verwendet nur das temporaere Testprofil und startet keine LIVE-Ausgabe.",
          "expected": "Die neue Countdown-Karte ist im echten Timer-Dashboard sichtbar.",
          "alt": "Lokalen Countdown auf dem Timer-Dashboard pruefen - Timerdauer, Startsignal und Ablaufregeln"
        },
        "en": {
          "title": "Verify a local countdown on the timer dashboard",
          "body": "Open “Create Timer”, enter the local demo name and duration, then click “Create Timer”. The capture uses only the temporary test profile and starts no LIVE output.",
          "expected": "The new countdown card is visible in the real timer dashboard.",
          "alt": "Verify a local countdown on the timer dashboard - timer duration, start signal, and flow rules"
        },
        "es": {
          "title": "Comprueba una cuenta atras local en el panel del temporizador",
          "body": "Abre «Create Timer», introduce el nombre demo local y la duracion, y haz clic en «Create Timer». La captura usa solo el perfil temporal y no inicia ninguna salida LIVE.",
          "expected": "La nueva tarjeta de cuenta atras queda visible en el panel real.",
          "alt": "Comprueba una cuenta atras local en el panel del temporizador - duración, señal de inicio y reglas de flujo del temporizador"
        },
        "fr": {
          "title": "Verifiez un compte a rebours local sur le tableau de bord",
          "body": "Ouvrez « Create Timer », saisissez le nom de demonstration local et la duree, puis cliquez sur « Create Timer ». La capture utilise uniquement le profil temporaire et ne demarre aucune sortie LIVE.",
          "expected": "La nouvelle carte de compte a rebours est visible sur le vrai tableau de bord.",
          "alt": "Verifiez un compte a rebours local sur le tableau de bord - durée, signal de départ et règles du minuteur"
        }
      },
      "capture": {
        "route": "/plugins/advanced-timer/ui.html",
        "assertVisible": "#timers-container",
        "focusText": {
          "de": "Lokalen Countdown auf dem Timer-Dashboard pruefen",
          "en": "Verify a local countdown on the timer dashboard",
          "es": "Comprueba una cuenta atras local en el panel del temporizador",
          "fr": "Verifiez un compte a rebours local sur le tableau de bord"
        },
        "action": {
          "type": "run-local-preview",
          "prepare": "create-demo-timer",
          "allowClick": true,
          "clickSelector": "#timer-form button[type=\"submit\"]",
          "settleMs": 1000,
          "stepId": "countdown-preview"
        },
        "expected": {
          "de": "Die neue Countdown-Karte ist im echten Timer-Dashboard sichtbar.",
          "en": "The new countdown card is visible in the real timer dashboard.",
          "es": "La nueva tarjeta de cuenta atras queda visible en el panel real.",
          "fr": "La nouvelle carte de compte a rebours est visible sur le vrai tableau de bord."
        }
      },
      "workflow": {
        "route": "/plugins/advanced-timer/ui.html",
        "instructions": {
          "de": {
            "title": "Lokalen Countdown auf dem Timer-Dashboard pruefen",
            "body": "Oeffne „Create Timer“, gib den lokalen Demo-Namen und die Dauer ein und klicke auf „Create Timer“. Die Aufnahme verwendet nur das temporaere Testprofil und startet keine LIVE-Ausgabe.",
            "expected": "Die neue Countdown-Karte ist im echten Timer-Dashboard sichtbar."
          },
          "en": {
            "title": "Verify a local countdown on the timer dashboard",
            "body": "Open “Create Timer”, enter the local demo name and duration, then click “Create Timer”. The capture uses only the temporary test profile and starts no LIVE output.",
            "expected": "The new countdown card is visible in the real timer dashboard."
          },
          "es": {
            "title": "Comprueba una cuenta atras local en el panel del temporizador",
            "body": "Abre «Create Timer», introduce el nombre demo local y la duracion, y haz clic en «Create Timer». La captura usa solo el perfil temporal y no inicia ninguna salida LIVE.",
            "expected": "La nueva tarjeta de cuenta atras queda visible en el panel real."
          },
          "fr": {
            "title": "Verifiez un compte a rebours local sur le tableau de bord",
            "body": "Ouvrez « Create Timer », saisissez le nom de demonstration local et la duree, puis cliquez sur « Create Timer ». La capture utilise uniquement le profil temporaire et ne demarre aucune sortie LIVE.",
            "expected": "La nouvelle carte de compte a rebours est visible sur le vrai tableau de bord."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/advanced-timer/ui.html"
          },
          {
            "type": "prepare",
            "name": "create-demo-timer"
          },
          {
            "type": "run-local-preview",
            "selector": "#timer-form button[type=\"submit\"]"
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
              "path": "/plugins/advanced-timer/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#timers-container"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#timers-container",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "timer-overlay",
      "copy": {
        "de": {
          "title": "Timer Overlay als Overlay-Vorschau oeffnen",
          "body": "Erstelle zuerst einen lokalen 90-Sekunden-Testtimer. Oeffne dann dessen echte Overlay-URL mit dem erzeugten timer-Parameter ausschliesslich in einer nicht sendenden OBS-Testszene.",
          "expected": "Das Overlay zeigt den lokalen Testtimer mit 01:30.",
          "alt": "Timer Overlay als Overlay-Vorschau oeffnen - Timerdauer, Startsignal und Ablaufregeln"
        },
        "en": {
          "title": "Open Timer Overlay as an overlay preview",
          "body": "First create a local 90-second test timer. Then open its real Overlay URL with the generated timer parameter only in an OBS test scene that is not live.",
          "expected": "The overlay shows the local test timer at 01:30.",
          "alt": "Open Timer Overlay as an overlay preview - timer duration, start signal, and flow rules"
        },
        "es": {
          "title": "Abre Timer Overlay como vista previa de overlay",
          "body": "Primero crea un temporizador de prueba local de 90 segundos. Despues abre su URL real de Overlay con el parametro timer generado solo en una escena de prueba de OBS que no esta al aire.",
          "expected": "El overlay muestra el temporizador local de prueba en 01:30.",
          "alt": "Abre Timer Overlay como vista previa de overlay - duración, señal de inicio y reglas de flujo del temporizador"
        },
        "fr": {
          "title": "Ouvrez Timer Overlay comme apercu overlay",
          "body": "Creez d abord un minuteur de test local de 90 secondes. Ouvrez ensuite sa vraie URL Overlay avec le parametre timer genere uniquement dans une scene de test OBS non diffusee.",
          "expected": "L overlay affiche le minuteur de test local a 01:30.",
          "alt": "Ouvrez Timer Overlay comme apercu overlay - durée, signal de départ et règles du minuteur"
        }
      },
      "capture": {
        "route": "/plugins/advanced-timer/overlay/index.html",
        "assertVisible": "#timer-container",
        "focusText": {
          "de": "Timer Overlay als Overlay-Vorschau oeffnen",
          "en": "Open Timer Overlay as an overlay preview",
          "es": "Abre Timer Overlay como vista previa de overlay",
          "fr": "Ouvrez Timer Overlay comme apercu overlay"
        },
        "action": {
          "type": "open-overlay-preview",
          "prepare": "create-demo-timer-overlay",
          "stepId": "timer-overlay"
        },
        "expected": {
          "de": "Das Overlay zeigt den lokalen Testtimer mit 01:30.",
          "en": "The overlay shows the local test timer at 01:30.",
          "es": "El overlay muestra el temporizador local de prueba en 01:30.",
          "fr": "L overlay affiche le minuteur de test local a 01:30."
        }
      },
      "workflow": {
        "route": "/plugins/advanced-timer/overlay/index.html",
        "instructions": {
          "de": {
            "title": "Timer Overlay als Overlay-Vorschau oeffnen",
            "body": "Erstelle zuerst einen lokalen 90-Sekunden-Testtimer. Oeffne dann dessen echte Overlay-URL mit dem erzeugten timer-Parameter ausschliesslich in einer nicht sendenden OBS-Testszene.",
            "expected": "Das Overlay zeigt den lokalen Testtimer mit 01:30."
          },
          "en": {
            "title": "Open Timer Overlay as an overlay preview",
            "body": "First create a local 90-second test timer. Then open its real Overlay URL with the generated timer parameter only in an OBS test scene that is not live.",
            "expected": "The overlay shows the local test timer at 01:30."
          },
          "es": {
            "title": "Abre Timer Overlay como vista previa de overlay",
            "body": "Primero crea un temporizador de prueba local de 90 segundos. Despues abre su URL real de Overlay con el parametro timer generado solo en una escena de prueba de OBS que no esta al aire.",
            "expected": "El overlay muestra el temporizador local de prueba en 01:30."
          },
          "fr": {
            "title": "Ouvrez Timer Overlay comme apercu overlay",
            "body": "Creez d abord un minuteur de test local de 90 secondes. Ouvrez ensuite sa vraie URL Overlay avec le parametre timer genere uniquement dans une scene de test OBS non diffusee.",
            "expected": "L overlay affiche le minuteur de test local a 01:30."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/advanced-timer/ui.html"
          },
          {
            "type": "prepare",
            "name": "create-demo-timer"
          },
          {
            "type": "run-local-preview",
            "selector": "#timer-form button[type=\"submit\"]"
          },
          {
            "type": "goto",
            "route": "/plugins/advanced-timer/overlay/index.html"
          },
          {
            "type": "open-overlay-preview",
            "selector": "#timer-container"
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
              "path": "/plugins/advanced-timer/overlay/index.html",
              "query": {"lang":"$locale","timer":"non-empty"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#timer-container"
          },
          {
            "type": "text",
            "selector": "#timer-container",
            "expected": "01:30"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#timer-container",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "timer-reset",
      "copy": {
        "de": {
          "title": "Timer Reset sicher zuruecksetzen",
          "body": "Entferne nur die Demo-Werte fuer Timer Reset, bevor du Timerdauer, Startsignal und Ablaufregeln produktiv vorbereitest.",
          "expected": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "alt": "Timer Reset sicher zuruecksetzen - Timerdauer, Startsignal und Ablaufregeln"
        },
        "en": {
          "title": "Reset Timer Reset safely",
          "body": "Remove only the demo values for Timer Reset before preparing timer duration, start signal, and flow rules for production.",
          "expected": "The test profile remains free of production impact.",
          "alt": "Reset Timer Reset safely - timer duration, start signal, and flow rules"
        },
        "es": {
          "title": "Restablece Timer Reset con seguridad",
          "body": "Elimina solo los valores demo de Timer Reset antes de preparar duración, señal de inicio y reglas de flujo del temporizador para produccion.",
          "expected": "El perfil de prueba permanece sin impacto de producción.",
          "alt": "Restablece Timer Reset con seguridad - duración, señal de inicio y reglas de flujo del temporizador"
        },
        "fr": {
          "title": "Reinitialisez Timer Reset en securite",
          "body": "Supprimez uniquement les valeurs demo de Timer Reset avant de preparer durée, signal de départ et règles du minuteur pour la production.",
          "expected": "Le profil de test reste sans impact de production.",
          "alt": "Reinitialisez Timer Reset en securite - durée, signal de départ et règles du minuteur"
        }
      },
      "capture": {
        "route": "/plugins/advanced-timer/ui.html",
        "assertVisible": "#tab-profiles",
        "focusText": {
          "de": "Timer Reset sicher zuruecksetzen",
          "en": "Reset Timer Reset safely",
          "es": "Restablece Timer Reset con seguridad",
          "fr": "Reinitialisez Timer Reset en securite"
        },
        "action": {
          "type": "reset-demo-state",
          "stepId": "timer-reset"
        },
        "expected": {
          "de": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "en": "The test profile remains free of production impact.",
          "es": "El perfil de prueba permanece sin impacto de producción.",
          "fr": "Le profil de test reste sans impact de production."
        }
      },
      "workflow": {
        "route": "/plugins/advanced-timer/ui.html",
        "instructions": {
          "de": {
            "title": "Timer Reset sicher zuruecksetzen",
            "body": "Entferne nur die Demo-Werte fuer Timer Reset, bevor du Timerdauer, Startsignal und Ablaufregeln produktiv vorbereitest.",
            "expected": "Das Testprofil bleibt ohne produktive Auswirkung."
          },
          "en": {
            "title": "Reset Timer Reset safely",
            "body": "Remove only the demo values for Timer Reset before preparing timer duration, start signal, and flow rules for production.",
            "expected": "The test profile remains free of production impact."
          },
          "es": {
            "title": "Restablece Timer Reset con seguridad",
            "body": "Elimina solo los valores demo de Timer Reset antes de preparar duración, señal de inicio y reglas de flujo del temporizador para produccion.",
            "expected": "El perfil de prueba permanece sin impacto de producción."
          },
          "fr": {
            "title": "Reinitialisez Timer Reset en securite",
            "body": "Supprimez uniquement les valeurs demo de Timer Reset avant de preparer durée, signal de départ et règles du minuteur pour la production.",
            "expected": "Le profil de test reste sans impact de production."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/advanced-timer/ui.html"
          },
          {
            "type": "reset-demo-state",
            "selector": "#tab-profiles"
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
              "path": "/plugins/advanced-timer/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#tab-profiles"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#tab-profiles",
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
