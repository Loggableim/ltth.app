# Vorschlag: Public-Goals-Anzeigungsvertrag

**Status:** technischer Vorschlag zur CEO-Prüfung; nicht implementiert und nicht freigegeben.  
**Umfang:** einzelnes Goal-Overlay. MultiGoal bleibt separat blockiert.  
**Grenze:** keine Änderung an Registry, Projektor, Plugins, Tunnel-/Freigabepolicy oder Release-/Summary-Dateien. Kein öffentlicher Start.

## Befund im aktuellen Stand

Die Registry führt `/goals/overlay` und `/goals/multigoal-overlay` als öffentliche Einstiegspunkte und listet deren Socket-Ereignisse. Der Public-Payload-Projektor liefert für Goals- und MultiGoals-Ereignisse jedoch ausdrücklich `null`; die bestehenden Rohereignisse werden damit fail-closed abgewiesen. Es gibt keinen öffentlichen `/api/goals`-GET-Vertrag. Das Einzel-Overlay bezieht sein initiales Goal derzeit über `goals:subscribe` mit einer internen Goal-ID. Die Plugin-Seite antwortet mit Goal-Datensatz und State-Machine-Snapshot und verwendet `goal:${goalId}` als internes Room.

Der Renderer zeigt aus dem Goal-Datensatz Name, Typ, aktuelle/Start-/Zielwerte, Template, Theme, Abmessungen und Animationen. Er verwendet den State `hidden` zur Sichtbarkeit und den Snapshot für Fortschritt sowie Update-/Reach-Animationen. Die State-Machine-Daten enthalten zusätzlich interne Goal-ID, vorherigen Zustand und Aktionsdaten wie `onReachAction` und `onReachIncrement`. Diese Daten gehören nicht in eine öffentliche Projektion.

Der Multigoal-Renderer abonniert derzeit mit interner MultiGoal-ID und erhält ein MultiGoal-Objekt samt Goal-Liste. Er verarbeitet zudem Goal-Wert-/Löschereignisse anhand interner IDs. Eine Freigabe dieses Pfads wäre ein eigener Vertrag mit Regeln für Kind-Goals, Reihenfolge, Rotation und Teillöschung; er ist von diesem Vorschlag nicht umfasst.

## Minimaler DTO-Vorschlag für ein einzelnes Goal

Neue öffentliche Nutzdaten sollen aus einer expliziten Feldliste aufgebaut werden; kein Spread, keine Weitergabe eines DB-Datensatzes oder State-Snapshots.

```json
{
  "name": "Community-Ziel",
  "type": "follower",
  "currentValue": 12,
  "targetValue": 100,
  "startValue": 0,
  "progress": 12,
  "isReached": false,
  "visible": true,
  "template": "compact-bar",
  "theme": {
    "primaryColor": "#60a5fa",
    "secondaryColor": "#3b82f6",
    "textColor": "#ffffff",
    "bgColor": "rgba(15, 23, 42, 0.95)"
  },
  "width": 600,
  "height": 140,
  "animation": "smooth-progress"
}
```

Feldregeln:

- `name`: Text für die Anzeige, auf eine begrenzte Länge (Vorschlag: 80 Zeichen) gekürzt und im Renderer als Text, nie als HTML eingesetzt.
- `type`: nur die im Renderer unterstützten Typen `coin`, `likes`, `follower`, `custom`; Labels und Symbole kommen aus lokalen Übersetzungen/Renderer-Mappings.
- `currentValue`, `targetValue`, `startValue`: endliche, begrenzte Zahlen; Wertebereiche und Obergrenzen vor Umsetzung anhand der vorhandenen Eingabevalidierung festlegen. `progress` serverseitig aus diesen Werten berechnen und auf 0–100 begrenzen. `isReached` ist ein boolescher Anzeigestatus.
- `visible`: abgeleitet aus dem Zustand (`state !== 'hidden'`); den Zustandstext selbst nicht veröffentlichen.
- `template`: Enum aus den im Renderer vorhandenen Templates. Für einen ersten Rollout vorzugsweise nur explizit geprüfte Templates freigeben; unbekannte/Legacy-IDs neutral ablehnen oder auf ein festes Default-Template abbilden.
- `theme`: ausschließlich `primaryColor`, `secondaryColor`, `textColor`, `bgColor`; Farben auf Hex/RGB(A)-Syntax mit Längenlimit validieren. `fontFamily` nicht übernehmen, da freie CSS-/Fontwerte unnötige Eingabefläche schaffen; Schriftgröße höchstens nach klarer Begrenzung ergänzen.
- `width` und `height`: endliche positive Integer innerhalb enger Renderergrenzen; Defaults serverseitig setzen.
- `animation`: Enum der tatsächlich implementierten Animationen, nicht beliebiger Konfigurationswert. Die Zuordnung der UI-Auswahl zur Renderer-ID vor Implementierung vollständig abgleichen.

