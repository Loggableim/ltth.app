'use strict';

const { exactLocalUrlExpectation } = require('../lib/guide-overlay-entry-points');

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
const guide = {
  "id": "fireworks",
  "route": "/plugins/fireworks/ui/settings.html",
  "topic": {
    "de": "Effektprofil, Auslöser und Audio-Lautstärke",
    "en": "effect profile, trigger, and audio volume",
    "es": "perfil de efecto, disparador y volumen de audio",
    "fr": "profil d’effet, déclencheur et volume audio"
  },
  "test": {
    "de": "den eingebauten Feuerwerk-Test",
    "en": "the built-in fireworks test",
    "es": "la prueba integrada de fuegos artificiales",
    "fr": "le test intégré de feux d’artifice"
  },
  "expected": {
    "de": "das Feuerwerk erscheint in der lokalen Overlay-Vorschau",
    "en": "the fireworks appear in the local overlay preview",
    "es": "los fuegos artificiales aparecen en la vista previa local",
    "fr": "les feux d’artifice apparaissent dans l’aperçu local"
  },
  "requirement": "obs",
  "safety": "obs",
  "mode": "ui",
  "overlay": "/plugins/fireworks/overlay.html",
  "related": [
    "webgpu-fireworks",
    "flame-overlay"
  ],
  "copy": {
    "de": {
      "title": "Fireworks Superplugin (Stable)",
      "summary": "Fireworks Superplugin (Stable) richtet Effektprofil, Auslöser und Audio-Lautstärke ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "das Feuerwerk erscheint in der lokalen Overlay-Vorschau",
      "requirements": "LTTH Dashboard; für die Ausgabe zusätzlich eine OBS-Testszene. Dieser konkrete Fireworks Superplugin (Stable)-Ablauf behandelt Effektprofil, Auslöser und Audio-Lautstärke.",
      "safety": "Nutze eine nicht gesendete OBS-Testszene; LIVE-Ausgaben bleiben deaktiviert. Dieser konkrete Fireworks Superplugin (Stable)-Ablauf behandelt Effektprofil, Auslöser und Audio-Lautstärke.",
      "troubleshooting": "Wenn Effektprofil, Auslöser und Audio-Lautstärke nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "webgpu-fireworks",
        "flame-overlay"
      ]
    },
    "en": {
      "title": "Fireworks Superplugin (Stable)",
      "summary": "Fireworks Superplugin (Stable) configures effect profile, trigger, and audio volume with a safe local check instead of a LIVE trigger.",
      "firstResult": "the fireworks appear in the local overlay preview",
      "requirements": "LTTH Dashboard; use an OBS test scene for output. This Fireworks Superplugin (Stable) workflow specifically covers effect profile, trigger, and audio volume.",
      "safety": "Use an OBS test scene that is not live; LIVE output remains disabled. This Fireworks Superplugin (Stable) workflow specifically covers effect profile, trigger, and audio volume.",
      "troubleshooting": "If effect profile, trigger, and audio volume is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "webgpu-fireworks",
        "flame-overlay"
      ]
    },
    "es": {
      "title": "Fireworks Superplugin (Stable)",
      "summary": "Fireworks Superplugin (Stable) configura perfil de efecto, disparador y volumen de audio mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "los fuegos artificiales aparecen en la vista previa local",
      "requirements": "El panel de LTTH y una escena de prueba de OBS para la salida. Este flujo concreto de Fireworks Superplugin (Stable) trata perfil de efecto, disparador y volumen de audio.",
      "safety": "Usa una escena de prueba de OBS que no esté al aire; la salida LIVE permanece desactivada. Este flujo concreto de Fireworks Superplugin (Stable) trata perfil de efecto, disparador y volumen de audio.",
      "troubleshooting": "Si perfil de efecto, disparador y volumen de audio no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "webgpu-fireworks",
        "flame-overlay"
      ]
    },
    "fr": {
      "title": "Fireworks Superplugin (Stable)",
      "summary": "Fireworks Superplugin (Stable) configure profil d’effet, déclencheur et volume audio avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "les feux d’artifice apparaissent dans l’aperçu local",
      "requirements": "Le tableau de bord LTTH et une scène de test OBS pour la sortie. Ce flux spécifique de Fireworks Superplugin (Stable) couvre profil d’effet, déclencheur et volume audio.",
      "safety": "Utilisez une scène de test OBS non diffusée ; la sortie LIVE reste désactivée. Ce flux spécifique de Fireworks Superplugin (Stable) couvre profil d’effet, déclencheur et volume audio.",
      "troubleshooting": "Si profil d’effet, déclencheur et volume audio n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "webgpu-fireworks",
        "flame-overlay"
      ]
    }
  },
  "steps": [
    {
      "id": "fireworks-card",
      "copy": {
        "de": {
          "title": "Fireworks Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Fireworks Card von Effektprofil, Auslöser und Audio-Lautstärke. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Fireworks Card im Testprofil konfigurieren - Effektprofil, Auslöser und Audio-Lautstärke"
        },
        "en": {
          "title": "Configure Fireworks Card in the test profile",
          "body": "Work in the visible Fireworks Card area of effect profile, trigger, and audio volume. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Fireworks Card in the test profile - effect profile, trigger, and audio volume"
        },
        "es": {
          "title": "Configura Fireworks Card en el perfil de prueba",
          "body": "Trabaja en el area visible Fireworks Card de perfil de efecto, disparador y volumen de audio. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Fireworks Card en el perfil de prueba - perfil de efecto, disparador y volumen de audio"
        },
        "fr": {
          "title": "Configurez Fireworks Card dans le profil de test",
          "body": "Travaillez dans la zone visible Fireworks Card de profil d’effet, déclencheur et volume audio. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Fireworks Card dans le profil de test - profil d’effet, déclencheur et volume audio"
        }
      },
      "capture": {
        "route": "/plugins/fireworks/ui/settings.html",
        "assertVisible": "#settings",
        "focusText": {
          "de": "Fireworks Card im Testprofil konfigurieren",
          "en": "Configure Fireworks Card in the test profile",
          "es": "Configura Fireworks Card en el perfil de prueba",
          "fr": "Configurez Fireworks Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "prepare": "open-fireworks-settings",
          "stepId": "fireworks-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/fireworks/ui/settings.html",
        "instructions": {
          "de": {
            "title": "Fireworks Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Fireworks Card von Effektprofil, Auslöser und Audio-Lautstärke. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Fireworks Card in the test profile",
            "body": "Work in the visible Fireworks Card area of effect profile, trigger, and audio volume. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Fireworks Card en el perfil de prueba",
            "body": "Trabaja en el area visible Fireworks Card de perfil de efecto, disparador y volumen de audio. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Fireworks Card dans le profil de test",
            "body": "Travaillez dans la zone visible Fireworks Card de profil d’effet, déclencheur et volume audio. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/fireworks/ui/settings.html"
          },
          {
            "type": "prepare",
            "name": "open-fireworks-settings"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#settings"
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
              "path": "/plugins/fireworks/ui/settings.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#settings"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#settings",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "effect-profile",
      "copy": {
        "de": {
          "title": "Effect Profile im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Effect Profile von Effektprofil, Auslöser und Audio-Lautstärke. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Effect Profile im Testprofil konfigurieren - Effektprofil, Auslöser und Audio-Lautstärke"
        },
        "en": {
          "title": "Configure Effect Profile in the test profile",
          "body": "Work in the visible Effect Profile area of effect profile, trigger, and audio volume. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Effect Profile in the test profile - effect profile, trigger, and audio volume"
        },
        "es": {
          "title": "Configura Effect Profile en el perfil de prueba",
          "body": "Trabaja en el area visible Effect Profile de perfil de efecto, disparador y volumen de audio. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Effect Profile en el perfil de prueba - perfil de efecto, disparador y volumen de audio"
        },
        "fr": {
          "title": "Configurez Effect Profile dans le profil de test",
          "body": "Travaillez dans la zone visible Effect Profile de profil d’effet, déclencheur et volume audio. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Effect Profile dans le profil de test - profil d’effet, déclencheur et volume audio"
        }
      },
      "capture": {
        "route": "/plugins/fireworks/ui/settings.html",
        "assertVisible": "#master-toggle",
        "focusText": {
          "de": "Effect Profile im Testprofil konfigurieren",
          "en": "Configure Effect Profile in the test profile",
          "es": "Configura Effect Profile en el perfil de prueba",
          "fr": "Configurez Effect Profile dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "prepare": "open-fireworks-settings",
          "stepId": "effect-profile"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/fireworks/ui/settings.html",
        "instructions": {
          "de": {
            "title": "Effect Profile im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Effect Profile von Effektprofil, Auslöser und Audio-Lautstärke. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Effect Profile in the test profile",
            "body": "Work in the visible Effect Profile area of effect profile, trigger, and audio volume. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Effect Profile en el perfil de prueba",
            "body": "Trabaja en el area visible Effect Profile de perfil de efecto, disparador y volumen de audio. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Effect Profile dans le profil de test",
            "body": "Travaillez dans la zone visible Effect Profile de profil d’effet, déclencheur et volume audio. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/fireworks/ui/settings.html"
          },
          {
            "type": "prepare",
            "name": "open-fireworks-settings"
          },
          {
            "type": "set-demo-value",
            "selector": "#master-toggle"
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
              "path": "/plugins/fireworks/ui/settings.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#master-toggle"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#master-toggle",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "audio-limit",
      "copy": {
        "de": {
          "title": "Audio Limit im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Audio Limit von Effektprofil, Auslöser und Audio-Lautstärke. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Audio Limit im Testprofil konfigurieren - Effektprofil, Auslöser und Audio-Lautstärke"
        },
        "en": {
          "title": "Configure Audio Limit in the test profile",
          "body": "Work in the visible Audio Limit area of effect profile, trigger, and audio volume. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Audio Limit in the test profile - effect profile, trigger, and audio volume"
        },
        "es": {
          "title": "Configura Audio Limit en el perfil de prueba",
          "body": "Trabaja en el area visible Audio Limit de perfil de efecto, disparador y volumen de audio. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Audio Limit en el perfil de prueba - perfil de efecto, disparador y volumen de audio"
        },
        "fr": {
          "title": "Configurez Audio Limit dans le profil de test",
          "body": "Travaillez dans la zone visible Audio Limit de profil d’effet, déclencheur et volume audio. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Audio Limit dans le profil de test - profil d’effet, déclencheur et volume audio"
        }
      },
      "capture": {
        "route": "/plugins/fireworks/ui/settings.html",
        "assertVisible": "#audio-volume",
        "focusText": {
          "de": "Audio Limit im Testprofil konfigurieren",
          "en": "Configure Audio Limit in the test profile",
          "es": "Configura Audio Limit en el perfil de prueba",
          "fr": "Configurez Audio Limit dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "prepare": "open-fireworks-settings",
          "stepId": "audio-limit"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/fireworks/ui/settings.html",
        "instructions": {
          "de": {
            "title": "Audio Limit im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Audio Limit von Effektprofil, Auslöser und Audio-Lautstärke. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Audio Limit in the test profile",
            "body": "Work in the visible Audio Limit area of effect profile, trigger, and audio volume. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Audio Limit en el perfil de prueba",
            "body": "Trabaja en el area visible Audio Limit de perfil de efecto, disparador y volumen de audio. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Audio Limit dans le profil de test",
            "body": "Travaillez dans la zone visible Audio Limit de profil d’effet, déclencheur et volume audio. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/fireworks/ui/settings.html"
          },
          {
            "type": "prepare",
            "name": "open-fireworks-settings"
          },
          {
            "type": "set-demo-value",
            "selector": "#audio-volume"
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
              "path": "/plugins/fireworks/ui/settings.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#audio-volume"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#audio-volume",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "fireworks-test",
      "copy": {
        "de": {
          "title": "Lokales Test-Feuerwerk ausloesen",
          "body": "Klicke im isolierten Testprofil auf den echten Button „Test Firework“. Der Test sendet nur an die lokale Vorschau und verwendet weder eine LIVE-Quelle noch ein externes Geraet.",
          "expected": "Die echte Erfolgsmeldung bestaetigt das ausgeloeste Test-Feuerwerk.",
          "alt": "Lokales Test-Feuerwerk ausloesen - Effektprofil, Auslöser und Audio-Lautstärke"
        },
        "en": {
          "title": "Trigger a local test firework",
          "body": "In the isolated test profile, click the real “Test Firework” button. The test targets only the local preview and uses neither a LIVE source nor an external device.",
          "expected": "The real success message confirms that the test firework was triggered.",
          "alt": "Trigger a local test firework - effect profile, trigger, and audio volume"
        },
        "es": {
          "title": "Activa un fuego artificial local de prueba",
          "body": "En el perfil de prueba aislado, haz clic en el boton real «Test Firework». La prueba solo llega a la vista previa local y no usa una fuente LIVE ni un dispositivo externo.",
          "expected": "El mensaje real de exito confirma que se activo el fuego artificial de prueba.",
          "alt": "Activa un fuego artificial local de prueba - perfil de efecto, disparador y volumen de audio"
        },
        "fr": {
          "title": "Declenchez un feu d artifice de test local",
          "body": "Dans le profil de test isole, cliquez sur le vrai bouton « Test Firework ». Le test cible uniquement l apercu local et n utilise ni source LIVE ni appareil externe.",
          "expected": "Le vrai message de succes confirme le declenchement du feu d artifice de test.",
          "alt": "Declenchez un feu d artifice de test local - profil d’effet, déclencheur et volume audio"
        }
      },
      "capture": {
        "route": "/plugins/fireworks/ui/settings.html",
        "assertVisible": "#test-btn",
        "focusText": {
          "de": "Lokales Test-Feuerwerk ausloesen",
          "en": "Trigger a local test firework",
          "es": "Activa un fuego artificial local de prueba",
          "fr": "Declenchez un feu d artifice de test local"
        },
        "action": {
          "type": "run-local-preview",
          "allowClick": true,
          "clickSelector": "#test-btn",
          "settleMs": 1000,
          "stepId": "fireworks-test"
        },
        "expected": {
          "de": "Die echte Erfolgsmeldung bestaetigt das ausgeloeste Test-Feuerwerk.",
          "en": "The real success message confirms that the test firework was triggered.",
          "es": "El mensaje real de exito confirma que se activo el fuego artificial de prueba.",
          "fr": "Le vrai message de succes confirme le declenchement du feu d artifice de test."
        }
      },
      "workflow": {
        "route": "/plugins/fireworks/ui/settings.html",
        "instructions": {
          "de": {
            "title": "Lokales Test-Feuerwerk ausloesen",
            "body": "Klicke im isolierten Testprofil auf den echten Button „Test Firework“. Der Test sendet nur an die lokale Vorschau und verwendet weder eine LIVE-Quelle noch ein externes Geraet.",
            "expected": "Die echte Erfolgsmeldung bestaetigt das ausgeloeste Test-Feuerwerk."
          },
          "en": {
            "title": "Trigger a local test firework",
            "body": "In the isolated test profile, click the real “Test Firework” button. The test targets only the local preview and uses neither a LIVE source nor an external device.",
            "expected": "The real success message confirms that the test firework was triggered."
          },
          "es": {
            "title": "Activa un fuego artificial local de prueba",
            "body": "En el perfil de prueba aislado, haz clic en el boton real «Test Firework». La prueba solo llega a la vista previa local y no usa una fuente LIVE ni un dispositivo externo.",
            "expected": "El mensaje real de exito confirma que se activo el fuego artificial de prueba."
          },
          "fr": {
            "title": "Declenchez un feu d artifice de test local",
            "body": "Dans le profil de test isole, cliquez sur le vrai bouton « Test Firework ». Le test cible uniquement l apercu local et n utilise ni source LIVE ni appareil externe.",
            "expected": "Le vrai message de succes confirme le declenchement du feu d artifice de test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/fireworks/ui/settings.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#test-btn"
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
              "path": "/plugins/fireworks/ui/settings.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#test-btn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#test-btn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "fireworks-overlay",
      "copy": {
        "de": {
          "title": "Fireworks Overlay als Overlay-Vorschau oeffnen",
          "body": "Oeffne die echte Fireworks Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
          "expected": "das Feuerwerk erscheint in der lokalen Overlay-Vorschau",
          "alt": "Fireworks Overlay als Overlay-Vorschau oeffnen - Effektprofil, Auslöser und Audio-Lautstärke"
        },
        "en": {
          "title": "Open Fireworks Overlay as an overlay preview",
          "body": "Open the real Fireworks Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
          "expected": "the fireworks appear in the local overlay preview",
          "alt": "Open Fireworks Overlay as an overlay preview - effect profile, trigger, and audio volume"
        },
        "es": {
          "title": "Abre Fireworks Overlay como vista previa de overlay",
          "body": "Abre la superficie real Fireworks Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
          "expected": "los fuegos artificiales aparecen en la vista previa local",
          "alt": "Abre Fireworks Overlay como vista previa de overlay - perfil de efecto, disparador y volumen de audio"
        },
        "fr": {
          "title": "Ouvrez Fireworks Overlay comme apercu overlay",
          "body": "Ouvrez la vraie surface Fireworks Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
          "expected": "les feux d’artifice apparaissent dans l’aperçu local",
          "alt": "Ouvrez Fireworks Overlay comme apercu overlay - profil d’effet, déclencheur et volume audio"
        }
      },
      "capture": {
        "route": "/plugins/fireworks/overlay.html",
        "assertVisible": "#fireworks-canvas",
        "focusText": {
          "de": "Fireworks Overlay als Overlay-Vorschau oeffnen",
          "en": "Open Fireworks Overlay as an overlay preview",
          "es": "Abre Fireworks Overlay como vista previa de overlay",
          "fr": "Ouvrez Fireworks Overlay comme apercu overlay"
        },
        "action": {
          "type": "open-overlay-preview",
          "stepId": "fireworks-overlay"
        },
        "expected": {
          "de": "das Feuerwerk erscheint in der lokalen Overlay-Vorschau",
          "en": "the fireworks appear in the local overlay preview",
          "es": "los fuegos artificiales aparecen en la vista previa local",
          "fr": "les feux d’artifice apparaissent dans l’aperçu local"
        }
      },
      "workflow": {
        "route": "/plugins/fireworks/overlay.html",
        "instructions": {
          "de": {
            "title": "Fireworks Overlay als Overlay-Vorschau oeffnen",
            "body": "Oeffne die echte Fireworks Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
            "expected": "das Feuerwerk erscheint in der lokalen Overlay-Vorschau"
          },
          "en": {
            "title": "Open Fireworks Overlay as an overlay preview",
            "body": "Open the real Fireworks Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
            "expected": "the fireworks appear in the local overlay preview"
          },
          "es": {
            "title": "Abre Fireworks Overlay como vista previa de overlay",
            "body": "Abre la superficie real Fireworks Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
            "expected": "los fuegos artificiales aparecen en la vista previa local"
          },
          "fr": {
            "title": "Ouvrez Fireworks Overlay comme apercu overlay",
            "body": "Ouvrez la vraie surface Fireworks Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
            "expected": "les feux d’artifice apparaissent dans l’aperçu local"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/fireworks/overlay.html"
          },
          {
            "type": "open-overlay-preview",
            "selector": "#fireworks-canvas"
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
              "path": "/plugins/fireworks/ui/settings.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#fireworks-canvas"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#fireworks-canvas",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "fireworks-reset",
      "copy": {
        "de": {
          "title": "Isolierte Fireworks-Einstellungen speichern",
          "body": "Pruefe die sichtbaren Testwerte und klicke auf „Save Settings“. Gespeichert wird ausschliesslich im temporaeren Capture-Profil; ein Reset ist nicht erforderlich und produktive Einstellungen bleiben unveraendert.",
          "expected": "Die echte Erfolgsmeldung bestaetigt die gespeicherten Test-Einstellungen.",
          "alt": "Isolierte Fireworks-Einstellungen speichern - Effektprofil, Auslöser und Audio-Lautstärke"
        },
        "en": {
          "title": "Save the isolated Fireworks settings",
          "body": "Review the visible test values and click “Save Settings”. This writes only to the temporary capture profile; no reset is required and production settings stay unchanged.",
          "expected": "The real success message confirms that the test settings were saved.",
          "alt": "Save the isolated Fireworks settings - effect profile, trigger, and audio volume"
        },
        "es": {
          "title": "Guarda los ajustes aislados de Fireworks",
          "body": "Revisa los valores de prueba visibles y haz clic en «Save Settings». Solo se guarda en el perfil temporal de captura; no hace falta restablecer y los ajustes de produccion no cambian.",
          "expected": "El mensaje real de exito confirma que se guardaron los ajustes de prueba.",
          "alt": "Guarda los ajustes aislados de Fireworks - perfil de efecto, disparador y volumen de audio"
        },
        "fr": {
          "title": "Enregistrez les reglages Fireworks isoles",
          "body": "Verifiez les valeurs de test visibles et cliquez sur « Save Settings ». L enregistrement concerne uniquement le profil temporaire de capture ; aucune reinitialisation n est necessaire et les reglages de production restent inchanges.",
          "expected": "Le vrai message de succes confirme l enregistrement des reglages de test.",
          "alt": "Enregistrez les reglages Fireworks isoles - profil d’effet, déclencheur et volume audio"
        }
      },
      "capture": {
        "route": "/plugins/fireworks/ui/settings.html",
        "assertVisible": "#save-btn",
        "focusText": {
          "de": "Isolierte Fireworks-Einstellungen speichern",
          "en": "Save the isolated Fireworks settings",
          "es": "Guarda los ajustes aislados de Fireworks",
          "fr": "Enregistrez les reglages Fireworks isoles"
        },
        "action": {
          "type": "save-demo-config",
          "prepare": "open-fireworks-settings",
          "allowClick": true,
          "clickSelector": "#save-btn",
          "settleMs": 1000,
          "stepId": "fireworks-reset"
        },
        "expected": {
          "de": "Die echte Erfolgsmeldung bestaetigt die gespeicherten Test-Einstellungen.",
          "en": "The real success message confirms that the test settings were saved.",
          "es": "El mensaje real de exito confirma que se guardaron los ajustes de prueba.",
          "fr": "Le vrai message de succes confirme l enregistrement des reglages de test."
        }
      },
      "workflow": {
        "route": "/plugins/fireworks/ui/settings.html",
        "instructions": {
          "de": {
            "title": "Isolierte Fireworks-Einstellungen speichern",
            "body": "Pruefe die sichtbaren Testwerte und klicke auf „Save Settings“. Gespeichert wird ausschliesslich im temporaeren Capture-Profil; ein Reset ist nicht erforderlich und produktive Einstellungen bleiben unveraendert.",
            "expected": "Die echte Erfolgsmeldung bestaetigt die gespeicherten Test-Einstellungen."
          },
          "en": {
            "title": "Save the isolated Fireworks settings",
            "body": "Review the visible test values and click “Save Settings”. This writes only to the temporary capture profile; no reset is required and production settings stay unchanged.",
            "expected": "The real success message confirms that the test settings were saved."
          },
          "es": {
            "title": "Guarda los ajustes aislados de Fireworks",
            "body": "Revisa los valores de prueba visibles y haz clic en «Save Settings». Solo se guarda en el perfil temporal de captura; no hace falta restablecer y los ajustes de produccion no cambian.",
            "expected": "El mensaje real de exito confirma que se guardaron los ajustes de prueba."
          },
          "fr": {
            "title": "Enregistrez les reglages Fireworks isoles",
            "body": "Verifiez les valeurs de test visibles et cliquez sur « Save Settings ». L enregistrement concerne uniquement le profil temporaire de capture ; aucune reinitialisation n est necessaire et les reglages de production restent inchanges.",
            "expected": "Le vrai message de succes confirme l enregistrement des reglages de test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/fireworks/ui/settings.html"
          },
          {
            "type": "prepare",
            "name": "open-fireworks-settings"
          },
          {
            "type": "save-demo-config",
            "selector": "#save-btn"
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
              "path": "/plugins/fireworks/ui/settings.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#save-btn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#save-btn",
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
    if (!step) throw new Error(`Missing Fireworks guide step: ${id}`);
    const focusText = Object.fromEntries(Object.entries(correction.copy).map(([locale, copy]) => [locale, copy.title]));
    const expected = Object.fromEntries(Object.entries(correction.copy).map(([locale, copy]) => [locale, copy.expected]));
    const route = correction.route || step.capture.route;
    step.copy = correction.copy;
    step.capture = { ...step.capture, route, assertVisible: correction.selector, focusText, action: { ...correction.action, stepId: id }, expected };
    step.workflow = {
      ...step.workflow,
      route,
      instructions: Object.fromEntries(Object.entries(correction.copy).map(([locale, copy]) => [locale, { title: copy.title, body: copy.body, expected: copy.expected }])),
      operations: [{ type: 'goto', route }, { type: correction.action.type, selector: correction.selector }],
      postconditions: [
        { type: 'http-status', expected: 200 },
        { type: 'url', expected: exactLocalUrlExpectation(route) },
        { type: 'visible', selector: correction.selector },
        { type: 'console', expected: 'no-errors' }
      ],
      captureRule: { ...step.workflow.captureRule, selector: correction.selector, stateChange: false }
    };
  }
}

applyWorkflowCorrections({
  'effect-profile': {
    selector: '#master-toggle',
    action: { type: 'open-plugin-surface', prepare: 'open-fireworks-settings' },
    copy: {
      de: { title: 'Hauptschalter fuer Effekte pruefen', body: 'Oeffne die echten Fireworks-Einstellungen und pruefe nur den sichtbaren Hauptschalter. Schalte ihn nicht um, starte keinen Test und speichere keine Konfiguration.', expected: 'Der Hauptschalter der vorhandenen lokalen Einstellung ist sichtbar und unveraendert.', alt: 'Fireworks Hauptschalter fuer Effekte' },
      en: { title: 'Inspect the effects master switch', body: 'Open the real Fireworks settings and inspect only the visible master switch. Do not toggle it, start a test, or save configuration.', expected: 'The master switch of the existing local setting is visible and unchanged.', alt: 'Fireworks effects master switch' },
      es: { title: 'Revisa el interruptor maestro de efectos', body: 'Abre los ajustes reales de Fireworks y revisa solo el interruptor maestro visible. No lo cambies, no inicies una prueba ni guardes configuracion.', expected: 'El interruptor maestro de la configuracion local existente es visible y no cambia.', alt: 'Interruptor maestro de efectos de Fireworks' },
      fr: { title: 'Verifiez l interrupteur principal des effets', body: 'Ouvrez les vrais reglages Fireworks et verifiez seulement l interrupteur principal visible. Ne le basculez pas, ne lancez pas de test et nenregistrez pas de configuration.', expected: 'L interrupteur principal du reglage local existant est visible et inchange.', alt: 'Interrupteur principal des effets Fireworks' }
    }
  },
  'fireworks-overlay': {
    route: '/plugins/fireworks/ui/settings.html',
    selector: '#copy-overlay-url',
    action: { type: 'open-plugin-surface' },
    copy: {
      de: { title: 'Fireworks-Overlay-URL für OBS kopieren', body: 'Prüfe den sichtbaren Button „Copy Overlay URL“ in den Fireworks-Einstellungen und übernimm die URL nur in eine nicht sendende OBS-Testszene. Das Bild dokumentiert den echten OBS-Einstieg statt eines leeren Overlays.', expected: 'Der Overlay-URL-Button ist sichtbar und trennt die OBS-Einrichtung klar vom lokalen Testfeuerwerk.', alt: 'Fireworks Overlay-URL für OBS' },
      en: { title: 'Copy the Fireworks overlay URL for OBS', body: 'Review the visible “Copy Overlay URL” button in Fireworks Settings and use the URL only in a non-live OBS test scene. The image documents the real OBS entry point instead of an empty overlay.', expected: 'The overlay URL button is visible and clearly separates OBS setup from the local test firework.', alt: 'Fireworks overlay URL for OBS' },
      es: { title: 'Copia la URL del overlay Fireworks para OBS', body: 'Revisa el botón visible «Copy Overlay URL» en los ajustes de Fireworks y usa la URL solo en una escena de prueba de OBS que no está en directo. La imagen documenta el acceso real a OBS en lugar de un overlay vacío.', expected: 'El botón de URL del overlay está visible y separa claramente la configuración OBS del fuego artificial de prueba local.', alt: 'URL del overlay Fireworks para OBS' },
      fr: { title: 'Copiez l’URL de l’overlay Fireworks pour OBS', body: 'Examinez le bouton visible « Copy Overlay URL » dans les réglages Fireworks et utilisez l’URL uniquement dans une scène de test OBS hors diffusion. L’image documente le véritable point d’entrée OBS au lieu d’un overlay vide.', expected: 'Le bouton d’URL de l’overlay est visible et sépare clairement la configuration OBS du feu d’artifice de test local.', alt: 'URL de l’overlay Fireworks pour OBS' }
    }
  }
});

module.exports = Object.freeze(guide);
