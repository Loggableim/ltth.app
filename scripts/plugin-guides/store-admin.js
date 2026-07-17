'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "store-admin",
  "route": "/dashboard.html?view=plugins",
  "topic": {
    "de": "Store-Ansicht, Quellenfreigabe und Paketstatus",
    "en": "store view, source approval, and package status",
    "es": "vista de tienda, aprobación de fuentes y estado de paquetes",
    "fr": "vue du store, approbation des sources et état des paquets"
  },
  "test": {
    "de": "die lokale Store-Ansicht ohne Community-Quelle",
    "en": "the local store view without a community source",
    "es": "la vista de tienda local sin fuente comunitaria",
    "fr": "la vue locale du store sans source communautaire"
  },
  "expected": {
    "de": "der Store zeigt den sicheren Standardzustand; keine Quelle wird aktiviert",
    "en": "the store shows the safe default state; no source is enabled",
    "es": "la tienda muestra el estado seguro predeterminado; no se activa ninguna fuente",
    "fr": "le store affiche l’état sûr par défaut ; aucune source n’est activée"
  },
  "requirement": "api",
  "safety": "credentials",
  "mode": "admin",
  "overlay": null,
  "related": [
    "config-import",
    "api-bridge"
  ],
  "copy": {
    "de": {
      "title": "LTTH App Store Admin",
      "summary": "LTTH App Store Admin richtet Store-Ansicht, Quellenfreigabe und Paketstatus ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "der Store zeigt den sicheren Standardzustand; keine Quelle wird aktiviert",
      "requirements": "LTTH Dashboard und Zugriff auf die lokale LTTH-URL. Dieser konkrete LTTH App Store Admin-Ablauf behandelt Store-Ansicht, Quellenfreigabe und Paketstatus.",
      "safety": "Keine echten API-Schlüssel oder Konten eingeben; Platzhalter bleiben Platzhalter. Dieser konkrete LTTH App Store Admin-Ablauf behandelt Store-Ansicht, Quellenfreigabe und Paketstatus.",
      "troubleshooting": "Wenn Store-Ansicht, Quellenfreigabe und Paketstatus nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "config-import",
        "api-bridge"
      ]
    },
    "en": {
      "title": "LTTH App Store Admin",
      "summary": "LTTH App Store Admin configures store view, source approval, and package status with a safe local check instead of a LIVE trigger.",
      "firstResult": "the store shows the safe default state; no source is enabled",
      "requirements": "LTTH Dashboard and access to the local LTTH URL. This LTTH App Store Admin workflow specifically covers store view, source approval, and package status.",
      "safety": "Do not enter real API keys or accounts; placeholders stay placeholders. This LTTH App Store Admin workflow specifically covers store view, source approval, and package status.",
      "troubleshooting": "If store view, source approval, and package status is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "config-import",
        "api-bridge"
      ]
    },
    "es": {
      "title": "LTTH App Store Admin",
      "summary": "LTTH App Store Admin configura vista de tienda, aprobación de fuentes y estado de paquetes mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "la tienda muestra el estado seguro predeterminado; no se activa ninguna fuente",
      "requirements": "El panel de LTTH y acceso a la URL local de LTTH. Este flujo concreto de LTTH App Store Admin trata vista de tienda, aprobación de fuentes y estado de paquetes.",
      "safety": "No introduzcas claves API ni cuentas reales; los marcadores siguen siendo marcadores. Este flujo concreto de LTTH App Store Admin trata vista de tienda, aprobación de fuentes y estado de paquetes.",
      "troubleshooting": "Si vista de tienda, aprobación de fuentes y estado de paquetes no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "config-import",
        "api-bridge"
      ]
    },
    "fr": {
      "title": "LTTH App Store Admin",
      "summary": "LTTH App Store Admin configure vue du store, approbation des sources et état des paquets avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "le store affiche l’état sûr par défaut ; aucune source n’est activée",
      "requirements": "Le tableau de bord LTTH et l’accès à l’URL locale LTTH. Ce flux spécifique de LTTH App Store Admin couvre vue du store, approbation des sources et état des paquets.",
      "safety": "Ne saisissez aucune clé API ni compte réel ; les espaces réservés restent des espaces réservés. Ce flux spécifique de LTTH App Store Admin couvre vue du store, approbation des sources et état des paquets.",
      "troubleshooting": "Si vue du store, approbation des sources et état des paquets n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "config-import",
        "api-bridge"
      ]
    }
  },
  "steps": [
    {
      "id": "store-card",
      "copy": {
        "de": {
          "title": "Store im abgemeldeten Ausgangszustand oeffnen",
          "body": "Oeffne Plugins im Dashboard. Ohne LTTH-Konto zeigt der Store bewusst den echten Account-Dialog statt einer Paketliste; es wird keine Quelle aktiviert.",
          "expected": "Der echte Account-Dialog ist sichtbar und es werden keine Pakete oder Quellen veraendert.",
          "alt": "Store im abgemeldeten Ausgangszustand oeffnen - Store-Ansicht, Quellenfreigabe und Paketstatus"
        },
        "en": {
          "title": "Open the Store in its signed-out starting state",
          "body": "Open Plugins in the dashboard. Without an LTTH account, the Store deliberately shows the real account dialog rather than a package list; no source is enabled.",
          "expected": "The real account dialog is visible and no package or source has changed.",
          "alt": "Open the Store in its signed-out starting state - store view, source approval, and package status"
        },
        "es": {
          "title": "Abre la tienda en su estado inicial sin sesion",
          "body": "Abre Plugins en el panel. Sin una cuenta LTTH, la tienda muestra deliberadamente el dialogo real de cuenta en lugar de una lista de paquetes; no se activa ninguna fuente.",
          "expected": "El dialogo real de cuenta queda visible y no cambia ningun paquete ni fuente.",
          "alt": "Abre la tienda en su estado inicial sin sesion - vista de tienda, aprobación de fuentes y estado de paquetes"
        },
        "fr": {
          "title": "Ouvrez le Store dans son etat initial deconnecte",
          "body": "Ouvrez Plugins dans le tableau de bord. Sans compte LTTH, le Store affiche volontairement le vrai dialogue de compte au lieu dune liste de paquets ; aucune source nest activee.",
          "expected": "Le vrai dialogue de compte est visible et aucun paquet ni source na change.",
          "alt": "Ouvrez le Store dans son etat initial deconnecte - vue du store, approbation des sources et état des paquets"
        }
      },
      "capture": {
        "route": "/dashboard.html",
        "assertVisible": ".plugin-store-mode-tabs",
        "focusText": {
          "de": "Store im abgemeldeten Ausgangszustand oeffnen",
          "en": "Open the Store in its signed-out starting state",
          "es": "Abre la tienda en su estado inicial sin sesion",
          "fr": "Ouvrez le Store dans son etat initial deconnecte"
        },
        "action": {
          "type": "inspect-safe-store-state",
          "prepare": "open-store-admin-view",
          "stepId": "store-card"
        },
        "expected": {
          "de": "Der echte Account-Dialog ist sichtbar und es werden keine Pakete oder Quellen veraendert.",
          "en": "The real account dialog is visible and no package or source has changed.",
          "es": "El dialogo real de cuenta queda visible y no cambia ningun paquete ni fuente.",
          "fr": "Le vrai dialogue de compte est visible et aucun paquet ni source na change."
        }
      },
      "workflow": {
        "route": "/dashboard.html",
        "instructions": {
          "de": {
            "title": "Store im abgemeldeten Ausgangszustand oeffnen",
            "body": "Oeffne Plugins im Dashboard. Ohne LTTH-Konto zeigt der Store bewusst den echten Account-Dialog statt einer Paketliste; es wird keine Quelle aktiviert.",
            "expected": "Der echte Account-Dialog ist sichtbar und es werden keine Pakete oder Quellen veraendert."
          },
          "en": {
            "title": "Open the Store in its signed-out starting state",
            "body": "Open Plugins in the dashboard. Without an LTTH account, the Store deliberately shows the real account dialog rather than a package list; no source is enabled.",
            "expected": "The real account dialog is visible and no package or source has changed."
          },
          "es": {
            "title": "Abre la tienda en su estado inicial sin sesion",
            "body": "Abre Plugins en el panel. Sin una cuenta LTTH, la tienda muestra deliberadamente el dialogo real de cuenta en lugar de una lista de paquetes; no se activa ninguna fuente.",
            "expected": "El dialogo real de cuenta queda visible y no cambia ningun paquete ni fuente."
          },
          "fr": {
            "title": "Ouvrez le Store dans son etat initial deconnecte",
            "body": "Ouvrez Plugins dans le tableau de bord. Sans compte LTTH, le Store affiche volontairement le vrai dialogue de compte au lieu dune liste de paquets ; aucune source nest activee.",
            "expected": "Le vrai dialogue de compte est visible et aucun paquet ni source na change."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/dashboard.html"
          },
          {
            "type": "prepare",
            "name": "open-store-admin-view"
          },
          {
            "type": "inspect-safe-store-state",
            "selector": ".plugin-store-mode-tabs"
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
              "path": "/dashboard.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": ".plugin-store-mode-tabs"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": ".plugin-store-mode-tabs",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "official-source",
      "copy": {
        "de": {
          "title": "Vor der offiziellen Paketliste sicher anmelden",
          "body": "Klicke erst nach einer bewussten Entscheidung auf „Sign in“. Der Account-Bridge oeffnet ltth.app und kehrt danach zur lokalen App zurueck; diese Anleitung zeigt keine erfundene Paketquelle vor der Anmeldung.",
          "expected": "Der echte Sign-in-Einstieg ist sichtbar, ohne den externen Login auszufuehren.",
          "alt": "Vor der offiziellen Paketliste sicher anmelden - Store-Ansicht, Quellenfreigabe und Paketstatus"
        },
        "en": {
          "title": "Sign in safely before browsing official packages",
          "body": "Click “Sign in” only after a deliberate decision. The account bridge opens ltth.app and then returns to the local app; this guide does not invent a package source before sign-in.",
          "expected": "The real sign-in entry point is visible without performing the external login.",
          "alt": "Sign in safely before browsing official packages - store view, source approval, and package status"
        },
        "es": {
          "title": "Inicia sesion de forma segura antes de ver paquetes oficiales",
          "body": "Haz clic en «Sign in» solo tras decidirlo conscientemente. El puente de cuenta abre ltth.app y luego vuelve a la aplicacion local; esta guia no inventa una fuente de paquetes antes de iniciar sesion.",
          "expected": "La entrada real de inicio de sesion queda visible sin ejecutar el login externo.",
          "alt": "Inicia sesion de forma segura antes de ver paquetes oficiales - vista de tienda, aprobación de fuentes y estado de paquetes"
        },
        "fr": {
          "title": "Connectez-vous en securite avant de parcourir les paquets officiels",
          "body": "Cliquez sur « Sign in » seulement apres une decision consciente. Le bridge de compte ouvre ltth.app puis revient vers l application locale ; ce guide ninvente pas de source de paquets avant connexion.",
          "expected": "Le vrai point dentree de connexion est visible sans effectuer le login externe.",
          "alt": "Connectez-vous en securite avant de parcourir les paquets officiels - vue du store, approbation des sources et état des paquets"
        }
      },
      "capture": {
        "route": "/dashboard.html",
        "assertVisible": ".plugin-store-auth-card",
        "focusText": {
          "de": "Vor der offiziellen Paketliste sicher anmelden",
          "en": "Sign in safely before browsing official packages",
          "es": "Inicia sesion de forma segura antes de ver paquetes oficiales",
          "fr": "Connectez-vous en securite avant de parcourir les paquets officiels"
        },
        "action": {
          "type": "inspect-safe-store-state",
          "prepare": "open-store-admin-view",
          "stepId": "official-source"
        },
        "expected": {
          "de": "Der echte Sign-in-Einstieg ist sichtbar, ohne den externen Login auszufuehren.",
          "en": "The real sign-in entry point is visible without performing the external login.",
          "es": "La entrada real de inicio de sesion queda visible sin ejecutar el login externo.",
          "fr": "Le vrai point dentree de connexion est visible sans effectuer le login externe."
        }
      },
      "workflow": {
        "route": "/dashboard.html",
        "instructions": {
          "de": {
            "title": "Vor der offiziellen Paketliste sicher anmelden",
            "body": "Klicke erst nach einer bewussten Entscheidung auf „Sign in“. Der Account-Bridge oeffnet ltth.app und kehrt danach zur lokalen App zurueck; diese Anleitung zeigt keine erfundene Paketquelle vor der Anmeldung.",
            "expected": "Der echte Sign-in-Einstieg ist sichtbar, ohne den externen Login auszufuehren."
          },
          "en": {
            "title": "Sign in safely before browsing official packages",
            "body": "Click “Sign in” only after a deliberate decision. The account bridge opens ltth.app and then returns to the local app; this guide does not invent a package source before sign-in.",
            "expected": "The real sign-in entry point is visible without performing the external login."
          },
          "es": {
            "title": "Inicia sesion de forma segura antes de ver paquetes oficiales",
            "body": "Haz clic en «Sign in» solo tras decidirlo conscientemente. El puente de cuenta abre ltth.app y luego vuelve a la aplicacion local; esta guia no inventa una fuente de paquetes antes de iniciar sesion.",
            "expected": "La entrada real de inicio de sesion queda visible sin ejecutar el login externo."
          },
          "fr": {
            "title": "Connectez-vous en securite avant de parcourir les paquets officiels",
            "body": "Cliquez sur « Sign in » seulement apres une decision consciente. Le bridge de compte ouvre ltth.app puis revient vers l application locale ; ce guide ninvente pas de source de paquets avant connexion.",
            "expected": "Le vrai point dentree de connexion est visible sans effectuer le login externe."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/dashboard.html"
          },
          {
            "type": "prepare",
            "name": "open-store-admin-view"
          },
          {
            "type": "inspect-safe-store-state",
            "selector": ".plugin-store-auth-card"
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
              "path": "/dashboard.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": ".plugin-store-auth-card"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": ".plugin-store-auth-card",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "package-status",
      "copy": {
        "de": {
          "title": "Paketstatus erst nach erfolgreicher Anmeldung erwarten",
          "body": "Im abgemeldeten Zustand zeigt der Store keinen Paketstatus und keine Suchliste. Melde dich an und kehre zur lokalen App zurueck, bevor du Installations- oder Update-Status bewertest.",
          "expected": "Der sichtbare Sign-in-Button erklaert, warum noch kein Paketstatus angezeigt wird.",
          "alt": "Paketstatus erst nach erfolgreicher Anmeldung erwarten - Store-Ansicht, Quellenfreigabe und Paketstatus"
        },
        "en": {
          "title": "Expect package status only after successful sign-in",
          "body": "While signed out, the Store shows neither package status nor a search list. Sign in and return to the local app before assessing installation or update status.",
          "expected": "The visible Sign in button explains why no package status is shown yet.",
          "alt": "Expect package status only after successful sign-in - store view, source approval, and package status"
        },
        "es": {
          "title": "Espera el estado de paquetes solo despues de iniciar sesion",
          "body": "Sin sesion, la tienda no muestra estado de paquetes ni lista de busqueda. Inicia sesion y vuelve a la aplicacion local antes de evaluar instalaciones o actualizaciones.",
          "expected": "El boton Sign in visible explica por que aun no se muestra estado de paquetes.",
          "alt": "Espera el estado de paquetes solo despues de iniciar sesion - vista de tienda, aprobación de fuentes y estado de paquetes"
        },
        "fr": {
          "title": "Attendez letat des paquets seulement apres une connexion reussie",
          "body": "Lorsque vous etes deconnecte, le Store naffiche ni etat de paquet ni liste de recherche. Connectez-vous et revenez a l application locale avant devaluer installations ou mises a jour.",
          "expected": "Le bouton Sign in visible explique pourquoi aucun etat de paquet nest encore affiche.",
          "alt": "Attendez letat des paquets seulement apres une connexion reussie - vue du store, approbation des sources et état des paquets"
        }
      },
      "capture": {
        "route": "/dashboard.html",
        "assertVisible": "[data-store-auth-mode=\"sign-in\"]",
        "focusText": {
          "de": "Paketstatus erst nach erfolgreicher Anmeldung erwarten",
          "en": "Expect package status only after successful sign-in",
          "es": "Espera el estado de paquetes solo despues de iniciar sesion",
          "fr": "Attendez letat des paquets seulement apres une connexion reussie"
        },
        "action": {
          "type": "inspect-safe-store-state",
          "prepare": "open-store-admin-view",
          "stepId": "package-status"
        },
        "expected": {
          "de": "Der sichtbare Sign-in-Button erklaert, warum noch kein Paketstatus angezeigt wird.",
          "en": "The visible Sign in button explains why no package status is shown yet.",
          "es": "El boton Sign in visible explica por que aun no se muestra estado de paquetes.",
          "fr": "Le bouton Sign in visible explique pourquoi aucun etat de paquet nest encore affiche."
        }
      },
      "workflow": {
        "route": "/dashboard.html",
        "instructions": {
          "de": {
            "title": "Paketstatus erst nach erfolgreicher Anmeldung erwarten",
            "body": "Im abgemeldeten Zustand zeigt der Store keinen Paketstatus und keine Suchliste. Melde dich an und kehre zur lokalen App zurueck, bevor du Installations- oder Update-Status bewertest.",
            "expected": "Der sichtbare Sign-in-Button erklaert, warum noch kein Paketstatus angezeigt wird."
          },
          "en": {
            "title": "Expect package status only after successful sign-in",
            "body": "While signed out, the Store shows neither package status nor a search list. Sign in and return to the local app before assessing installation or update status.",
            "expected": "The visible Sign in button explains why no package status is shown yet."
          },
          "es": {
            "title": "Espera el estado de paquetes solo despues de iniciar sesion",
            "body": "Sin sesion, la tienda no muestra estado de paquetes ni lista de busqueda. Inicia sesion y vuelve a la aplicacion local antes de evaluar instalaciones o actualizaciones.",
            "expected": "El boton Sign in visible explica por que aun no se muestra estado de paquetes."
          },
          "fr": {
            "title": "Attendez letat des paquets seulement apres une connexion reussie",
            "body": "Lorsque vous etes deconnecte, le Store naffiche ni etat de paquet ni liste de recherche. Connectez-vous et revenez a l application locale avant devaluer installations ou mises a jour.",
            "expected": "Le bouton Sign in visible explique pourquoi aucun etat de paquet nest encore affiche."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/dashboard.html"
          },
          {
            "type": "prepare",
            "name": "open-store-admin-view"
          },
          {
            "type": "inspect-safe-store-state",
            "selector": "[data-store-auth-mode=\"sign-in\"]"
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
              "path": "/dashboard.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "[data-store-auth-mode=\"sign-in\"]"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "[data-store-auth-mode=\"sign-in\"]",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "store-inspection",
      "copy": {
        "de": {
          "title": "LTTH-Konto vor der Store-Inspektion erstellen",
          "body": "Nutze bei Bedarf „Create account“. Der externe Account-Flow ist absichtlich nicht Teil der lokalen Screenshot-Aufnahme; nach der Rueckkehr kannst du offizielle Pakete pruefen.",
          "expected": "Der echte Create-account-Einstieg ist sichtbar, ohne einen Account anzulegen.",
          "alt": "LTTH-Konto vor der Store-Inspektion erstellen - Store-Ansicht, Quellenfreigabe und Paketstatus"
        },
        "en": {
          "title": "Create an LTTH account before Store inspection",
          "body": "Use “Create account” when needed. The external account flow is intentionally not part of the local screenshot capture; after returning, you can review official packages.",
          "expected": "The real Create account entry point is visible without creating an account.",
          "alt": "Create an LTTH account before Store inspection - store view, source approval, and package status"
        },
        "es": {
          "title": "Crea una cuenta LTTH antes de inspeccionar la tienda",
          "body": "Usa «Create account» si lo necesitas. El flujo externo de cuenta no forma parte intencionalmente de la captura local; tras volver puedes revisar paquetes oficiales.",
          "expected": "La entrada real Create account queda visible sin crear una cuenta.",
          "alt": "Crea una cuenta LTTH antes de inspeccionar la tienda - vista de tienda, aprobación de fuentes y estado de paquetes"
        },
        "fr": {
          "title": "Creez un compte LTTH avant dinspecter le Store",
          "body": "Utilisez « Create account » si necessaire. Le flux de compte externe ne fait volontairement pas partie de la capture locale ; apres votre retour, vous pouvez verifier les paquets officiels.",
          "expected": "Le vrai point dentree Create account est visible sans creer de compte.",
          "alt": "Creez un compte LTTH avant dinspecter le Store - vue du store, approbation des sources et état des paquets"
        }
      },
      "capture": {
        "route": "/dashboard.html",
        "assertVisible": "[data-store-auth-mode=\"sign-up\"]",
        "focusText": {
          "de": "LTTH-Konto vor der Store-Inspektion erstellen",
          "en": "Create an LTTH account before Store inspection",
          "es": "Crea una cuenta LTTH antes de inspeccionar la tienda",
          "fr": "Creez un compte LTTH avant dinspecter le Store"
        },
        "action": {
          "type": "inspect-safe-store-state",
          "prepare": "open-store-admin-view",
          "stepId": "store-inspection"
        },
        "expected": {
          "de": "Der echte Create-account-Einstieg ist sichtbar, ohne einen Account anzulegen.",
          "en": "The real Create account entry point is visible without creating an account.",
          "es": "La entrada real Create account queda visible sin crear una cuenta.",
          "fr": "Le vrai point dentree Create account est visible sans creer de compte."
        }
      },
      "workflow": {
        "route": "/dashboard.html",
        "instructions": {
          "de": {
            "title": "LTTH-Konto vor der Store-Inspektion erstellen",
            "body": "Nutze bei Bedarf „Create account“. Der externe Account-Flow ist absichtlich nicht Teil der lokalen Screenshot-Aufnahme; nach der Rueckkehr kannst du offizielle Pakete pruefen.",
            "expected": "Der echte Create-account-Einstieg ist sichtbar, ohne einen Account anzulegen."
          },
          "en": {
            "title": "Create an LTTH account before Store inspection",
            "body": "Use “Create account” when needed. The external account flow is intentionally not part of the local screenshot capture; after returning, you can review official packages.",
            "expected": "The real Create account entry point is visible without creating an account."
          },
          "es": {
            "title": "Crea una cuenta LTTH antes de inspeccionar la tienda",
            "body": "Usa «Create account» si lo necesitas. El flujo externo de cuenta no forma parte intencionalmente de la captura local; tras volver puedes revisar paquetes oficiales.",
            "expected": "La entrada real Create account queda visible sin crear una cuenta."
          },
          "fr": {
            "title": "Creez un compte LTTH avant dinspecter le Store",
            "body": "Utilisez « Create account » si necessaire. Le flux de compte externe ne fait volontairement pas partie de la capture locale ; apres votre retour, vous pouvez verifier les paquets officiels.",
            "expected": "Le vrai point dentree Create account est visible sans creer de compte."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/dashboard.html"
          },
          {
            "type": "prepare",
            "name": "open-store-admin-view"
          },
          {
            "type": "inspect-safe-store-state",
            "selector": "[data-store-auth-mode=\"sign-up\"]"
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
              "path": "/dashboard.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "[data-store-auth-mode=\"sign-up\"]"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "[data-store-auth-mode=\"sign-up\"]",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "store-review",
      "copy": {
        "de": {
          "title": "Store-Accountzugang vor dem Verlassen pruefen",
          "body": "Der Sign-in-Button im Store-Kopf ist der echte Einstieg zum Konto. Ohne Anmeldung bleiben Paketlisten, Kauf- und Installationsaktionen bewusst gesperrt.",
          "expected": "Der echte Header-Sign-in ist sichtbar; die Aufnahme loest keinen Login aus.",
          "alt": "Store-Accountzugang vor dem Verlassen pruefen - Store-Ansicht, Quellenfreigabe und Paketstatus"
        },
        "en": {
          "title": "Review Store account access before leaving",
          "body": "The Sign in button in the Store header is the real account entry point. Until you sign in, package lists, purchase actions, and installs intentionally stay unavailable.",
          "expected": "The real header Sign in is visible; the capture triggers no login.",
          "alt": "Review Store account access before leaving - store view, source approval, and package status"
        },
        "es": {
          "title": "Revisa el acceso de cuenta de la tienda antes de salir",
          "body": "El boton Sign in en la cabecera de la tienda es la entrada real de cuenta. Hasta iniciar sesion, las listas de paquetes, compras e instalaciones permanecen intencionalmente no disponibles.",
          "expected": "El Sign in real de la cabecera queda visible; la captura no inicia ningun login.",
          "alt": "Revisa el acceso de cuenta de la tienda antes de salir - vista de tienda, aprobación de fuentes y estado de paquetes"
        },
        "fr": {
          "title": "Verifiez lacces au compte Store avant de quitter",
          "body": "Le bouton Sign in dans len-tete du Store est le vrai point dentree de compte. Tant que vous ne vous connectez pas, listes de paquets, achats et installations restent volontairement indisponibles.",
          "expected": "Le vrai Sign in de len-tete est visible ; la capture ne declenche aucun login.",
          "alt": "Verifiez lacces au compte Store avant de quitter - vue du store, approbation des sources et état des paquets"
        }
      },
      "capture": {
        "route": "/dashboard.html",
        "assertVisible": "[data-store-account-signin]",
        "focusText": {
          "de": "Store-Accountzugang vor dem Verlassen pruefen",
          "en": "Review Store account access before leaving",
          "es": "Revisa el acceso de cuenta de la tienda antes de salir",
          "fr": "Verifiez lacces au compte Store avant de quitter"
        },
        "action": {
          "type": "inspect-safe-store-state",
          "prepare": "open-store-admin-view",
          "stepId": "store-review"
        },
        "expected": {
          "de": "Der echte Header-Sign-in ist sichtbar; die Aufnahme loest keinen Login aus.",
          "en": "The real header Sign in is visible; the capture triggers no login.",
          "es": "El Sign in real de la cabecera queda visible; la captura no inicia ningun login.",
          "fr": "Le vrai Sign in de len-tete est visible ; la capture ne declenche aucun login."
        }
      },
      "workflow": {
        "route": "/dashboard.html",
        "instructions": {
          "de": {
            "title": "Store-Accountzugang vor dem Verlassen pruefen",
            "body": "Der Sign-in-Button im Store-Kopf ist der echte Einstieg zum Konto. Ohne Anmeldung bleiben Paketlisten, Kauf- und Installationsaktionen bewusst gesperrt.",
            "expected": "Der echte Header-Sign-in ist sichtbar; die Aufnahme loest keinen Login aus."
          },
          "en": {
            "title": "Review Store account access before leaving",
            "body": "The Sign in button in the Store header is the real account entry point. Until you sign in, package lists, purchase actions, and installs intentionally stay unavailable.",
            "expected": "The real header Sign in is visible; the capture triggers no login."
          },
          "es": {
            "title": "Revisa el acceso de cuenta de la tienda antes de salir",
            "body": "El boton Sign in en la cabecera de la tienda es la entrada real de cuenta. Hasta iniciar sesion, las listas de paquetes, compras e instalaciones permanecen intencionalmente no disponibles.",
            "expected": "El Sign in real de la cabecera queda visible; la captura no inicia ningun login."
          },
          "fr": {
            "title": "Verifiez lacces au compte Store avant de quitter",
            "body": "Le bouton Sign in dans len-tete du Store est le vrai point dentree de compte. Tant que vous ne vous connectez pas, listes de paquets, achats et installations restent volontairement indisponibles.",
            "expected": "Le vrai Sign in de len-tete est visible ; la capture ne declenche aucun login."
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/dashboard.html"
          },
          {
            "type": "prepare",
            "name": "open-store-admin-view"
          },
          {
            "type": "inspect-safe-store-state",
            "selector": "[data-store-account-signin]"
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
              "path": "/dashboard.html",
              "query": {"lang":"$locale"},
              "exactQuery": true
            }
          },
          {
            "type": "visible",
            "selector": "[data-store-account-signin]"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "[data-store-account-signin]",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    }
  ]
});