Nicht veröffentlichen: interne Goal-/MultiGoal-IDs, DB-Rohzeile, `theme_json`, `enabled`, Aktionen/Increment beim Erreichen, Stream-Reset-Optionen, Erstellungs-/Änderungszeiten, State-Machine-Objekt (`previousState`, `data`, Aktionsparameter), interne Room-Namen, Fehlerstack/DB-Fehler oder benachbarte Goals. Kein `goalId` in Nutzdaten, Bestätigungen oder Fehlerantworten.

## Capability-, Subscription- und Raumzuordnung

Vorschlag für eine spätere, separate Freigabe:

1. Das lokale Goals-UI erzeugt für ein einzelnes Goal einen kryptografisch zufälligen, hochentropischen, opaken Public-Display-Token. Der Token ist eine widerrufbare Anzeigekapazität, keine Goal-ID. Im persistenten Speicher nach Möglichkeit nur einen Hash/Fingerprint ablegen; Klartext nur bei Erzeugung für die lokale Overlay-URL anzeigen. Tokenrotation und Widerruf müssen möglich sein.
2. Der öffentliche Client sendet künftig ein neues Event, etwa `goals:public:subscribe`, ausschließlich mit dem Token. Der Server validiert Format, Existenz, Widerruf und Zielbindung; er speichert die interne Zuordnung nur serverseitig auf `socket.data`.
3. Public-Sockets treten **nicht** dem bestehenden internen `goal:${goalId}`-Room bei. Ein dedizierter, nicht erratbarer bzw. gehashter Scope-Room wie `goal-public:${tokenHash}` trennt Public-Zustellung. Für jeden Room-Send ist der DTO-Projektor zwingend; es darf keinen Fallback auf Rohdaten oder den globalen Public-Tunnel-Room geben.
4. Die initiale Antwort (`goals:public:snapshot`) geht nur an den anfragenden Socket und enthält ausschließlich den DTO. Folgeereignisse (`goals:public:update`, optional `goals:public:deleted`) werden nur an den Scope-Room des zugehörigen Tokens geschickt. Konfiguration, Wertänderung, Reset und Reach werden auf dieselbe DTO-Allowlist projiziert; Eventnamen werden erst nach Prüfung in Registry/Adapter aufgenommen.
5. Bei jedem Reconnect sendet der Client den Token erneut. Der Server validiert neu, bindet den Scope erneut und liefert einen frischen Snapshot. Widerrufene, unbekannte oder falsch formatierte Tokens erhalten eine neutrale, identische Antwort ohne Hinweis auf Goal-Existenz.
6. Token dürfen nicht in Logs, Fehlermeldungen, Analyseereignissen oder Broadcast-Payloads auftauchen. URL-/Query-Token-Leaks über Referer und Verlauf sind vor einer Produktfreigabe zu bewerten; ein Fragment oder ein expliziter lokaler URL-Mechanismus kann dafür geeigneter sein.

Die vorhandene globale Public-Room-Weiterleitung ist kein Ersatz für diese Zuordnung. Die Adapterregeln müssen verhindern, dass rohe lokale Goal-Events oder fremde Goal-Scopes an Public-Sockets gelangen, auch wenn ein Plugin versehentlich ein internes Room adressiert.

## Ereignisse und Animation

Der Client benötigt beim Start einen projizierten Snapshot, danach Updates und optional eine Löschmeldung. Die existierenden `goals:subscribed`, `goals:config-changed`, `goals:value-changed`, `goals:reached`, `goals:reach-complete`, `goals:reset` und `goals:deleted` bleiben lokale Plugin-Verträge; ihre Rohformen sollen nicht öffentlich freigeschaltet werden.

Das derzeitige `goals:animation-end` nimmt interne Goal-ID und Animationstyp entgegen. Insbesondere ein `reach`-Abschluss ist nicht nur Darstellung: die State Machine kann dadurch Aktionen ausführen, Zustand ändern oder Zielwerte anpassen. Dieses öffentliche Ack nicht mit dem DTO-Subscribe wiederverwenden. Falls Client-Acks für die Darstellung nötig bleiben, braucht es ein neues, socketgebundenes Ereignis mit einem serverseitig ausgestellten einmaligen Sequenz-Token und strikt erlaubtem Phasen-Enum (`update`/`reach`). Der Server prüft aktive Subscription, erwartete Phase, Frische, Einmaligkeit und Rate-Limit; keine IDs oder frei wählbaren Aktionsdaten vom Client. Vorzugsweise sollte der Server den Reach-Übergang zeitgesteuert abschließen, sodass ein Public-Client das Goal-Verhalten nicht steuert. Die Entscheidung über Animation-Acks und Timeout-Verhalten ist vor Umsetzung mit dem CEO zu treffen.

