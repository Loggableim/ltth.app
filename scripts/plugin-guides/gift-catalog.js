'use strict';

const { exactLocalUrlExpectation } = require('../lib/guide-overlay-entry-points');

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
const guide = {
  "id": "gift-catalog",
  "route": "/plugins/gift-catalog/ui.html",
  "topic": {
    "de": "Geschenkkatalog, Coinschwelle und Beispielzuordnung",
    "en": "gift catalog, coin threshold, and sample mapping",
    "es": "catálogo de regalos, umbral de monedas y asignación de ejemplo",
    "fr": "catalogue de cadeaux, seuil de pièces et mappage d’exemple"
  },
  "test": {
    "de": "einen Katalogfilter mit Demodaten",
    "en": "a catalog filter with demo data",
    "es": "un filtro de catálogo con datos demo",
    "fr": "un filtre de catalogue avec des données démo"
  },
  "expected": {
    "de": "die gefilterte Geschenkauswahl wird angezeigt, ohne LIVE-Daten zu laden",
    "en": "the filtered gift selection is shown without loading LIVE data",
    "es": "la selección filtrada se muestra sin cargar datos LIVE",
    "fr": "la sélection filtrée est affichée sans charger de données LIVE"
  },
  "requirement": "standard",
  "safety": "local",
  "mode": "ui",
  "overlay": null,
  "related": [
    "goals",
    "fireworks"
  ],
  "copy": {
    "de": {
      "title": "Developer Guides",
      "summary": "Developer Guides richtet Geschenkkatalog, Coinschwelle und Beispielzuordnung ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "die gefilterte Geschenkauswahl wird angezeigt, ohne LIVE-Daten zu laden",
      "requirements": "LTTH Dashboard und ein lokales Testprofil. Dieser konkrete Developer Guides-Ablauf behandelt Geschenkkatalog, Coinschwelle und Beispielzuordnung.",
      "safety": "Verwende ausschließlich Demo-Ereignisse und ein temporäres Testprofil. Dieser konkrete Developer Guides-Ablauf behandelt Geschenkkatalog, Coinschwelle und Beispielzuordnung.",
      "troubleshooting": "Wenn Geschenkkatalog, Coinschwelle und Beispielzuordnung nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "goals",
        "fireworks"
      ]
    },
    "en": {
      "title": "Developer Guides",
      "summary": "Developer Guides configures gift catalog, coin threshold, and sample mapping with a safe local check instead of a LIVE trigger.",
      "firstResult": "the filtered gift selection is shown without loading LIVE data",
      "requirements": "LTTH Dashboard and a local test profile. This Developer Guides workflow specifically covers gift catalog, coin threshold, and sample mapping.",
      "safety": "Use demo events and a temporary test profile only. This Developer Guides workflow specifically covers gift catalog, coin threshold, and sample mapping.",
      "troubleshooting": "If gift catalog, coin threshold, and sample mapping is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "goals",
        "fireworks"
      ]
    },
    "es": {
      "title": "Developer Guides",
      "summary": "Developer Guides configura catálogo de regalos, umbral de monedas y asignación de ejemplo mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "la selección filtrada se muestra sin cargar datos LIVE",
      "requirements": "El panel de LTTH y un perfil de prueba local. Este flujo concreto de Developer Guides trata catálogo de regalos, umbral de monedas y asignación de ejemplo.",
      "safety": "Usa solo eventos de demostración y un perfil de prueba temporal. Este flujo concreto de Developer Guides trata catálogo de regalos, umbral de monedas y asignación de ejemplo.",
      "troubleshooting": "Si catálogo de regalos, umbral de monedas y asignación de ejemplo no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "goals",
        "fireworks"
      ]
    },
    "fr": {
      "title": "Developer Guides",
      "summary": "Developer Guides configure catalogue de cadeaux, seuil de pièces et mappage d’exemple avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "la sélection filtrée est affichée sans charger de données LIVE",
      "requirements": "Le tableau de bord LTTH et un profil de test local. Ce flux spécifique de Developer Guides couvre catalogue de cadeaux, seuil de pièces et mappage d’exemple.",
      "safety": "Utilisez uniquement des événements de démonstration et un profil de test temporaire. Ce flux spécifique de Developer Guides couvre catalogue de cadeaux, seuil de pièces et mappage d’exemple.",
      "troubleshooting": "Si catalogue de cadeaux, seuil de pièces et mappage d’exemple n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "goals",
        "fireworks"
      ]
    }
  },
  "steps": [
    {
      "id": "catalog-card",
      "copy": {
        "de": {
          "title": "Catalog Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Catalog Card von Geschenkkatalog, Coinschwelle und Beispielzuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Catalog Card im Testprofil konfigurieren - Geschenkkatalog, Coinschwelle und Beispielzuordnung"
        },
        "en": {
          "title": "Configure Catalog Card in the test profile",
          "body": "Work in the visible Catalog Card area of gift catalog, coin threshold, and sample mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Catalog Card in the test profile - gift catalog, coin threshold, and sample mapping"
        },
        "es": {
          "title": "Configura Catalog Card en el perfil de prueba",
          "body": "Trabaja en el area visible Catalog Card de catálogo de regalos, umbral de monedas y asignación de ejemplo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Catalog Card en el perfil de prueba - catálogo de regalos, umbral de monedas y asignación de ejemplo"
        },
        "fr": {
          "title": "Configurez Catalog Card dans le profil de test",
          "body": "Travaillez dans la zone visible Catalog Card de catalogue de cadeaux, seuil de pièces et mappage d’exemple. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Catalog Card dans le profil de test - catalogue de cadeaux, seuil de pièces et mappage d’exemple"
        }
      },
      "capture": {
        "route": "/plugins/gift-catalog/ui.html",
        "assertVisible": "#config-form",
        "focusText": {
          "de": "Catalog Card im Testprofil konfigurieren",
          "en": "Configure Catalog Card in the test profile",
          "es": "Configura Catalog Card en el perfil de prueba",
          "fr": "Configurez Catalog Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "catalog-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/gift-catalog/ui.html",
        "instructions": {
          "de": {
            "title": "Catalog Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Catalog Card von Geschenkkatalog, Coinschwelle und Beispielzuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Catalog Card in the test profile",
            "body": "Work in the visible Catalog Card area of gift catalog, coin threshold, and sample mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Catalog Card en el perfil de prueba",
            "body": "Trabaja en el area visible Catalog Card de catálogo de regalos, umbral de monedas y asignación de ejemplo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Catalog Card dans le profil de test",
            "body": "Travaillez dans la zone visible Catalog Card de catalogue de cadeaux, seuil de pièces et mappage d’exemple. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/gift-catalog/ui.html"
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
              "path": "/plugins/gift-catalog/ui.html",
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
      "id": "catalog-filter",
      "copy": {
        "de": {
          "title": "Catalog Filter im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Catalog Filter von Geschenkkatalog, Coinschwelle und Beispielzuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Catalog Filter im Testprofil konfigurieren - Geschenkkatalog, Coinschwelle und Beispielzuordnung"
        },
        "en": {
          "title": "Configure Catalog Filter in the test profile",
          "body": "Work in the visible Catalog Filter area of gift catalog, coin threshold, and sample mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Catalog Filter in the test profile - gift catalog, coin threshold, and sample mapping"
        },
        "es": {
          "title": "Configura Catalog Filter en el perfil de prueba",
          "body": "Trabaja en el area visible Catalog Filter de catálogo de regalos, umbral de monedas y asignación de ejemplo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Catalog Filter en el perfil de prueba - catálogo de regalos, umbral de monedas y asignación de ejemplo"
        },
        "fr": {
          "title": "Configurez Catalog Filter dans le profil de test",
          "body": "Travaillez dans la zone visible Catalog Filter de catalogue de cadeaux, seuil de pièces et mappage d’exemple. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Catalog Filter dans le profil de test - catalogue de cadeaux, seuil de pièces et mappage d’exemple"
        }
      },
      "capture": {
        "route": "/plugins/gift-catalog/ui.html",
        "assertVisible": "#app-language",
        "focusText": {
          "de": "Catalog Filter im Testprofil konfigurieren",
          "en": "Configure Catalog Filter in the test profile",
          "es": "Configura Catalog Filter en el perfil de prueba",
          "fr": "Configurez Catalog Filter dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "catalog-filter"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/gift-catalog/ui.html",
        "instructions": {
          "de": {
            "title": "Catalog Filter im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Catalog Filter von Geschenkkatalog, Coinschwelle und Beispielzuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Catalog Filter in the test profile",
            "body": "Work in the visible Catalog Filter area of gift catalog, coin threshold, and sample mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Catalog Filter en el perfil de prueba",
            "body": "Trabaja en el area visible Catalog Filter de catálogo de regalos, umbral de monedas y asignación de ejemplo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Catalog Filter dans le profil de test",
            "body": "Travaillez dans la zone visible Catalog Filter de catalogue de cadeaux, seuil de pièces et mappage d’exemple. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/gift-catalog/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#app-language"
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
              "path": "/plugins/gift-catalog/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#app-language"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#app-language",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "coin-threshold",
      "copy": {
        "de": {
          "title": "Coin Threshold im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Coin Threshold von Geschenkkatalog, Coinschwelle und Beispielzuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "alt": "Coin Threshold im Testprofil konfigurieren - Geschenkkatalog, Coinschwelle und Beispielzuordnung"
        },
        "en": {
          "title": "Configure Coin Threshold in the test profile",
          "body": "Work in the visible Coin Threshold area of gift catalog, coin threshold, and sample mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The demo value is visible and can be reviewed before testing.",
          "alt": "Configure Coin Threshold in the test profile - gift catalog, coin threshold, and sample mapping"
        },
        "es": {
          "title": "Configura Coin Threshold en el perfil de prueba",
          "body": "Trabaja en el area visible Coin Threshold de catálogo de regalos, umbral de monedas y asignación de ejemplo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "El valor demo queda visible y puede revisarse antes de probar.",
          "alt": "Configura Coin Threshold en el perfil de prueba - catálogo de regalos, umbral de monedas y asignación de ejemplo"
        },
        "fr": {
          "title": "Configurez Coin Threshold dans le profil de test",
          "body": "Travaillez dans la zone visible Coin Threshold de catalogue de cadeaux, seuil de pièces et mappage d’exemple. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La valeur démo est visible et peut être vérifiée avant le test.",
          "alt": "Configurez Coin Threshold dans le profil de test - catalogue de cadeaux, seuil de pièces et mappage d’exemple"
        }
      },
      "capture": {
        "route": "/plugins/gift-catalog/ui.html",
        "assertVisible": "#run-refresh-form",
        "focusText": {
          "de": "Coin Threshold im Testprofil konfigurieren",
          "en": "Configure Coin Threshold in the test profile",
          "es": "Configura Coin Threshold en el perfil de prueba",
          "fr": "Configurez Coin Threshold dans le profil de test"
        },
        "action": {
          "type": "set-demo-value",
          "stepId": "coin-threshold"
        },
        "expected": {
          "de": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.",
          "en": "The demo value is visible and can be reviewed before testing.",
          "es": "El valor demo queda visible y puede revisarse antes de probar.",
          "fr": "La valeur démo est visible et peut être vérifiée avant le test."
        }
      },
      "workflow": {
        "route": "/plugins/gift-catalog/ui.html",
        "instructions": {
          "de": {
            "title": "Coin Threshold im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Coin Threshold von Geschenkkatalog, Coinschwelle und Beispielzuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden."
          },
          "en": {
            "title": "Configure Coin Threshold in the test profile",
            "body": "Work in the visible Coin Threshold area of gift catalog, coin threshold, and sample mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The demo value is visible and can be reviewed before testing."
          },
          "es": {
            "title": "Configura Coin Threshold en el perfil de prueba",
            "body": "Trabaja en el area visible Coin Threshold de catálogo de regalos, umbral de monedas y asignación de ejemplo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "El valor demo queda visible y puede revisarse antes de probar."
          },
          "fr": {
            "title": "Configurez Coin Threshold dans le profil de test",
            "body": "Travaillez dans la zone visible Coin Threshold de catalogue de cadeaux, seuil de pièces et mappage d’exemple. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La valeur démo est visible et peut être vérifiée avant le test."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/gift-catalog/ui.html"
          },
          {
            "type": "set-demo-value",
            "selector": "#run-refresh-form"
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
              "path": "/plugins/gift-catalog/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#run-refresh-form"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#run-refresh-form",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "gift-preview",
      "copy": {
        "de": {
          "title": "Gift Preview lokal testen",
          "body": "Fuehre Gift Preview nur mit einen Katalogfilter mit Demodaten im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
          "expected": "die gefilterte Geschenkauswahl wird angezeigt, ohne LIVE-Daten zu laden",
          "alt": "Gift Preview lokal testen - Geschenkkatalog, Coinschwelle und Beispielzuordnung"
        },
        "en": {
          "title": "Test Gift Preview locally",
          "body": "Run Gift Preview only with a catalog filter with demo data in the isolated test profile; no LIVE source, hardware, or external connection is used.",
          "expected": "the filtered gift selection is shown without loading LIVE data",
          "alt": "Test Gift Preview locally - gift catalog, coin threshold, and sample mapping"
        },
        "es": {
          "title": "Prueba Gift Preview localmente",
          "body": "Ejecuta Gift Preview solo con un filtro de catálogo con datos demo en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
          "expected": "la selección filtrada se muestra sin cargar datos LIVE",
          "alt": "Prueba Gift Preview localmente - catálogo de regalos, umbral de monedas y asignación de ejemplo"
        },
        "fr": {
          "title": "Testez Gift Preview localement",
          "body": "Executez Gift Preview uniquement avec un filtre de catalogue avec des données démo dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
          "expected": "la sélection filtrée est affichée sans charger de données LIVE",
          "alt": "Testez Gift Preview localement - catalogue de cadeaux, seuil de pièces et mappage d’exemple"
        }
      },
      "capture": {
        "route": "/plugins/gift-catalog/ui.html",
        "assertVisible": "#catalog-output",
        "focusText": {
          "de": "Gift Preview lokal testen",
          "en": "Test Gift Preview locally",
          "es": "Prueba Gift Preview localmente",
          "fr": "Testez Gift Preview localement"
        },
        "action": {
          "type": "run-local-preview",
          "stepId": "gift-preview"
        },
        "expected": {
          "de": "die gefilterte Geschenkauswahl wird angezeigt, ohne LIVE-Daten zu laden",
          "en": "the filtered gift selection is shown without loading LIVE data",
          "es": "la selección filtrada se muestra sin cargar datos LIVE",
          "fr": "la sélection filtrée est affichée sans charger de données LIVE"
        }
      },
      "workflow": {
        "route": "/plugins/gift-catalog/ui.html",
        "instructions": {
          "de": {
            "title": "Gift Preview lokal testen",
            "body": "Fuehre Gift Preview nur mit einen Katalogfilter mit Demodaten im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.",
            "expected": "die gefilterte Geschenkauswahl wird angezeigt, ohne LIVE-Daten zu laden"
          },
          "en": {
            "title": "Test Gift Preview locally",
            "body": "Run Gift Preview only with a catalog filter with demo data in the isolated test profile; no LIVE source, hardware, or external connection is used.",
            "expected": "the filtered gift selection is shown without loading LIVE data"
          },
          "es": {
            "title": "Prueba Gift Preview localmente",
            "body": "Ejecuta Gift Preview solo con un filtro de catálogo con datos demo en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.",
            "expected": "la selección filtrada se muestra sin cargar datos LIVE"
          },
          "fr": {
            "title": "Testez Gift Preview localement",
            "body": "Executez Gift Preview uniquement avec un filtre de catalogue avec des données démo dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.",
            "expected": "la sélection filtrée est affichée sans charger de données LIVE"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/gift-catalog/ui.html"
          },
          {
            "type": "run-local-preview",
            "selector": "#catalog-output"
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
              "path": "/plugins/gift-catalog/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#catalog-output"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#catalog-output",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "catalog-review",
      "copy": {
        "de": {
          "title": "Catalog Review im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Catalog Review von Geschenkkatalog, Coinschwelle und Beispielzuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert.",
          "alt": "Catalog Review im Testprofil konfigurieren - Geschenkkatalog, Coinschwelle und Beispielzuordnung"
        },
        "en": {
          "title": "Configure Catalog Review in the test profile",
          "body": "Work in the visible Catalog Review area of gift catalog, coin threshold, and sample mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The test configuration is saved safely and can be reviewed.",
          "alt": "Configure Catalog Review in the test profile - gift catalog, coin threshold, and sample mapping"
        },
        "es": {
          "title": "Configura Catalog Review en el perfil de prueba",
          "body": "Trabaja en el area visible Catalog Review de catálogo de regalos, umbral de monedas y asignación de ejemplo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La configuración de prueba se guarda de forma segura y puede revisarse.",
          "alt": "Configura Catalog Review en el perfil de prueba - catálogo de regalos, umbral de monedas y asignación de ejemplo"
        },
        "fr": {
          "title": "Configurez Catalog Review dans le profil de test",
          "body": "Travaillez dans la zone visible Catalog Review de catalogue de cadeaux, seuil de pièces et mappage d’exemple. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La configuration de test est enregistrée de manière sûre et vérifiable.",
          "alt": "Configurez Catalog Review dans le profil de test - catalogue de cadeaux, seuil de pièces et mappage d’exemple"
        }
      },
      "capture": {
        "route": "/plugins/gift-catalog/ui.html",
        "assertVisible": "#connection-state",
        "focusText": {
          "de": "Catalog Review im Testprofil konfigurieren",
          "en": "Configure Catalog Review in the test profile",
          "es": "Configura Catalog Review en el perfil de prueba",
          "fr": "Configurez Catalog Review dans le profil de test"
        },
        "action": {
          "type": "save-demo-config",
          "stepId": "catalog-review"
        },
        "expected": {
          "de": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert.",
          "en": "The test configuration is saved safely and can be reviewed.",
          "es": "La configuración de prueba se guarda de forma segura y puede revisarse.",
          "fr": "La configuration de test est enregistrée de manière sûre et vérifiable."
        }
      },
      "workflow": {
        "route": "/plugins/gift-catalog/ui.html",
        "instructions": {
          "de": {
            "title": "Catalog Review im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Catalog Review von Geschenkkatalog, Coinschwelle und Beispielzuordnung. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert."
          },
          "en": {
            "title": "Configure Catalog Review in the test profile",
            "body": "Work in the visible Catalog Review area of gift catalog, coin threshold, and sample mapping. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The test configuration is saved safely and can be reviewed."
          },
          "es": {
            "title": "Configura Catalog Review en el perfil de prueba",
            "body": "Trabaja en el area visible Catalog Review de catálogo de regalos, umbral de monedas y asignación de ejemplo. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La configuración de prueba se guarda de forma segura y puede revisarse."
          },
          "fr": {
            "title": "Configurez Catalog Review dans le profil de test",
            "body": "Travaillez dans la zone visible Catalog Review de catalogue de cadeaux, seuil de pièces et mappage d’exemple. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La configuration de test est enregistrée de manière sûre et vérifiable."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/gift-catalog/ui.html"
          },
          {
            "type": "save-demo-config",
            "selector": "#connection-state"
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
              "path": "/plugins/gift-catalog/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#connection-state"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#connection-state",
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
    if (!step) throw new Error(`Missing Gift Catalog guide step: ${id}`);
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
  'coin-threshold': {
    selector: '#run-refresh-form',
    action: { type: 'open-plugin-surface' },
    copy: {
      de: { title: 'Lokalen Aktualisierungs-Einstieg pruefen', body: 'Pruefe den Knopf Run current form und den zugehoerigen Hinweis. Fuehre die Aktualisierung nicht aus, weil sie je nach Konfiguration externe Katalogdaten abrufen kann.', expected: 'Der lokale Aktualisierungs-Einstieg ist sichtbar; es wird keine Katalogabfrage gestartet.', alt: 'Lokaler Aktualisierungs-Einstieg des Gift Catalog' },
      en: { title: 'Inspect the local refresh entry point', body: 'Inspect the Run current form button and its related guidance. Do not run the refresh because it can retrieve external catalog data depending on configuration.', expected: 'The local refresh entry point is visible and no catalog request starts.', alt: 'Gift Catalog local refresh entry point' },
      es: { title: 'Revisa el punto de actualizacion local', body: 'Revisa el boton Ejecutar formulario actual y su indicacion relacionada. No ejecutes la actualizacion porque puede obtener datos externos de catalogo segun la configuracion.', expected: 'El punto de actualizacion local es visible y no inicia ninguna solicitud de catalogo.', alt: 'Punto de actualizacion local de Gift Catalog' },
      fr: { title: 'Verifiez le point dentree de rafraichissement local', body: 'Verifiez le bouton Executer le formulaire actuel et son indication associee. Ne lancez pas le rafraichissement car il peut recuperer des donnees de catalogue externes selon la configuration.', expected: 'Le point dentree de rafraichissement local est visible et aucune requete de catalogue ne demarre.', alt: 'Point dentree de rafraichissement local Gift Catalog' }
    }
  }
});

module.exports = Object.freeze(guide);
