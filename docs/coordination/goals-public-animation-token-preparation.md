# SingleGoal Public-Aufbereitung: Animation-Abschluss und Token-URL

**Status:** Sourceanalyse und Negativtestplan für CEO-Entscheidung; keine Implementierung oder Freigabe.  
**Scope:** nur SingleGoal. MultiGoal bleibt für einen getrennten Auftrag blockiert.  
**Änderungen:** nur dieses Vorbereitungsdokument; keine Produkt-/Policy-/Registryänderung und kein Tunnelstart.

## Animation-Abschluss: tatsächlicher Lifecycle

### Aktuelle Aufrufkette

1. `app/plugins/goals/overlay/overlay.js` startet bei `goals:value-changed` die Update-Animation und bei `goals:reached` die Reach-Animation. Nach erfülltem Promise sendet der Overlay-Client `goals:animation-end` mit `{ goalId, animationType: 'update'|'reach' }`.
2. `app/plugins/goals/backend/websocket.js` registriert das Ereignis ohne Public-/Local-Unterscheidung. Der Handler sucht die State Machine anhand der übermittelten internen ID. `update` ruft `onUpdateAnimationEnd()`, `reach` ruft `onReachAnimationEnd()` auf.
3. `app/plugins/goals/engine/state-machine.js` reagiert nur, wenn die Maschine in der passenden Animationsphase steht. Update-Ende wechselt aus `animating_update` abhängig vom aktuellen Wert nach `idle` oder `reached`; `reached` startet unmittelbar `animating_reach`. Reach-Ende wechselt aus `animating_reach` nach `processing_reach`; beim Eintritt wird `applyReachBehavior()` synchron ausgeführt.
4. `applyReachBehavior()` kann `hide` auslösen, Werte auf Start zurücksetzen, das Ziel verdoppeln oder per `onReachIncrement` erhöhen. Bei verändertem Ziel persistiert der Listener in `app/plugins/goals/main.js` den neuen `target_value` und sendet die lokale Konfigurationsaktualisierung. Beim Reach sendet der Socket-Handler danach `goals:reach-complete` mit Goal und Snapshot in `goal:${goalId}`.

### Wer besitzt den Abschluss heute?

Es gibt keinen serverseitigen Animationstimer und keinen separaten Eigentümer/Lease. Der Client, der die Animation abspielt, sendet den Abschluss. Der Backend-Handler akzeptiert das Event von jedem Socket, der eine vorhandene Goal-ID kennt; die State-Machine-Phasenprüfung verhindert zwar unpassende und wiederholte Abschlüsse außerhalb der erwarteten Phase, ersetzt aber keine Autorisierung. Der einzelne Client-ACK ist damit gegenwärtig ein zustandswirksamer Trigger.

Wenn gar kein Overlay verbunden ist, oder Animation/Promise dauerhaft nicht abschließt, kann die Maschine in `animating_update` bzw. `animating_reach` stehen bleiben. Schnelle Wertupdates setzen animierende Zustände in `updateValue()` manuell auf `idle` zurück; das ist ein eigener Unterbrechungspfad, kein allgemeiner Timeout-Fallback.

### Kann der Server ohne Public-ACK intern finalisieren?

**Ja, technisch; nein, nicht als semantikneutrale Änderung des vorhandenen Verhaltens.** Ein serverseitiger Timer könnte an den Eintritt in `animating_update`/`animating_reach` gebunden werden und bei Fristablauf selbst die passenden internen State-Machine-Methoden oder eine interne Finalisierung aufrufen. Das beseitigt die Abhängigkeit von einem Public-ACK, weil Public-Clients gar keine Abschlussautorität erhalten. Es ändert aber das bisherige Verhalten für lokale Clients, die offline sind, lange Animationen abspielen oder deren ACK verspätet ist: serverseitige Frist gewinnt dann gegen den lokalen Abschluss.

Eine sichere spätere Variante wäre ein **Fallback-only** Timer:

