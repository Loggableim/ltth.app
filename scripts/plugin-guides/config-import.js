'use strict';

const { exactLocalUrlExpectation } = require('../lib/guide-overlay-entry-points');

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
const guide = {
  "id": "config-import",
  "route": "/plugins/config-import/ui.html",
  "topic": {
    "de": "Backup-Datei, Export und Wiederherstellungsprüfung",
    "en": "backup file, export, and restore check",
    "es": "archivo de copia, exportación y comprobación de restauración",
    "fr": "fichier de sauvegarde, export et contrôle de restauration"
  },
  "test": {
    "de": "einen Export in das temporäre Testprofil",
    "en": "an export into the temporary test profile",
    "es": "una exportación al perfil de prueba temporal",
    "fr": "un export dans le profil de test temporaire"
  },
  "expected": {
    "de": "eine Testdatei wird erzeugt, ohne dein Produktivprofil zu überschreiben",
    "en": "a test file is created without overwriting your production profile",
    "es": "se crea un archivo de prueba sin sobrescribir tu perfil de producción",
    "fr": "un fichier de test est créé sans écraser votre profil de production"
  },
  "requirement": "standard",
  "safety": "local",
  "mode": "ui",
  "overlay": null,
  "related": [
    "data-source",
    "store-admin"
  ],
  "copy": {
    "de": {
      "title": "Config Backup & Restore",
      "summary": "Config Backup & Restore richtet Backup-Datei, Export und Wiederherstellungsprüfung ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "eine Testdatei wird erzeugt, ohne dein Produktivprofil zu überschreiben",
      "requirements": "LTTH Dashboard und ein lokales Testprofil. Dieser konkrete Config Backup & Restore-Ablauf behandelt Backup-Datei, Export und Wiederherstellungsprüfung.",
      "safety": "Verwende ausschließlich Demo-Ereignisse und ein temporäres Testprofil. Dieser konkrete Config Backup & Restore-Ablauf behandelt Backup-Datei, Export und Wiederherstellungsprüfung.",
      "troubleshooting": "Wenn Backup-Datei, Export und Wiederherstellungsprüfung nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "data-source",
        "store-admin"
      ]
    },
    "en": {
      "title": "Config Backup & Restore",
      "summary": "Config Backup & Restore configures backup file, export, and restore check with a safe local check instead of a LIVE trigger.",
      "firstResult": "a test file is created without overwriting your production profile",
      "requirements": "LTTH Dashboard and a local test profile. This Config Backup & Restore workflow specifically covers backup file, export, and restore check.",
      "safety": "Use demo events and a temporary test profile only. This Config Backup & Restore workflow specifically covers backup file, export, and restore check.",
      "troubleshooting": "If backup file, export, and restore check is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "data-source",
        "store-admin"
      ]
    },
    "es": {
      "title": "Config Backup & Restore",
      "summary": "Config Backup & Restore configura archivo de copia, exportación y comprobación de restauración mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "se crea un archivo de prueba sin sobrescribir tu perfil de producción",
      "requirements": "El panel de LTTH y un perfil de prueba local. Este flujo concreto de Config Backup & Restore trata archivo de copia, exportación y comprobación de restauración.",
      "safety": "Usa solo eventos de demostración y un perfil de prueba temporal. Este flujo concreto de Config Backup & Restore trata archivo de copia, exportación y comprobación de restauración.",
      "troubleshooting": "Si archivo de copia, exportación y comprobación de restauración no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "data-source",
        "store-admin"
      ]
    },
    "fr": {
      "title": "Config Backup & Restore",
      "summary": "Config Backup & Restore configure fichier de sauvegarde, export et contrôle de restauration avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "un fichier de test est créé sans écraser votre profil de production",
      "requirements": "Le tableau de bord LTTH et un profil de test local. Ce flux spécifique de Config Backup & Restore couvre fichier de sauvegarde, export et contrôle de restauration.",
      "safety": "Utilisez uniquement des événements de démonstration et un profil de test temporaire. Ce flux spécifique de Config Backup & Restore couvre fichier de sauvegarde, export et contrôle de restauration.",
      "troubleshooting": "Si fichier de sauvegarde, export et contrôle de restauration n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "data-source",
        "store-admin"
      ]
    }
  },
  "steps": [
    {
      "id": "backup-card",
      "copy": {
        "de": {
          "title": "Backup Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Backup Card von Backup-Datei, Export und Wiederherstellungsprüfung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Backup Card im Testprofil konfigurieren - Backup-Datei, Export und Wiederherstellungsprüfung"
        },
        "en": {
          "title": "Configure Backup Card in the test profile",
          "body": "Work in the visible Backup Card area of backup file, export, and restore check. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Backup Card in the test profile - backup file, export, and restore check"
        },
        "es": {
          "title": "Configura Backup Card en el perfil de prueba",
          "body": "Trabaja en el area visible Backup Card de archivo de copia, exportación y comprobación de restauración. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Backup Card en el perfil de prueba - archivo de copia, exportación y comprobación de restauración"
        },
        "fr": {
          "title": "Configurez Backup Card dans le profil de test",
          "body": "Travaillez dans la zone visible Backup Card de fichier de sauvegarde, export et contrôle de restauration. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Backup Card dans le profil de test - fichier de sauvegarde, export et contrôle de restauration"
        }
      },
      "capture": {
        "route": "/plugins/config-import/ui.html",
        "assertVisible": "#tab-export",
        "focusText": {
          "de": "Backup Card im Testprofil konfigurieren",
          "en": "Configure Backup Card in the test profile",
          "es": "Configura Backup Card en el perfil de prueba",
          "fr": "Configurez Backup Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "backup-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/config-import/ui.html",
        "instructions": {
          "de": {
            "title": "Backup Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Backup Card von Backup-Datei, Export und Wiederherstellungsprüfung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Backup Card in the test profile",
            "body": "Work in the visible Backup Card area of backup file, export, and restore check. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Backup Card en el perfil de prueba",
            "body": "Trabaja en el area visible Backup Card de archivo de copia, exportación y comprobación de restauración. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Backup Card dans le profil de test",
            "body": "Travaillez dans la zone visible Backup Card de fichier de sauvegarde, export et contrôle de restauration. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/config-import/ui.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#tab-export"
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
              "path": "/plugins/config-import/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#tab-export"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#tab-export",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "export-scope",
      "copy": {
        "de": {
          "title": "Export Scope im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Export Scope von Backup-Datei, Export und Wiederherstellungsprüfung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Export Scope im Testprofil konfigurieren - Backup-Datei, Export und Wiederherstellungsprüfung"
        },
        "en": {
          "title": "Configure Export Scope in the test profile",
          "body": "Work in the visible Export Scope area of backup file, export, and restore check. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Export Scope in the test profile - backup file, export, and restore check"
        },
        "es": {
          "title": "Configura Export Scope en el perfil de prueba",
          "body": "Trabaja en el area visible Export Scope de archivo de copia, exportación y comprobación de restauración. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Export Scope en el perfil de prueba - archivo de copia, exportación y comprobación de restauración"
        },
        "fr": {
          "title": "Configurez Export Scope dans le profil de test",
          "body": "Travaillez dans la zone visible Export Scope de fichier de sauvegarde, export et contrôle de restauration. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Export Scope dans le profil de test - fichier de sauvegarde, export et contrôle de restauration"
        }
      },
      "capture": {
        "route": "/plugins/config-import/ui.html",
        "assertVisible": "#incPluginSettings",
        "focusText": {
          "de": "Export Scope im Testprofil konfigurieren",
          "en": "Configure Export Scope in the test profile",
          "es": "Configura Export Scope en el perfil de prueba",
          "fr": "Configurez Export Scope dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "export-scope"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/config-import/ui.html",
        "instructions": {
          "de": {
            "title": "Export Scope im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Export Scope von Backup-Datei, Export und Wiederherstellungsprüfung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Export Scope in the test profile",
            "body": "Work in the visible Export Scope area of backup file, export, and restore check. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Export Scope en el perfil de prueba",
            "body": "Trabaja en el area visible Export Scope de archivo de copia, exportación y comprobación de restauración. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Export Scope dans le profil de test",
            "body": "Travaillez dans la zone visible Export Scope de fichier de sauvegarde, export et contrôle de restauration. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/config-import/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#incPluginSettings"
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
              "path": "/plugins/config-import/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#incPluginSettings"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#incPluginSettings",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "test-export",
      "copy": {
        "de": {
          "title": "Test Export im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Test Export von Backup-Datei, Export und Wiederherstellungsprüfung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Test Export im Testprofil konfigurieren - Backup-Datei, Export und Wiederherstellungsprüfung"
        },
        "en": {
          "title": "Configure Test Export in the test profile",
          "body": "Work in the visible Test Export area of backup file, export, and restore check. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Test Export in the test profile - backup file, export, and restore check"
        },
        "es": {
          "title": "Configura Test Export en el perfil de prueba",
          "body": "Trabaja en el area visible Test Export de archivo de copia, exportación y comprobación de restauración. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Test Export en el perfil de prueba - archivo de copia, exportación y comprobación de restauración"
        },
        "fr": {
          "title": "Configurez Test Export dans le profil de test",
          "body": "Travaillez dans la zone visible Test Export de fichier de sauvegarde, export et contrôle de restauration. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Test Export dans le profil de test - fichier de sauvegarde, export et contrôle de restauration"
        }
      },
      "capture": {
        "route": "/plugins/config-import/ui.html",
        "assertVisible": "#exportBtn",
        "focusText": {
          "de": "Test Export im Testprofil konfigurieren",
          "en": "Configure Test Export in the test profile",
          "es": "Configura Test Export en el perfil de prueba",
          "fr": "Configurez Test Export dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "test-export"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/config-import/ui.html",
        "instructions": {
          "de": {
            "title": "Test Export im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Test Export von Backup-Datei, Export und Wiederherstellungsprüfung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Test Export in the test profile",
            "body": "Work in the visible Test Export area of backup file, export, and restore check. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Test Export en el perfil de prueba",
            "body": "Trabaja en el area visible Test Export de archivo de copia, exportación y comprobación de restauración. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Test Export dans le profil de test",
            "body": "Travaillez dans la zone visible Test Export de fichier de sauvegarde, export et contrôle de restauration. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/config-import/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#exportBtn"
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
              "path": "/plugins/config-import/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#exportBtn"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#exportBtn",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "restore-inspection",
      "copy": {
        "de": {
          "title": "Restore Inspection im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Restore Inspection von Backup-Datei, Export und Wiederherstellungsprüfung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert.",
          "alt": "Restore Inspection im Testprofil konfigurieren - Backup-Datei, Export und Wiederherstellungsprüfung"
        },
        "en": {
          "title": "Configure Restore Inspection in the test profile",
          "body": "Work in the visible Restore Inspection area of backup file, export, and restore check. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The test configuration is saved safely and can be reviewed.",
          "alt": "Configure Restore Inspection in the test profile - backup file, export, and restore check"
        },
        "es": {
          "title": "Configura Restore Inspection en el perfil de prueba",
          "body": "Trabaja en el area visible Restore Inspection de archivo de copia, exportación y comprobación de restauración. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La configuración de prueba se guarda de forma segura y puede revisarse.",
          "alt": "Configura Restore Inspection en el perfil de prueba - archivo de copia, exportación y comprobación de restauración"
        },
        "fr": {
          "title": "Configurez Restore Inspection dans le profil de test",
          "body": "Travaillez dans la zone visible Restore Inspection de fichier de sauvegarde, export et contrôle de restauration. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La configuration de test est enregistrée de manière sûre et vérifiable.",
          "alt": "Configurez Restore Inspection dans le profil de test - fichier de sauvegarde, export et contrôle de restauration"
        }
      },
      "capture": {
        "route": "/plugins/config-import/ui.html",
        "assertVisible": "#tab-import",
        "focusText": {
          "de": "Restore Inspection im Testprofil konfigurieren",
          "en": "Configure Restore Inspection in the test profile",
          "es": "Configura Restore Inspection en el perfil de prueba",
          "fr": "Configurez Restore Inspection dans le profil de test"
        },
        "action": {
          "type": "save-demo-config",
          "stepId": "restore-inspection"
        },
        "expected": {
          "de": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert.",
          "en": "The test configuration is saved safely and can be reviewed.",
          "es": "La configuración de prueba se guarda de forma segura y puede revisarse.",
          "fr": "La configuration de test est enregistrée de manière sûre et vérifiable."
        }
      },
      "workflow": {
        "route": "/plugins/config-import/ui.html",
        "instructions": {
          "de": {
            "title": "Restore Inspection im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Restore Inspection von Backup-Datei, Export und Wiederherstellungsprüfung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert."
          },
          "en": {
            "title": "Configure Restore Inspection in the test profile",
            "body": "Work in the visible Restore Inspection area of backup file, export, and restore check. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The test configuration is saved safely and can be reviewed."
          },
          "es": {
            "title": "Configura Restore Inspection en el perfil de prueba",
            "body": "Trabaja en el area visible Restore Inspection de archivo de copia, exportación y comprobación de restauración. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La configuración de prueba se guarda de forma segura y puede revisarse."
          },
          "fr": {
            "title": "Configurez Restore Inspection dans le profil de test",
            "body": "Travaillez dans la zone visible Restore Inspection de fichier de sauvegarde, export et contrôle de restauration. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La configuration de test est enregistrée de manière sûre et vérifiable."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/config-import/ui.html"
          },
          {
            "type": "save-demo-config",
            "selector": "#tab-import"
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
              "path": "/plugins/config-import/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#tab-import"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#tab-import",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "backup-cleanup",
      "copy": {
        "de": {
          "title": "Test-Backup erstellen und Ergebnis pruefen",
          "body": "Klicke im isolierten Testprofil auf „Download Backup“. Die Ergebnis-Karte bestaetigt die lokale Test-Sicherung; weder Import noch produktive Daten werden veraendert.",
          "expected": "Die Karte „Backup Created“ zeigt die erstellte Test-Sicherung.",
          "alt": "Test-Backup erstellen und Ergebnis pruefen - Backup-Datei, Export und Wiederherstellungsprüfung"
        },
        "en": {
          "title": "Create a test backup and review the result",
          "body": "In the isolated test profile, click “Download Backup”. The result card confirms the local test backup; neither an import nor production data is changed.",
          "expected": "The “Backup Created” card shows the generated test backup.",
          "alt": "Create a test backup and review the result - backup file, export, and restore check"
        },
        "es": {
          "title": "Crea una copia de prueba y revisa el resultado",
          "body": "En el perfil de prueba aislado, haz clic en «Descargar copia de seguridad». La tarjeta de resultado confirma la copia local; no se modifica ninguna importacion ni dato de produccion.",
          "expected": "La tarjeta «Backup Created» muestra la copia de prueba generada.",
          "alt": "Crea una copia de prueba y revisa el resultado - archivo de copia, exportación y comprobación de restauración"
        },
        "fr": {
          "title": "Creez une sauvegarde de test et verifiez le resultat",
          "body": "Dans le profil de test isole, cliquez sur « Telecharger la sauvegarde ». La carte de resultat confirme la sauvegarde locale ; aucun import ni donnees de production ne sont modifies.",
          "expected": "La carte « Backup Created » affiche la sauvegarde de test generee.",
          "alt": "Creez une sauvegarde de test et verifiez le resultat - fichier de sauvegarde, export et contrôle de restauration"
        }
      },
      "capture": {
        "route": "/plugins/config-import/ui.html",
        "assertVisible": "#exportResultCard",
        "focusText": {
          "de": "Test-Backup erstellen und Ergebnis pruefen",
          "en": "Create a test backup and review the result",
          "es": "Crea una copia de prueba y revisa el resultado",
          "fr": "Creez une sauvegarde de test et verifiez le resultat"
        },
        "action": {
          "type": "save-demo-config",
          "allowClick": true,
          "clickSelector": "#exportBtn",
          "evidenceSelector": "#exportResultCard",
          "settleMs": 1000,
          "stepId": "backup-cleanup"
        },
        "expected": {
          "de": "Die Karte „Backup Created“ zeigt die erstellte Test-Sicherung.",
          "en": "The “Backup Created” card shows the generated test backup.",
          "es": "La tarjeta «Backup Created» muestra la copia de prueba generada.",
          "fr": "La carte « Backup Created » affiche la sauvegarde de test generee."
        }
      },
      "workflow": {
        "route": "/plugins/config-import/ui.html",
        "instructions": {
          "de": {
            "title": "Test-Backup erstellen und Ergebnis pruefen",
            "body": "Klicke im isolierten Testprofil auf „Download Backup“. Die Ergebnis-Karte bestaetigt die lokale Test-Sicherung; weder Import noch produktive Daten werden veraendert.",
            "expected": "Die Karte „Backup Created“ zeigt die erstellte Test-Sicherung."
          },
          "en": {
            "title": "Create a test backup and review the result",
            "body": "In the isolated test profile, click “Download Backup”. The result card confirms the local test backup; neither an import nor production data is changed.",
            "expected": "The “Backup Created” card shows the generated test backup."
          },
          "es": {
            "title": "Crea una copia de prueba y revisa el resultado",
            "body": "En el perfil de prueba aislado, haz clic en «Descargar copia de seguridad». La tarjeta de resultado confirma la copia local; no se modifica ninguna importacion ni dato de produccion.",
            "expected": "La tarjeta «Backup Created» muestra la copia de prueba generada."
          },
          "fr": {
            "title": "Creez une sauvegarde de test et verifiez le resultat",
            "body": "Dans le profil de test isole, cliquez sur « Telecharger la sauvegarde ». La carte de resultat confirme la sauvegarde locale ; aucun import ni donnees de production ne sont modifies.",
            "expected": "La carte « Backup Created » affiche la sauvegarde de test generee."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/config-import/ui.html"
          },
          {
            "type": "save-demo-config",
            "selector": "#exportBtn"
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
              "path": "/plugins/config-import/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#exportResultCard"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#exportResultCard",
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
    if (!step) throw new Error(`Missing Config Import guide step: ${id}`);
    const focusText = Object.fromEntries(Object.entries(correction.copy).map(([locale, copy]) => [locale, copy.title]));
    const expected = Object.fromEntries(Object.entries(correction.copy).map(([locale, copy]) => [locale, copy.expected]));
    step.copy = correction.copy;
    step.capture = { ...step.capture, assertVisible: correction.selector, focusText, action: { ...correction.action, stepId: id }, expected };
    step.workflow = {
      ...step.workflow,
      instructions: Object.fromEntries(Object.entries(correction.copy).map(([locale, copy]) => [locale, { title: copy.title, body: copy.body, expected: copy.expected }])),
      operations: [{ type: 'goto', route: step.capture.route }, { type: correction.action.type, selector: correction.selector }],
      postconditions: [
        { type: 'http-status', expected: 200 },
        { type: 'url', expected: exactLocalUrlExpectation(step.capture.route) },
        { type: 'visible', selector: correction.selector },
        { type: 'console', expected: 'no-errors' }
      ],
      captureRule: { ...step.workflow.captureRule, selector: correction.selector, stateChange: false }
    };
  }
}

applyWorkflowCorrections({
  'restore-inspection': {
    selector: '#tab-import',
    action: { type: 'open-plugin-surface' },
    copy: {
      de: { title: 'Import-Tab ohne Wiederherstellung pruefen', body: 'Oeffne den echten Import-Tab und lies die Upload- und Vorschauhinweise. Waehle keine Datei und starte keine Wiederherstellung.', expected: 'Der sichtbare Import-Tab erklaert den sicheren Vorschauweg, ohne Daten zu veraendern.', alt: 'Import-Tab von Config Import ohne Wiederherstellung' },
      en: { title: 'Inspect the Import tab without restoring', body: 'Open the real Import tab and review its upload and preview guidance. Do not choose a file or start a restore.', expected: 'The visible Import tab explains the safe preview path without changing data.', alt: 'Config Import tab without a restore' },
      es: { title: 'Revisa la pestana Importar sin restaurar', body: 'Abre la pestana real Importar y revisa las indicaciones de carga y vista previa. No elijas un archivo ni inicies una restauracion.', expected: 'La pestana Importar visible explica la vista previa segura sin cambiar datos.', alt: 'Pestana Importar de Config Import sin restauracion' },
      fr: { title: 'Verifiez l onglet Importer sans restaurer', body: 'Ouvrez le vrai onglet Importer et lisez les indications de televersement et d apercu. Ne choisissez aucun fichier et ne lancez aucune restauration.', expected: 'L onglet Importer visible explique le parcours d apercu sur sans modifier de donnees.', alt: 'Onglet Importer de Config Import sans restauration' }
    }
  },
  'test-export': {
    selector: '#exportBtn',
    action: { type: 'open-plugin-surface' },
    copy: {
      de: { title: 'Backup-Download vor dem Export pruefen', body: 'Pruefe den Download-Backup-Knopf und die zuvor gewaehlten Kategorien. Erzeuge in diesem Schritt keine Datei und lade keine Sicherung hoch.', expected: 'Der echte lokale Export-Einstieg ist sichtbar, ohne Daten zu schreiben oder herunterzuladen.', alt: 'Lokaler Export-Einstieg von Config Import' },
      en: { title: 'Inspect backup download before export', body: 'Inspect the Download Backup button and the categories selected before it. This step creates no file and uploads no backup.', expected: 'The real local export entry point is visible without writing or downloading data.', alt: 'Config Import local export entry point' },
      es: { title: 'Revisa la descarga de copia antes de exportar', body: 'Revisa el boton Descargar copia y las categorias elegidas antes de el. Este paso no crea archivos ni sube una copia.', expected: 'El punto de entrada de exportacion local real es visible sin escribir ni descargar datos.', alt: 'Punto de entrada local de exportacion de Config Import' },
      fr: { title: 'Verifiez le telechargement de sauvegarde avant export', body: 'Verifiez le bouton Telecharger la sauvegarde et les categories choisies avant lui. Cette etape ne cree aucun fichier et nenvoie aucune sauvegarde.', expected: 'Le vrai point dentree dexport local est visible sans ecrire ni telecharger de donnees.', alt: 'Point dentree dexport local Config Import' }
    }
  }
});

module.exports = Object.freeze(guide);
