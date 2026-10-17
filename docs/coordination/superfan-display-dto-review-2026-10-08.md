# SuperFan display DTO review — 2026-10-08

## Ergebnis

Der lokal installierte EulerStream SDK-Vertrag (`@eulerstream/euler-websocket-sdk@0.0.6`, V2 typings SHA-256 `76A4BC340EFCFF2178A191E4943198EC9C8EE95FF115C34D0D1B2A66E46F9A31`) enthält ein generisches `WebcastBarrageMessage`, aber kein benanntes dauerhaftes `superFan`-/`isSuperFan`-Rollenfeld. Die vorhandene synthetische SDK-Probe belegt nur, dass die generische Protobufstruktur synthetische `displayType`-Marker und `Text.piecesList[].userValue.user` trägt. Die Klassifikation aus `ttlive_superfan...` stammt laut Recherche aus einem separaten Community-Connector und ist kein dokumentierter EulerStream-Serververtrag. Der rohe `superFan`-Eventpfad wird aktuell bewusst fail-closed gehalten. Deshalb ist ein zukünftiger DTO technisch spezifizierbar, aber die sichere Producerfreigabe bleibt an einen verifizierten Klassifikationsvertrag gebunden.

## Aktueller öffentlicher DTO-Vertrag

Die spätere ausdrückliche Nutzerfreigabe legt ausschließlich diese öffentlichen Felder fest. Optionale Felder werden weggelassen, wenn sie nicht sicher verfügbar und validiert sind.

```js
{
  displayName: string,          // begrenzter Anzeigename
  eventType: 'superfan' | 'superfan-join',
  level?: number,               // nur expliziter Fanclub-Level
  profilePictureUrl?: string   // nur validierte HTTPS-Profilbild-URL
}
```

`type: 'superfan-display'` und `timestamp` bleiben ausschließlich interne Queue-/Retention-Metadaten. Der öffentliche Live- und History-DTO enthält sie nicht; in History ergibt sich die Queueart aus `events['superfan-display']`. Der Overlayrenderer darf für lokale Sortierung einen flüchtigen Zeitwert ergänzen.

Ältere Vorschläge wie `kind`, `event`, `title`, `color` und `avatarUrl` sind keine freigegebenen öffentlichen Felder und dürfen nicht ausgegeben werden.

Werte, die sich aus den lokal installierten V2-Typen ableiten lassen:

- **Anzeigename:** `User.nickname` ist direkt vorhanden. `uniqueId` ist ein öffentlicher Handle, aber zugleich stabiler account-bezogener Identifier; nur bei ausdrücklicher Wahl in der Einwilligung ausgeben. Kein `userId`-Fallback.
- **Level:** `User.fansClubInfo.fansLevel` (String), `User.fansClub.fansClubData.level`/entsprechender FansClub-Level oder eine eindeutig als `badgeScene=FANS` klassifizierte Badge-`logExtra.level` sind Fanclub-Level-Kandidaten. Auf positive, sicher geparste Ganzzahl begrenzen; mehrere widersprüchliche Level nicht heuristisch kombinieren. Kein PayGrade/AnchorLevel/UserGrade als SuperFan-Level.
- **Profilbild:** `profilePicture`/Medium/Large sind `Image`-Objekte; nur eine validierte HTTPS-Bild-URL als `profilePictureUrl` projizieren. `mUri`, schema, beliebige URL-Listen und Proto-Imageobjekte nicht weiterreichen. Das Feld ist optional.

Die übrige Feldinventur oben dokumentiert mögliche Quelldaten, erweitert aber nicht den freigegebenen DTO-Vertrag.

## Ausgeschlossen

`userId`, `idStr`, `secUid`, `specialId`, room IDs, `uniqueId` (sofern nicht ausdrücklich als sichtbarer Handle gewählt), komplette `User`-/Barrage-/Envelope-Objekte, alle `piecesList`/Textinhalte, `displayType`/Proto-Eventnamen, Protobuf-Rohbytes, Gift-/Subscribe-/Follow-/PayGrade-Daten, Scores, `fansScore`, Follower-/Abozahlen, device/account/settings/config/key-/Sessionwerte, beliebige `logExtra`, Badge-/Image-Unterobjekte, URLs außerhalb der Avatar-Projektion sowie rohe Fehler-/Debugtexte. Interne IDs dürfen nur innerhalb eines bereits autorisierten flüchtigen Actor-Matchings verwendet und vor Plugin-/Socket-Grenze verworfen werden.

`isSubscribe`/`isSubscribedToAnchor`, Moderator-Flags, Gifts, Fanclubmitgliedschaft/Level und `msgType` 10/11 sind für sich allein **kein** SuperFan-Rollenbeleg. SuperFanBox-Envelope/BusinessType 19 darf nicht als Mitgliedschaft eines beliebigen enthaltenen Users interpretiert werden. Es ist kein Ablauf-/Widerrufsvertrag für eine dauerhafte Rolle belegt; daher nur ereignisbezogene Anzeige, keine persistente Rollenberechtigung.

## Bestätigung / Einwilligung

- Eine explizite Nutzerentscheidung zur öffentlichen Anzeige der ausgewählten sichtbaren Felder ist erforderlich. Avatarbild und Account-Handle sollten getrennte optionale Zustimmungen sein; diese Review findet keine Grundlage, dass deren bloße technische Verfügbarkeit eine Zustimmung ersetzt.
- Für ein eventgebundenes, nicht persistiertes DTO aus Nickname/optional Level/Titel/Farbe ist keine zusätzliche Bestätigung je Datenklasse erkennbar, wenn der Nutzer diese Anzeige bereits bewusst aktiviert hat.
- Persistieren, Exportieren, Teilen außerhalb des bereits freigegebenen Overlay-/Pluginziels oder dauerhafte Rollen-/Zugriffsentscheidungen würden zusätzlichen Zweck/Umfang darstellen und brauchen eine eigene Produktentscheidung/Zustimmung. Hier nicht freigegeben.
- Falls Nutzerzustimmung zur Anzeige noch nicht vorliegt, DTO nicht aktivieren und nichts weiterleiten. Bestehende CEO-Handoff-Freigabe deckt nur die bereits benannte öffentliche Anzeige ab; sie erlaubt weder interne IDs/Rawpayload/Settings noch Speicherung.

## Evidenzgrenzen

Ausschließlich lokale Typdefinitionen, vorhandene Quellpfade und synthetische Schema-Recherche ausgewertet; keine Keys, echten Payloadwerte, Konten oder Liveverbindungen verwendet. Die Proto-Typen belegen Feldform, nicht TikTok-/EulerStream-Semantik, Einwilligungsstatus, Aktualität oder Verlässlichkeit dieser Werte. Ein unabhängiger EulerStream-Rollenvertrag und Ablaufsemantik bleiben offen. Insbesondere sind EulerStream-Markersemantik und ihre zuverlässige Unterscheidung zwischen beigetretenem und neuem SuperFan weiterhin unbestätigt; der öffentliche Producer muss bis zu einem verifizierten Marker-Vertrag fail-closed bleiben.
