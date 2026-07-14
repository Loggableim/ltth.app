'use strict';

// Complete editorial and workflow contract for this plugin. The build
// consumes this module directly; it does not generate guide prose.
module.exports = Object.freeze({
  "id": "api-bridge",
  "route": "/api/bridge/info",
  "topic": {
    "de": "lokale Aktionen, Ereignisse und die API-Bridge",
    "en": "local actions, events, and the API bridge",
    "es": "acciones locales, eventos y la API Bridge",
    "fr": "actions locales, événements et l’API Bridge"
  },
  "test": {
    "de": "GET /api/bridge/info und eine harmlose Action-Abfrage",
    "en": "GET /api/bridge/info and a harmless action lookup",
    "es": "GET /api/bridge/info y una consulta de acción inocua",
    "fr": "GET /api/bridge/info et une lecture d’action inoffensive"
  },
  "expected": {
    "de": "die Antwort beschreibt die verfügbare Bridge, ohne eine Aktion auszuführen",
    "en": "the response describes the available bridge without executing an action",
    "es": "la respuesta describe el puente disponible sin ejecutar una acción",
    "fr": "la réponse décrit le bridge disponible sans exécuter d’action"
  },
  "requirement": "api",
  "safety": "credentials",
  "mode": "api",
  "overlay": null,
  "related": [
    "data-source",
    "gcce"
  ],
  "copy": {
    "de": {
      "title": "API Bridge",
      "summary": "API Bridge richtet lokale Aktionen, Ereignisse und die API-Bridge ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.",
      "firstResult": "die Antwort beschreibt die verfügbare Bridge, ohne eine Aktion auszuführen",
      "requirements": "LTTH Dashboard und Zugriff auf die lokale LTTH-URL. Dieser konkrete API Bridge-Ablauf behandelt lokale Aktionen, Ereignisse und die API-Bridge.",
      "safety": "Keine echten API-Schlüssel oder Konten eingeben; Platzhalter bleiben Platzhalter. Dieser konkrete API Bridge-Ablauf behandelt lokale Aktionen, Ereignisse und die API-Bridge.",
      "troubleshooting": "Wenn lokale Aktionen, Ereignisse und die API-Bridge nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.",
      "related": [
        "data-source",
        "gcce"
      ]
    },
    "en": {
      "title": "API Bridge",
      "summary": "API Bridge configures local actions, events, and the API bridge with a safe local check instead of a LIVE trigger.",
      "firstResult": "the response describes the available bridge without executing an action",
      "requirements": "LTTH Dashboard and access to the local LTTH URL. This API Bridge workflow specifically covers local actions, events, and the API bridge.",
      "safety": "Do not enter real API keys or accounts; placeholders stay placeholders. This API Bridge workflow specifically covers local actions, events, and the API bridge.",
      "troubleshooting": "If local actions, events, and the API bridge is not visible, first check the active plugin status, local route, and saved test values.",
      "related": [
        "data-source",
        "gcce"
      ]
    },
    "es": {
      "title": "API Bridge",
      "summary": "API Bridge configura acciones locales, eventos y la API Bridge mediante una comprobación local segura, no un disparador LIVE.",
      "firstResult": "la respuesta describe el puente disponible sin ejecutar una acción",
      "requirements": "El panel de LTTH y acceso a la URL local de LTTH. Este flujo concreto de API Bridge trata acciones locales, eventos y la API Bridge.",
      "safety": "No introduzcas claves API ni cuentas reales; los marcadores siguen siendo marcadores. Este flujo concreto de API Bridge trata acciones locales, eventos y la API Bridge.",
      "troubleshooting": "Si acciones locales, eventos y la API Bridge no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.",
      "related": [
        "data-source",
        "gcce"
      ]
    },
    "fr": {
      "title": "API Bridge",
      "summary": "API Bridge configure actions locales, événements et l’API Bridge avec un contrôle local sûr plutôt qu’un déclencheur LIVE.",
      "firstResult": "la réponse décrit le bridge disponible sans exécuter d’action",
      "requirements": "Le tableau de bord LTTH et l’accès à l’URL locale LTTH. Ce flux spécifique de API Bridge couvre actions locales, événements et l’API Bridge.",
      "safety": "Ne saisissez aucune clé API ni compte réel ; les espaces réservés restent des espaces réservés. Ce flux spécifique de API Bridge couvre actions locales, événements et l’API Bridge.",
      "troubleshooting": "Si actions locales, événements et l’API Bridge n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.",
      "related": [
        "data-source",
        "gcce"
      ]
    }
  },
  "steps": [
    {
      "id": "bridge-info",
      "copy": {
        "de": {
          "title": "Bridge-Information nur lesend pruefen",
          "body": "Pruefe den Abschnitt Bridge-Information in der lokalen API-Bridge-Referenz. Diese Anleitung sendet keinen POST-Request.",
          "expected": "die Antwort beschreibt die verfügbare Bridge, ohne eine Aktion auszuführen",
          "alt": "Bridge-Information nur lesend pruefen - lokale Aktionen, Ereignisse und die API-Bridge"
        },
        "en": {
          "title": "Inspect Bridge information read-only",
          "body": "Inspect the Bridge information section in the local API Bridge reference. This guide sends no POST request.",
          "expected": "the response describes the available bridge without executing an action",
          "alt": "Inspect Bridge information read-only - local actions, events, and the API bridge"
        },
        "es": {
          "title": "Inspecciona Informacion de Bridge en solo lectura",
          "body": "Revisa la seccion Informacion de Bridge en la referencia local de API Bridge. Esta guia no envia POST.",
          "expected": "la respuesta describe el puente disponible sin ejecutar una acción",
          "alt": "Inspecciona Informacion de Bridge en solo lectura - acciones locales, eventos y la API Bridge"
        },
        "fr": {
          "title": "Inspectez Information Bridge en lecture seule",
          "body": "Inspectez la section Information Bridge dans la reference API Bridge locale. Ce guide n envoie aucune requete POST.",
          "expected": "la réponse décrit le bridge disponible sans exécuter d’action",
          "alt": "Inspectez Information Bridge en lecture seule - actions locales, événements et l’API Bridge"
        }
      },
      "capture": {
        "route": "/api-bridge/ui",
        "assertVisible": "#bridge-info",
        "focusText": {
          "de": "Bridge-Information nur lesend pruefen",
          "en": "Inspect Bridge information read-only",
          "es": "Inspecciona Informacion de Bridge en solo lectura",
          "fr": "Inspectez Information Bridge en lecture seule"
        },
        "action": {
          "type": "inspect-readonly-api",
          "stepId": "bridge-info"
        },
        "expected": {
          "de": "die Antwort beschreibt die verfügbare Bridge, ohne eine Aktion auszuführen",
          "en": "the response describes the available bridge without executing an action",
          "es": "la respuesta describe el puente disponible sin ejecutar una acción",
          "fr": "la réponse décrit le bridge disponible sans exécuter d’action"
        }
      },
      "workflow": {
        "route": "/api-bridge/ui",
        "instructions": {
          "de": {
            "title": "Bridge-Information nur lesend pruefen",
            "body": "Pruefe den Abschnitt Bridge-Information in der lokalen API-Bridge-Referenz. Diese Anleitung sendet keinen POST-Request.",
            "expected": "die Antwort beschreibt die verfügbare Bridge, ohne eine Aktion auszuführen"
          },
          "en": {
            "title": "Inspect Bridge information read-only",
            "body": "Inspect the Bridge information section in the local API Bridge reference. This guide sends no POST request.",
            "expected": "the response describes the available bridge without executing an action"
          },
          "es": {
            "title": "Inspecciona Informacion de Bridge en solo lectura",
            "body": "Revisa la seccion Informacion de Bridge en la referencia local de API Bridge. Esta guia no envia POST.",
            "expected": "la respuesta describe el puente disponible sin ejecutar una acción"
          },
          "fr": {
            "title": "Inspectez Information Bridge en lecture seule",
            "body": "Inspectez la section Information Bridge dans la reference API Bridge locale. Ce guide n envoie aucune requete POST.",
            "expected": "la réponse décrit le bridge disponible sans exécuter d’action"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/api-bridge/ui"
          },
          {
            "type": "inspect-readonly-api",
            "selector": "#bridge-info"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/api-bridge/ui"
          },
          {
            "type": "visible",
            "selector": "#bridge-info"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#bridge-info",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "actions-list",
      "copy": {
        "de": {
          "title": "Aktionsliste nur lesend pruefen",
          "body": "Pruefe den Abschnitt Aktionsliste in der lokalen API-Bridge-Referenz. Diese Anleitung sendet keinen POST-Request.",
          "expected": "die Antwort beschreibt die verfügbare Bridge, ohne eine Aktion auszuführen",
          "alt": "Aktionsliste nur lesend pruefen - lokale Aktionen, Ereignisse und die API-Bridge"
        },
        "en": {
          "title": "Inspect action list read-only",
          "body": "Inspect the action list section in the local API Bridge reference. This guide sends no POST request.",
          "expected": "the response describes the available bridge without executing an action",
          "alt": "Inspect action list read-only - local actions, events, and the API bridge"
        },
        "es": {
          "title": "Inspecciona lista de acciones en solo lectura",
          "body": "Revisa la seccion lista de acciones en la referencia local de API Bridge. Esta guia no envia POST.",
          "expected": "la respuesta describe el puente disponible sin ejecutar una acción",
          "alt": "Inspecciona lista de acciones en solo lectura - acciones locales, eventos y la API Bridge"
        },
        "fr": {
          "title": "Inspectez liste des actions en lecture seule",
          "body": "Inspectez la section liste des actions dans la reference API Bridge locale. Ce guide n envoie aucune requete POST.",
          "expected": "la réponse décrit le bridge disponible sans exécuter d’action",
          "alt": "Inspectez liste des actions en lecture seule - actions locales, événements et l’API Bridge"
        }
      },
      "capture": {
        "route": "/api-bridge/ui",
        "assertVisible": "#bridge-actions",
        "focusText": {
          "de": "Aktionsliste nur lesend pruefen",
          "en": "Inspect action list read-only",
          "es": "Inspecciona lista de acciones en solo lectura",
          "fr": "Inspectez liste des actions en lecture seule"
        },
        "action": {
          "type": "inspect-readonly-api",
          "stepId": "actions-list"
        },
        "expected": {
          "de": "die Antwort beschreibt die verfügbare Bridge, ohne eine Aktion auszuführen",
          "en": "the response describes the available bridge without executing an action",
          "es": "la respuesta describe el puente disponible sin ejecutar una acción",
          "fr": "la réponse décrit le bridge disponible sans exécuter d’action"
        }
      },
      "workflow": {
        "route": "/api-bridge/ui",
        "instructions": {
          "de": {
            "title": "Aktionsliste nur lesend pruefen",
            "body": "Pruefe den Abschnitt Aktionsliste in der lokalen API-Bridge-Referenz. Diese Anleitung sendet keinen POST-Request.",
            "expected": "die Antwort beschreibt die verfügbare Bridge, ohne eine Aktion auszuführen"
          },
          "en": {
            "title": "Inspect action list read-only",
            "body": "Inspect the action list section in the local API Bridge reference. This guide sends no POST request.",
            "expected": "the response describes the available bridge without executing an action"
          },
          "es": {
            "title": "Inspecciona lista de acciones en solo lectura",
            "body": "Revisa la seccion lista de acciones en la referencia local de API Bridge. Esta guia no envia POST.",
            "expected": "la respuesta describe el puente disponible sin ejecutar una acción"
          },
          "fr": {
            "title": "Inspectez liste des actions en lecture seule",
            "body": "Inspectez la section liste des actions dans la reference API Bridge locale. Ce guide n envoie aucune requete POST.",
            "expected": "la réponse décrit le bridge disponible sans exécuter d’action"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/api-bridge/ui"
          },
          {
            "type": "inspect-readonly-api",
            "selector": "#bridge-actions"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/api-bridge/ui"
          },
          {
            "type": "visible",
            "selector": "#bridge-actions"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#bridge-actions",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "request-example",
      "copy": {
        "de": {
          "title": "POST-Request-Vertrag nur lesend pruefen",
          "body": "Pruefe den Abschnitt POST-Request-Vertrag in der lokalen API-Bridge-Referenz. Diese Anleitung sendet keinen POST-Request.",
          "expected": "die Antwort beschreibt die verfügbare Bridge, ohne eine Aktion auszuführen",
          "alt": "POST-Request-Vertrag nur lesend pruefen - lokale Aktionen, Ereignisse und die API-Bridge"
        },
        "en": {
          "title": "Inspect POST request contract read-only",
          "body": "Inspect the POST request contract section in the local API Bridge reference. This guide sends no POST request.",
          "expected": "the response describes the available bridge without executing an action",
          "alt": "Inspect POST request contract read-only - local actions, events, and the API bridge"
        },
        "es": {
          "title": "Inspecciona contrato de solicitud POST en solo lectura",
          "body": "Revisa la seccion contrato de solicitud POST en la referencia local de API Bridge. Esta guia no envia POST.",
          "expected": "la respuesta describe el puente disponible sin ejecutar una acción",
          "alt": "Inspecciona contrato de solicitud POST en solo lectura - acciones locales, eventos y la API Bridge"
        },
        "fr": {
          "title": "Inspectez contrat de requete POST en lecture seule",
          "body": "Inspectez la section contrat de requete POST dans la reference API Bridge locale. Ce guide n envoie aucune requete POST.",
          "expected": "la réponse décrit le bridge disponible sans exécuter d’action",
          "alt": "Inspectez contrat de requete POST en lecture seule - actions locales, événements et l’API Bridge"
        }
      },
      "capture": {
        "route": "/api-bridge/ui",
        "assertVisible": "#bridge-events",
        "focusText": {
          "de": "POST-Request-Vertrag nur lesend pruefen",
          "en": "Inspect POST request contract read-only",
          "es": "Inspecciona contrato de solicitud POST en solo lectura",
          "fr": "Inspectez contrat de requete POST en lecture seule"
        },
        "action": {
          "type": "inspect-readonly-api",
          "stepId": "request-example"
        },
        "expected": {
          "de": "die Antwort beschreibt die verfügbare Bridge, ohne eine Aktion auszuführen",
          "en": "the response describes the available bridge without executing an action",
          "es": "la respuesta describe el puente disponible sin ejecutar una acción",
          "fr": "la réponse décrit le bridge disponible sans exécuter d’action"
        }
      },
      "workflow": {
        "route": "/api-bridge/ui",
        "instructions": {
          "de": {
            "title": "POST-Request-Vertrag nur lesend pruefen",
            "body": "Pruefe den Abschnitt POST-Request-Vertrag in der lokalen API-Bridge-Referenz. Diese Anleitung sendet keinen POST-Request.",
            "expected": "die Antwort beschreibt die verfügbare Bridge, ohne eine Aktion auszuführen"
          },
          "en": {
            "title": "Inspect POST request contract read-only",
            "body": "Inspect the POST request contract section in the local API Bridge reference. This guide sends no POST request.",
            "expected": "the response describes the available bridge without executing an action"
          },
          "es": {
            "title": "Inspecciona contrato de solicitud POST en solo lectura",
            "body": "Revisa la seccion contrato de solicitud POST en la referencia local de API Bridge. Esta guia no envia POST.",
            "expected": "la respuesta describe el puente disponible sin ejecutar una acción"
          },
          "fr": {
            "title": "Inspectez contrat de requete POST en lecture seule",
            "body": "Inspectez la section contrat de requete POST dans la reference API Bridge locale. Ce guide n envoie aucune requete POST.",
            "expected": "la réponse décrit le bridge disponible sans exécuter d’action"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/api-bridge/ui"
          },
          {
            "type": "inspect-readonly-api",
            "selector": "#bridge-events"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/api-bridge/ui"
          },
          {
            "type": "visible",
            "selector": "#bridge-events"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#bridge-events",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "event-stream-check",
      "copy": {
        "de": {
          "title": "Ereignisprotokoll nur lesend pruefen",
          "body": "Pruefe den Abschnitt Ereignisprotokoll in der lokalen API-Bridge-Referenz. Diese Anleitung sendet keinen POST-Request.",
          "expected": "die Antwort beschreibt die verfügbare Bridge, ohne eine Aktion auszuführen",
          "alt": "Ereignisprotokoll nur lesend pruefen - lokale Aktionen, Ereignisse und die API-Bridge"
        },
        "en": {
          "title": "Inspect event log read-only",
          "body": "Inspect the event log section in the local API Bridge reference. This guide sends no POST request.",
          "expected": "the response describes the available bridge without executing an action",
          "alt": "Inspect event log read-only - local actions, events, and the API bridge"
        },
        "es": {
          "title": "Inspecciona registro de eventos en solo lectura",
          "body": "Revisa la seccion registro de eventos en la referencia local de API Bridge. Esta guia no envia POST.",
          "expected": "la respuesta describe el puente disponible sin ejecutar una acción",
          "alt": "Inspecciona registro de eventos en solo lectura - acciones locales, eventos y la API Bridge"
        },
        "fr": {
          "title": "Inspectez journal des evenements en lecture seule",
          "body": "Inspectez la section journal des evenements dans la reference API Bridge locale. Ce guide n envoie aucune requete POST.",
          "expected": "la réponse décrit le bridge disponible sans exécuter d’action",
          "alt": "Inspectez journal des evenements en lecture seule - actions locales, événements et l’API Bridge"
        }
      },
      "capture": {
        "route": "/api-bridge/ui",
        "assertVisible": "#bridge-request",
        "focusText": {
          "de": "Ereignisprotokoll nur lesend pruefen",
          "en": "Inspect event log read-only",
          "es": "Inspecciona registro de eventos en solo lectura",
          "fr": "Inspectez journal des evenements en lecture seule"
        },
        "action": {
          "type": "inspect-readonly-api",
          "stepId": "event-stream-check"
        },
        "expected": {
          "de": "die Antwort beschreibt die verfügbare Bridge, ohne eine Aktion auszuführen",
          "en": "the response describes the available bridge without executing an action",
          "es": "la respuesta describe el puente disponible sin ejecutar una acción",
          "fr": "la réponse décrit le bridge disponible sans exécuter d’action"
        }
      },
      "workflow": {
        "route": "/api-bridge/ui",
        "instructions": {
          "de": {
            "title": "Ereignisprotokoll nur lesend pruefen",
            "body": "Pruefe den Abschnitt Ereignisprotokoll in der lokalen API-Bridge-Referenz. Diese Anleitung sendet keinen POST-Request.",
            "expected": "die Antwort beschreibt die verfügbare Bridge, ohne eine Aktion auszuführen"
          },
          "en": {
            "title": "Inspect event log read-only",
            "body": "Inspect the event log section in the local API Bridge reference. This guide sends no POST request.",
            "expected": "the response describes the available bridge without executing an action"
          },
          "es": {
            "title": "Inspecciona registro de eventos en solo lectura",
            "body": "Revisa la seccion registro de eventos en la referencia local de API Bridge. Esta guia no envia POST.",
            "expected": "la respuesta describe el puente disponible sin ejecutar una acción"
          },
          "fr": {
            "title": "Inspectez journal des evenements en lecture seule",
            "body": "Inspectez la section journal des evenements dans la reference API Bridge locale. Ce guide n envoie aucune requete POST.",
            "expected": "la réponse décrit le bridge disponible sans exécuter d’action"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/api-bridge/ui"
          },
          {
            "type": "inspect-readonly-api",
            "selector": "#bridge-request"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/api-bridge/ui"
          },
          {
            "type": "visible",
            "selector": "#bridge-request"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#bridge-request",
          "viewport": {
            "width": 1440,
            "height": 900
          },
          "stateChange": false
        }
      }
    },
    {
      "id": "bridge-review",
      "copy": {
        "de": {
          "title": "Bridge-Sicherheitsgrenze nur lesend pruefen",
          "body": "Pruefe den Abschnitt Bridge-Sicherheitsgrenze in der lokalen API-Bridge-Referenz. Diese Anleitung sendet keinen POST-Request.",
          "expected": "die Antwort beschreibt die verfügbare Bridge, ohne eine Aktion auszuführen",
          "alt": "Bridge-Sicherheitsgrenze nur lesend pruefen - lokale Aktionen, Ereignisse und die API-Bridge"
        },
        "en": {
          "title": "Inspect Bridge safety boundary read-only",
          "body": "Inspect the Bridge safety boundary section in the local API Bridge reference. This guide sends no POST request.",
          "expected": "the response describes the available bridge without executing an action",
          "alt": "Inspect Bridge safety boundary read-only - local actions, events, and the API bridge"
        },
        "es": {
          "title": "Inspecciona limite de seguridad de Bridge en solo lectura",
          "body": "Revisa la seccion limite de seguridad de Bridge en la referencia local de API Bridge. Esta guia no envia POST.",
          "expected": "la respuesta describe el puente disponible sin ejecutar una acción",
          "alt": "Inspecciona limite de seguridad de Bridge en solo lectura - acciones locales, eventos y la API Bridge"
        },
        "fr": {
          "title": "Inspectez limite de securite Bridge en lecture seule",
          "body": "Inspectez la section limite de securite Bridge dans la reference API Bridge locale. Ce guide n envoie aucune requete POST.",
          "expected": "la réponse décrit le bridge disponible sans exécuter d’action",
          "alt": "Inspectez limite de securite Bridge en lecture seule - actions locales, événements et l’API Bridge"
        }
      },
      "capture": {
        "route": "/api-bridge/ui",
        "assertVisible": "#bridge-safety",
        "focusText": {
          "de": "Bridge-Sicherheitsgrenze nur lesend pruefen",
          "en": "Inspect Bridge safety boundary read-only",
          "es": "Inspecciona limite de seguridad de Bridge en solo lectura",
          "fr": "Inspectez limite de securite Bridge en lecture seule"
        },
        "action": {
          "type": "inspect-readonly-api",
          "stepId": "bridge-review"
        },
        "expected": {
          "de": "die Antwort beschreibt die verfügbare Bridge, ohne eine Aktion auszuführen",
          "en": "the response describes the available bridge without executing an action",
          "es": "la respuesta describe el puente disponible sin ejecutar una acción",
          "fr": "la réponse décrit le bridge disponible sans exécuter d’action"
        }
      },
      "workflow": {
        "route": "/api-bridge/ui",
        "instructions": {
          "de": {
            "title": "Bridge-Sicherheitsgrenze nur lesend pruefen",
            "body": "Pruefe den Abschnitt Bridge-Sicherheitsgrenze in der lokalen API-Bridge-Referenz. Diese Anleitung sendet keinen POST-Request.",
            "expected": "die Antwort beschreibt die verfügbare Bridge, ohne eine Aktion auszuführen"
          },
          "en": {
            "title": "Inspect Bridge safety boundary read-only",
            "body": "Inspect the Bridge safety boundary section in the local API Bridge reference. This guide sends no POST request.",
            "expected": "the response describes the available bridge without executing an action"
          },
          "es": {
            "title": "Inspecciona limite de seguridad de Bridge en solo lectura",
            "body": "Revisa la seccion limite de seguridad de Bridge en la referencia local de API Bridge. Esta guia no envia POST.",
            "expected": "la respuesta describe el puente disponible sin ejecutar una acción"
          },
          "fr": {
            "title": "Inspectez limite de securite Bridge en lecture seule",
            "body": "Inspectez la section limite de securite Bridge dans la reference API Bridge locale. Ce guide n envoie aucune requete POST.",
            "expected": "la réponse décrit le bridge disponible sans exécuter d’action"
          }
        },
        "operations": [
          {
            "type": "goto",
            "route": "/api-bridge/ui"
          },
          {
            "type": "inspect-readonly-api",
            "selector": "#bridge-safety"
          }
        ],
        "postconditions": [
          {
            "type": "http-status",
            "expected": "< 400"
          },
          {
            "type": "url",
            "expected": "/api-bridge/ui"
          },
          {
            "type": "visible",
            "selector": "#bridge-safety"
          },
          {
            "type": "console",
            "expected": "no-errors"
          }
        ],
        "captureRule": {
          "selector": "#bridge-safety",
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
