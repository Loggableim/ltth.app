# Unified Queue: Public-DTO-Plan nach Fail-Closed

Stand: 2026-10-07. Nur Reviewentwurf; keine Registryerweiterung, kein Public-Datenvertrag freigegeben.

## Current sicherer Zustand

`unified-queue:status` und `unified-queue:wheel-queued` liefern für Public-Sockets `null` aus dem gemeinsamen Projektor. Die bestehenden Producer und lokalen Queueoverlay-Consumers erhalten weiter alle Originalfelder. Public-Overlay-Incoming `unified-queue:request-status` bleibt explizit zugelassen und read-only, aber seine direkte Antwort wird durch denselben Projektor unterdrückt.

Der interne Status enthält ein aktuelles Item plus die gesamte Queue mit Namen, Timestamps, `spinId`, teilweise `batchId` und `gameType`; Eventpayload `unified-queue:wheel-queued` enthält zusätzlich rohe `wheelId`, `segmentCount` und `spinId`. Queue-Manager begrenzt die Queue heute mit `MAX_QUEUE_SIZE = 50`, aber ein Public-Projektor darf nicht blind von diesem Runtimewert ausgehen.

## Minimaler Verbraucherbedarf

Original-Wheeloverlay rendert Queueposition, Typicon und `nickname || username`. Beim Initial-/Reconnectstatus mappt es `currentItem` plus `queue`; `spinId`/`batchId` dienen als Korrelationswerte für spätere Entfernung, nicht für Anzeige. Das laufende Wheel-Folge-Resultat bleibt fail-closed; ein Public-Queue DTO wäre daher ohne gepaarte, ebenfalls genehmigte Terminal-/Entfernungsnachricht eine unvollständige Anzeige.

## Vorschlag für späteren expliziten Vertrag

Erst nach Owner-/Produktreview; keine Felder sind jetzt zugelassen:

- `unified-queue:status`: `{ isProcessing, queueLength, currentItem, queue }`; `queueLength` begrenzt auf höchstens 50, Queueitems begrenzt auf dieselbe Obergrenze. Items nur `{ type, position, displayName, publicQueueRef }`, wobei `currentItem` ebenfalls `position` erhält.
- `unified-queue:wheel-queued`: `{ position, displayName, publicQueueRef, queueLength }` mit identischer Referenz für dasselbe Item wie die Statussnapshot-Antwort.
- **Referenz:** servergenerierte, kryptografisch zufällige, opake Public-Korrelation; nie `spinId`/`batchId`/`wheelId`. Mapping nur Serverprozess, maximale Lebensdauer begrenzt, genau beim Queueabschluss gelöscht. Der Token wird nicht von einem Public-Client an einen Schreib-/ACK-Handler zurückgesendet. Derzeitige Public-ACK-Sperren bleiben in Kraft.
- **Anzeigedaten:** `type` nur festes enum (`wheel|slot|plinko|chess|connect4` entsprechend unterstützter Queueanzeige); `displayName` nur, falls Produkt Datenschutzfreigabe erteilt, Länge begrenzt, keine UID; sonst generischer Name. Position/Anzahl Integer mit klarer Obergrenze. Keine `timestamp`, `segmentCount`, Wheel-/DB-/Provider-ID, roher Username oder interne Metadaten.
- **Lebenszyklus:** zusammengehörige Status-/Queue-/Terminalereignisse brauchen denselben public-only Ref. Vor Projektorfreigabe muss feststehen, wie beendete Queueitems zuverlässig entfernt werden, ohne `wheel:spin-result` oder neue Clientautorität zu eröffnen. `unified-queue:cleared` und andere Queuetyp-Events bleiben außerhalb dieses Zweierplans und werden nicht automatisch projiziert.

## Testplan vor einer etwaigen Freigabe

- Originalpayload mit `spinId`, `wheelId`, `batchId`, Username, Timestamp, Segmentcount und Extraobjekten; Public-Projektion enthält ausschließlich erlaubte DTO-Schlüssel.
- Null-/falsche Typen, negative/zu große Queueposition/-länge, >50 Items, zu lange Anzeigenamen, unbekannte Spieletypen und Tokenformat: fail-closed.
- Derselbe opake Ref über Wheel-Queued-Event, Status-Reconnect und geplantes Terminalevent; nach Ende/TTL kein Mapping-Replay.
- Echter lokaler Queueadapter: unverändertes Originalpayload; Public-Room: nur genehmigtes Projektionsobjekt. Direkte Emits verhalten sich identisch.
- Nachweis, dass kein Token an `wheel:spin-complete` oder einen anderen Schreib-/Rewardhandler gebunden ist.

## Reviewgrenze

Die Events sind derzeit absichtlich öffentlich nicht verfügbar; der Wheel-Public-Empfänger erhält kein Queue-DTO. Keine Änderung an Queueproducer, anderer Queueevents, Registry, HTTP-Routen, Schreibpfaden oder Overlay. Kein Server-/OBS-/LIVE-Nachweis.
