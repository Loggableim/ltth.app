'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
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
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/weather-control/ui.html"
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
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/weather-control/ui.html"
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
          "title": "Lifecycle Rule im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Lifecycle Rule von Wettereffect, Intensität und Lebenszyklus. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Lifecycle Rule im Testprofil konfigurieren - Wettereffect, Intensität und Lebenszyklus"
        },
        "en": {
          "title": "Configure Lifecycle Rule in the test profile",
          "body": "Work in the visible Lifecycle Rule area of weather effect, intensity, and lifecycle. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Lifecycle Rule in the test profile - weather effect, intensity, and lifecycle"
        },
        "es": {
          "title": "Configura Lifecycle Rule en el perfil de prueba",
          "body": "Trabaja en el area visible Lifecycle Rule de efecto meteorológico, intensidad y ciclo de vida. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Lifecycle Rule en el perfil de prueba - efecto meteorológico, intensidad y ciclo de vida"
        },
        "fr": {
          "title": "Configurez Lifecycle Rule dans le profil de test",
          "body": "Travaillez dans la zone visible Lifecycle Rule de effet météo, intensité et cycle de vie. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Lifecycle Rule dans le profil de test - effet météo, intensité et cycle de vie"
        }
      },
      "capture": {
        "route": "/plugins/weather-control/ui.html",
        "assertVisible": "#testRainEffectBtn",
        "focusText": {
          "de": "Lifecycle Rule im Testprofil konfigurieren",
          "en": "Configure Lifecycle Rule in the test profile",
          "es": "Configura Lifecycle Rule en el perfil de prueba",
          "fr": "Configurez Lifecycle Rule dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "lifecycle-rule"
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
            "title": "Lifecycle Rule im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Lifecycle Rule von Wettereffect, Intensität und Lebenszyklus. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Lifecycle Rule in the test profile",
            "body": "Work in the visible Lifecycle Rule area of weather effect, intensity, and lifecycle. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Lifecycle Rule en el perfil de prueba",
            "body": "Trabaja en el area visible Lifecycle Rule de efecto meteorológico, intensidad y ciclo de vida. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Lifecycle Rule dans le profil de test",
            "body": "Travaillez dans la zone visible Lifecycle Rule de effet météo, intensité et cycle de vie. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
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
            "selector": "#testRainEffectBtn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/weather-control/ui.html"
          },
          {
            "type": "visible",
            "selector": "#testRainEffectBtn"
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
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/weather-control/ui.html"
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
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/weather-control/overlay.html"
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
          "title": "Weather Reset sicher zuruecksetzen",
          "body": "Entferne nur die Demo-Werte fuer Weather Reset, bevor du Wettereffect, Intensität und Lebenszyklus produktiv vorbereitest.",
          "expected": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "alt": "Weather Reset sicher zuruecksetzen - Wettereffect, Intensität und Lebenszyklus"
        },
        "en": {
          "title": "Reset Weather Reset safely",
          "body": "Remove only the demo values for Weather Reset before preparing weather effect, intensity, and lifecycle for production.",
          "expected": "The test profile remains free of production impact.",
          "alt": "Reset Weather Reset safely - weather effect, intensity, and lifecycle"
        },
        "es": {
          "title": "Restablece Weather Reset con seguridad",
          "body": "Elimina solo los valores demo de Weather Reset antes de preparar efecto meteorológico, intensidad y ciclo de vida para produccion.",
          "expected": "El perfil de prueba permanece sin impacto de producción.",
          "alt": "Restablece Weather Reset con seguridad - efecto meteorológico, intensidad y ciclo de vida"
        },
        "fr": {
          "title": "Reinitialisez Weather Reset en securite",
          "body": "Supprimez uniquement les valeurs demo de Weather Reset avant de preparer effet météo, intensité et cycle de vie pour la production.",
          "expected": "Le profil de test reste sans impact de production.",
          "alt": "Reinitialisez Weather Reset en securite - effet météo, intensité et cycle de vie"
        }
      },
      "capture": {
        "route": "/plugins/weather-control/ui.html",
        "assertVisible": "#stopAllPreviewBtn",
        "focusText": {
          "de": "Weather Reset sicher zuruecksetzen",
          "en": "Reset Weather Reset safely",
          "es": "Restablece Weather Reset con seguridad",
          "fr": "Reinitialisez Weather Reset en securite"
        },
        "action": {
          "type": "reset-demo-state",
          "stepId": "weather-reset"
        },
        "expected": {
          "de": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "en": "The test profile remains free of production impact.",
          "es": "El perfil de prueba permanece sin impacto de producción.",
          "fr": "Le profil de test reste sans impact de production."
        }
      },
      "workflow": {
        "route": "/plugins/weather-control/ui.html",
        "instructions": {
          "de": {
            "title": "Weather Reset sicher zuruecksetzen",
            "body": "Entferne nur die Demo-Werte fuer Weather Reset, bevor du Wettereffect, Intensität und Lebenszyklus produktiv vorbereitest.",
            "expected": "Das Testprofil bleibt ohne produktive Auswirkung."
          },
          "en": {
            "title": "Reset Weather Reset safely",
            "body": "Remove only the demo values for Weather Reset before preparing weather effect, intensity, and lifecycle for production.",
            "expected": "The test profile remains free of production impact."
          },
          "es": {
            "title": "Restablece Weather Reset con seguridad",
            "body": "Elimina solo los valores demo de Weather Reset antes de preparar efecto meteorológico, intensidad y ciclo de vida para produccion.",
            "expected": "El perfil de prueba permanece sin impacto de producción."
          },
          "fr": {
            "title": "Reinitialisez Weather Reset en securite",
            "body": "Supprimez uniquement les valeurs demo de Weather Reset avant de preparer effet météo, intensité et cycle de vie pour la production.",
            "expected": "Le profil de test reste sans impact de production."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/weather-control/ui.html"
          },
          {
            "type": "reset-demo-state",
            "selector": "#stopAllPreviewBtn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/weather-control/ui.html"
          },
          {
            "type": "visible",
            "selector": "#stopAllPreviewBtn"
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
});