## Geplante Codebereiche nach Freigabe

- `app/modules/public-overlay-registry.js`: nur neue, einzeln benannte Public-Subscribe-/Antwort-/Update-/Delete-Ereignisse sowie geprüfte Entry-/Assetpfade aufnehmen. Keine Wildcards und keine öffentlichen Schreib- oder Admin-HTTP-Routen.
- `app/modules/public-overlay-payload-projection.js`: neue strikt konstruktive Projektionen mit Feld-, Längen-, Zahlen-, Farb- und Enumvalidierung; rohe Goals-Events fail-closed lassen.
- `app/modules/public-overlay-socket-adapter.js` und `app/modules/public-overlay-access.js`: dedizierte Scope-Room-Zustellung, keine Aufnahme öffentlicher Sockets in interne Goal-Rooms, kein globaler Rohdaten-Fallback; Schutz von direct emit, room emit und Reconnect.
- `app/plugins/goals/backend/websocket.js`: lokale Handler unverändert lassen; neue Public-Subscription separat und nur für Public-Sockets registrieren/bedienen. Tokenauflösung, Snapshot-Projektion und Scope-Zustellung getrennt implementieren. Vorhandene Goal-Manager-/DB-Methoden nur serverintern verwenden.
- `app/plugins/goals/overlay/overlay.js` und ggf. `app/plugins/goals/ui.js`: Public-Link nutzt Token statt Goal-ID; Renderer konsumiert ausschließlich Public-DTO-Ereignisse. Keine Änderung an Rollen- oder Goal-Aktionslogik.
- Bestehende Integrationstests plus isolierter lokaler HTTP-/Socket.IO-Test: nach Freigabe neue positive/negative Fälle ergänzen. Bis dahin keine Produktions- oder Tunnelfreigabe.

## Negative Fälle und spätere Prüfmatrix

- Kein Token, kaputtes Format, falscher, unbekannter, widerrufener oder rotierter Token: neutral ablehnen; keine Existenz-/ID-Unterscheidung.
- Unbekanntes Event, zusätzliches Feld, unzulässige Enum, HTML-/überlange Texte, CSS-Injection, NaN/Infinity, negative oder zu große Maße/Zahlen: keine Antwortdaten bzw. neutraler Fehler; niemals Teilprojektion aus unbekanntem Objekt übernehmen.
- Public-Socket kann weder interne Goal-Rooms abonnieren noch `goals:animation-end`, Config-, Wert-, Reset-, Lösch- oder Reach-Aktionen auslösen.
- Zwei Tokens für zwei Goals: keinerlei Cross-Room-Daten; ein anderes öffentliches Overlay erhält keine Goals-Events.
- Interner lokaler Client behält den bisherigen vollständigen Plugin-Vertrag; Public-Client erhält ausschließlich explizite DTO-Felder.
- Reconnect liefert den aktuellen DTO-Snapshot; Offline-/veraltete Acks, Replay und doppelte Animation-Acks verändern keinen Goal-Zustand.
- MultiGoal bleibt gesperrt, bis ein eigener, bounded DTO- und Child-Visibility-Vertrag samt Tests vorliegt.
- Registry-Test bestätigt explizite Allowlist; kein HTTP-Schreibpfad, keine Wildcard, keine Zugangsdaten, kein Rohpayload.

## Offene CEO-Entscheidungen

1. Soll zunächst nur das Einzel-Goal-Overlay unterstützt werden? Empfehlung dieses Vorschlags: ja; MultiGoal bleibt ausdrücklich Legacy/gesperrt.
2. Welche Template-/Animation-Enums sollen im ersten sicheren DTO unterstützt werden? Die Renderer-Mappings sind vor Umsetzung abschließend zu listen.
3. Soll die lokale UI Public-Tokens anlegen, rotieren und widerrufen können, und welcher Token-Speicher-/URL-Mechanismus ist akzeptiert?
4. Darf ein Public-Client irgendeinen Animationsabschluss melden oder muss der Server Reach-Abschlüsse selbst terminieren?
5. Welche exakten Zahlen- und Größenobergrenzen passen zum UI und zu bestehenden Goal-Eingabevalidierungen?

Bis zu diesen Entscheidungen bleibt Public Goals im aktuellen Deny-by-default-Zustand blockiert.
