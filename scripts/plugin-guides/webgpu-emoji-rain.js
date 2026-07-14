'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "webgpu-emoji-rain",
  "route": "/plugins/webgpu-emoji-rain/ui.html",
  "topic": {
    "de": "WebGPU-Preset, Assets und Geschenkregel",
    "en": "WebGPU preset, assets, and gift rule",
    "es": "preajuste WebGPU, recursos y regla de regalo",
    "fr": "préréglage WebGPU, assets et règle de cadeau"
  },
  "test": {
    "de": "ein lokales Emoji-Regen-Testereignis",
    "en": "a local emoji-rain test event",
    "es": "un evento de prueba local de lluvia de emoji",
    "fr": "un événement local de test de pluie emoji"
  },
  "expected": {
    "de": "die GPU-Vorschau zeigt Emojis und meldet keinen LIVE-Kontakt",
    "en": "the GPU preview shows emojis and reports no LIVE connection",
    "es": "la vista previa GPU muestra emojis y no informa conexión LIVE",
    "fr": "l’aperçu GPU montre des emojis et n’indique aucune connexion LIVE"
  },
  "requirement": "obs",
  "safety": "obs",
  "mode": "ui",
  "overlay": "/plugins/webgpu-emoji-rain/overlay.html",
  "related": [
    "emoji-rain",
    "webgpu-fireworks"
  ],
  "copy": {
    "de": {
      "title": "WebGPU EmojiRain",
      "summary": "WebGPU EmojiRain richtet WebGPU-Preset, Assets und Geschenkregel ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "die GPU-Vorschau zeigt Emojis und meldet keinen LIVE-Kontakt",
      "requirements": "LTTH Dashboard; für die Ausgabe zusätzlich eine OBS-Testszene. Dieser konkrete WebGPU EmojiRain-Ablauf behandelt WebGPU-Preset, Assets und Geschenkregel.",
      "safety": "Nutze eine nicht gesendete OBS-Testszene; LIVE-Ausgaben bleiben deaktiviert. Dieser konkrete WebGPU EmojiRain-Ablauf behandelt WebGPU-Preset, Assets und Geschenkregel.",
      "troubleshooting": "Wenn WebGPU-Preset, Assets und Geschenkregel nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "emoji-rain",
        "webgpu-fireworks"
      ]
    },
    "en": {
      "title": "WebGPU EmojiRain",
      "summary": "WebGPU EmojiRain configures WebGPU preset, assets, and gift rule with a safe local check instead of a LIVE trigger.",
      "firstResult": "the GPU preview shows emojis and reports no LIVE connection",
      "requirements": "LTTH Dashboard; use an OBS test scene for output. This WebGPU EmojiRain workflow specifically covers WebGPU preset, assets, and gift rule.",
      "safety": "Use an OBS test scene that is not live; LIVE output remains disabled. This WebGPU EmojiRain workflow specifically covers WebGPU preset, assets, and gift rule.",
      "troubleshooting": "If WebGPU preset, assets, and gift rule is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "emoji-rain",
        "webgpu-fireworks"
      ]
    },
    "es": {
      "title": "WebGPU EmojiRain",
      "summary": "WebGPU EmojiRain configura preajuste WebGPU, recursos y regla de regalo mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "la vista previa GPU muestra emojis y no informa conexión LIVE",
      "requirements": "El panel de LTTH y una escena de prueba de OBS para la salida. Este flujo concreto de WebGPU EmojiRain trata preajuste WebGPU, recursos y regla de regalo.",
      "safety": "Usa una escena de prueba de OBS que no esté al aire; la salida LIVE permanece desactivada. Este flujo concreto de WebGPU EmojiRain trata preajuste WebGPU, recursos y regla de regalo.",
      "troubleshooting": "Si preajuste WebGPU, recursos y regla de regalo no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "emoji-rain",
        "webgpu-fireworks"
      ]
    },
    "fr": {
      "title": "WebGPU EmojiRain",
      "summary": "WebGPU EmojiRain configure préréglage WebGPU, assets et règle de cadeau avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "l’aperçu GPU montre des emojis et n’indique aucune connexion LIVE",
      "requirements": "Le tableau de bord LTTH et une scène de test OBS pour la sortie. Ce flux spécifique de WebGPU EmojiRain couvre préréglage WebGPU, assets et règle de cadeau.",
      "safety": "Utilisez une scène de test OBS non diffusée ; la sortie LIVE reste désactivée. Ce flux spécifique de WebGPU EmojiRain couvre préréglage WebGPU, assets et règle de cadeau.",
      "troubleshooting": "Si préréglage WebGPU, assets et règle de cadeau n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "emoji-rain",
        "webgpu-fireworks"
      ]
    }
  },
  "steps": [
    {
      "id": "gpu-rain-card",
      "copy": {
        "de": {
          "title": "GPU Rain Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich GPU Rain Card von WebGPU-Preset, Assets und Geschenkregel. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "GPU Rain Card im Testprofil konfigurieren - WebGPU-Preset, Assets und Geschenkregel"
        },
        "en": {
          "title": "Configure GPU Rain Card in the test profile",
          "body": "Work in the visible GPU Rain Card area of WebGPU preset, assets, and gift rule. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure GPU Rain Card in the test profile - WebGPU preset, assets, and gift rule"
        },
        "es": {
          "title": "Configura GPU Rain Card en el perfil de prueba",
          "body": "Trabaja en el area visible GPU Rain Card de preajuste WebGPU, recursos y regla de regalo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura GPU Rain Card en el perfil de prueba - preajuste WebGPU, recursos y regla de regalo"
        },
        "fr": {
          "title": "Configurez GPU Rain Card dans le profil de test",
          "body": "Travaillez dans la zone visible GPU Rain Card de préréglage WebGPU, assets et règle de cadeau. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez GPU Rain Card dans le profil de test - préréglage WebGPU, assets et règle de cadeau"
        }
      },
      "capture": {
        "route": "/plugins/webgpu-emoji-rain/ui.html",
        "assertVisible": "#renderer-state",
        "focusText": {
          "de": "GPU Rain Card im Testprofil konfigurieren",
          "en": "Configure GPU Rain Card in the test profile",
          "es": "Configura GPU Rain Card en el perfil de prueba",
          "fr": "Configurez GPU Rain Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "gpu-rain-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/webgpu-emoji-rain/ui.html",
        "instructions": {
          "de": {
            "title": "GPU Rain Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich GPU Rain Card von WebGPU-Preset, Assets und Geschenkregel. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure GPU Rain Card in the test profile",
            "body": "Work in the visible GPU Rain Card area of WebGPU preset, assets, and gift rule. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura GPU Rain Card en el perfil de prueba",
            "body": "Trabaja en el area visible GPU Rain Card de preajuste WebGPU, recursos y regla de regalo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez GPU Rain Card dans le profil de test",
            "body": "Travaillez dans la zone visible GPU Rain Card de préréglage WebGPU, assets et règle de cadeau. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/webgpu-emoji-rain/ui.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#renderer-state"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/webgpu-emoji-rain/ui.html"
          },
          {
            "type": "visible",
            "selector": "#renderer-state"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#renderer-state",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "gpu-preset",
      "copy": {
        "de": {
          "title": "GPU Preset sicher zuruecksetzen",
          "body": "Entferne nur die Demo-Werte fuer GPU Preset, bevor du WebGPU-Preset, Assets und Geschenkregel produktiv vorbereitest.",
          "expected": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "alt": "GPU Preset sicher zuruecksetzen - WebGPU-Preset, Assets und Geschenkregel"
        },
        "en": {
          "title": "Reset GPU Preset safely",
          "body": "Remove only the demo values for GPU Preset before preparing WebGPU preset, assets, and gift rule for production.",
          "expected": "The test profile remains free of production impact.",
          "alt": "Reset GPU Preset safely - WebGPU preset, assets, and gift rule"
        },
        "es": {
          "title": "Restablece GPU Preset con seguridad",
          "body": "Elimina solo los valores demo de GPU Preset antes de preparar preajuste WebGPU, recursos y regla de regalo para produccion.",
          "expected": "El perfil de prueba permanece sin impacto de producción.",
          "alt": "Restablece GPU Preset con seguridad - preajuste WebGPU, recursos y regla de regalo"
        },
        "fr": {
          "title": "Reinitialisez GPU Preset en securite",
          "body": "Supprimez uniquement les valeurs demo de GPU Preset avant de preparer préréglage WebGPU, assets et règle de cadeau pour la production.",
          "expected": "Le profil de test reste sans impact de production.",
          "alt": "Reinitialisez GPU Preset en securite - préréglage WebGPU, assets et règle de cadeau"
        }
      },
      "capture": {
        "route": "/plugins/webgpu-emoji-rain/ui.html",
        "assertVisible": "#quality_preset",
        "focusText": {
          "de": "GPU Preset sicher zuruecksetzen",
          "en": "Reset GPU Preset safely",
          "es": "Restablece GPU Preset con seguridad",
          "fr": "Reinitialisez GPU Preset en securite"
        },
        "action": {
          "type": "reset-demo-state",
          "stepId": "gpu-preset"
        },
        "expected": {
          "de": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "en": "The test profile remains free of production impact.",
          "es": "El perfil de prueba permanece sin impacto de producción.",
          "fr": "Le profil de test reste sans impact de production."
        }
      },
      "workflow": {
        "route": "/plugins/webgpu-emoji-rain/ui.html",
        "instructions": {
          "de": {
            "title": "GPU Preset sicher zuruecksetzen",
            "body": "Entferne nur die Demo-Werte fuer GPU Preset, bevor du WebGPU-Preset, Assets und Geschenkregel produktiv vorbereitest.",
            "expected": "Das Testprofil bleibt ohne produktive Auswirkung."
          },
          "en": {
            "title": "Reset GPU Preset safely",
            "body": "Remove only the demo values for GPU Preset before preparing WebGPU preset, assets, and gift rule for production.",
            "expected": "The test profile remains free of production impact."
          },
          "es": {
            "title": "Restablece GPU Preset con seguridad",
            "body": "Elimina solo los valores demo de GPU Preset antes de preparar preajuste WebGPU, recursos y regla de regalo para produccion.",
            "expected": "El perfil de prueba permanece sin impacto de producción."
          },
          "fr": {
            "title": "Reinitialisez GPU Preset en securite",
            "body": "Supprimez uniquement les valeurs demo de GPU Preset avant de preparer préréglage WebGPU, assets et règle de cadeau pour la production.",
            "expected": "Le profil de test reste sans impact de production."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/webgpu-emoji-rain/ui.html"
          },
          {
            "type": "reset-demo-state",
            "selector": "#quality_preset"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/webgpu-emoji-rain/ui.html"
          },
          {
            "type": "visible",
            "selector": "#quality_preset"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#quality_preset",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "asset-rule",
      "copy": {
        "de": {
          "title": "Asset Rule im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Asset Rule von WebGPU-Preset, Assets und Geschenkregel. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Asset Rule im Testprofil konfigurieren - WebGPU-Preset, Assets und Geschenkregel"
        },
        "en": {
          "title": "Configure Asset Rule in the test profile",
          "body": "Work in the visible Asset Rule area of WebGPU preset, assets, and gift rule. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Asset Rule in the test profile - WebGPU preset, assets, and gift rule"
        },
        "es": {
          "title": "Configura Asset Rule en el perfil de prueba",
          "body": "Trabaja en el area visible Asset Rule de preajuste WebGPU, recursos y regla de regalo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Asset Rule en el perfil de prueba - preajuste WebGPU, recursos y regla de regalo"
        },
        "fr": {
          "title": "Configurez Asset Rule dans le profil de test",
          "body": "Travaillez dans la zone visible Asset Rule de préréglage WebGPU, assets et règle de cadeau. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Asset Rule dans le profil de test - préréglage WebGPU, assets et règle de cadeau"
        }
      },
      "capture": {
        "route": "/plugins/webgpu-emoji-rain/ui.html",
        "assertVisible": "#effect_intensity",
        "focusText": {
          "de": "Asset Rule im Testprofil konfigurieren",
          "en": "Configure Asset Rule in the test profile",
          "es": "Configura Asset Rule en el perfil de prueba",
          "fr": "Configurez Asset Rule dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "asset-rule"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/webgpu-emoji-rain/ui.html",
        "instructions": {
          "de": {
            "title": "Asset Rule im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Asset Rule von WebGPU-Preset, Assets und Geschenkregel. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Asset Rule in the test profile",
            "body": "Work in the visible Asset Rule area of WebGPU preset, assets, and gift rule. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Asset Rule en el perfil de prueba",
            "body": "Trabaja en el area visible Asset Rule de preajuste WebGPU, recursos y regla de regalo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Asset Rule dans le profil de test",
            "body": "Travaillez dans la zone visible Asset Rule de préréglage WebGPU, assets et règle de cadeau. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/webgpu-emoji-rain/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#effect_intensity"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/webgpu-emoji-rain/ui.html"
          },
          {
            "type": "visible",
            "selector": "#effect_intensity"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#effect_intensity",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "gpu-rain-test",
      "copy": {
        "de": {
          "title": "GPU Rain Test lokal testen",
          "body": "Fuehre GPU Rain Test nur mit ein lokales Emoji-Regen-Testereignis im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "die GPU-Vorschau zeigt Emojis und meldet keinen LIVE-Kontakt",
          "alt": "GPU Rain Test lokal testen - WebGPU-Preset, Assets und Geschenkregel"
        },
        "en": {
          "title": "Test GPU Rain Test locally",
          "body": "Run GPU Rain Test only with a local emoji-rain test event in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the GPU preview shows emojis and reports no LIVE connection",
          "alt": "Test GPU Rain Test locally - WebGPU preset, assets, and gift rule"
        },
        "es": {
          "title": "Prueba GPU Rain Test localmente",
          "body": "Ejecuta GPU Rain Test solo con un evento de prueba local de lluvia de emoji en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "la vista previa GPU muestra emojis y no informa conexión LIVE",
          "alt": "Prueba GPU Rain Test localmente - preajuste WebGPU, recursos y regla de regalo"
        },
        "fr": {
          "title": "Testez GPU Rain Test localement",
          "body": "Executez GPU Rain Test uniquement avec un événement local de test de pluie emoji dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "l’aperçu GPU montre des emojis et n’indique aucune connexion LIVE",
          "alt": "Testez GPU Rain Test localement - préréglage WebGPU, assets et règle de cadeau"
        }
      },
      "capture": {
        "route": "/plugins/webgpu-emoji-rain/ui.html",
        "assertVisible": "#save-config-btn",
        "focusText": {
          "de": "GPU Rain Test lokal testen",
          "en": "Test GPU Rain Test locally",
          "es": "Prueba GPU Rain Test localmente",
          "fr": "Testez GPU Rain Test localement"
        },
        "action": {
          "type": "run-local-preview",
          "stepId": "gpu-rain-test"
        },
        "expected": {
          "de": "die GPU-Vorschau zeigt Emojis und meldet keinen LIVE-Kontakt",
          "en": "the GPU preview shows emojis and reports no LIVE connection",
          "es": "la vista previa GPU muestra emojis y no informa conexión LIVE",
          "fr": "l’aperçu GPU montre des emojis et n’indique aucune connexion LIVE"
        }
      },
      "workflow": {
        "route": "/plugins/webgpu-emoji-rain/ui.html",
        "instructions": {
          "de": {
            "title": "GPU Rain Test lokal testen",
            "body": "Fuehre GPU Rain Test nur mit ein lokales Emoji-Regen-Testereignis im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "die GPU-Vorschau zeigt Emojis und meldet keinen LIVE-Kontakt"
          },
          "en": {
            "title": "Test GPU Rain Test locally",
            "body": "Run GPU Rain Test only with a local emoji-rain test event in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the GPU preview shows emojis and reports no LIVE connection"
          },
          "es": {
            "title": "Prueba GPU Rain Test localmente",
            "body": "Ejecuta GPU Rain Test solo con un evento de prueba local de lluvia de emoji en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "la vista previa GPU muestra emojis y no informa conexión LIVE"
          },
          "fr": {
            "title": "Testez GPU Rain Test localement",
            "body": "Executez GPU Rain Test uniquement avec un événement local de test de pluie emoji dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "l’aperçu GPU montre des emojis et n’indique aucune connexion LIVE"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/webgpu-emoji-rain/ui.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#save-config-btn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/webgpu-emoji-rain/ui.html"
          },
          {
            "type": "visible",
            "selector": "#save-config-btn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#save-config-btn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "gpu-rain-overlay",
      "copy": {
        "de": {
          "title": "GPU Rain Overlay als Overlay-Vorschau oeffnen",
          "body": "Oeffne die echte GPU Rain Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
          "expected": "die GPU-Vorschau zeigt Emojis und meldet keinen LIVE-Kontakt",
          "alt": "GPU Rain Overlay als Overlay-Vorschau oeffnen - WebGPU-Preset, Assets und Geschenkregel"
        },
        "en": {
          "title": "Open GPU Rain Overlay as an overlay preview",
          "body": "Open the real GPU Rain Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
          "expected": "the GPU preview shows emojis and reports no LIVE connection",
          "alt": "Open GPU Rain Overlay as an overlay preview - WebGPU preset, assets, and gift rule"
        },
        "es": {
          "title": "Abre GPU Rain Overlay como vista previa de overlay",
          "body": "Abre la superficie real GPU Rain Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
          "expected": "la vista previa GPU muestra emojis y no informa conexión LIVE",
          "alt": "Abre GPU Rain Overlay como vista previa de overlay - preajuste WebGPU, recursos y regla de regalo"
        },
        "fr": {
          "title": "Ouvrez GPU Rain Overlay comme apercu overlay",
          "body": "Ouvrez la vraie surface GPU Rain Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
          "expected": "l’aperçu GPU montre des emojis et n’indique aucune connexion LIVE",
          "alt": "Ouvrez GPU Rain Overlay comme apercu overlay - préréglage WebGPU, assets et règle de cadeau"
        }
      },
      "capture": {
        "route": "/plugins/webgpu-emoji-rain/overlay.html",
        "assertVisible": "#emoji-rain-canvas",
        "focusText": {
          "de": "GPU Rain Overlay als Overlay-Vorschau oeffnen",
          "en": "Open GPU Rain Overlay as an overlay preview",
          "es": "Abre GPU Rain Overlay como vista previa de overlay",
          "fr": "Ouvrez GPU Rain Overlay comme apercu overlay"
        },
        "action": {
          "type": "open-overlay-preview",
          "stepId": "gpu-rain-overlay"
        },
        "expected": {
          "de": "die GPU-Vorschau zeigt Emojis und meldet keinen LIVE-Kontakt",
          "en": "the GPU preview shows emojis and reports no LIVE connection",
          "es": "la vista previa GPU muestra emojis y no informa conexión LIVE",
          "fr": "l’aperçu GPU montre des emojis et n’indique aucune connexion LIVE"
        }
      },
      "workflow": {
        "route": "/plugins/webgpu-emoji-rain/overlay.html",
        "instructions": {
          "de": {
            "title": "GPU Rain Overlay als Overlay-Vorschau oeffnen",
            "body": "Oeffne die echte GPU Rain Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
            "expected": "die GPU-Vorschau zeigt Emojis und meldet keinen LIVE-Kontakt"
          },
          "en": {
            "title": "Open GPU Rain Overlay as an overlay preview",
            "body": "Open the real GPU Rain Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
            "expected": "the GPU preview shows emojis and reports no LIVE connection"
          },
          "es": {
            "title": "Abre GPU Rain Overlay como vista previa de overlay",
            "body": "Abre la superficie real GPU Rain Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
            "expected": "la vista previa GPU muestra emojis y no informa conexión LIVE"
          },
          "fr": {
            "title": "Ouvrez GPU Rain Overlay comme apercu overlay",
            "body": "Ouvrez la vraie surface GPU Rain Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
            "expected": "l’aperçu GPU montre des emojis et n’indique aucune connexion LIVE"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/webgpu-emoji-rain/overlay.html"
          },
          {
            "type": "open-overlay-preview",
            "selector": "#emoji-rain-canvas"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/webgpu-emoji-rain/overlay.html"
          },
          {
            "type": "visible",
            "selector": "#emoji-rain-canvas"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#emoji-rain-canvas",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "gpu-rain-reset",
      "copy": {
        "de": {
          "title": "GPU Rain Reset sicher zuruecksetzen",
          "body": "Entferne nur die Demo-Werte fuer GPU Rain Reset, bevor du WebGPU-Preset, Assets und Geschenkregel produktiv vorbereitest.",
          "expected": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "alt": "GPU Rain Reset sicher zuruecksetzen - WebGPU-Preset, Assets und Geschenkregel"
        },
        "en": {
          "title": "Reset GPU Rain Reset safely",
          "body": "Remove only the demo values for GPU Rain Reset before preparing WebGPU preset, assets, and gift rule for production.",
          "expected": "The test profile remains free of production impact.",
          "alt": "Reset GPU Rain Reset safely - WebGPU preset, assets, and gift rule"
        },
        "es": {
          "title": "Restablece GPU Rain Reset con seguridad",
          "body": "Elimina solo los valores demo de GPU Rain Reset antes de preparar preajuste WebGPU, recursos y regla de regalo para produccion.",
          "expected": "El perfil de prueba permanece sin impacto de producción.",
          "alt": "Restablece GPU Rain Reset con seguridad - preajuste WebGPU, recursos y regla de regalo"
        },
        "fr": {
          "title": "Reinitialisez GPU Rain Reset en securite",
          "body": "Supprimez uniquement les valeurs demo de GPU Rain Reset avant de preparer préréglage WebGPU, assets et règle de cadeau pour la production.",
          "expected": "Le profil de test reste sans impact de production.",
          "alt": "Reinitialisez GPU Rain Reset en securite - préréglage WebGPU, assets et règle de cadeau"
        }
      },
      "capture": {
        "route": "/plugins/webgpu-emoji-rain/ui.html",
        "assertVisible": "#toggle-enabled-status",
        "focusText": {
          "de": "GPU Rain Reset sicher zuruecksetzen",
          "en": "Reset GPU Rain Reset safely",
          "es": "Restablece GPU Rain Reset con seguridad",
          "fr": "Reinitialisez GPU Rain Reset en securite"
        },
        "action": {
          "type": "reset-demo-state",
          "stepId": "gpu-rain-reset"
        },
        "expected": {
          "de": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "en": "The test profile remains free of production impact.",
          "es": "El perfil de prueba permanece sin impacto de producción.",
          "fr": "Le profil de test reste sans impact de production."
        }
      },
      "workflow": {
        "route": "/plugins/webgpu-emoji-rain/ui.html",
        "instructions": {
          "de": {
            "title": "GPU Rain Reset sicher zuruecksetzen",
            "body": "Entferne nur die Demo-Werte fuer GPU Rain Reset, bevor du WebGPU-Preset, Assets und Geschenkregel produktiv vorbereitest.",
            "expected": "Das Testprofil bleibt ohne produktive Auswirkung."
          },
          "en": {
            "title": "Reset GPU Rain Reset safely",
            "body": "Remove only the demo values for GPU Rain Reset before preparing WebGPU preset, assets, and gift rule for production.",
            "expected": "The test profile remains free of production impact."
          },
          "es": {
            "title": "Restablece GPU Rain Reset con seguridad",
            "body": "Elimina solo los valores demo de GPU Rain Reset antes de preparar preajuste WebGPU, recursos y regla de regalo para produccion.",
            "expected": "El perfil de prueba permanece sin impacto de producción."
          },
          "fr": {
            "title": "Reinitialisez GPU Rain Reset en securite",
            "body": "Supprimez uniquement les valeurs demo de GPU Rain Reset avant de preparer préréglage WebGPU, assets et règle de cadeau pour la production.",
            "expected": "Le profil de test reste sans impact de production."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/webgpu-emoji-rain/ui.html"
          },
          {
            "type": "reset-demo-state",
            "selector": "#toggle-enabled-status"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/webgpu-emoji-rain/ui.html"
          },
          {
            "type": "visible",
            "selector": "#toggle-enabled-status"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#toggle-enabled-status",
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
