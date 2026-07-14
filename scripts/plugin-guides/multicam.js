'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "multicam",
  "route": "/plugins/multicam/ui.html",
  "topic": {
    "de": "Kameraquelle, Szenenregel und Umschaltbedingung",
    "en": "camera source, scene rule, and switch condition",
    "es": "fuente de cámara, regla de escena y condición de cambio",
    "fr": "source caméra, règle de scène et condition de bascule"
  },
  "test": {
    "de": "eine nicht sendende OBS-Testszene",
    "en": "an OBS test scene that is not live",
    "es": "una escena de prueba de OBS que no está al aire",
    "fr": "une scène de test OBS non diffusée"
  },
  "expected": {
    "de": "die Regel wird gespeichert, ohne OBS zu schalten",
    "en": "the rule is saved without switching OBS",
    "es": "la regla se guarda sin cambiar OBS",
    "fr": "la règle est enregistrée sans basculer OBS"
  },
  "requirement": "obs",
  "safety": "obs",
  "mode": "ui",
  "overlay": null,
  "related": [
    "vdoninja",
    "clarityhud"
  ],
  "copy": {
    "de": {
      "title": "Multi-Cam Switcher",
      "summary": "Multi-Cam Switcher richtet Kameraquelle, Szenenregel und Umschaltbedingung ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "die Regel wird gespeichert, ohne OBS zu schalten",
      "requirements": "LTTH Dashboard; für die Ausgabe zusätzlich eine OBS-Testszene. Dieser konkrete Multi-Cam Switcher-Ablauf behandelt Kameraquelle, Szenenregel und Umschaltbedingung.",
      "safety": "Nutze eine nicht gesendete OBS-Testszene; LIVE-Ausgaben bleiben deaktiviert. Dieser konkrete Multi-Cam Switcher-Ablauf behandelt Kameraquelle, Szenenregel und Umschaltbedingung.",
      "troubleshooting": "Wenn Kameraquelle, Szenenregel und Umschaltbedingung nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "vdoninja",
        "clarityhud"
      ]
    },
    "en": {
      "title": "Multi-Cam Switcher",
      "summary": "Multi-Cam Switcher configures camera source, scene rule, and switch condition with a safe local check instead of a LIVE trigger.",
      "firstResult": "the rule is saved without switching OBS",
      "requirements": "LTTH Dashboard; use an OBS test scene for output. This Multi-Cam Switcher workflow specifically covers camera source, scene rule, and switch condition.",
      "safety": "Use an OBS test scene that is not live; LIVE output remains disabled. This Multi-Cam Switcher workflow specifically covers camera source, scene rule, and switch condition.",
      "troubleshooting": "If camera source, scene rule, and switch condition is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "vdoninja",
        "clarityhud"
      ]
    },
    "es": {
      "title": "Multi-Cam Switcher",
      "summary": "Multi-Cam Switcher configura fuente de cámara, regla de escena y condición de cambio mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "la regla se guarda sin cambiar OBS",
      "requirements": "El panel de LTTH y una escena de prueba de OBS para la salida. Este flujo concreto de Multi-Cam Switcher trata fuente de cámara, regla de escena y condición de cambio.",
      "safety": "Usa una escena de prueba de OBS que no esté al aire; la salida LIVE permanece desactivada. Este flujo concreto de Multi-Cam Switcher trata fuente de cámara, regla de escena y condición de cambio.",
      "troubleshooting": "Si fuente de cámara, regla de escena y condición de cambio no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "vdoninja",
        "clarityhud"
      ]
    },
    "fr": {
      "title": "Multi-Cam Switcher",
      "summary": "Multi-Cam Switcher configure source caméra, règle de scène et condition de bascule avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "la règle est enregistrée sans basculer OBS",
      "requirements": "Le tableau de bord LTTH et une scène de test OBS pour la sortie. Ce flux spécifique de Multi-Cam Switcher couvre source caméra, règle de scène et condition de bascule.",
      "safety": "Utilisez une scène de test OBS non diffusée ; la sortie LIVE reste désactivée. Ce flux spécifique de Multi-Cam Switcher couvre source caméra, règle de scène et condition de bascule.",
      "troubleshooting": "Si source caméra, règle de scène et condition de bascule n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "vdoninja",
        "clarityhud"
      ]
    }
  },
  "steps": [
    {
      "id": "multicam-card",
      "copy": {
        "de": {
          "title": "Multicam Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Multicam Card von Kameraquelle, Szenenregel und Umschaltbedingung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Multicam Card im Testprofil konfigurieren - Kameraquelle, Szenenregel und Umschaltbedingung"
        },
        "en": {
          "title": "Configure Multicam Card in the test profile",
          "body": "Work in the visible Multicam Card area of camera source, scene rule, and switch condition. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Multicam Card in the test profile - camera source, scene rule, and switch condition"
        },
        "es": {
          "title": "Configura Multicam Card en el perfil de prueba",
          "body": "Trabaja en el area visible Multicam Card de fuente de cámara, regla de escena y condición de cambio. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Multicam Card en el perfil de prueba - fuente de cámara, regla de escena y condición de cambio"
        },
        "fr": {
          "title": "Configurez Multicam Card dans le profil de test",
          "body": "Travaillez dans la zone visible Multicam Card de source caméra, règle de scène et condition de bascule. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Multicam Card dans le profil de test - source caméra, règle de scène et condition de bascule"
        }
      },
      "capture": {
        "route": "/plugins/multicam/ui.html",
        "assertVisible": "#currentScene",
        "focusText": {
          "de": "Multicam Card im Testprofil konfigurieren",
          "en": "Configure Multicam Card in the test profile",
          "es": "Configura Multicam Card en el perfil de prueba",
          "fr": "Configurez Multicam Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "multicam-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/multicam/ui.html",
        "instructions": {
          "de": {
            "title": "Multicam Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Multicam Card von Kameraquelle, Szenenregel und Umschaltbedingung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Multicam Card in the test profile",
            "body": "Work in the visible Multicam Card area of camera source, scene rule, and switch condition. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Multicam Card en el perfil de prueba",
            "body": "Trabaja en el area visible Multicam Card de fuente de cámara, regla de escena y condición de cambio. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Multicam Card dans le profil de test",
            "body": "Travaillez dans la zone visible Multicam Card de source caméra, règle de scène et condition de bascule. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/multicam/ui.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#currentScene"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/multicam/ui.html"
          },
          {
            "type": "visible",
            "selector": "#currentScene"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#currentScene",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "camera-source",
      "copy": {
        "de": {
          "title": "OBS vor einer Szenenzuordnung verbinden",
          "body": "Die echte Multicam-Oberflaeche zeigt den Button „OBS verbinden“. Richte die OBS-Verbindung in LTTH ein und verbinde erst dann; ohne diese Verbindung wird keine Kamera- oder Szenenliste erfunden.",
          "expected": "Der echte OBS-Verbindungs-Einstieg ist sichtbar.",
          "alt": "OBS vor einer Szenenzuordnung verbinden - Kameraquelle, Szenenregel und Umschaltbedingung"
        },
        "en": {
          "title": "Connect OBS before assigning a scene",
          "body": "The real Multicam surface shows the “Connect OBS” button. Configure the OBS connection in LTTH and connect only then; without it, no camera or scene list is invented.",
          "expected": "The real OBS connection entry point is visible.",
          "alt": "Connect OBS before assigning a scene - camera source, scene rule, and switch condition"
        },
        "es": {
          "title": "Conecta OBS antes de asignar una escena",
          "body": "La superficie real de Multicam muestra el boton «Connect OBS». Configura la conexion OBS en LTTH y conectala solo entonces; sin ella no se inventa ninguna lista de camaras ni escenas.",
          "expected": "La entrada real de conexion OBS queda visible.",
          "alt": "Conecta OBS antes de asignar una escena - fuente de cámara, regla de escena y condición de cambio"
        },
        "fr": {
          "title": "Connectez OBS avant dattribuer une scene",
          "body": "La vraie interface Multicam affiche le bouton « Connect OBS ». Configurez la connexion OBS dans LTTH, puis connectez-vous ; sans elle, aucune liste de cameras ou de scenes nest inventee.",
          "expected": "Le vrai point dentree de connexion OBS est visible.",
          "alt": "Connectez OBS avant dattribuer une scene - source caméra, règle de scène et condition de bascule"
        }
      },
      "capture": {
        "route": "/plugins/multicam/ui.html",
        "assertVisible": "#obs-connect-btn",
        "focusText": {
          "de": "OBS vor einer Szenenzuordnung verbinden",
          "en": "Connect OBS before assigning a scene",
          "es": "Conecta OBS antes de asignar una escena",
          "fr": "Connectez OBS avant dattribuer une scene"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "camera-source"
        },
        "expected": {
          "de": "Der echte OBS-Verbindungs-Einstieg ist sichtbar.",
          "en": "The real OBS connection entry point is visible.",
          "es": "La entrada real de conexion OBS queda visible.",
          "fr": "Le vrai point dentree de connexion OBS est visible."
        }
      },
      "workflow": {
        "route": "/plugins/multicam/ui.html",
        "instructions": {
          "de": {
            "title": "OBS vor einer Szenenzuordnung verbinden",
            "body": "Die echte Multicam-Oberflaeche zeigt den Button „OBS verbinden“. Richte die OBS-Verbindung in LTTH ein und verbinde erst dann; ohne diese Verbindung wird keine Kamera- oder Szenenliste erfunden.",
            "expected": "Der echte OBS-Verbindungs-Einstieg ist sichtbar."
          },
          "en": {
            "title": "Connect OBS before assigning a scene",
            "body": "The real Multicam surface shows the “Connect OBS” button. Configure the OBS connection in LTTH and connect only then; without it, no camera or scene list is invented.",
            "expected": "The real OBS connection entry point is visible."
          },
          "es": {
            "title": "Conecta OBS antes de asignar una escena",
            "body": "La superficie real de Multicam muestra el boton «Connect OBS». Configura la conexion OBS en LTTH y conectala solo entonces; sin ella no se inventa ninguna lista de camaras ni escenas.",
            "expected": "La entrada real de conexion OBS queda visible."
          },
          "fr": {
            "title": "Connectez OBS avant dattribuer une scene",
            "body": "La vraie interface Multicam affiche le bouton « Connect OBS ». Configurez la connexion OBS dans LTTH, puis connectez-vous ; sans elle, aucune liste de cameras ou de scenes nest inventee.",
            "expected": "Le vrai point dentree de connexion OBS est visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/multicam/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#obs-connect-btn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/multicam/ui.html"
          },
          {
            "type": "visible",
            "selector": "#obs-connect-btn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#obs-connect-btn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "scene-rule",
      "copy": {
        "de": {
          "title": "Eine Szene erst aus der echten OBS-Liste waehlen",
          "body": "Nach erfolgreicher OBS-Verbindung waehle eine vorhandene Szene im Szenen-Dropdown und nutze erst dann „Wechseln“. Bleibt OBS getrennt, ist eine leere Liste der korrekte Zustand.",
          "expected": "Der echte Szenen-Dropdown zeigt nur von OBS gelieferte Szenen.",
          "alt": "Eine Szene erst aus der echten OBS-Liste waehlen - Kameraquelle, Szenenregel und Umschaltbedingung"
        },
        "en": {
          "title": "Choose a scene only from the real OBS list",
          "body": "After OBS connects, choose an existing scene in the scene drop-down and only then use “Switch”. While OBS is disconnected, an empty list is the correct state.",
          "expected": "The real scene drop-down shows only scenes supplied by OBS.",
          "alt": "Choose a scene only from the real OBS list - camera source, scene rule, and switch condition"
        },
        "es": {
          "title": "Elige una escena solo de la lista OBS real",
          "body": "Tras conectar OBS, elige una escena existente en el desplegable y solo entonces usa «Switch». Mientras OBS este desconectado, una lista vacia es el estado correcto.",
          "expected": "El desplegable real muestra solo escenas proporcionadas por OBS.",
          "alt": "Elige una escena solo de la lista OBS real - fuente de cámara, regla de escena y condición de cambio"
        },
        "fr": {
          "title": "Choisissez une scene uniquement dans la vraie liste OBS",
          "body": "Apres connexion d OBS, choisissez une scene existante dans la liste deroulante, puis utilisez « Switch ». Tant qu OBS est deconnecte, une liste vide est letat correct.",
          "expected": "La vraie liste de scenes naffiche que les scenes fournies par OBS.",
          "alt": "Choisissez une scene uniquement dans la vraie liste OBS - source caméra, règle de scène et condition de bascule"
        }
      },
      "capture": {
        "route": "/plugins/multicam/ui.html",
        "assertVisible": "#sceneSelect",
        "focusText": {
          "de": "Eine Szene erst aus der echten OBS-Liste waehlen",
          "en": "Choose a scene only from the real OBS list",
          "es": "Elige una escena solo de la lista OBS real",
          "fr": "Choisissez une scene uniquement dans la vraie liste OBS"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "scene-rule"
        },
        "expected": {
          "de": "Der echte Szenen-Dropdown zeigt nur von OBS gelieferte Szenen.",
          "en": "The real scene drop-down shows only scenes supplied by OBS.",
          "es": "El desplegable real muestra solo escenas proporcionadas por OBS.",
          "fr": "La vraie liste de scenes naffiche que les scenes fournies par OBS."
        }
      },
      "workflow": {
        "route": "/plugins/multicam/ui.html",
        "instructions": {
          "de": {
            "title": "Eine Szene erst aus der echten OBS-Liste waehlen",
            "body": "Nach erfolgreicher OBS-Verbindung waehle eine vorhandene Szene im Szenen-Dropdown und nutze erst dann „Wechseln“. Bleibt OBS getrennt, ist eine leere Liste der korrekte Zustand.",
            "expected": "Der echte Szenen-Dropdown zeigt nur von OBS gelieferte Szenen."
          },
          "en": {
            "title": "Choose a scene only from the real OBS list",
            "body": "After OBS connects, choose an existing scene in the scene drop-down and only then use “Switch”. While OBS is disconnected, an empty list is the correct state.",
            "expected": "The real scene drop-down shows only scenes supplied by OBS."
          },
          "es": {
            "title": "Elige una escena solo de la lista OBS real",
            "body": "Tras conectar OBS, elige una escena existente en el desplegable y solo entonces usa «Switch». Mientras OBS este desconectado, una lista vacia es el estado correcto.",
            "expected": "El desplegable real muestra solo escenas proporcionadas por OBS."
          },
          "fr": {
            "title": "Choisissez une scene uniquement dans la vraie liste OBS",
            "body": "Apres connexion d OBS, choisissez une scene existante dans la liste deroulante, puis utilisez « Switch ». Tant qu OBS est deconnecte, une liste vide est letat correct.",
            "expected": "La vraie liste de scenes naffiche que les scenes fournies par OBS."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/multicam/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#sceneSelect"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/multicam/ui.html"
          },
          {
            "type": "visible",
            "selector": "#sceneSelect"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#sceneSelect",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "scene-dry-run",
      "copy": {
        "de": {
          "title": "Scene DRY RUN lokal testen",
          "body": "Fuehre Scene DRY RUN nur mit eine nicht sendende OBS-Testszene im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "die Regel wird gespeichert, ohne OBS zu schalten",
          "alt": "Scene DRY RUN lokal testen - Kameraquelle, Szenenregel und Umschaltbedingung"
        },
        "en": {
          "title": "Test Scene DRY RUN locally",
          "body": "Run Scene DRY RUN only with an OBS test scene that is not live in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the rule is saved without switching OBS",
          "alt": "Test Scene DRY RUN locally - camera source, scene rule, and switch condition"
        },
        "es": {
          "title": "Prueba Scene DRY RUN localmente",
          "body": "Ejecuta Scene DRY RUN solo con una escena de prueba de OBS que no está al aire en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "la regla se guarda sin cambiar OBS",
          "alt": "Prueba Scene DRY RUN localmente - fuente de cámara, regla de escena y condición de cambio"
        },
        "fr": {
          "title": "Testez Scene DRY RUN localement",
          "body": "Executez Scene DRY RUN uniquement avec une scène de test OBS non diffusée dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "la règle est enregistrée sans basculer OBS",
          "alt": "Testez Scene DRY RUN localement - source caméra, règle de scène et condition de bascule"
        }
      },
      "capture": {
        "route": "/plugins/multicam/ui.html",
        "assertVisible": "#giftGridContainer",
        "focusText": {
          "de": "Scene DRY RUN lokal testen",
          "en": "Test Scene DRY RUN locally",
          "es": "Prueba Scene DRY RUN localmente",
          "fr": "Testez Scene DRY RUN localement"
        },
        "action": {
          "type": "run-local-preview",
          "stepId": "scene-dry-run"
        },
        "expected": {
          "de": "die Regel wird gespeichert, ohne OBS zu schalten",
          "en": "the rule is saved without switching OBS",
          "es": "la regla se guarda sin cambiar OBS",
          "fr": "la règle est enregistrée sans basculer OBS"
        }
      },
      "workflow": {
        "route": "/plugins/multicam/ui.html",
        "instructions": {
          "de": {
            "title": "Scene DRY RUN lokal testen",
            "body": "Fuehre Scene DRY RUN nur mit eine nicht sendende OBS-Testszene im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "die Regel wird gespeichert, ohne OBS zu schalten"
          },
          "en": {
            "title": "Test Scene DRY RUN locally",
            "body": "Run Scene DRY RUN only with an OBS test scene that is not live in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the rule is saved without switching OBS"
          },
          "es": {
            "title": "Prueba Scene DRY RUN localmente",
            "body": "Ejecuta Scene DRY RUN solo con una escena de prueba de OBS que no está al aire en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "la regla se guarda sin cambiar OBS"
          },
          "fr": {
            "title": "Testez Scene DRY RUN localement",
            "body": "Executez Scene DRY RUN uniquement avec une scène de test OBS non diffusée dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "la règle est enregistrée sans basculer OBS"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/multicam/ui.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#giftGridContainer"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/multicam/ui.html"
          },
          {
            "type": "visible",
            "selector": "#giftGridContainer"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#giftGridContainer",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "multicam-review",
      "copy": {
        "de": {
          "title": "Multicam Review im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Multicam Review von Kameraquelle, Szenenregel und Umschaltbedingung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert.",
          "alt": "Multicam Review im Testprofil konfigurieren - Kameraquelle, Szenenregel und Umschaltbedingung"
        },
        "en": {
          "title": "Configure Multicam Review in the test profile",
          "body": "Work in the visible Multicam Review area of camera source, scene rule, and switch condition. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The test configuration is saved safely and can be reviewed.",
          "alt": "Configure Multicam Review in the test profile - camera source, scene rule, and switch condition"
        },
        "es": {
          "title": "Configura Multicam Review en el perfil de prueba",
          "body": "Trabaja en el area visible Multicam Review de fuente de cámara, regla de escena y condición de cambio. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La configuración de prueba se guarda de forma segura y puede revisarse.",
          "alt": "Configura Multicam Review en el perfil de prueba - fuente de cámara, regla de escena y condición de cambio"
        },
        "fr": {
          "title": "Configurez Multicam Review dans le profil de test",
          "body": "Travaillez dans la zone visible Multicam Review de source caméra, règle de scène et condition de bascule. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La configuration de test est enregistrée de manière sûre et vérifiable.",
          "alt": "Configurez Multicam Review dans le profil de test - source caméra, règle de scène et condition de bascule"
        }
      },
      "capture": {
        "route": "/plugins/multicam/ui.html",
        "assertVisible": "#saveMappingsBtn",
        "focusText": {
          "de": "Multicam Review im Testprofil konfigurieren",
          "en": "Configure Multicam Review in the test profile",
          "es": "Configura Multicam Review en el perfil de prueba",
          "fr": "Configurez Multicam Review dans le profil de test"
        },
        "action": {
          "type": "save-demo-config",
          "stepId": "multicam-review"
        },
        "expected": {
          "de": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert.",
          "en": "The test configuration is saved safely and can be reviewed.",
          "es": "La configuración de prueba se guarda de forma segura y puede revisarse.",
          "fr": "La configuration de test est enregistrée de manière sûre et vérifiable."
        }
      },
      "workflow": {
        "route": "/plugins/multicam/ui.html",
        "instructions": {
          "de": {
            "title": "Multicam Review im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Multicam Review von Kameraquelle, Szenenregel und Umschaltbedingung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert."
          },
          "en": {
            "title": "Configure Multicam Review in the test profile",
            "body": "Work in the visible Multicam Review area of camera source, scene rule, and switch condition. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The test configuration is saved safely and can be reviewed."
          },
          "es": {
            "title": "Configura Multicam Review en el perfil de prueba",
            "body": "Trabaja en el area visible Multicam Review de fuente de cámara, regla de escena y condición de cambio. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La configuración de prueba se guarda de forma segura y puede revisarse."
          },
          "fr": {
            "title": "Configurez Multicam Review dans le profil de test",
            "body": "Travaillez dans la zone visible Multicam Review de source caméra, règle de scène et condition de bascule. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La configuration de test est enregistrée de manière sûre et vérifiable."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/multicam/ui.html"
          },
          {
            "type": "save-demo-config",
            "selector": "#saveMappingsBtn"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/plugins/multicam/ui.html"
          },
          {
            "type": "visible",
            "selector": "#saveMappingsBtn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#saveMappingsBtn",
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
