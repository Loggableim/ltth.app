'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "gcce",
  "route": "/plugins/gcce/ui.html",
  "topic": {
    "de": "Befehl, Berechtigung und Chat-Antwort",
    "en": "command, permission, and chat response",
    "es": "comando, permiso y respuesta de chat",
    "fr": "commande, autorisation et réponse de chat"
  },
  "test": {
    "de": "einen lokalen Testbefehl",
    "en": "a local test command",
    "es": "un comando de prueba local",
    "fr": "une commande de test locale"
  },
  "expected": {
    "de": "der Befehl wird validiert, ohne eine LIVE-Chatnachricht zu senden",
    "en": "the command is validated without sending a LIVE chat message",
    "es": "el comando se valida sin enviar un mensaje de chat LIVE",
    "fr": "la commande est validée sans envoyer de message de chat LIVE"
  },
  "requirement": "standard",
  "safety": "local",
  "mode": "ui",
  "overlay": null,
  "related": [
    "api-bridge",
    "game-engine"
  ],
  "copy": {
    "de": {
      "title": "Global Chat Command Engine",
      "summary": "Global Chat Command Engine richtet Befehl, Berechtigung und Chat-Antwort ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "der Befehl wird validiert, ohne eine LIVE-Chatnachricht zu senden",
      "requirements": "LTTH Dashboard und ein lokales Testprofil. Dieser konkrete Global Chat Command Engine-Ablauf behandelt Befehl, Berechtigung und Chat-Antwort.",
      "safety": "Verwende ausschließlich Demo-Ereignisse und ein temporäres Testprofil. Dieser konkrete Global Chat Command Engine-Ablauf behandelt Befehl, Berechtigung und Chat-Antwort.",
      "troubleshooting": "Wenn Befehl, Berechtigung und Chat-Antwort nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "api-bridge",
        "game-engine"
      ]
    },
    "en": {
      "title": "Global Chat Command Engine",
      "summary": "Global Chat Command Engine configures command, permission, and chat response with a safe local check instead of a LIVE trigger.",
      "firstResult": "the command is validated without sending a LIVE chat message",
      "requirements": "LTTH Dashboard and a local test profile. This Global Chat Command Engine workflow specifically covers command, permission, and chat response.",
      "safety": "Use demo events and a temporary test profile only. This Global Chat Command Engine workflow specifically covers command, permission, and chat response.",
      "troubleshooting": "If command, permission, and chat response is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "api-bridge",
        "game-engine"
      ]
    },
    "es": {
      "title": "Global Chat Command Engine",
      "summary": "Global Chat Command Engine configura comando, permiso y respuesta de chat mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "el comando se valida sin enviar un mensaje de chat LIVE",
      "requirements": "El panel de LTTH y un perfil de prueba local. Este flujo concreto de Global Chat Command Engine trata comando, permiso y respuesta de chat.",
      "safety": "Usa solo eventos de demostración y un perfil de prueba temporal. Este flujo concreto de Global Chat Command Engine trata comando, permiso y respuesta de chat.",
      "troubleshooting": "Si comando, permiso y respuesta de chat no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "api-bridge",
        "game-engine"
      ]
    },
    "fr": {
      "title": "Global Chat Command Engine",
      "summary": "Global Chat Command Engine configure commande, autorisation et réponse de chat avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "la commande est validée sans envoyer de message de chat LIVE",
      "requirements": "Le tableau de bord LTTH et un profil de test local. Ce flux spécifique de Global Chat Command Engine couvre commande, autorisation et réponse de chat.",
      "safety": "Utilisez uniquement des événements de démonstration et un profil de test temporaire. Ce flux spécifique de Global Chat Command Engine couvre commande, autorisation et réponse de chat.",
      "troubleshooting": "Si commande, autorisation et réponse de chat n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "api-bridge",
        "game-engine"
      ]
    }
  },
  "steps": [
    {
      "id": "command-card",
      "copy": {
        "de": {
          "title": "Command Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Command Card von Befehl, Berechtigung und Chat-Antwort. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Command Card im Testprofil konfigurieren - Befehl, Berechtigung und Chat-Antwort"
        },
        "en": {
          "title": "Configure Command Card in the test profile",
          "body": "Work in the visible Command Card area of command, permission, and chat response. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Command Card in the test profile - command, permission, and chat response"
        },
        "es": {
          "title": "Configura Command Card en el perfil de prueba",
          "body": "Trabaja en el area visible Command Card de comando, permiso y respuesta de chat. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Command Card en el perfil de prueba - comando, permiso y respuesta de chat"
        },
        "fr": {
          "title": "Configurez Command Card dans le profil de test",
          "body": "Travaillez dans la zone visible Command Card de commande, autorisation et réponse de chat. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Command Card dans le profil de test - commande, autorisation et réponse de chat"
        }
      },
      "capture": {
        "route": "/plugins/gcce/ui.html",
        "assertVisible": "#config-form",
        "focusText": {
          "de": "Command Card im Testprofil konfigurieren",
          "en": "Configure Command Card in the test profile",
          "es": "Configura Command Card en el perfil de prueba",
          "fr": "Configurez Command Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "command-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/gcce/ui.html",
        "instructions": {
          "de": {
            "title": "Command Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Command Card von Befehl, Berechtigung und Chat-Antwort. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Command Card in the test profile",
            "body": "Work in the visible Command Card area of command, permission, and chat response. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Command Card en el perfil de prueba",
            "body": "Trabaja en el area visible Command Card de comando, permiso y respuesta de chat. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Command Card dans le profil de test",
            "body": "Travaillez dans la zone visible Command Card de commande, autorisation et réponse de chat. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/gcce/ui.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#config-form"
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
              "path": "/plugins/gcce/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#config-form"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#config-form",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "command-name",
      "copy": {
        "de": {
          "title": "Command Name im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Command Name von Befehl, Berechtigung und Chat-Antwort. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Command Name im Testprofil konfigurieren - Befehl, Berechtigung und Chat-Antwort"
        },
        "en": {
          "title": "Configure Command Name in the test profile",
          "body": "Work in the visible Command Name area of command, permission, and chat response. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Command Name in the test profile - command, permission, and chat response"
        },
        "es": {
          "title": "Configura Command Name en el perfil de prueba",
          "body": "Trabaja en el area visible Command Name de comando, permiso y respuesta de chat. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Command Name en el perfil de prueba - comando, permiso y respuesta de chat"
        },
        "fr": {
          "title": "Configurez Command Name dans le profil de test",
          "body": "Travaillez dans la zone visible Command Name de commande, autorisation et réponse de chat. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Command Name dans le profil de test - commande, autorisation et réponse de chat"
        }
      },
      "capture": {
        "route": "/plugins/gcce/ui.html",
        "assertVisible": "#command-prefix",
        "focusText": {
          "de": "Command Name im Testprofil konfigurieren",
          "en": "Configure Command Name in the test profile",
          "es": "Configura Command Name en el perfil de prueba",
          "fr": "Configurez Command Name dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "command-name"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/gcce/ui.html",
        "instructions": {
          "de": {
            "title": "Command Name im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Command Name von Befehl, Berechtigung und Chat-Antwort. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Command Name in the test profile",
            "body": "Work in the visible Command Name area of command, permission, and chat response. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Command Name en el perfil de prueba",
            "body": "Trabaja en el area visible Command Name de comando, permiso y respuesta de chat. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Command Name dans le profil de test",
            "body": "Travaillez dans la zone visible Command Name de commande, autorisation et réponse de chat. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/gcce/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#command-prefix"
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
              "path": "/plugins/gcce/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#command-prefix"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#command-prefix",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "permission-rule",
      "copy": {
        "de": {
          "title": "Permission Rule im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Permission Rule von Befehl, Berechtigung und Chat-Antwort. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Permission Rule im Testprofil konfigurieren - Befehl, Berechtigung und Chat-Antwort"
        },
        "en": {
          "title": "Configure Permission Rule in the test profile",
          "body": "Work in the visible Permission Rule area of command, permission, and chat response. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Permission Rule in the test profile - command, permission, and chat response"
        },
        "es": {
          "title": "Configura Permission Rule en el perfil de prueba",
          "body": "Trabaja en el area visible Permission Rule de comando, permiso y respuesta de chat. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Permission Rule en el perfil de prueba - comando, permiso y respuesta de chat"
        },
        "fr": {
          "title": "Configurez Permission Rule dans le profil de test",
          "body": "Travaillez dans la zone visible Permission Rule de commande, autorisation et réponse de chat. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Permission Rule dans le profil de test - commande, autorisation et réponse de chat"
        }
      },
      "capture": {
        "route": "/plugins/gcce/ui.html",
        "assertVisible": "#cmd-filter-permission",
        "focusText": {
          "de": "Permission Rule im Testprofil konfigurieren",
          "en": "Configure Permission Rule in the test profile",
          "es": "Configura Permission Rule en el perfil de prueba",
          "fr": "Configurez Permission Rule dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "permission-rule"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/gcce/ui.html",
        "instructions": {
          "de": {
            "title": "Permission Rule im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Permission Rule von Befehl, Berechtigung und Chat-Antwort. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Permission Rule in the test profile",
            "body": "Work in the visible Permission Rule area of command, permission, and chat response. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Permission Rule en el perfil de prueba",
            "body": "Trabaja en el area visible Permission Rule de comando, permiso y respuesta de chat. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Permission Rule dans le profil de test",
            "body": "Travaillez dans la zone visible Permission Rule de commande, autorisation et réponse de chat. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/gcce/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#cmd-filter-permission"
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
              "path": "/plugins/gcce/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#cmd-filter-permission"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#cmd-filter-permission",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "command-dry-run",
      "copy": {
        "de": {
          "title": "Command DRY RUN lokal testen",
          "body": "Fuehre Command DRY RUN nur mit einen lokalen Testbefehl im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "der Befehl wird validiert, ohne eine LIVE-Chatnachricht zu senden",
          "alt": "Command DRY RUN lokal testen - Befehl, Berechtigung und Chat-Antwort"
        },
        "en": {
          "title": "Test Command DRY RUN locally",
          "body": "Run Command DRY RUN only with a local test command in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the command is validated without sending a LIVE chat message",
          "alt": "Test Command DRY RUN locally - command, permission, and chat response"
        },
        "es": {
          "title": "Prueba Command DRY RUN localmente",
          "body": "Ejecuta Command DRY RUN solo con un comando de prueba local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "el comando se valida sin enviar un mensaje de chat LIVE",
          "alt": "Prueba Command DRY RUN localmente - comando, permiso y respuesta de chat"
        },
        "fr": {
          "title": "Testez Command DRY RUN localement",
          "body": "Executez Command DRY RUN uniquement avec une commande de test locale dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "la commande est validée sans envoyer de message de chat LIVE",
          "alt": "Testez Command DRY RUN localement - commande, autorisation et réponse de chat"
        }
      },
      "capture": {
        "route": "/plugins/gcce/ui.html",
        "assertVisible": "#btn-refresh-stats",
        "focusText": {
          "de": "Command DRY RUN lokal testen",
          "en": "Test Command DRY RUN locally",
          "es": "Prueba Command DRY RUN localmente",
          "fr": "Testez Command DRY RUN localement"
        },
        "action": {
          "type": "run-local-preview",
          "stepId": "command-dry-run"
        },
        "expected": {
          "de": "der Befehl wird validiert, ohne eine LIVE-Chatnachricht zu senden",
          "en": "the command is validated without sending a LIVE chat message",
          "es": "el comando se valida sin enviar un mensaje de chat LIVE",
          "fr": "la commande est validée sans envoyer de message de chat LIVE"
        }
      },
      "workflow": {
        "route": "/plugins/gcce/ui.html",
        "instructions": {
          "de": {
            "title": "Command DRY RUN lokal testen",
            "body": "Fuehre Command DRY RUN nur mit einen lokalen Testbefehl im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "der Befehl wird validiert, ohne eine LIVE-Chatnachricht zu senden"
          },
          "en": {
            "title": "Test Command DRY RUN locally",
            "body": "Run Command DRY RUN only with a local test command in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the command is validated without sending a LIVE chat message"
          },
          "es": {
            "title": "Prueba Command DRY RUN localmente",
            "body": "Ejecuta Command DRY RUN solo con un comando de prueba local en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "el comando se valida sin enviar un mensaje de chat LIVE"
          },
          "fr": {
            "title": "Testez Command DRY RUN localement",
            "body": "Executez Command DRY RUN uniquement avec une commande de test locale dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "la commande est validée sans envoyer de message de chat LIVE"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/gcce/ui.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#btn-refresh-stats"
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
              "path": "/plugins/gcce/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#btn-refresh-stats"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#btn-refresh-stats",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "command-review",
      "copy": {
        "de": {
          "title": "Command Review im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Command Review von Befehl, Berechtigung und Chat-Antwort. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert.",
          "alt": "Command Review im Testprofil konfigurieren - Befehl, Berechtigung und Chat-Antwort"
        },
        "en": {
          "title": "Configure Command Review in the test profile",
          "body": "Work in the visible Command Review area of command, permission, and chat response. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The test configuration is saved safely and can be reviewed.",
          "alt": "Configure Command Review in the test profile - command, permission, and chat response"
        },
        "es": {
          "title": "Configura Command Review en el perfil de prueba",
          "body": "Trabaja en el area visible Command Review de comando, permiso y respuesta de chat. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La configuración de prueba se guarda de forma segura y puede revisarse.",
          "alt": "Configura Command Review en el perfil de prueba - comando, permiso y respuesta de chat"
        },
        "fr": {
          "title": "Configurez Command Review dans le profil de test",
          "body": "Travaillez dans la zone visible Command Review de commande, autorisation et réponse de chat. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La configuration de test est enregistrée de manière sûre et vérifiable.",
          "alt": "Configurez Command Review dans le profil de test - commande, autorisation et réponse de chat"
        }
      },
      "capture": {
        "route": "/plugins/gcce/ui.html",
        "assertVisible": "#tab-monitoring",
        "focusText": {
          "de": "Command Review im Testprofil konfigurieren",
          "en": "Configure Command Review in the test profile",
          "es": "Configura Command Review en el perfil de prueba",
          "fr": "Configurez Command Review dans le profil de test"
        },
        "action": {
          "type": "save-demo-config",
          "stepId": "command-review"
        },
        "expected": {
          "de": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert.",
          "en": "The test configuration is saved safely and can be reviewed.",
          "es": "La configuración de prueba se guarda de forma segura y puede revisarse.",
          "fr": "La configuration de test est enregistrée de manière sûre et vérifiable."
        }
      },
      "workflow": {
        "route": "/plugins/gcce/ui.html",
        "instructions": {
          "de": {
            "title": "Command Review im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Command Review von Befehl, Berechtigung und Chat-Antwort. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert."
          },
          "en": {
            "title": "Configure Command Review in the test profile",
            "body": "Work in the visible Command Review area of command, permission, and chat response. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The test configuration is saved safely and can be reviewed."
          },
          "es": {
            "title": "Configura Command Review en el perfil de prueba",
            "body": "Trabaja en el area visible Command Review de comando, permiso y respuesta de chat. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La configuración de prueba se guarda de forma segura y puede revisarse."
          },
          "fr": {
            "title": "Configurez Command Review dans le profil de test",
            "body": "Travaillez dans la zone visible Command Review de commande, autorisation et réponse de chat. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La configuration de test est enregistrée de manière sûre et vérifiable."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/gcce/ui.html"
          },
          {
            "type": "save-demo-config",
            "selector": "#tab-monitoring"
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
              "path": "/plugins/gcce/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#tab-monitoring"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#tab-monitoring",
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