- Vorhandene lokale Overlay-ACKs bleiben für die lokale App-Semantik zuständig.
- Der Timer darf nur die vom Server erfasste, aktuell aktive Animationsgeneration abschließen und wird durch lokalen ACK, neuen Wert/Reset/Löschung sowie Prozessende gelöscht/entwertet.
- Falls Fristablauf eintritt, wird intern finalisiert; Public-ACKs sind weder Quelle noch notwendige Bedingung.
- Frist, Generation, Zustandsprüfungen, Wiederanlaufverhalten und Persistenzwirkung müssen explizit entschieden und mit lokalen Regressionstests abgesichert werden.

Das ist die kleinste Änderung, die Offline-Stall behebt und die lokale Client-ACK-Priorität bei normalem Betrieb erhält. Sie ist dennoch eine beobachtbare neue Semantik beim Ausfall/Verzug des lokalen Renderers; man kann daher nicht behaupten, das bestehende Lifecycle-Verhalten sei unverändert. Wenn „lokale Semantik unverändert“ wörtlich auch den Ausfallfall einschließt, ist automatisches Finalisieren nicht möglich. Dann muss Reach weiter auf einen **lokalen** Overlay-ACK warten; Public darf nur Darstellung konsumieren und darf diesen lokalen ACK weder senden noch ersetzen.

### Negativtestplan für Animation

- Public-Socket sendet altes `goals:animation-end` mit richtiger/falscher/fehlender ID und `update`/`reach`: kein Zustandswechsel, kein `reach-complete`, kein DB-Write, keine Ziel-/Wertänderung.
- Public-Socket sendet neue, eventuell später freigegebene Display-/Animation-Nachrichten samt zusätzlichen Feldern, interner ID, Aktionsnamen oder frei gewähltem Zielwert: fail-closed.
- Nur lokale Overlay-Verbindung sendet passendes ACK in aktiver Phase: bisheriger Update-/Reach-Ablauf bleibt erhalten.
- Lokaler ACK falsche Phase, doppelt, verspätet nach Reset/Update oder nach Goal-Löschung: kein doppelter Abschluss und keine Änderung eines anderen Goals.
- Falls CEO den Fallback-only Timer freigibt: kein lokaler ACK führt erst nach Frist zum genau einmaligen internen Abschluss; ACK vor Frist entwertet Timer; später Timerlauf bewirkt nichts; neue Animationsgeneration/Update/Reset/Löschung entwertet alte Timer.
- Fallback-Test prüft auch `hide`, `reset`, `double`, `increment` und `reach-complete` auf identische Nebenwirkungen zu dem jeweiligen internen Abschluss. Kein Test verwendet einen öffentlichen Tunnel.

## Opaker Token über vorhandene Overlay-URL- und Tunnelkopie-UI

### Bestehender Anschluss

- `app/plugins/goals/ui.js` erstellt SingleGoal-URL aktuell als `/goals/overlay?id=${goal.id}` und zeigt sie mit normalem Copy-Button an. Ein zweiter Button hat bereits `data-copy-tiktok-studio-url`, `data-overlay-url-source="self"` und `data-url`.
- `app/public/js/tiktok-studio-url.js` liest diese URL über `readButtonURL()`. Der bestehende temporäre Copy-Pfad ruft `POST /api/network/overlay-tunnel/ensure` mit `{ overlayURL }` auf und kopiert danach die zurückgegebene URL. `app/modules/overlay-tunnel-routes.js` prüft Origin und registrierten Entry-Path; `app/modules/public-overlay-url.js` übernimmt Pfad und Query der validierten lokalen URL in die Quick-Tunnel-URL. Der Tunnel-Endpunkt startet nur auf explizite Copy-Aktion; hier wurde er nicht aufgerufen.

### Vorbereitungsentwurf

Die vorhandene Goals-Karte und der vorhandene temporäre URL-Copy-Button können nach separater Freigabe weitergenutzt werden. Beim Erzeugen der lokalen SingleGoal-URL wird statt `id=<interne ID>` ein einziger opaker Capability-Parameter verwendet, z. B. `display=<zufälliger Token>`. Der vorhandene Tunnel-Copy-Mechanismus validiert weiter denselben registrierten Pfad und überträgt den Query-Parameter unverändert zur Public-URL. Damit braucht es kein paralleles Overlay-Link-UI. Die normale lokale Dashboard-URL und der existierende lokale Subscribe-Vertrag müssen getrennt bewertet werden, damit ein Public-Capability-Token nicht versehentlich zum lokalen Admin-/Control-Identifikator wird.

