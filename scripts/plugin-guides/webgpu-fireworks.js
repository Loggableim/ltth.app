'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "webgpu-fireworks",
  "route": "/webgpu-fireworks/ui",
  "topic": {
    "de": "WebGPU-Qualität, Auslöser und Performance-Grenze",
    "en": "WebGPU quality, trigger, and performance limit",
    "es": "calidad WebGPU, disparador y límite de rendimiento",
    "fr": "qualité WebGPU, déclencheur et limite de performance"
  },
  "test": {
    "de": "den lokalen Follower-Test und die Overlay-Vorschau",
    "en": "the local follower test and overlay preview",
    "es": "la prueba local de follower y la vista previa del overlay",
    "fr": "le test local de follower et l’aperçu overlay"
  },
  "expected": {
    "de": "das WebGPU-Feuerwerk wird gerendert, ohne TikTok LIVE zu verbinden",
    "en": "the WebGPU fireworks render without connecting TikTok LIVE",
    "es": "los fuegos WebGPU se renderizan sin conectar TikTok LIVE",
    "fr": "les feux WebGPU sont rendus sans connecter TikTok LIVE"
  },
  "requirement": "obs",
  "safety": "obs",
  "mode": "ui",
  "overlay": "/webgpu-fireworks/overlay",
  "related": [
    "fireworks",
    "visual-fx-frame-webgpu"
  ],
  "copy": {
    "de": {
      "title": "WebGPU Fireworks",
      "summary": "WebGPU Fireworks richtet WebGPU-Qualität, Auslöser und Performance-Grenze ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "das WebGPU-Feuerwerk wird gerendert, ohne TikTok LIVE zu verbinden",
      "requirements": "LTTH Dashboard; für die Ausgabe zusätzlich eine OBS-Testszene. Dieser konkrete WebGPU Fireworks-Ablauf behandelt WebGPU-Qualität, Auslöser und Performance-Grenze.",
      "safety": "Nutze eine nicht gesendete OBS-Testszene; LIVE-Ausgaben bleiben deaktiviert. Dieser konkrete WebGPU Fireworks-Ablauf behandelt WebGPU-Qualität, Auslöser und Performance-Grenze.",
      "troubleshooting": "Wenn WebGPU-Qualität, Auslöser und Performance-Grenze nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "fireworks",
        "visual-fx-frame-webgpu"
      ]
    },
    "en": {
      "title": "WebGPU Fireworks",
      "summary": "WebGPU Fireworks configures WebGPU quality, trigger, and performance limit with a safe local check instead of a LIVE trigger.",
      "firstResult": "the WebGPU fireworks render without connecting TikTok LIVE",
      "requirements": "LTTH Dashboard; use an OBS test scene for output. This WebGPU Fireworks workflow specifically covers WebGPU quality, trigger, and performance limit.",
      "safety": "Use an OBS test scene that is not live; LIVE output remains disabled. This WebGPU Fireworks workflow specifically covers WebGPU quality, trigger, and performance limit.",
      "troubleshooting": "If WebGPU quality, trigger, and performance limit is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "fireworks",
        "visual-fx-frame-webgpu"
      ]
    },
    "es": {
      "title": "WebGPU Fireworks",
      "summary": "WebGPU Fireworks configura calidad WebGPU, disparador y límite de rendimiento mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "los fuegos WebGPU se renderizan sin conectar TikTok LIVE",
      "requirements": "El panel de LTTH y una escena de prueba de OBS para la salida. Este flujo concreto de WebGPU Fireworks trata calidad WebGPU, disparador y límite de rendimiento.",
      "safety": "Usa una escena de prueba de OBS que no esté al aire; la salida LIVE permanece desactivada. Este flujo concreto de WebGPU Fireworks trata calidad WebGPU, disparador y límite de rendimiento.",
      "troubleshooting": "Si calidad WebGPU, disparador y límite de rendimiento no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "fireworks",
        "visual-fx-frame-webgpu"
      ]
    },
    "fr": {
      "title": "WebGPU Fireworks",
      "summary": "WebGPU Fireworks configure qualité WebGPU, déclencheur et limite de performance avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "les feux WebGPU sont rendus sans connecter TikTok LIVE",
      "requirements": "Le tableau de bord LTTH et une scène de test OBS pour la sortie. Ce flux spécifique de WebGPU Fireworks couvre qualité WebGPU, déclencheur et limite de performance.",
      "safety": "Utilisez une scène de test OBS non diffusée ; la sortie LIVE reste désactivée. Ce flux spécifique de WebGPU Fireworks couvre qualité WebGPU, déclencheur et limite de performance.",
      "troubleshooting": "Si qualité WebGPU, déclencheur et limite de performance n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "fireworks",
        "visual-fx-frame-webgpu"
      ]
    }
  },
  "steps": [
    {
      "id": "gpu-fireworks-card",
      "copy": {
        "de": {
          "title": "GPU Fireworks Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich GPU Fireworks Card von WebGPU-Qualität, Auslöser und Performance-Grenze. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "GPU Fireworks Card im Testprofil konfigurieren - WebGPU-Qualität, Auslöser und Performance-Grenze"
        },
        "en": {
          "title": "Configure GPU Fireworks Card in the test profile",
          "body": "Work in the visible GPU Fireworks Card area of WebGPU quality, trigger, and performance limit. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure GPU Fireworks Card in the test profile - WebGPU quality, trigger, and performance limit"
        },
        "es": {
          "title": "Configura GPU Fireworks Card en el perfil de prueba",
          "body": "Trabaja en el area visible GPU Fireworks Card de calidad WebGPU, disparador y límite de rendimiento. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura GPU Fireworks Card en el perfil de prueba - calidad WebGPU, disparador y límite de rendimiento"
        },
        "fr": {
          "title": "Configurez GPU Fireworks Card dans le profil de test",
          "body": "Travaillez dans la zone visible GPU Fireworks Card de qualité WebGPU, déclencheur et limite de performance. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez GPU Fireworks Card dans le profil de test - qualité WebGPU, déclencheur et limite de performance"
        }
      },
      "capture": {
        "route": "/plugins/webgpu-fireworks/ui/settings.html",
        "assertVisible": "#webgpu-runtime-state",
        "focusText": {
          "de": "GPU Fireworks Card im Testprofil konfigurieren",
          "en": "Configure GPU Fireworks Card in the test profile",
          "es": "Configura GPU Fireworks Card en el perfil de prueba",
          "fr": "Configurez GPU Fireworks Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "gpu-fireworks-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/webgpu-fireworks/ui/settings.html",
        "instructions": {
          "de": {
            "title": "GPU Fireworks Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich GPU Fireworks Card von WebGPU-Qualität, Auslöser und Performance-Grenze. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure GPU Fireworks Card in the test profile",
            "body": "Work in the visible GPU Fireworks Card area of WebGPU quality, trigger, and performance limit. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura GPU Fireworks Card en el perfil de prueba",
            "body": "Trabaja en el area visible GPU Fireworks Card de calidad WebGPU, disparador y límite de rendimiento. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez GPU Fireworks Card dans le profil de test",
            "body": "Travaillez dans la zone visible GPU Fireworks Card de qualité WebGPU, déclencheur et limite de performance. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/webgpu-fireworks/ui/settings.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#webgpu-runtime-state"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/webgpu-fireworks/ui/settings.html"
          },
          {
            "type": "visible",
            "selector": "#webgpu-runtime-state"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#webgpu-runtime-state",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "gpu-quality",
      "copy": {
        "de": {
          "title": "WebGPU-Qualitaetsprofil im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich WebGPU-Qualitaetsprofil von WebGPU-Qualität, Auslöser und Performance-Grenze. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "WebGPU-Qualitaetsprofil im Testprofil konfigurieren - WebGPU-Qualität, Auslöser und Performance-Grenze"
        },
        "en": {
          "title": "Configure WebGPU quality profile in the test profile",
          "body": "Work in the visible WebGPU quality profile area of WebGPU quality, trigger, and performance limit. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure WebGPU quality profile in the test profile - WebGPU quality, trigger, and performance limit"
        },
        "es": {
          "title": "Configura perfil de calidad WebGPU en el perfil de prueba",
          "body": "Trabaja en el area visible perfil de calidad WebGPU de calidad WebGPU, disparador y límite de rendimiento. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura perfil de calidad WebGPU en el perfil de prueba - calidad WebGPU, disparador y límite de rendimiento"
        },
        "fr": {
          "title": "Configurez profil de qualite WebGPU dans le profil de test",
          "body": "Travaillez dans la zone visible profil de qualite WebGPU de qualité WebGPU, déclencheur et limite de performance. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez profil de qualite WebGPU dans le profil de test - qualité WebGPU, déclencheur et limite de performance"
        }
      },
      "capture": {
        "route": "/plugins/webgpu-fireworks/ui/settings.html",
        "assertVisible": "#webgpu-visual-style",
        "focusText": {
          "de": "WebGPU-Qualitaetsprofil im Testprofil konfigurieren",
          "en": "Configure WebGPU quality profile in the test profile",
          "es": "Configura perfil de calidad WebGPU en el perfil de prueba",
          "fr": "Configurez profil de qualite WebGPU dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "gpu-quality"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/webgpu-fireworks/ui/settings.html",
        "instructions": {
          "de": {
            "title": "WebGPU-Qualitaetsprofil im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich WebGPU-Qualitaetsprofil von WebGPU-Qualität, Auslöser und Performance-Grenze. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure WebGPU quality profile in the test profile",
            "body": "Work in the visible WebGPU quality profile area of WebGPU quality, trigger, and performance limit. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura perfil de calidad WebGPU en el perfil de prueba",
            "body": "Trabaja en el area visible perfil de calidad WebGPU de calidad WebGPU, disparador y límite de rendimiento. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez profil de qualite WebGPU dans le profil de test",
            "body": "Travaillez dans la zone visible profil de qualite WebGPU de qualité WebGPU, déclencheur et limite de performance. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/webgpu-fireworks/ui/settings.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#webgpu-visual-style"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/webgpu-fireworks/ui/settings.html"
          },
          {
            "type": "visible",
            "selector": "#webgpu-visual-style"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#webgpu-visual-style",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "follower-trigger",
      "copy": {
        "de": {
          "title": "Follower-Ausloeser im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Follower-Ausloeser von WebGPU-Qualität, Auslöser und Performance-Grenze. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Follower-Ausloeser im Testprofil konfigurieren - WebGPU-Qualität, Auslöser und Performance-Grenze"
        },
        "en": {
          "title": "Configure follower trigger in the test profile",
          "body": "Work in the visible follower trigger area of WebGPU quality, trigger, and performance limit. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure follower trigger in the test profile - WebGPU quality, trigger, and performance limit"
        },
        "es": {
          "title": "Configura disparador de follower en el perfil de prueba",
          "body": "Trabaja en el area visible disparador de follower de calidad WebGPU, disparador y límite de rendimiento. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura disparador de follower en el perfil de prueba - calidad WebGPU, disparador y límite de rendimiento"
        },
        "fr": {
          "title": "Configurez declencheur de follower dans le profil de test",
          "body": "Travaillez dans la zone visible declencheur de follower de qualité WebGPU, déclencheur et limite de performance. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez declencheur de follower dans le profil de test - qualité WebGPU, déclencheur et limite de performance"
        }
      },
      "capture": {
        "route": "/plugins/webgpu-fireworks/ui/settings.html",
        "assertVisible": "#min-coins",
        "focusText": {
          "de": "Follower-Ausloeser im Testprofil konfigurieren",
          "en": "Configure follower trigger in the test profile",
          "es": "Configura disparador de follower en el perfil de prueba",
          "fr": "Configurez declencheur de follower dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "follower-trigger"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/webgpu-fireworks/ui/settings.html",
        "instructions": {
          "de": {
            "title": "Follower-Ausloeser im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Follower-Ausloeser von WebGPU-Qualität, Auslöser und Performance-Grenze. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure follower trigger in the test profile",
            "body": "Work in the visible follower trigger area of WebGPU quality, trigger, and performance limit. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura disparador de follower en el perfil de prueba",
            "body": "Trabaja en el area visible disparador de follower de calidad WebGPU, disparador y límite de rendimiento. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez declencheur de follower dans le profil de test",
            "body": "Travaillez dans la zone visible declencheur de follower de qualité WebGPU, déclencheur et limite de performance. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/webgpu-fireworks/ui/settings.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#min-coins"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/webgpu-fireworks/ui/settings.html"
          },
          {
            "type": "visible",
            "selector": "#min-coins"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#min-coins",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "gpu-fireworks-test",
      "copy": {
        "de": {
          "title": "Den eingebauten WebGPU-Feuerwerkstest lokal ausloesen",
          "body": "Klicke auf den echten Button „Test Firework“. Er loest das eingebaute lokale Testereignis aus; weder TikTok LIVE noch eine externe Quelle wird verbunden.",
          "expected": "Die echte Test-Rueckmeldung ist nach dem lokalen Ausloesen sichtbar.",
          "alt": "Den eingebauten WebGPU-Feuerwerkstest lokal ausloesen - WebGPU-Qualität, Auslöser und Performance-Grenze"
        },
        "en": {
          "title": "Trigger the built-in WebGPU fireworks test locally",
          "body": "Click the real “Test Firework” button. It triggers the built-in local test event; neither TikTok LIVE nor an external source is connected.",
          "expected": "The real test feedback is visible after the local trigger.",
          "alt": "Trigger the built-in WebGPU fireworks test locally - WebGPU quality, trigger, and performance limit"
        },
        "es": {
          "title": "Activa localmente la prueba integrada de fuegos WebGPU",
          "body": "Haz clic en el boton real «Test Firework». Activa el evento de prueba local integrado; no conecta TikTok LIVE ni una fuente externa.",
          "expected": "La respuesta real de prueba queda visible tras el disparo local.",
          "alt": "Activa localmente la prueba integrada de fuegos WebGPU - calidad WebGPU, disparador y límite de rendimiento"
        },
        "fr": {
          "title": "Declenchez localement le test integre de feux dartifice WebGPU",
          "body": "Cliquez sur le vrai bouton « Test Firework ». Il declenche levenement de test local integre ; ni TikTok LIVE ni source externe nest connecte.",
          "expected": "Le vrai retour du test est visible apres le declenchement local.",
          "alt": "Declenchez localement le test integre de feux dartifice WebGPU - qualité WebGPU, déclencheur et limite de performance"
        }
      },
      "capture": {
        "route": "/plugins/webgpu-fireworks/ui/settings.html",
        "assertVisible": "#toast",
        "focusText": {
          "de": "Den eingebauten WebGPU-Feuerwerkstest lokal ausloesen",
          "en": "Trigger the built-in WebGPU fireworks test locally",
          "es": "Activa localmente la prueba integrada de fuegos WebGPU",
          "fr": "Declenchez localement le test integre de feux dartifice WebGPU"
        },
        "action": {
          "type": "run-local-preview",
          "allowClick": true,
          "clickSelector": "#test-btn",
          "settleMs": 250,
          "stepId": "gpu-fireworks-test"
        },
        "expected": {
          "de": "Die echte Test-Rueckmeldung ist nach dem lokalen Ausloesen sichtbar.",
          "en": "The real test feedback is visible after the local trigger.",
          "es": "La respuesta real de prueba queda visible tras el disparo local.",
          "fr": "Le vrai retour du test est visible apres le declenchement local."
        }
      },
      "workflow": {
        "route": "/plugins/webgpu-fireworks/ui/settings.html",
        "instructions": {
          "de": {
            "title": "Den eingebauten WebGPU-Feuerwerkstest lokal ausloesen",
            "body": "Klicke auf den echten Button „Test Firework“. Er loest das eingebaute lokale Testereignis aus; weder TikTok LIVE noch eine externe Quelle wird verbunden.",
            "expected": "Die echte Test-Rueckmeldung ist nach dem lokalen Ausloesen sichtbar."
          },
          "en": {
            "title": "Trigger the built-in WebGPU fireworks test locally",
            "body": "Click the real “Test Firework” button. It triggers the built-in local test event; neither TikTok LIVE nor an external source is connected.",
            "expected": "The real test feedback is visible after the local trigger."
          },
          "es": {
            "title": "Activa localmente la prueba integrada de fuegos WebGPU",
            "body": "Haz clic en el boton real «Test Firework». Activa el evento de prueba local integrado; no conecta TikTok LIVE ni una fuente externa.",
            "expected": "La respuesta real de prueba queda visible tras el disparo local."
          },
          "fr": {
            "title": "Declenchez localement le test integre de feux dartifice WebGPU",
            "body": "Cliquez sur le vrai bouton « Test Firework ». Il declenche levenement de test local integre ; ni TikTok LIVE ni source externe nest connecte.",
            "expected": "Le vrai retour du test est visible apres le declenchement local."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/webgpu-fireworks/ui/settings.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#test-btn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/webgpu-fireworks/ui/settings.html"
          },
          {
            "type": "visible",
            "selector": "#toast"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#toast",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "gpu-fireworks-overlay",
      "copy": {
        "de": {
          "title": "GPU Fireworks Overlay als Overlay-Vorschau oeffnen",
          "body": "Oeffne die echte GPU Fireworks Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
          "expected": "das WebGPU-Feuerwerk wird gerendert, ohne TikTok LIVE zu verbinden",
          "alt": "GPU Fireworks Overlay als Overlay-Vorschau oeffnen - WebGPU-Qualität, Auslöser und Performance-Grenze"
        },
        "en": {
          "title": "Open GPU Fireworks Overlay as an overlay preview",
          "body": "Open the real GPU Fireworks Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
          "expected": "the WebGPU fireworks render without connecting TikTok LIVE",
          "alt": "Open GPU Fireworks Overlay as an overlay preview - WebGPU quality, trigger, and performance limit"
        },
        "es": {
          "title": "Abre GPU Fireworks Overlay como vista previa de overlay",
          "body": "Abre la superficie real GPU Fireworks Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
          "expected": "los fuegos WebGPU se renderizan sin conectar TikTok LIVE",
          "alt": "Abre GPU Fireworks Overlay como vista previa de overlay - calidad WebGPU, disparador y límite de rendimiento"
        },
        "fr": {
          "title": "Ouvrez GPU Fireworks Overlay comme apercu overlay",
          "body": "Ouvrez la vraie surface GPU Fireworks Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
          "expected": "les feux WebGPU sont rendus sans connecter TikTok LIVE",
          "alt": "Ouvrez GPU Fireworks Overlay comme apercu overlay - qualité WebGPU, déclencheur et limite de performance"
        }
      },
      "capture": {
        "route": "/plugins/webgpu-fireworks/overlay.html",
        "assertVisible": "#fireworks-canvas",
        "focusText": {
          "de": "GPU Fireworks Overlay als Overlay-Vorschau oeffnen",
          "en": "Open GPU Fireworks Overlay as an overlay preview",
          "es": "Abre GPU Fireworks Overlay como vista previa de overlay",
          "fr": "Ouvrez GPU Fireworks Overlay comme apercu overlay"
        },
        "action": {
          "type": "open-overlay-preview",
          "stepId": "gpu-fireworks-overlay"
        },
        "expected": {
          "de": "das WebGPU-Feuerwerk wird gerendert, ohne TikTok LIVE zu verbinden",
          "en": "the WebGPU fireworks render without connecting TikTok LIVE",
          "es": "los fuegos WebGPU se renderizan sin conectar TikTok LIVE",
          "fr": "les feux WebGPU sont rendus sans connecter TikTok LIVE"
        }
      },
      "workflow": {
        "route": "/plugins/webgpu-fireworks/overlay.html",
        "instructions": {
          "de": {
            "title": "GPU Fireworks Overlay als Overlay-Vorschau oeffnen",
            "body": "Oeffne die echte GPU Fireworks Overlay-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.",
            "expected": "das WebGPU-Feuerwerk wird gerendert, ohne TikTok LIVE zu verbinden"
          },
          "en": {
            "title": "Open GPU Fireworks Overlay as an overlay preview",
            "body": "Open the real GPU Fireworks Overlay surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.",
            "expected": "the WebGPU fireworks render without connecting TikTok LIVE"
          },
          "es": {
            "title": "Abre GPU Fireworks Overlay como vista previa de overlay",
            "body": "Abre la superficie real GPU Fireworks Overlay solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.",
            "expected": "los fuegos WebGPU se renderizan sin conectar TikTok LIVE"
          },
          "fr": {
            "title": "Ouvrez GPU Fireworks Overlay comme apercu overlay",
            "body": "Ouvrez la vraie surface GPU Fireworks Overlay uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.",
            "expected": "les feux WebGPU sont rendus sans connecter TikTok LIVE"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/webgpu-fireworks/overlay.html"
          },
          {
            "type": "open-overlay-preview",
            "selector": "#fireworks-canvas"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/webgpu-fireworks/overlay.html"
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
      "id": "gpu-fireworks-reset",
      "copy": {
        "de": {
          "title": "GPU Fireworks Reset sicher zuruecksetzen",
          "body": "Entferne nur die Demo-Werte fuer GPU Fireworks Reset, bevor du WebGPU-Qualität, Auslöser und Performance-Grenze produktiv vorbereitest.",
          "expected": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "alt": "GPU Fireworks Reset sicher zuruecksetzen - WebGPU-Qualität, Auslöser und Performance-Grenze"
        },
        "en": {
          "title": "Reset GPU Fireworks Reset safely",
          "body": "Remove only the demo values for GPU Fireworks Reset before preparing WebGPU quality, trigger, and performance limit for production.",
          "expected": "The test profile remains free of production impact.",
          "alt": "Reset GPU Fireworks Reset safely - WebGPU quality, trigger, and performance limit"
        },
        "es": {
          "title": "Restablece GPU Fireworks Reset con seguridad",
          "body": "Elimina solo los valores demo de GPU Fireworks Reset antes de preparar calidad WebGPU, disparador y límite de rendimiento para produccion.",
          "expected": "El perfil de prueba permanece sin impacto de producción.",
          "alt": "Restablece GPU Fireworks Reset con seguridad - calidad WebGPU, disparador y límite de rendimiento"
        },
        "fr": {
          "title": "Reinitialisez GPU Fireworks Reset en securite",
          "body": "Supprimez uniquement les valeurs demo de GPU Fireworks Reset avant de preparer qualité WebGPU, déclencheur et limite de performance pour la production.",
          "expected": "Le profil de test reste sans impact de production.",
          "alt": "Reinitialisez GPU Fireworks Reset en securite - qualité WebGPU, déclencheur et limite de performance"
        }
      },
      "capture": {
        "route": "/plugins/webgpu-fireworks/ui/settings.html",
        "assertVisible": "#save-btn",
        "focusText": {
          "de": "GPU Fireworks Reset sicher zuruecksetzen",
          "en": "Reset GPU Fireworks Reset safely",
          "es": "Restablece GPU Fireworks Reset con seguridad",
          "fr": "Reinitialisez GPU Fireworks Reset en securite"
        },
        "action": {
          "type": "reset-demo-state",
          "stepId": "gpu-fireworks-reset"
        },
        "expected": {
          "de": "Das Testprofil bleibt ohne produktive Auswirkung.",
          "en": "The test profile remains free of production impact.",
          "es": "El perfil de prueba permanece sin impacto de producción.",
          "fr": "Le profil de test reste sans impact de production."
        }
      },
      "workflow": {
        "route": "/plugins/webgpu-fireworks/ui/settings.html",
        "instructions": {
          "de": {
            "title": "GPU Fireworks Reset sicher zuruecksetzen",
            "body": "Entferne nur die Demo-Werte fuer GPU Fireworks Reset, bevor du WebGPU-Qualität, Auslöser und Performance-Grenze produktiv vorbereitest.",
            "expected": "Das Testprofil bleibt ohne produktive Auswirkung."
          },
          "en": {
            "title": "Reset GPU Fireworks Reset safely",
            "body": "Remove only the demo values for GPU Fireworks Reset before preparing WebGPU quality, trigger, and performance limit for production.",
            "expected": "The test profile remains free of production impact."
          },
          "es": {
            "title": "Restablece GPU Fireworks Reset con seguridad",
            "body": "Elimina solo los valores demo de GPU Fireworks Reset antes de preparar calidad WebGPU, disparador y límite de rendimiento para produccion.",
            "expected": "El perfil de prueba permanece sin impacto de producción."
          },
          "fr": {
            "title": "Reinitialisez GPU Fireworks Reset en securite",
            "body": "Supprimez uniquement les valeurs demo de GPU Fireworks Reset avant de preparer qualité WebGPU, déclencheur et limite de performance pour la production.",
            "expected": "Le profil de test reste sans impact de production."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/webgpu-fireworks/ui/settings.html"
          },
          {
            "type": "reset-demo-state",
            "selector": "#save-btn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/webgpu-fireworks/ui/settings.html"
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
});
