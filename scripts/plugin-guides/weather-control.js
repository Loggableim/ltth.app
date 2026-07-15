'use strict';

const { applyOverlayEntryPoints } = require('../lib/guide-overlay-entry-points');

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze(applyOverlayEntryPoints({
  "id": "weather-control",
  "route": "/plugins/weather-control/ui.html",
  "topic": {
    "de": "Wettereffect, Intensität und Lebenszyklus",
    "en": "weather effect, intensity, and lifecycle",
    "es": "efecto meteorológico, intensidad y ciclo de vida",
    "fr": "effet météo, intensité et cycle de vie"
  },
  "test": {
    "de": "einen lokalen Wetterimpuls",
    "en": "a local weather pulse",
    "es": "un impulso meteorológico local",
    "fr": "une impulsion météo locale"
  },
  "expected": {
    "de": "der Effekt startet und endet in der Vorschau ohne LIVE-Szene",
    "en": "the effect starts and ends in preview without a LIVE scene",
    "es": "el efecto inicia y termina en la vista previa sin escena LIVE",
    "fr": "l’effet commence et finit dans l’aperçu sans scène LIVE"
  },
  "requirement": "obs",
  "safety": "obs",
  "mode": "ui",
  "overlay": "/plugins/weather-control/overlay.html",
  "related": [
    "webgpu-fireworks",
    "emoji-rain"
  ],
  "copy": {
    "de": {
      "title": "Weather Control",
      "summary": "Weather Control richtet Wettereffect, Intensität und Lebenszyklus ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "der Effekt startet und endet in der Vorschau ohne LIVE-Szene",
      "requirements": "LTTH Dashboard; für die Ausgabe zusätzlich eine OBS-Testszene. Dieser konkrete Weather Control-Ablauf behandelt Wettereffect, Intensität und Lebenszyklus.",
      "safety": "Nutze eine nicht gesendete OBS-Testszene; LIVE-Ausgaben bleiben deaktiviert. Dieser konkrete Weather Control-Ablauf behandelt Wettereffect, Intensität und Lebenszyklus.",
      "troubleshooting": "Wenn Wettereffect, Intensität und Lebenszyklus nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "webgpu-fireworks",
        "emoji-rain"
      ]
    },
    "en": {
      "title": "Weather Control",
      "summary": "Weather Control configures weather effect, intensity, and lifecycle with a safe local check instead of a LIVE trigger.",
      "firstResult": "the effect starts and ends in preview without a LIVE scene",
      "requirements": "LTTH Dashboard; use an OBS test scene for output. This Weather Control workflow specifically covers weather effect, intensity, and lifecycle.",
      "safety": "Use an OBS test scene that is not live; LIVE output remains disabled. This Weather Control workflow specifically covers weather effect, intensity, and lifecycle.",
      "troubleshooting": "If weather effect, intensity, and lifecycle is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "webgpu-fireworks",
        "emoji-rain"
      ]
    },
    "es": {
      "title": "Weather Control",
      "summary": "Weather Control configura efecto meteorológico, intensidad y ciclo de vida mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "el efecto inicia y termina en la vista previa sin escena LIVE",
      "requirements": "El panel de LTTH y una escena de prueba de OBS para la salida. Este flujo concreto de Weather Control trata efecto meteorológico, intensidad y ciclo de vida.",
      "safety": "Usa una escena de prueba de OBS que no esté al aire; la salida LIVE permanece desactivada. Este flujo concreto de Weather Control trata efecto meteorológico, intensidad y ciclo de vida.",
      "troubleshooting": "Si efecto meteorológico, intensidad y ciclo de vida no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "webgpu-fireworks",
        "emoji-rain"
      ]
    },
    "fr": {
      "title": "Weather Control",
      "summary": "Weather Control configure effet météo, intensité et cycle de vie avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "l’effet commence et finit dans l’aperçu sans scène LIVE",
      "requirements": "Le tableau de bord LTTH et une scène de test OBS pour la sortie. Ce flux spécifique de Weather Control couvre effet météo, intensité et cycle de vie.",
      "safety": "Utilisez une scène de test OBS non diffusée ; la sortie LIVE reste désactivée. Ce flux spécifique de Weather Control couvre effet météo, intensité et cycle de vie.",
      "troubleshooting": "Si effet météo, intensité et cycle de vie n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "webgpu-fireworks",
        "emoji-rain"
      ]
    }
  },
  "steps": [
    {
      "id": "weather-card",
      "copy": {
        "de": {
          "title": "Weather Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Weather Card von Wettereffect, Intensität und Lebenszyklus. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Weather Card im Testprofil konfigurieren - Wettereffect, Intensität und Lebenszyklus"
        },
        "en": {
          "title": "Configure Weather Card in the test profile",
          "body": "Work in the visible Weather Card area of weather effect, intensity, and lifecycle. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Weather Card in the test profile - weather effect, intensity, and lifecycle"
        },
        "es": {
          "title": "Configura Weather Card en el perfil de prueba",
          "body": "Trabaja en el area visible Weather Card de efecto meteorológico, intensidad y ciclo de vida. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Weather Card en el perfil de prueba - efecto meteorológico, intensidad y ciclo de vida"
        },
        "fr": {
          "title": "Configurez Weather Card dans le profil de test",
          "body": "Travaillez dans la zone visible Weather Card de effet météo, intensité et cycle de vie. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Weather Card dans le profil de test - effet météo, intensité et cycle de vie"
        }
      },
      "capture": {
        "route": "/plugins/weather-control/ui.html",
        "assertVisible": "#statusAlert",
        "focusText": {
          "de": "Weather Card im Testprofil konfigurieren",
          "en": "Configure Weather Card in the test profile",
          "es": "Configura Weather Card en el perfil de prueba",
          "fr": "Configurez Weather Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "weather-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/weather-control/ui.html",
        "instructions": {
          "de": {
            "title": "Weather Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Weather Card von Wettereffect, Intensität und Lebenszyklus. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Weather Card in the test profile",
            "body": "Work in the visible Weather Card area of weather effect, intensity, and lifecycle. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Weather Card en el perfil de prueba",
            "body": "Trabaja en el area visible Weather Card de efecto meteorológico, intensidad y ciclo de vida. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Weather Card dans le profil de test",
            "body": "Travaillez dans la zone visible Weather Card de effet météo, intensité et cycle de vie. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/weather-control/ui.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#statusAlert"
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
              "path": "/plugins/weather-control/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#statusAlert"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#statusAlert",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "weather-effect",
      "copy": {
        "de": {
          "title": "Weather Effect im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Weather Effect von Wettereffect, Intensität und Lebenszyklus. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Weather Effect im Testprofil konfigurieren - Wettereffect, Intensität und Lebenszyklus"
        },
        "en": {
          "title": "Configure Weather Effect in the test profile",
          "body": "Work in the visible Weather Effect area of weather effect, intensity, and lifecycle. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Weather Effect in the test profile - weather effect, intensity, and lifecycle"
        },
        "es": {
          "title": "Configura Weather Effect en el perfil de prueba",
          "body": "Trabaja en el area visible Weather Effect de efecto meteorológico, intensidad y ciclo de vida. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Weather Effect en el perfil de prueba - efecto meteorológico, intensidad y ciclo de vida"
        },
        "fr": {
          "title": "Configurez Weather Effect dans le profil de test",
          "body": "Travaillez dans la zone visible Weather Effect de effet météo, intensité et cycle de vie. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Weather Effect dans le profil de test - effet météo, intensité et cycle de vie"
        }
      },
      "capture": {
        "route": "/plugins/weather-control/ui.html",
        "assertVisible": "#qualityPreset",
        "focusText": {
          "de": "Weather Effect im Testprofil konfigurieren",
          "en": "Configure Weather Effect in the test profile",
          "es": "Configura Weather Effect en el perfil de prueba",
          "fr": "Configurez Weather Effect dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "weather-effect"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/weather-control/ui.html",
        "instructions": {
          "de": {
            "title": "Weather Effect im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Weather Effect von Wettereffect, Intensität und Lebenszyklus. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Weather Effect in the test profile",
            "body": "Work in the visible Weather Effect area of weather effect, intensity, and lifecycle. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Weather Effect en el perfil de prueba",
            "body": "Trabaja en el area visible Weather Effect de efecto meteorológico, intensidad y ciclo de vida. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Weather Effect dans le profil de test",
            "body": "Travaillez dans la zone visible Weather Effect de effet météo, intensité et cycle de vie. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/weather-control/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#qualityPreset"
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
              "path": "/plugins/weather-control/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#qualityPreset"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#qualityPreset",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "lifecycle-rule",
      "copy": {
        "de": {
          "title": "Lokale Regenvorschau starten und wieder beenden",
          "body": "Klicke auf den echten Button „Test Rain Effect“, um die lokale Vorschau zu starten. Beende sie danach mit „Stop All“; weder gespeicherte Wetterregeln noch eine LIVE-Szene werden geändert.",
          "expected": "Der reale Button „Test Rain Effect“ ist sichtbar und startet nur die lokale Regenvorschau.",
          "alt": "Lokale Regenvorschau starten und wieder beenden - Wettereffekt, Intensität und Lebenszyklus"
        },
        "en": {
          "title": "Start and stop the local rain preview",
          "body": "Click the real “Test Rain Effect” button to start the local preview. Then use “Stop All” to clean it up; no saved weather rule or LIVE scene is changed.",
          "expected": "The real “Test Rain Effect” button is visible and starts only the local rain preview.",
          "alt": "Start and stop the local rain preview - weather effect, intensity, and lifecycle"
        },
        "es": {
          "title": "Inicia y detén la vista previa local de lluvia",
          "body": "Haz clic en el botón real «Test Rain Effect» para iniciar la vista previa local. Después usa «Stop All» para limpiarla; no se cambia ninguna regla meteorológica guardada ni escena LIVE.",
          "expected": "El botón real «Test Rain Effect» es visible e inicia solo la vista previa local de lluvia.",
          "alt": "Inicia y detén la vista previa local de lluvia - efecto meteorológico, intensidad y ciclo de vida"
        },
        "fr": {
          "title": "Démarrez puis arrêtez l'aperçu local de pluie",
          "body": "Cliquez sur le vrai bouton « Test Rain Effect » pour démarrer l'aperçu local. Utilisez ensuite « Stop All » pour le nettoyer ; aucune règle météo enregistrée ni scène LIVE n'est modifiée.",
          "expected": "Le vrai bouton « Test Rain Effect » est visible et ne démarre que l'aperçu local de pluie.",
          "alt": "Démarrez puis arrêtez l'aperçu local de pluie - effet météo, intensité et cycle de vie"
        }
      },
      "capture": {
        "route": "/plugins/weather-control/ui.html",
        "assertVisible": "#testRainEffectBtn",
        "focusText": {
          "de": "Lokale Regenvorschau starten und wieder beenden",
          "en": "Start and stop the local rain preview",
          "es": "Inicia y detén la vista previa local de lluvia",
          "fr": "Démarrez puis arrêtez l'aperçu local de pluie"
        },
        "action": {
          "type": "run-local-preview",
          "allowClick": true,
          "clickSelector": "#testRainEffectBtn",
          "evidenceSelector": "#statusAlert",
          "settleMs": 750,
          "stepId": "lifecycle-rule"
        },
        "expected": {
          "de": "Der reale Button „Test Rain Effect“ ist sichtbar und startet nur die lokale Regenvorschau.",
          "en": "The real “Test Rain Effect” button is visible and starts only the local rain preview.",
          "es": "El botón real «Test Rain Effect» es visible e inicia solo la vista previa local de lluvia.",
          "fr": "Le vrai bouton « Test Rain Effect » est visible et ne démarre que l'aperçu local de pluie."
        }
      },
      "workflow": {
        "route": "/plugins/weather-control/ui.html",
        "instructions": {
          "de": {
            "title": "Lokale Regenvorschau starten und wieder beenden",
            "body": "Klicke auf den echten Button „Test Rain Effect“, um die lokale Vorschau zu starten. Beende sie danach mit „Stop All“; weder gespeicherte Wetterregeln noch eine LIVE-Szene werden geändert.",
            "expected": "Der reale Button „Test Rain Effect“ ist sichtbar und startet nur die lokale Regenvorschau."
          },
          "en": {
            "title": "Start and stop the local rain preview",
            "body": "Click the real “Test Rain Effect” button to start the local preview. Then use “Stop All” to clean it up; no saved weather rule or LIVE scene is changed.",
            "expected": "The real “Test Rain Effect” button is visible and starts only the local rain preview."
          },
          "es": {
            "title": "Inicia y detén la vista previa local de lluvia",
            "body": "Haz clic en el botón real «Test Rain Effect» para iniciar la vista previa local. Después usa «Stop All» para limpiarla; no se cambia ninguna regla meteorológica guardada ni escena LIVE.",
            "expected": "El botón real «Test Rain Effect» es visible e inicia solo la vista previa local de lluvia."
          },
          "fr": {
            "title": "Démarrez puis arrêtez l'aperçu local de pluie",
            "body": "Cliquez sur le vrai bouton « Test Rain Effect » pour démarrer l'aperçu local. Utilisez ensuite « Stop All » pour le nettoyer ; aucune règle météo enregistrée ni scène LIVE n'est modifiée.",
            "expected": "Le vrai bouton « Test Rain Effect » est visible et ne démarre que l'aperçu local de pluie."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/weather-control/ui.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#testRainEffectBtn"
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
              "path": "/plugins/weather-control/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#testRainEffectBtn"
          },
          {
            "type": "visible",
            "selector": "#statusAlert"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#testRainEffectBtn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "weather-pulse",
      "copy": {
        "de": {
          "title": "Weather Pulse lokal testen",
          "body": "Fuehre Weather Pulse nur mit einen lokalen Wetterimpuls im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "der Effekt startet und endet in der Vorschau ohne LIVE-Szene",
          "alt": "Weather Pulse lokal testen - Wettereffect, Intensität und Lebenszyklus"
        },
        "en": {
          "title": "Test Weather Pulse locally",
          "body": "Run Weather Pulse only with a local weather pulse in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the effect starts and ends in preview without a LIVE scene",
          "alt": "Test Weather Pulse locally - weather effect, intensity, and lifecycle"
        },
        "es": {
          "title": "Prueba Weather Pulse localmente",
          "body": "Ejecuta Weather Pulse solo con un impulso meteorológico local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "el efecto inicia y termina en la vista previa sin escena LIVE",
          "alt": "Prueba Weather Pulse localmente - efecto meteorológico, intensidad y ciclo de vida"
        },
        "fr": {
          "title": "Testez Weather Pulse localement",
          "body": "Executez Weather Pulse uniquement avec une impulsion météo locale dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "l’effet commence et finit dans l’aperçu sans scène LIVE",
          "alt": "Testez Weather Pulse localement - effet météo, intensité et cycle de vie"
        }
      },
      "capture": {
        "route": "/plugins/weather-control/ui.html",
        "assertVisible": "#preview-particles",
        "focusText": {
          "de": "Weather Pulse lokal testen",
          "en": "Test Weather Pulse locally",
          "es": "Prueba Weather Pulse localmente",
          "fr": "Testez Weather Pulse localement"
        },
        "action": {
          "type": "run-local-preview",
          "allowClick": true,
          "clickSelector": "#testRainEffectBtn",
          "settleMs": 750,
          "stepId": "weather-pulse"
        },
        "expected": {
          "de": "der Effekt startet und endet in der Vorschau ohne LIVE-Szene",
          "en": "the effect starts and ends in preview without a LIVE scene",
          "es": "el efecto inicia y termina en la vista previa sin escena LIVE",
          "fr": "l’effet commence et finit dans l’aperçu sans scène LIVE"
        }
      },
      "workflow": {
        "route": "/plugins/weather-control/ui.html",
        "instructions": {
          "de": {
            "title": "Weather Pulse lokal testen",
            "body": "Fuehre Weather Pulse nur mit einen lokalen Wetterimpuls im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "der Effekt startet und endet in der Vorschau ohne LIVE-Szene"
          },
          "en": {
            "title": "Test Weather Pulse locally",
            "body": "Run Weather Pulse only with a local weather pulse in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the effect starts and ends in preview without a LIVE scene"
          },
          "es": {
            "title": "Prueba Weather Pulse localmente",
            "body": "Ejecuta Weather Pulse solo con un impulso meteorológico local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "el efecto inicia y termina en la vista previa sin escena LIVE"
          },
          "fr": {
            "title": "Testez Weather Pulse localement",
            "body": "Executez Weather Pulse uniquement avec une impulsion météo locale dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "l’effet commence et finit dans l’aperçu sans scène LIVE"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/weather-control/ui.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#testRainEffectBtn"
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
              "path": "/plugins/weather-control/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#preview-particles"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#preview-particles",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "weather-overlay",
      "copy": {
        "de": {
          "title": "Weather Overlay als Overlay-Vorschau oeffnen",
          "body": "Oeffne die echte Weather Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
          "expected": "der Effekt startet und endet in der Vorschau ohne LIVE-Szene",
          "alt": "Weather Overlay als Overlay-Vorschau oeffnen - Wettereffect, Intensität und Lebenszyklus"
        },
        "en": {
          "title": "Open Weather Overlay as an overlay preview",
          "body": "Open the real Weather Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
          "expected": "the effect starts and ends in preview without a LIVE scene",
          "alt": "Open Weather Overlay as an overlay preview - weather effect, intensity, and lifecycle"
        },
        "es": {
          "title": "Abre Weather Overlay como vista previa de overlay",
          "body": "Abre la superficie real Weather Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
          "expected": "el efecto inicia y termina en la vista previa sin escena LIVE",
          "alt": "Abre Weather Overlay como vista previa de overlay - efecto meteorológico, intensidad y ciclo de vida"
        },
        "fr": {
          "title": "Ouvrez Weather Overlay comme apercu overlay",
          "body": "Ouvrez la vraie surface Weather Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
          "expected": "l’effet commence et finit dans l’aperçu sans scène LIVE",
          "alt": "Ouvrez Weather Overlay comme apercu overlay - effet météo, intensité et cycle de vie"
        }
      },
      "capture": {
        "route": "/plugins/weather-control/overlay.html",
        "assertVisible": "#weather-canvas",
        "focusText": {
          "de": "Weather Overlay als Overlay-Vorschau oeffnen",
          "en": "Open Weather Overlay as an overlay preview",
          "es": "Abre Weather Overlay como vista previa de overlay",
          "fr": "Ouvrez Weather Overlay comme apercu overlay"
        },
        "action": {
          "type": "open-overlay-preview",
          "stepId": "weather-overlay"
        },
        "expected": {
          "de": "der Effekt startet und endet in der Vorschau ohne LIVE-Szene",
          "en": "the effect starts and ends in preview without a LIVE scene",
          "es": "el efecto inicia y termina en la vista previa sin escena LIVE",
          "fr": "l’effet commence et finit dans l’aperçu sans scène LIVE"
        }
      },
      "workflow": {
        "route": "/plugins/weather-control/overlay.html",
        "instructions": {
          "de": {
            "title": "Weather Overlay als Overlay-Vorschau oeffnen",
            "body": "Oeffne die echte Weather Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
            "expected": "der Effekt startet und endet in der Vorschau ohne LIVE-Szene"
          },
          "en": {
            "title": "Open Weather Overlay as an overlay preview",
            "body": "Open the real Weather Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
            "expected": "the effect starts and ends in preview without a LIVE scene"
          },
          "es": {
            "title": "Abre Weather Overlay como vista previa de overlay",
            "body": "Abre la superficie real Weather Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
            "expected": "el efecto inicia y termina en la vista previa sin escena LIVE"
          },
          "fr": {
            "title": "Ouvrez Weather Overlay comme apercu overlay",
            "body": "Ouvrez la vraie surface Weather Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
            "expected": "l’effet commence et finit dans l’aperçu sans scène LIVE"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/weather-control/overlay.html"
          },
          {
            "type": "open-overlay-preview",
            "selector": "#weather-canvas"
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
              "path": "/plugins/weather-control/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#weather-canvas"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#weather-canvas",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "weather-reset",
      "copy": {
        "de": {
          "title": "Lokale Regenvorschau sauber beenden",
          "body": "Klicke nach dem Regen-Test auf den echten Button „Stop All“. Er beendet nur laufende Vorschau-Effekte und speichert oder löscht keine Wetterkonfiguration.",
          "expected": "Der reale Button „Stop All“ ist als Aufräumaktion für die lokale Vorschau sichtbar.",
          "alt": "Lokale Regenvorschau sauber beenden - Wettereffekt, Intensität und Lebenszyklus"
        },
        "en": {
          "title": "Cleanly stop the local rain preview",
          "body": "After the rain test, click the real “Stop All” button. It stops only running preview effects and neither saves nor deletes weather configuration.",
          "expected": "The real “Stop All” button is visible as the cleanup action for the local preview.",
          "alt": "Cleanly stop the local rain preview - weather effect, intensity, and lifecycle"
        },
        "es": {
          "title": "Detén limpiamente la vista previa local de lluvia",
          "body": "Después de probar la lluvia, haz clic en el botón real «Stop All». Solo detiene los efectos de vista previa en curso y no guarda ni elimina configuración meteorológica.",
          "expected": "El botón real «Stop All» es visible como acción de limpieza de la vista previa local.",
          "alt": "Detén limpiamente la vista previa local de lluvia - efecto meteorológico, intensidad y ciclo de vida"
        },
        "fr": {
          "title": "Arrêtez proprement l'aperçu local de pluie",
          "body": "Après le test de pluie, cliquez sur le vrai bouton « Stop All ». Il arrête uniquement les effets d'aperçu en cours et n'enregistre ni ne supprime aucune configuration météo.",
          "expected": "Le vrai bouton « Stop All » est visible comme action de nettoyage de l'aperçu local.",
          "alt": "Arrêtez proprement l'aperçu local de pluie - effet météo, intensité et cycle de vie"
        }
      },
      "capture": {
        "route": "/plugins/weather-control/ui.html",
        "assertVisible": "#stopAllPreviewBtn",
        "focusText": {
          "de": "Lokale Regenvorschau sauber beenden",
          "en": "Cleanly stop the local rain preview",
          "es": "Detén limpiamente la vista previa local de lluvia",
          "fr": "Arrêtez proprement l'aperçu local de pluie"
        },
        "action": {
          "type": "run-local-preview",
          "allowClick": true,
          "clickSelector": "#stopAllPreviewBtn",
          "evidenceSelector": "#statusAlert",
          "settleMs": 250,
          "stepId": "weather-reset"
        },
        "expected": {
          "de": "Der reale Button „Stop All“ ist als Aufräumaktion für die lokale Vorschau sichtbar.",
          "en": "The real “Stop All” button is visible as the cleanup action for the local preview.",
          "es": "El botón real «Stop All» es visible como acción de limpieza de la vista previa local.",
          "fr": "Le vrai bouton « Stop All » est visible comme action de nettoyage de l'aperçu local."
        }
      },
      "workflow": {
        "route": "/plugins/weather-control/ui.html",
        "instructions": {
          "de": {
            "title": "Lokale Regenvorschau sauber beenden",
            "body": "Klicke nach dem Regen-Test auf den echten Button „Stop All“. Er beendet nur laufende Vorschau-Effekte und speichert oder löscht keine Wetterkonfiguration.",
            "expected": "Der reale Button „Stop All“ ist als Aufräumaktion für die lokale Vorschau sichtbar."
          },
          "en": {
            "title": "Cleanly stop the local rain preview",
            "body": "After the rain test, click the real “Stop All” button. It stops only running preview effects and neither saves nor deletes weather configuration.",
            "expected": "The real “Stop All” button is visible as the cleanup action for the local preview."
          },
          "es": {
            "title": "Detén limpiamente la vista previa local de lluvia",
            "body": "Después de probar la lluvia, haz clic en el botón real «Stop All». Solo detiene los efectos de vista previa en curso y no guarda ni elimina configuración meteorológica.",
            "expected": "El botón real «Stop All» es visible como acción de limpieza de la vista previa local."
          },
          "fr": {
            "title": "Arrêtez proprement l'aperçu local de pluie",
            "body": "Après le test de pluie, cliquez sur le vrai bouton « Stop All ». Il arrête uniquement les effets d'aperçu en cours et n'enregistre ni ne supprime aucune configuration météo.",
            "expected": "Le vrai bouton « Stop All » est visible comme action de nettoyage de l'aperçu local."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/weather-control/ui.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#stopAllPreviewBtn"
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
              "path": "/plugins/weather-control/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#stopAllPreviewBtn"
          },
          {
            "type": "visible",
            "selector": "#statusAlert"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#stopAllPreviewBtn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    }
  ]
}, {
  'weather-overlay': {
    route: '/plugins/weather-control/ui.html',
    selector: '#overlayUrl',
    copy: {
      de: { title: 'Weather-Control-Overlay-URL für OBS übernehmen', body: 'Prüfe die sichtbare Overlay-URL in Weather Control, bevor du sie in einer nicht sendenden OBS-Testszene als Browser-Quelle einrichtest. Das Bild zeigt die echte URL und den Kopier-Einstieg statt einer leeren Wetterfläche.', expected: 'Die sichtbare Overlay-URL kann gezielt für die OBS-Testquelle übernommen werden.' },
      en: { title: 'Use the Weather Control overlay URL for OBS', body: 'Review the visible overlay URL in Weather Control before using it as a browser source in a non-live OBS test scene. The image shows the real URL and copy entry point instead of an empty weather surface.', expected: 'The visible overlay URL can be deliberately used for the OBS test source.' },
      es: { title: 'Usa la URL del overlay Weather Control para OBS', body: 'Revisa la URL visible del overlay en Weather Control antes de usarla como fuente de navegador en una escena de prueba de OBS que no está en directo. La imagen muestra la URL real y el acceso para copiarla en lugar de una superficie meteorológica vacía.', expected: 'La URL visible del overlay puede usarse de forma intencionada para la fuente de prueba OBS.' },
      fr: { title: 'Utilisez l’URL de l’overlay Weather Control pour OBS', body: 'Vérifiez l’URL visible de l’overlay dans Weather Control avant de l’utiliser comme source navigateur dans une scène de test OBS hors diffusion. L’image montre l’URL réelle et le point d’entrée de copie au lieu d’une surface météo vide.', expected: 'L’URL visible de l’overlay peut être utilisée volontairement pour la source de test OBS.' }
    }
  }
}));
