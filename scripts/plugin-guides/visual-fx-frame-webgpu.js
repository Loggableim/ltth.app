'use strict';

const { applyOverlayEntryPoints } = require('../lib/guide-overlay-entry-points');

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze(applyOverlayEntryPoints({
  "id": "visual-fx-frame-webgpu",
  "route": "/visual-fx-frame-webgpu/ui",
  "topic": {
    "de": "WebGPU-Rahmen, Premium-Stile und Qualitätsprofil",
    "en": "WebGPU frame, premium styles, and quality profile",
    "es": "marco WebGPU, estilos premium y perfil de calidad",
    "fr": "cadre WebGPU, styles premium et profil de qualité"
  },
  "test": {
    "de": "eine lokale WebGPU-Vorschau",
    "en": "a local WebGPU preview",
    "es": "una vista previa WebGPU local",
    "fr": "un aperçu WebGPU local"
  },
  "expected": {
    "de": "der Rahmen wird gerendert und die Qualitätsanzeige bleibt im Testprofil",
    "en": "the frame is rendered and the quality indicator stays in the test profile",
    "es": "el marco se renderiza y el indicador de calidad permanece en el perfil de prueba",
    "fr": "le cadre est rendu et l’indicateur de qualité reste dans le profil de test"
  },
  "requirement": "obs",
  "safety": "obs",
  "mode": "ui",
  "overlay": "/visual-fx-frame-webgpu/overlay",
  "overlayWorkflowStepIds": ["frame-obs-source"],
  "related": [
    "webgpu-fireworks",
    "flame-overlay"
  ],
  "copy": {
    "de": {
      "title": "Visual FX Frame WEBGPU",
      "summary": "Visual FX Frame WEBGPU richtet WebGPU-Rahmen, Premium-Stile und Qualitätsprofil ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "der Rahmen wird gerendert und die Qualitätsanzeige bleibt im Testprofil",
      "requirements": "LTTH Dashboard; für die Ausgabe zusätzlich eine OBS-Testszene. Dieser konkrete Visual FX Frame WEBGPU-Ablauf behandelt WebGPU-Rahmen, Premium-Stile und Qualitätsprofil.",
      "safety": "Nutze eine nicht gesendete OBS-Testszene; LIVE-Ausgaben bleiben deaktiviert. Dieser konkrete Visual FX Frame WEBGPU-Ablauf behandelt WebGPU-Rahmen, Premium-Stile und Qualitätsprofil.",
      "troubleshooting": "Wenn WebGPU-Rahmen, Premium-Stile und Qualitätsprofil nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "webgpu-fireworks",
        "flame-overlay"
      ]
    },
    "en": {
      "title": "Visual FX Frame WEBGPU",
      "summary": "Visual FX Frame WEBGPU configures WebGPU frame, premium styles, and quality profile with a safe local check instead of a LIVE trigger.",
      "firstResult": "the frame is rendered and the quality indicator stays in the test profile",
      "requirements": "LTTH Dashboard; use an OBS test scene for output. This Visual FX Frame WEBGPU workflow specifically covers WebGPU frame, premium styles, and quality profile.",
      "safety": "Use an OBS test scene that is not live; LIVE output remains disabled. This Visual FX Frame WEBGPU workflow specifically covers WebGPU frame, premium styles, and quality profile.",
      "troubleshooting": "If WebGPU frame, premium styles, and quality profile is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "webgpu-fireworks",
        "flame-overlay"
      ]
    },
    "es": {
      "title": "Visual FX Frame WEBGPU",
      "summary": "Visual FX Frame WEBGPU configura marco WebGPU, estilos premium y perfil de calidad mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "el marco se renderiza y el indicador de calidad permanece en el perfil de prueba",
      "requirements": "El panel de LTTH y una escena de prueba de OBS para la salida. Este flujo concreto de Visual FX Frame WEBGPU trata marco WebGPU, estilos premium y perfil de calidad.",
      "safety": "Usa una escena de prueba de OBS que no esté al aire; la salida LIVE permanece desactivada. Este flujo concreto de Visual FX Frame WEBGPU trata marco WebGPU, estilos premium y perfil de calidad.",
      "troubleshooting": "Si marco WebGPU, estilos premium y perfil de calidad no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "webgpu-fireworks",
        "flame-overlay"
      ]
    },
    "fr": {
      "title": "Visual FX Frame WEBGPU",
      "summary": "Visual FX Frame WEBGPU configure cadre WebGPU, styles premium et profil de qualité avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "le cadre est rendu et l’indicateur de qualité reste dans le profil de test",
      "requirements": "Le tableau de bord LTTH et une scène de test OBS pour la sortie. Ce flux spécifique de Visual FX Frame WEBGPU couvre cadre WebGPU, styles premium et profil de qualité.",
      "safety": "Utilisez une scène de test OBS non diffusée ; la sortie LIVE reste désactivée. Ce flux spécifique de Visual FX Frame WEBGPU couvre cadre WebGPU, styles premium et profil de qualité.",
      "troubleshooting": "Si cadre WebGPU, styles premium et profil de qualité n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "webgpu-fireworks",
        "flame-overlay"
      ]
    }
  },
  "steps": [
    {
      "id": "webgpu-frame-card",
      "copy": {
        "de": {
          "title": "Webgpu Frame Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Webgpu Frame Card von WebGPU-Rahmen, Premium-Stile und Qualitätsprofil. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Webgpu Frame Card im Testprofil konfigurieren - WebGPU-Rahmen, Premium-Stile und Qualitätsprofil"
        },
        "en": {
          "title": "Configure Webgpu Frame Card in the test profile",
          "body": "Work in the visible Webgpu Frame Card area of WebGPU frame, premium styles, and quality profile. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Webgpu Frame Card in the test profile - WebGPU frame, premium styles, and quality profile"
        },
        "es": {
          "title": "Configura Webgpu Frame Card en el perfil de prueba",
          "body": "Trabaja en el area visible Webgpu Frame Card de marco WebGPU, estilos premium y perfil de calidad. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Webgpu Frame Card en el perfil de prueba - marco WebGPU, estilos premium y perfil de calidad"
        },
        "fr": {
          "title": "Configurez Webgpu Frame Card dans le profil de test",
          "body": "Travaillez dans la zone visible Webgpu Frame Card de cadre WebGPU, styles premium et profil de qualité. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Webgpu Frame Card dans le profil de test - cadre WebGPU, styles premium et profil de qualité"
        }
      },
      "capture": {
        "route": "/visual-fx-frame-webgpu/ui",
        "assertVisible": "#webgpuRuntimeState",
        "focusText": {
          "de": "Webgpu Frame Card im Testprofil konfigurieren",
          "en": "Configure Webgpu Frame Card in the test profile",
          "es": "Configura Webgpu Frame Card en el perfil de prueba",
          "fr": "Configurez Webgpu Frame Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "webgpu-frame-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/visual-fx-frame-webgpu/ui",
        "instructions": {
          "de": {
            "title": "Webgpu Frame Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Webgpu Frame Card von WebGPU-Rahmen, Premium-Stile und Qualitätsprofil. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Webgpu Frame Card in the test profile",
            "body": "Work in the visible Webgpu Frame Card area of WebGPU frame, premium styles, and quality profile. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Webgpu Frame Card en el perfil de prueba",
            "body": "Trabaja en el area visible Webgpu Frame Card de marco WebGPU, estilos premium y perfil de calidad. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Webgpu Frame Card dans le profil de test",
            "body": "Travaillez dans la zone visible Webgpu Frame Card de cadre WebGPU, styles premium et profil de qualité. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/visual-fx-frame-webgpu/ui"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#webgpuRuntimeState"
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
              "path": "/visual-fx-frame-webgpu/ui",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#webgpuRuntimeState"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#webgpuRuntimeState",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "texture-select",
      "copy": {
        "de": {
          "title": "Texture Select im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Texture Select von WebGPU-Rahmen, Premium-Stile und Qualitätsprofil. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Texture Select im Testprofil konfigurieren - WebGPU-Rahmen, Premium-Stile und Qualitätsprofil"
        },
        "en": {
          "title": "Configure Texture Select in the test profile",
          "body": "Work in the visible Texture Select area of WebGPU frame, premium styles, and quality profile. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Texture Select in the test profile - WebGPU frame, premium styles, and quality profile"
        },
        "es": {
          "title": "Configura Texture Select en el perfil de prueba",
          "body": "Trabaja en el area visible Texture Select de marco WebGPU, estilos premium y perfil de calidad. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Texture Select en el perfil de prueba - marco WebGPU, estilos premium y perfil de calidad"
        },
        "fr": {
          "title": "Configurez Texture Select dans le profil de test",
          "body": "Travaillez dans la zone visible Texture Select de cadre WebGPU, styles premium et profil de qualité. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Texture Select dans le profil de test - cadre WebGPU, styles premium et profil de qualité"
        }
      },
      "capture": {
        "route": "/visual-fx-frame-webgpu/ui",
        "assertVisible": "#visualStyle",
        "focusText": {
          "de": "Texture Select im Testprofil konfigurieren",
          "en": "Configure Texture Select in the test profile",
          "es": "Configura Texture Select en el perfil de prueba",
          "fr": "Configurez Texture Select dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "texture-select"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/visual-fx-frame-webgpu/ui",
        "instructions": {
          "de": {
            "title": "Texture Select im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Texture Select von WebGPU-Rahmen, Premium-Stile und Qualitätsprofil. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Texture Select in the test profile",
            "body": "Work in the visible Texture Select area of WebGPU frame, premium styles, and quality profile. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Texture Select en el perfil de prueba",
            "body": "Trabaja en el area visible Texture Select de marco WebGPU, estilos premium y perfil de calidad. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Texture Select dans le profil de test",
            "body": "Travaillez dans la zone visible Texture Select de cadre WebGPU, styles premium et profil de qualité. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/visual-fx-frame-webgpu/ui"
          },
          {
            "type": "set-demo-value",
            "selector": "#visualStyle"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": [200,304]
          },
          {
            "type": "url",
            "expected": {
              "path": "/visual-fx-frame-webgpu/ui",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#visualStyle"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#visualStyle",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "quality-profile",
      "copy": {
        "de": {
          "title": "Quality Profile im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Quality Profile von WebGPU-Rahmen, Premium-Stile und Qualitätsprofil. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Quality Profile im Testprofil konfigurieren - WebGPU-Rahmen, Premium-Stile und Qualitätsprofil"
        },
        "en": {
          "title": "Configure Quality Profile in the test profile",
          "body": "Work in the visible Quality Profile area of WebGPU frame, premium styles, and quality profile. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Quality Profile in the test profile - WebGPU frame, premium styles, and quality profile"
        },
        "es": {
          "title": "Configura Quality Profile en el perfil de prueba",
          "body": "Trabaja en el area visible Quality Profile de marco WebGPU, estilos premium y perfil de calidad. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Quality Profile en el perfil de prueba - marco WebGPU, estilos premium y perfil de calidad"
        },
        "fr": {
          "title": "Configurez Quality Profile dans le profil de test",
          "body": "Travaillez dans la zone visible Quality Profile de cadre WebGPU, styles premium et profil de qualité. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Quality Profile dans le profil de test - cadre WebGPU, styles premium et profil de qualité"
        }
      },
      "capture": {
        "route": "/visual-fx-frame-webgpu/ui",
        "assertVisible": "#qualityMode",
        "focusText": {
          "de": "Quality Profile im Testprofil konfigurieren",
          "en": "Configure Quality Profile in the test profile",
          "es": "Configura Quality Profile en el perfil de prueba",
          "fr": "Configurez Quality Profile dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "quality-profile"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/visual-fx-frame-webgpu/ui",
        "instructions": {
          "de": {
            "title": "Quality Profile im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Quality Profile von WebGPU-Rahmen, Premium-Stile und Qualitätsprofil. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Quality Profile in the test profile",
            "body": "Work in the visible Quality Profile area of WebGPU frame, premium styles, and quality profile. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Quality Profile en el perfil de prueba",
            "body": "Trabaja en el area visible Quality Profile de marco WebGPU, estilos premium y perfil de calidad. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Quality Profile dans le profil de test",
            "body": "Travaillez dans la zone visible Quality Profile de cadre WebGPU, styles premium et profil de qualité. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/visual-fx-frame-webgpu/ui"
          },
          {
            "type": "set-demo-value",
            "selector": "#qualityMode"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": [200,304]
          },
          {
            "type": "url",
            "expected": {
              "path": "/visual-fx-frame-webgpu/ui",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#qualityMode"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#qualityMode",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "gpu-frame-preview",
      "copy": {
        "de": {
          "title": "GPU Frame Preview lokal testen",
          "body": "Fuehre GPU Frame Preview nur mit eine lokale WebGPU-Vorschau im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "der Rahmen wird gerendert und die Qualitätsanzeige bleibt im Testprofil",
          "alt": "GPU Frame Preview lokal testen - WebGPU-Rahmen, Premium-Stile und Qualitätsprofil"
        },
        "en": {
          "title": "Test GPU Frame Preview locally",
          "body": "Run GPU Frame Preview only with a local WebGPU preview in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the frame is rendered and the quality indicator stays in the test profile",
          "alt": "Test GPU Frame Preview locally - WebGPU frame, premium styles, and quality profile"
        },
        "es": {
          "title": "Prueba GPU Frame Preview localmente",
          "body": "Ejecuta GPU Frame Preview solo con una vista previa WebGPU local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "el marco se renderiza y el indicador de calidad permanece en el perfil de prueba",
          "alt": "Prueba GPU Frame Preview localmente - marco WebGPU, estilos premium y perfil de calidad"
        },
        "fr": {
          "title": "Testez GPU Frame Preview localement",
          "body": "Executez GPU Frame Preview uniquement avec un aperçu WebGPU local dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "le cadre est rendu et l’indicateur de qualité reste dans le profil de test",
          "alt": "Testez GPU Frame Preview localement - cadre WebGPU, styles premium et profil de qualité"
        }
      },
      "capture": {
        "route": "/visual-fx-frame-webgpu/ui",
        "assertVisible": "#previewToggle",
        "focusText": {
          "de": "GPU Frame Preview lokal testen",
          "en": "Test GPU Frame Preview locally",
          "es": "Prueba GPU Frame Preview localmente",
          "fr": "Testez GPU Frame Preview localement"
        },
        "action": {
          "type": "run-local-preview",
          "stepId": "gpu-frame-preview"
        },
        "expected": {
          "de": "der Rahmen wird gerendert und die Qualitätsanzeige bleibt im Testprofil",
          "en": "the frame is rendered and the quality indicator stays in the test profile",
          "es": "el marco se renderiza y el indicador de calidad permanece en el perfil de prueba",
          "fr": "le cadre est rendu et l’indicateur de qualité reste dans le profil de test"
        }
      },
      "workflow": {
        "route": "/visual-fx-frame-webgpu/ui",
        "instructions": {
          "de": {
            "title": "GPU Frame Preview lokal testen",
            "body": "Fuehre GPU Frame Preview nur mit eine lokale WebGPU-Vorschau im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "der Rahmen wird gerendert und die Qualitätsanzeige bleibt im Testprofil"
          },
          "en": {
            "title": "Test GPU Frame Preview locally",
            "body": "Run GPU Frame Preview only with a local WebGPU preview in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the frame is rendered and the quality indicator stays in the test profile"
          },
          "es": {
            "title": "Prueba GPU Frame Preview localmente",
            "body": "Ejecuta GPU Frame Preview solo con una vista previa WebGPU local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "el marco se renderiza y el indicador de calidad permanece en el perfil de prueba"
          },
          "fr": {
            "title": "Testez GPU Frame Preview localement",
            "body": "Executez GPU Frame Preview uniquement avec un aperçu WebGPU local dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "le cadre est rendu et l’indicateur de qualité reste dans le profil de test"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/visual-fx-frame-webgpu/ui"
          },
          {
            "type": "run-local-preview",
            "selector": "#previewToggle"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": [200,304]
          },
          {
            "type": "url",
            "expected": {
              "path": "/visual-fx-frame-webgpu/ui",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#previewToggle"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#previewToggle",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "frame-obs-source",
      "copy": {
        "de": {
          "title": "Frame OBS Source als Overlay-Vorschau oeffnen",
          "body": "Oeffne die echte Frame OBS Source-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt. Für Visual FX Frame WEBGPU prüft dieser Schritt ausdrücklich „Frame OBS Source als Overlay-Vorschau oeffnen“.",
          "expected": "der Rahmen wird gerendert und die Qualitätsanzeige bleibt im Testprofil",
          "alt": "Frame OBS Source als Overlay-Vorschau oeffnen - WebGPU-Rahmen, Premium-Stile und Qualitätsprofil"
        },
        "en": {
          "title": "Open Frame OBS Source as an overlay preview",
          "body": "Open the real Frame OBS Source surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted. For Visual FX Frame WEBGPU, this step explicitly verifies “Open Frame OBS Source as an overlay preview”.",
          "expected": "the frame is rendered and the quality indicator stays in the test profile",
          "alt": "Open Frame OBS Source as an overlay preview - WebGPU frame, premium styles, and quality profile"
        },
        "es": {
          "title": "Abre Frame OBS Source como vista previa de overlay",
          "body": "Abre la superficie real Frame OBS Source solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo. Para Visual FX Frame WEBGPU, este paso comprueba expresamente «Abre Frame OBS Source como vista previa de overlay».",
          "expected": "el marco se renderiza y el indicador de calidad permanece en el perfil de prueba",
          "alt": "Abre Frame OBS Source como vista previa de overlay - marco WebGPU, estilos premium y perfil de calidad"
        },
        "fr": {
          "title": "Ouvrez Frame OBS Source comme apercu overlay",
          "body": "Ouvrez la vraie surface Frame OBS Source uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere. Pour Visual FX Frame WEBGPU, cette étape vérifie explicitement « Ouvrez Frame OBS Source comme apercu overlay ».",
          "expected": "le cadre est rendu et l’indicateur de qualité reste dans le profil de test",
          "alt": "Ouvrez Frame OBS Source comme apercu overlay - cadre WebGPU, styles premium et profil de qualité"
        }
      },
      "capture": {
        "route": "/visual-fx-frame-webgpu/overlay",
        "assertVisible": "#visualFxCanvas",
        "focusText": {
          "de": "Frame OBS Source als Overlay-Vorschau oeffnen",
          "en": "Open Frame OBS Source as an overlay preview",
          "es": "Abre Frame OBS Source como vista previa de overlay",
          "fr": "Ouvrez Frame OBS Source comme apercu overlay"
        },
        "action": {
          "type": "open-overlay-preview",
          "stepId": "frame-obs-source"
        },
        "expected": {
          "de": "der Rahmen wird gerendert und die Qualitätsanzeige bleibt im Testprofil",
          "en": "the frame is rendered and the quality indicator stays in the test profile",
          "es": "el marco se renderiza y el indicador de calidad permanece en el perfil de prueba",
          "fr": "le cadre est rendu et l’indicateur de qualité reste dans le profil de test"
        }
      },
      "workflow": {
        "route": "/visual-fx-frame-webgpu/overlay",
        "instructions": {
          "de": {
            "title": "Frame OBS Source als Overlay-Vorschau oeffnen",
            "body": "Oeffne die echte Frame OBS Source-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt. Für Visual FX Frame WEBGPU prüft dieser Schritt ausdrücklich „Frame OBS Source als Overlay-Vorschau oeffnen“.",
            "expected": "der Rahmen wird gerendert und die Qualitätsanzeige bleibt im Testprofil"
          },
          "en": {
            "title": "Open Frame OBS Source as an overlay preview",
            "body": "Open the real Frame OBS Source surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted. For Visual FX Frame WEBGPU, this step explicitly verifies “Open Frame OBS Source as an overlay preview”.",
            "expected": "the frame is rendered and the quality indicator stays in the test profile"
          },
          "es": {
            "title": "Abre Frame OBS Source como vista previa de overlay",
            "body": "Abre la superficie real Frame OBS Source solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo. Para Visual FX Frame WEBGPU, este paso comprueba expresamente «Abre Frame OBS Source como vista previa de overlay».",
            "expected": "el marco se renderiza y el indicador de calidad permanece en el perfil de prueba"
          },
          "fr": {
            "title": "Ouvrez Frame OBS Source comme apercu overlay",
            "body": "Ouvrez la vraie surface Frame OBS Source uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere. Pour Visual FX Frame WEBGPU, cette étape vérifie explicitement « Ouvrez Frame OBS Source comme apercu overlay ».",
            "expected": "le cadre est rendu et l’indicateur de qualité reste dans le profil de test"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/visual-fx-frame-webgpu/overlay"
          },
          {
            "type": "open-overlay-preview",
            "selector": "#visualFxCanvas"
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
              "path": "/visual-fx-frame-webgpu/ui",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#visualFxCanvas"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#visualFxCanvas",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "frame-reset",
      "copy": {
        "de": {
          "title": "Frame Reset sicher zuruecksetzen",
          "body": "Entferne nur die Demo-Werte fuer Frame Reset, bevor du WebGPU-Rahmen, Premium-Stile und Qualitätsprofil produktiv vorbereitest.",
          "expected": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "alt": "Frame Reset sicher zuruecksetzen - WebGPU-Rahmen, Premium-Stile und Qualitätsprofil"
        },
        "en": {
          "title": "Reset Frame Reset safely",
          "body": "Remove only the demo values for Frame Reset before preparing WebGPU frame, premium styles, and quality profile for production.",
          "expected": "The test profile remains free of production impact.",
          "alt": "Reset Frame Reset safely - WebGPU frame, premium styles, and quality profile"
        },
        "es": {
          "title": "Restablece Frame Reset con seguridad",
          "body": "Elimina solo los valores demo de Frame Reset antes de preparar marco WebGPU, estilos premium y perfil de calidad para produccion.",
          "expected": "El perfil de prueba permanece sin impacto de producción.",
          "alt": "Restablece Frame Reset con seguridad - marco WebGPU, estilos premium y perfil de calidad"
        },
        "fr": {
          "title": "Reinitialisez Frame Reset en securite",
          "body": "Supprimez uniquement les valeurs demo de Frame Reset avant de preparer cadre WebGPU, styles premium et profil de qualité pour la production.",
          "expected": "Le profil de test reste sans impact de production.",
          "alt": "Reinitialisez Frame Reset en securite - cadre WebGPU, styles premium et profil de qualité"
        }
      },
      "capture": {
        "route": "/visual-fx-frame-webgpu/ui",
        "assertVisible": "#savePresetBtn",
        "focusText": {
          "de": "Frame Reset sicher zuruecksetzen",
          "en": "Reset Frame Reset safely",
          "es": "Restablece Frame Reset con seguridad",
          "fr": "Reinitialisez Frame Reset en securite"
        },
        "action": {
          "type": "reset-demo-state",
          "stepId": "frame-reset"
        },
        "expected": {
          "de": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "en": "The test profile remains free of production impact.",
          "es": "El perfil de prueba permanece sin impacto de producción.",
          "fr": "Le profil de test reste sans impact de production."
        }
      },
      "workflow": {
        "route": "/visual-fx-frame-webgpu/ui",
        "instructions": {
          "de": {
            "title": "Frame Reset sicher zuruecksetzen",
            "body": "Entferne nur die Demo-Werte fuer Frame Reset, bevor du WebGPU-Rahmen, Premium-Stile und Qualitätsprofil produktiv vorbereitest.",
            "expected": "Das Testprofil bleibt ohne produktive Auswirkung."
          },
          "en": {
            "title": "Reset Frame Reset safely",
            "body": "Remove only the demo values for Frame Reset before preparing WebGPU frame, premium styles, and quality profile for production.",
            "expected": "The test profile remains free of production impact."
          },
          "es": {
            "title": "Restablece Frame Reset con seguridad",
            "body": "Elimina solo los valores demo de Frame Reset antes de preparar marco WebGPU, estilos premium y perfil de calidad para produccion.",
            "expected": "El perfil de prueba permanece sin impacto de producción."
          },
          "fr": {
            "title": "Reinitialisez Frame Reset en securite",
            "body": "Supprimez uniquement les valeurs demo de Frame Reset avant de preparer cadre WebGPU, styles premium et profil de qualité pour la production.",
            "expected": "Le profil de test reste sans impact de production."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/visual-fx-frame-webgpu/ui"
          },
          {
            "type": "reset-demo-state",
            "selector": "#savePresetBtn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": [200,304]
          },
          {
            "type": "url",
            "expected": {
              "path": "/visual-fx-frame-webgpu/ui",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#savePresetBtn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#savePresetBtn",
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
  'frame-obs-source': {
    route: '/visual-fx-frame-webgpu/ui',
    selector: '#overlayUrl',
    copy: {
      de: { title: 'WebGPU-Frame-URL für OBS übernehmen', body: 'Prüfe die sichtbare WebGPU-Frame-URL in den Einstellungen, bevor du sie in einer nicht sendenden OBS-Testszene als Browser-Quelle einrichtest. Das Bild dokumentiert die echte OBS-Anleitung statt eines leeren Frame-Exports.', expected: 'Die sichtbare WebGPU-Overlay-URL und die folgenden OBS-Schritte sind klar.' },
      en: { title: 'Use the WebGPU frame URL for OBS', body: 'Review the visible WebGPU frame URL in Settings before using it as a browser source in a non-live OBS test scene. The image documents the real OBS guidance instead of an empty frame export.', expected: 'The visible WebGPU overlay URL and the following OBS steps are clear.' },
      es: { title: 'Usa la URL del marco WebGPU para OBS', body: 'Revisa la URL visible del marco WebGPU en Ajustes antes de usarla como fuente de navegador en una escena de prueba de OBS que no está en directo. La imagen documenta la guía real de OBS en lugar de un export vacío del marco.', expected: 'La URL visible del overlay WebGPU y los pasos siguientes de OBS están claros.' },
      fr: { title: 'Utilisez l’URL du cadre WebGPU pour OBS', body: 'Vérifiez l’URL visible du cadre WebGPU dans les réglages avant de l’utiliser comme source navigateur dans une scène de test OBS hors diffusion. L’image documente le véritable guide OBS au lieu d’un export de cadre vide.', expected: 'L’URL visible de l’overlay WebGPU et les étapes OBS suivantes sont claires.' }
    }
  }
}));
