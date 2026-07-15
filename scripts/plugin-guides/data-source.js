'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "data-source",
  "route": "/plugins/data-source/ui.html",
  "topic": {
    "de": "Datenquelle, Feldzuordnung und Aktualisierungsintervall",
    "en": "data source, field mapping, and refresh interval",
    "es": "fuente de datos, asignación de campos e intervalo de actualización",
    "fr": "source de données, mappage des champs et intervalle de mise à jour"
  },
  "test": {
    "de": "eine lokale Beispieldatenquelle",
    "en": "a local example data source",
    "es": "una fuente de datos de ejemplo local",
    "fr": "une source de données locale d’exemple"
  },
  "expected": {
    "de": "die Vorschau zeigt die Testfelder, ohne einen Fremdserver anzufragen",
    "en": "the preview shows test fields without requesting an external server",
    "es": "la vista previa muestra campos de prueba sin consultar un servidor externo",
    "fr": "l’aperçu affiche les champs de test sans interroger de serveur externe"
  },
  "requirement": "api",
  "safety": "credentials",
  "mode": "ui",
  "overlay": null,
  "related": [
    "api-bridge",
    "streamalchemy"
  ],
  "copy": {
    "de": {
      "title": "Data Source Manager",
      "summary": "Data Source Manager richtet Datenquelle, Feldzuordnung und Aktualisierungsintervall ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "die Vorschau zeigt die Testfelder, ohne einen Fremdserver anzufragen",
      "requirements": "LTTH Dashboard und Zugriff auf die lokale LTTH-URL. Dieser konkrete Data Source Manager-Ablauf behandelt Datenquelle, Feldzuordnung und Aktualisierungsintervall.",
      "safety": "Keine echten API-Schlüssel oder Konten eingeben; Platzhalter bleiben Platzhalter. Dieser konkrete Data Source Manager-Ablauf behandelt Datenquelle, Feldzuordnung und Aktualisierungsintervall.",
      "troubleshooting": "Wenn Datenquelle, Feldzuordnung und Aktualisierungsintervall nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "api-bridge",
        "streamalchemy"
      ]
    },
    "en": {
      "title": "Data Source Manager",
      "summary": "Data Source Manager configures data source, field mapping, and refresh interval with a safe local check instead of a LIVE trigger.",
      "firstResult": "the preview shows test fields without requesting an external server",
      "requirements": "LTTH Dashboard and access to the local LTTH URL. This Data Source Manager workflow specifically covers data source, field mapping, and refresh interval.",
      "safety": "Do not enter real API keys or accounts; placeholders stay placeholders. This Data Source Manager workflow specifically covers data source, field mapping, and refresh interval.",
      "troubleshooting": "If data source, field mapping, and refresh interval is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "api-bridge",
        "streamalchemy"
      ]
    },
    "es": {
      "title": "Data Source Manager",
      "summary": "Data Source Manager configura fuente de datos, asignación de campos e intervalo de actualización mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "la vista previa muestra campos de prueba sin consultar un servidor externo",
      "requirements": "El panel de LTTH y acceso a la URL local de LTTH. Este flujo concreto de Data Source Manager trata fuente de datos, asignación de campos e intervalo de actualización.",
      "safety": "No introduzcas claves API ni cuentas reales; los marcadores siguen siendo marcadores. Este flujo concreto de Data Source Manager trata fuente de datos, asignación de campos e intervalo de actualización.",
      "troubleshooting": "Si fuente de datos, asignación de campos e intervalo de actualización no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "api-bridge",
        "streamalchemy"
      ]
    },
    "fr": {
      "title": "Data Source Manager",
      "summary": "Data Source Manager configure source de données, mappage des champs et intervalle de mise à jour avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "l’aperçu affiche les champs de test sans interroger de serveur externe",
      "requirements": "Le tableau de bord LTTH et l’accès à l’URL locale LTTH. Ce flux spécifique de Data Source Manager couvre source de données, mappage des champs et intervalle de mise à jour.",
      "safety": "Ne saisissez aucune clé API ni compte réel ; les espaces réservés restent des espaces réservés. Ce flux spécifique de Data Source Manager couvre source de données, mappage des champs et intervalle de mise à jour.",
      "troubleshooting": "Si source de données, mappage des champs et intervalle de mise à jour n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "api-bridge",
        "streamalchemy"
      ]
    }
  },
  "steps": [
    {
      "id": "source-card",
      "copy": {
        "de": {
          "title": "Source Card im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Source Card von Datenquelle, Feldzuordnung und Aktualisierungsintervall. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "alt": "Source Card im Testprofil konfigurieren - Datenquelle, Feldzuordnung und Aktualisierungsintervall"
        },
        "en": {
          "title": "Configure Source Card in the test profile",
          "body": "Work in the visible Source Card area of data source, field mapping, and refresh interval. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The relevant plugin surface is visibly identified.",
          "alt": "Configure Source Card in the test profile - data source, field mapping, and refresh interval"
        },
        "es": {
          "title": "Configura Source Card en el perfil de prueba",
          "body": "Trabaja en el area visible Source Card de fuente de datos, asignación de campos e intervalo de actualización. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La superficie correspondiente del plugin queda identificada.",
          "alt": "Configura Source Card en el perfil de prueba - fuente de datos, asignación de campos e intervalo de actualización"
        },
        "fr": {
          "title": "Configurez Source Card dans le profil de test",
          "body": "Travaillez dans la zone visible Source Card de source de données, mappage des champs et intervalle de mise à jour. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La surface de plugin correspondante est clairement visible.",
          "alt": "Configurez Source Card dans le profil de test - source de données, mappage des champs et intervalle de mise à jour"
        }
      },
      "capture": {
        "route": "/plugins/data-source/ui.html",
        "assertVisible": "#card-eulerstream",
        "focusText": {
          "de": "Source Card im Testprofil konfigurieren",
          "en": "Configure Source Card in the test profile",
          "es": "Configura Source Card en el perfil de prueba",
          "fr": "Configurez Source Card dans le profil de test"
        },
        "action": {
          "type": "open-plugin-surface",
          "stepId": "source-card"
        },
        "expected": {
          "de": "Die passende Plugin-Oberfläche ist eindeutig sichtbar.",
          "en": "The relevant plugin surface is visibly identified.",
          "es": "La superficie correspondiente del plugin queda identificada.",
          "fr": "La surface de plugin correspondante est clairement visible."
        }
      },
      "workflow": {
        "route": "/plugins/data-source/ui.html",
        "instructions": {
          "de": {
            "title": "Source Card im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Source Card von Datenquelle, Feldzuordnung und Aktualisierungsintervall. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die passende Plugin-Oberfläche ist eindeutig sichtbar."
          },
          "en": {
            "title": "Configure Source Card in the test profile",
            "body": "Work in the visible Source Card area of data source, field mapping, and refresh interval. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The relevant plugin surface is visibly identified."
          },
          "es": {
            "title": "Configura Source Card en el perfil de prueba",
            "body": "Trabaja en el area visible Source Card de fuente de datos, asignación de campos e intervalo de actualización. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La superficie correspondiente del plugin queda identificada."
          },
          "fr": {
            "title": "Configurez Source Card dans le profil de test",
            "body": "Travaillez dans la zone visible Source Card de source de données, mappage des champs et intervalle de mise à jour. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La surface de plugin correspondante est clairement visible."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/data-source/ui.html"
          },
          {
            "type": "open-plugin-surface",
            "selector": "#card-eulerstream"
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
              "path": "/plugins/data-source/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#card-eulerstream"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#card-eulerstream",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "local-source",
      "copy": {
        "de": {
          "title": "Local Source: lokale TikFinity-Quelle auswaehlen",
          "body": "Klicke auf die echte Karte „TikFinity“. Das waehlt nur die lokale WebSocket-Quelle im isolierten Testprofil; es stellt keine TikTok- oder externe Verbindung her. Für Data Source Manager prüft dieser Schritt ausdrücklich „Local Source: lokale TikFinity-Quelle auswaehlen“.",
          "expected": "Die TikFinity-Einstellungen und der lokale Port sind sichtbar und koennen ohne Verbindung geprueft werden.",
          "alt": "Local Source: lokale TikFinity-Quelle auswaehlen - Datenquelle, Feldzuordnung und Aktualisierungsintervall"
        },
        "en": {
          "title": "Select the local TikFinity source for Local Source",
          "body": "Click the real “TikFinity” card. It selects only the local WebSocket source in the isolated test profile; it does not connect to TikTok or any external service. For Data Source Manager, this step explicitly verifies “Select the local TikFinity source for Local Source”.",
          "expected": "The TikFinity settings and local port are visible and can be reviewed without connecting.",
          "alt": "Select the local TikFinity source for Local Source - data source, field mapping, and refresh interval"
        },
        "es": {
          "title": "Selecciona la fuente local TikFinity para Local Source",
          "body": "Haz clic en la tarjeta real «TikFinity». Solo selecciona la fuente WebSocket local del perfil aislado; no conecta con TikTok ni con un servicio externo. Para Data Source Manager, este paso comprueba expresamente «Selecciona la fuente local TikFinity para Local Source».",
          "expected": "Los ajustes de TikFinity y el puerto local quedan visibles y pueden revisarse sin conectar.",
          "alt": "Selecciona la fuente local TikFinity para Local Source - fuente de datos, asignación de campos e intervalo de actualización"
        },
        "fr": {
          "title": "Selectionnez la source TikFinity locale pour Local Source",
          "body": "Cliquez sur la vraie carte « TikFinity ». Elle selectionne uniquement la source WebSocket locale dans le profil isole ; elle ne se connecte ni a TikTok ni a un service externe. Pour Data Source Manager, cette étape vérifie explicitement « Selectionnez la source TikFinity locale pour Local Source ».",
          "expected": "Les reglages TikFinity et le port local sont visibles et peuvent etre verifies sans connexion.",
          "alt": "Selectionnez la source TikFinity locale pour Local Source - source de données, mappage des champs et intervalle de mise à jour"
        }
      },
      "capture": {
        "route": "/plugins/data-source/ui.html",
        "assertVisible": "#tikfinity-settings-card",
        "focusText": {
          "de": "Local Source: lokale TikFinity-Quelle auswaehlen",
          "en": "Select the local TikFinity source for Local Source",
          "es": "Selecciona la fuente local TikFinity para Local Source",
          "fr": "Selectionnez la source TikFinity locale pour Local Source"
        },
        "action": {
          "type": "select-local-source",
          "allowClick": true,
          "clickSelector": "#card-tikfinity",
          "evidenceSelector": "#tikfinity-settings-card",
          "settleMs": 1000,
          "stepId": "local-source"
        },
        "expected": {
          "de": "Die TikFinity-Einstellungen und der lokale Port sind sichtbar und koennen ohne Verbindung geprueft werden.",
          "en": "The TikFinity settings and local port are visible and can be reviewed without connecting.",
          "es": "Los ajustes de TikFinity y el puerto local quedan visibles y pueden revisarse sin conectar.",
          "fr": "Les reglages TikFinity et le port local sont visibles et peuvent etre verifies sans connexion."
        }
      },
      "workflow": {
        "route": "/plugins/data-source/ui.html",
        "instructions": {
          "de": {
            "title": "Local Source: lokale TikFinity-Quelle auswaehlen",
            "body": "Klicke auf die echte Karte „TikFinity“. Das waehlt nur die lokale WebSocket-Quelle im isolierten Testprofil; es stellt keine TikTok- oder externe Verbindung her. Für Data Source Manager prüft dieser Schritt ausdrücklich „Local Source: lokale TikFinity-Quelle auswaehlen“.",
            "expected": "Die TikFinity-Einstellungen und der lokale Port sind sichtbar und koennen ohne Verbindung geprueft werden."
          },
          "en": {
            "title": "Select the local TikFinity source for Local Source",
            "body": "Click the real “TikFinity” card. It selects only the local WebSocket source in the isolated test profile; it does not connect to TikTok or any external service. For Data Source Manager, this step explicitly verifies “Select the local TikFinity source for Local Source”.",
            "expected": "The TikFinity settings and local port are visible and can be reviewed without connecting."
          },
          "es": {
            "title": "Selecciona la fuente local TikFinity para Local Source",
            "body": "Haz clic en la tarjeta real «TikFinity». Solo selecciona la fuente WebSocket local del perfil aislado; no conecta con TikTok ni con un servicio externo. Para Data Source Manager, este paso comprueba expresamente «Selecciona la fuente local TikFinity para Local Source».",
            "expected": "Los ajustes de TikFinity y el puerto local quedan visibles y pueden revisarse sin conectar."
          },
          "fr": {
            "title": "Selectionnez la source TikFinity locale pour Local Source",
            "body": "Cliquez sur la vraie carte « TikFinity ». Elle selectionne uniquement la source WebSocket locale dans le profil isole ; elle ne se connecte ni a TikTok ni a un service externe. Pour Data Source Manager, cette étape vérifie explicitement « Selectionnez la source TikFinity locale pour Local Source ».",
            "expected": "Les reglages TikFinity et le port local sont visibles et peuvent etre verifies sans connexion."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/data-source/ui.html"
          },
          {
            "type": "select-local-source",
            "selector": "#card-tikfinity"
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
              "path": "/plugins/data-source/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#tikfinity-settings-card"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#tikfinity-settings-card",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "field-map",
      "copy": {
        "de": {
          "title": "Field MAP: lokale TikFinity-Quelle auswaehlen",
          "body": "Klicke auf die echte Karte „TikFinity“. Das waehlt nur die lokale WebSocket-Quelle im isolierten Testprofil; es stellt keine TikTok- oder externe Verbindung her. Für Data Source Manager prüft dieser Schritt ausdrücklich „Field MAP: lokale TikFinity-Quelle auswaehlen“.",
          "expected": "Die TikFinity-Einstellungen und der lokale Port sind sichtbar und koennen ohne Verbindung geprueft werden.",
          "alt": "Field MAP: lokale TikFinity-Quelle auswaehlen - Datenquelle, Feldzuordnung und Aktualisierungsintervall"
        },
        "en": {
          "title": "Select the local TikFinity source for Field MAP",
          "body": "Click the real “TikFinity” card. It selects only the local WebSocket source in the isolated test profile; it does not connect to TikTok or any external service. For Data Source Manager, this step explicitly verifies “Select the local TikFinity source for Field MAP”.",
          "expected": "The TikFinity settings and local port are visible and can be reviewed without connecting.",
          "alt": "Select the local TikFinity source for Field MAP - data source, field mapping, and refresh interval"
        },
        "es": {
          "title": "Selecciona la fuente local TikFinity para Field MAP",
          "body": "Haz clic en la tarjeta real «TikFinity». Solo selecciona la fuente WebSocket local del perfil aislado; no conecta con TikTok ni con un servicio externo. Para Data Source Manager, este paso comprueba expresamente «Selecciona la fuente local TikFinity para Field MAP».",
          "expected": "Los ajustes de TikFinity y el puerto local quedan visibles y pueden revisarse sin conectar.",
          "alt": "Selecciona la fuente local TikFinity para Field MAP - fuente de datos, asignación de campos e intervalo de actualización"
        },
        "fr": {
          "title": "Selectionnez la source TikFinity locale pour Field MAP",
          "body": "Cliquez sur la vraie carte « TikFinity ». Elle selectionne uniquement la source WebSocket locale dans le profil isole ; elle ne se connecte ni a TikTok ni a un service externe. Pour Data Source Manager, cette étape vérifie explicitement « Selectionnez la source TikFinity locale pour Field MAP ».",
          "expected": "Les reglages TikFinity et le port local sont visibles et peuvent etre verifies sans connexion.",
          "alt": "Selectionnez la source TikFinity locale pour Field MAP - source de données, mappage des champs et intervalle de mise à jour"
        }
      },
      "capture": {
        "route": "/plugins/data-source/ui.html",
        "assertVisible": "#tikfinity-port",
        "focusText": {
          "de": "Field MAP: lokale TikFinity-Quelle auswaehlen",
          "en": "Select the local TikFinity source for Field MAP",
          "es": "Selecciona la fuente local TikFinity para Field MAP",
          "fr": "Selectionnez la source TikFinity locale pour Field MAP"
        },
        "action": {
          "type": "select-local-source",
          "allowClick": true,
          "clickSelector": "#card-tikfinity",
          "settleMs": 1000,
          "stepId": "field-map"
        },
        "expected": {
          "de": "Die TikFinity-Einstellungen und der lokale Port sind sichtbar und koennen ohne Verbindung geprueft werden.",
          "en": "The TikFinity settings and local port are visible and can be reviewed without connecting.",
          "es": "Los ajustes de TikFinity y el puerto local quedan visibles y pueden revisarse sin conectar.",
          "fr": "Les reglages TikFinity et le port local sont visibles et peuvent etre verifies sans connexion."
        }
      },
      "workflow": {
        "route": "/plugins/data-source/ui.html",
        "instructions": {
          "de": {
            "title": "Field MAP: lokale TikFinity-Quelle auswaehlen",
            "body": "Klicke auf die echte Karte „TikFinity“. Das waehlt nur die lokale WebSocket-Quelle im isolierten Testprofil; es stellt keine TikTok- oder externe Verbindung her. Für Data Source Manager prüft dieser Schritt ausdrücklich „Field MAP: lokale TikFinity-Quelle auswaehlen“.",
            "expected": "Die TikFinity-Einstellungen und der lokale Port sind sichtbar und koennen ohne Verbindung geprueft werden."
          },
          "en": {
            "title": "Select the local TikFinity source for Field MAP",
            "body": "Click the real “TikFinity” card. It selects only the local WebSocket source in the isolated test profile; it does not connect to TikTok or any external service. For Data Source Manager, this step explicitly verifies “Select the local TikFinity source for Field MAP”.",
            "expected": "The TikFinity settings and local port are visible and can be reviewed without connecting."
          },
          "es": {
            "title": "Selecciona la fuente local TikFinity para Field MAP",
            "body": "Haz clic en la tarjeta real «TikFinity». Solo selecciona la fuente WebSocket local del perfil aislado; no conecta con TikTok ni con un servicio externo. Para Data Source Manager, este paso comprueba expresamente «Selecciona la fuente local TikFinity para Field MAP».",
            "expected": "Los ajustes de TikFinity y el puerto local quedan visibles y pueden revisarse sin conectar."
          },
          "fr": {
            "title": "Selectionnez la source TikFinity locale pour Field MAP",
            "body": "Cliquez sur la vraie carte « TikFinity ». Elle selectionne uniquement la source WebSocket locale dans le profil isole ; elle ne se connecte ni a TikTok ni a un service externe. Pour Data Source Manager, cette étape vérifie explicitement « Selectionnez la source TikFinity locale pour Field MAP ».",
            "expected": "Les reglages TikFinity et le port local sont visibles et peuvent etre verifies sans connexion."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/data-source/ui.html"
          },
          {
            "type": "select-local-source",
            "selector": "#card-tikfinity"
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
              "path": "/plugins/data-source/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#tikfinity-port"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#tikfinity-port",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "data-preview",
      "copy": {
        "de": {
          "title": "Lokalen TikFinity-Port speichern und Rueckmeldung pruefen",
          "body": "Nach der Auswahl von „TikFinity“ klicke auf „Einstellungen speichern“. Der Port wird ausschliesslich im isolierten Testprofil gespeichert; es wird keine TikTok-Verbindung aufgebaut.",
          "expected": "Die echte Erfolgsmeldung bestaetigt die gespeicherten lokalen Einstellungen.",
          "alt": "Lokalen TikFinity-Port speichern und Rueckmeldung pruefen - Datenquelle, Feldzuordnung und Aktualisierungsintervall"
        },
        "en": {
          "title": "Save the local TikFinity port and review the response",
          "body": "After selecting “TikFinity”, click “Save settings”. The port is saved only in the isolated test profile; no TikTok connection is created.",
          "expected": "The real success message confirms the saved local settings.",
          "alt": "Save the local TikFinity port and review the response - data source, field mapping, and refresh interval"
        },
        "es": {
          "title": "Guarda el puerto local de TikFinity y revisa la respuesta",
          "body": "Despues de seleccionar «TikFinity», haz clic en «Guardar configuracion». El puerto se guarda solo en el perfil aislado; no se crea conexion con TikTok.",
          "expected": "El mensaje real de exito confirma los ajustes locales guardados.",
          "alt": "Guarda el puerto local de TikFinity y revisa la respuesta - fuente de datos, asignación de campos e intervalo de actualización"
        },
        "fr": {
          "title": "Enregistrez le port TikFinity local et verifiez la reponse",
          "body": "Apres avoir selectionne « TikFinity », cliquez sur « Enregistrer les reglages ». Le port est enregistre uniquement dans le profil isole ; aucune connexion TikTok n est creee.",
          "expected": "Le vrai message de succes confirme les reglages locaux enregistres.",
          "alt": "Enregistrez le port TikFinity local et verifiez la reponse - source de données, mappage des champs et intervalle de mise à jour"
        }
      },
      "capture": {
        "route": "/plugins/data-source/ui.html",
        "assertVisible": "#btn-save-tikfinity",
        "focusText": {
          "de": "Lokalen TikFinity-Port speichern und Rueckmeldung pruefen",
          "en": "Save the local TikFinity port and review the response",
          "es": "Guarda el puerto local de TikFinity y revisa la respuesta",
          "fr": "Enregistrez le port TikFinity local et verifiez la reponse"
        },
        "action": {
          "type": "save-demo-config",
          "prepare": "select-local-tikfinity",
          "allowClick": true,
          "clickSelector": "#btn-save-tikfinity",
          "evidenceSelector": "#toast",
          "settleMs": 1000,
          "stepId": "data-preview"
        },
        "expected": {
          "de": "Die echte Erfolgsmeldung bestaetigt die gespeicherten lokalen Einstellungen.",
          "en": "The real success message confirms the saved local settings.",
          "es": "El mensaje real de exito confirma los ajustes locales guardados.",
          "fr": "Le vrai message de succes confirme les reglages locaux enregistres."
        }
      },
      "workflow": {
        "route": "/plugins/data-source/ui.html",
        "instructions": {
          "de": {
            "title": "Lokalen TikFinity-Port speichern und Rueckmeldung pruefen",
            "body": "Nach der Auswahl von „TikFinity“ klicke auf „Einstellungen speichern“. Der Port wird ausschliesslich im isolierten Testprofil gespeichert; es wird keine TikTok-Verbindung aufgebaut.",
            "expected": "Die echte Erfolgsmeldung bestaetigt die gespeicherten lokalen Einstellungen."
          },
          "en": {
            "title": "Save the local TikFinity port and review the response",
            "body": "After selecting “TikFinity”, click “Save settings”. The port is saved only in the isolated test profile; no TikTok connection is created.",
            "expected": "The real success message confirms the saved local settings."
          },
          "es": {
            "title": "Guarda el puerto local de TikFinity y revisa la respuesta",
            "body": "Despues de seleccionar «TikFinity», haz clic en «Guardar configuracion». El puerto se guarda solo en el perfil aislado; no se crea conexion con TikTok.",
            "expected": "El mensaje real de exito confirma los ajustes locales guardados."
          },
          "fr": {
            "title": "Enregistrez le port TikFinity local et verifiez la reponse",
            "body": "Apres avoir selectionne « TikFinity », cliquez sur « Enregistrer les reglages ». Le port est enregistre uniquement dans le profil isole ; aucune connexion TikTok n est creee.",
            "expected": "Le vrai message de succes confirme les reglages locaux enregistres."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/data-source/ui.html"
          },
          {
            "type": "prepare",
            "name": "select-local-tikfinity"
          },
          {
            "type": "save-demo-config",
            "selector": "#btn-save-tikfinity"
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
              "path": "/plugins/data-source/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#btn-save-tikfinity"
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
          "selector": "#btn-save-tikfinity",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": true
        }
      }
    },
    {
      "id": "source-review",
      "copy": {
        "de": {
          "title": "Source Review im Testprofil konfigurieren",
          "body": "Arbeite im sichtbaren Bereich Source Review von Datenquelle, Feldzuordnung und Aktualisierungsintervall. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
          "expected": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert.",
          "alt": "Source Review im Testprofil konfigurieren - Datenquelle, Feldzuordnung und Aktualisierungsintervall"
        },
        "en": {
          "title": "Configure Source Review in the test profile",
          "body": "Work in the visible Source Review area of data source, field mapping, and refresh interval. Use local demo values only; never credentials, a device ID, or a LIVE target.",
          "expected": "The test configuration is saved safely and can be reviewed.",
          "alt": "Configure Source Review in the test profile - data source, field mapping, and refresh interval"
        },
        "es": {
          "title": "Configura Source Review en el perfil de prueba",
          "body": "Trabaja en el area visible Source Review de fuente de datos, asignación de campos e intervalo de actualización. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
          "expected": "La configuración de prueba se guarda de forma segura y puede revisarse.",
          "alt": "Configura Source Review en el perfil de prueba - fuente de datos, asignación de campos e intervalo de actualización"
        },
        "fr": {
          "title": "Configurez Source Review dans le profil de test",
          "body": "Travaillez dans la zone visible Source Review de source de données, mappage des champs et intervalle de mise à jour. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
          "expected": "La configuration de test est enregistrée de manière sûre et vérifiable.",
          "alt": "Configurez Source Review dans le profil de test - source de données, mappage des champs et intervalle de mise à jour"
        }
      },
      "capture": {
        "route": "/plugins/data-source/ui.html",
        "assertVisible": "#status-badge",
        "focusText": {
          "de": "Source Review im Testprofil konfigurieren",
          "en": "Configure Source Review in the test profile",
          "es": "Configura Source Review en el perfil de prueba",
          "fr": "Configurez Source Review dans le profil de test"
        },
        "action": {
          "type": "save-demo-config",
          "stepId": "source-review"
        },
        "expected": {
          "de": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert.",
          "en": "The test configuration is saved safely and can be reviewed.",
          "es": "La configuración de prueba se guarda de forma segura y puede revisarse.",
          "fr": "La configuration de test est enregistrée de manière sûre et vérifiable."
        }
      },
      "workflow": {
        "route": "/plugins/data-source/ui.html",
        "instructions": {
          "de": {
            "title": "Source Review im Testprofil konfigurieren",
            "body": "Arbeite im sichtbaren Bereich Source Review von Datenquelle, Feldzuordnung und Aktualisierungsintervall. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.",
            "expected": "Die Testkonfiguration ist nachvollziehbar und sicher gespeichert."
          },
          "en": {
            "title": "Configure Source Review in the test profile",
            "body": "Work in the visible Source Review area of data source, field mapping, and refresh interval. Use local demo values only; never credentials, a device ID, or a LIVE target.",
            "expected": "The test configuration is saved safely and can be reviewed."
          },
          "es": {
            "title": "Configura Source Review en el perfil de prueba",
            "body": "Trabaja en el area visible Source Review de fuente de datos, asignación de campos e intervalo de actualización. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.",
            "expected": "La configuración de prueba se guarda de forma segura y puede revisarse."
          },
          "fr": {
            "title": "Configurez Source Review dans le profil de test",
            "body": "Travaillez dans la zone visible Source Review de source de données, mappage des champs et intervalle de mise à jour. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.",
            "expected": "La configuration de test est enregistrée de manière sûre et vérifiable."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/plugins/data-source/ui.html"
          },
          {
            "type": "save-demo-config",
            "selector": "#status-badge"
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
              "path": "/plugins/data-source/ui.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "#status-badge"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#status-badge",
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

const guide = module.exports;

function correctReviewStep(id, { selector, action, copy, operations }) {
  const step = guide.steps.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`Missing Data Source guide step: ${id}`);
  const focusText = Object.fromEntries(Object.entries(copy).map(([locale, value]) => [locale, value.title]));
  const expected = Object.fromEntries(Object.entries(copy).map(([locale, value]) => [locale, value.expected]));
  step.copy = copy;
  step.capture = {
    ...step.capture,
    assertVisible: selector,
    focusText,
    action: { ...action, stepId: id },
    expected
  };
  step.workflow = {
    ...step.workflow,
    instructions: Object.fromEntries(Object.entries(copy).map(([locale, value]) => [locale, {
      title: value.title,
      body: value.body,
      expected: value.expected
    }])),
    operations,
    postconditions: [
      { type: 'http-status', expected: 200 },
      {
        type: 'url',
        expected: {
          path: '/plugins/data-source/ui.html',
          query: { lang: '$locale' },
          exactQuery: true
        }
      },
      { type: 'visible', selector },
      { type: 'console', expected: 'no-errors' }
    ],
    captureRule: {
      ...step.workflow.captureRule,
      selector,
      stateChange: false
    }
  };
}

correctReviewStep('source-review', {
  selector: '#status-badge',
  action: { type: 'open-plugin-surface' },
  operations: [
    { type: 'goto', route: '/plugins/data-source/ui.html' },
    { type: 'open-plugin-surface', selector: '#status-badge' }
  ],
  copy: {
    de: { title: 'Aktive Datenquelle im Status pruefen', body: 'Lies das sichtbare Status-Badge nach dem lokalen Test. Dieser Schritt speichert nichts und verbindet sich nicht mit TikTok.', expected: 'Die aktive Datenquelle ist sichtbar, ohne eine Einstellung zu schreiben.', alt: 'Aktive Datenquelle im Data-Source-Status' },
    en: { title: 'Inspect the active data source in status', body: 'Read the visible status badge after the local test. This step saves nothing and does not connect to TikTok.', expected: 'The active data source is visible without writing a setting.', alt: 'Active data source in the Data Source status' },
    es: { title: 'Revisa la fuente de datos activa en el estado', body: 'Lee el indicador de estado visible despues de la prueba local. Este paso no guarda nada ni conecta con TikTok.', expected: 'La fuente de datos activa es visible sin escribir una configuracion.', alt: 'Fuente de datos activa en el estado de Data Source' },
    fr: { title: 'Verifiez la source de donnees active dans le statut', body: 'Lisez le badge de statut visible apres le test local. Cette etape n enregistre rien et ne se connecte pas a TikTok.', expected: 'La source de donnees active est visible sans ecrire de reglage.', alt: 'Source de donnees active dans le statut Data Source' }
  }
});