Tokenlebenszyklus, der vor Codefreigabe entschieden werden muss:

- lokal erzeugte kryptografisch zufällige hochentropische Capability (kein Goal-ID-Ableitung, fortlaufender Zähler oder signiertes Klartextobjekt mit interner ID);
- nur Hash/Fingerprint dauerhaft speichern, soweit vorhandene Plugin-DB/Settings das ohne sensible Konfigurationskopie erlaubt; rohen Token nur bei Ausgabe der lokalen Overlay-URL halten;
- pro Goal widerrufen/rotieren können; Rotation verwirft den alten Link; keine öffentliche Mutation dafür;
- Lookup liefert intern die Goal-ID, aber Antwort/Rooms/Ereignisse führen Tokenhash oder opaque scope statt Goal-ID im Public-Payload;
- keine Tokenwerte in App-Logs, Browserkonsole, Fehlermeldungen, Telemetrie oder öffentlichen Antworttexten.

**URL-Transport-Risiko:** Die bestehende Tunnelkopie kopiert die URL mitsamt Query. Damit wäre die Capability für Empfänger des OBS-Links sichtbar und kann zusätzlich in Browser-Verlauf, Server-/Proxy-Logs oder Referer-Kontext geraten. Der aktuelle Tunnelvalidator lehnt Fragment-URLs ab, und `buildPublicOverlayURL()` erhält explizit den Query-String. Das macht Query als einfachsten Anschluss an die bestehende UI, aber nicht automatisch als sicheren Transport genehmigt. Vor Umsetzung Token-Redaktion in Logs, Referrer-Policy des Overlay-Dokuments, Socket-Verbindungsprotokoll, Browserhistorie und Token-Rotation prüfen. Kein neuer HTTP-Admin- oder Schreibendpunkt ist hierfür vorgesehen; eine lokale UI-Aktion/Plugin-Methode muss den Token sicher erzeugen und verwalten können.

## Zuständigkeitsgrenzen und notwendige spätere Hunkbereiche

Keine dieser Änderungen wird mit diesem Auftrag vorgenommen. Nach CEO-Freigabe wären voraussichtlich erforderlich:

- Goals UI URL-Erzeugung/Kopierbuttons in `app/plugins/goals/ui.js` an lokale Capability-Ausgabe anbinden, ohne neue Parallel-UI;
- Goals Backend und existierende Plugin-DB/Settings hinsichtlich separater Tokenverwaltung prüfen; nie Token-Adminzugang öffentlich machen;
- Overlay-Runtime auf Capability-Subscribe und ausschließlich neue projizierte Public-DTO-Ereignisse umstellen; keine interne ID in public Ack-Events;
- Public Registry/Projektor/Socketadapter erst nach expliziter Freigabe ergänzen, mit dediziertem Scope und deny-by-default;
- mögliche interne Timeout-Fallback-Änderung an State-Machine-Owner abstimmen und lokal semantikprüfen. Public renderer/ACK darf diesen Pfad nicht steuern.

## Offene CEO-Entscheidungen

1. Ist der lokale ACK bei normalem Betrieb maßgebliche Lifecycle-Autorität und wird ein fallback-only Servertimer nur für ausbleibenden ACK akzeptiert, obwohl er Ausfallfälle verändert? Oder bleibt Lifecycle strikt ACK-gebunden und kann ohne lokalen Renderer stehen bleiben?
2. Wird Token als Capability in der kopierten URL-Query akzeptiert, wenn Referer-/Log-Redaktion und Widerruf ergänzt werden, oder soll ein anderer Transport erst geprüft werden? Der vorhandene Tunnelkopierpfad übernimmt Query und verwirft Fragment.
3. Welcher lokale Goals-UI-/DB-Mechanismus darf Token generieren, anzeigen, rotieren und widerrufen? Die vorhandene Overlay-Karte ist der bevorzugte Ort; es wird keine zusätzliche UI vorausgesetzt.
4. Soll ein Offline/fehlender lokaler Overlay-ACK den Reach-Zustand unverändert offenlassen, wenn der Timer abgelehnt wird?

Bis zu diesen Entscheidungen bleiben Animation-Abschluss, Capability-Generierung und Public-Goals-Vertrag unverändert gesperrt.
