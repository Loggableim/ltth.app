# Aufgabenvergleich: drei Dashboard-Mockups

**Stand: 08.10.2026 · lokale Mockups und synthetischer Browseraudit · keine Produktentscheidung**

## Empfehlung

Für den nächsten klickbaren Prototyp empfiehlt sich **03 – Arbeitsbereiche als Navigationsgerüst, kombiniert mit der ruhigen Startfläche aus 01**. Der Grund ist die Kombination aus nachweisbarer Vollständigkeit der Navigation (alle 42 Views sind in jedem Mockup enthalten und durchsuchbar) und dem vom Nutzer gewünschten übersichtlichen Einstieg. 02 sollte als optionale Live-Betriebsansicht erhalten bleiben, nicht als allgemeine Startseite: sie unterstützt Ereignisbeobachtung am besten, zeigt aber die höchste Dauerdichte.

Diese Empfehlung betrifft nur den nächsten Prototyp-Schritt. Keines der Mockups bildet den geprüften Ereignis-Retry- oder Profilwechsel-Ablauf produktionsnah ab; die 42er-Navigation markiert Demo-Ziele, sie startet keine Produktansichten.

## Vergleich entlang der geprüften Aufgaben

| Aufgabe | 01 · Creator-Überblick | 02 · Live-Konsole | 03 · Arbeitsbereiche | Evidenz / Risiko |
|---|---|---|---|---|
| **Start und Verbindung** | Ruhiger Offline-Einstieg; klarer Verbindungsblock, wenige Kennzahlen und häufige Aktionen. | Verbindung und Live-Status sind prominent in einen Betriebsarbeitsplatz eingebettet. | Verbindung steht neben Workspace-Auswahl und Aufgabenbereichen. | Alle drei Demo-Flows schalten Offline → Verbunden → Live lokal um. Das simuliert keine echte Verbindung. 01 passt am besten zum Wunsch nach weniger Überladung; 02 ist am stärksten während eines Streams. |
| **Ereignisverlauf und Retry** | Letzte Ereignisse und Protokoll-Einstieg sind sichtbar, der Ereignisfehler-/Leerzustand fehlt. | Ereignisstrom und Statusspalte liegen direkt auf der Startfläche; beste strukturelle Nähe zum Live-Event-Log. | Aktivitätsvorschau plus Events-Ziel in der Navigation; geringste unmittelbare Sichtbarkeit. | Der synthetische Produktbrowserlauf prüfte Laden → 503/Retry → leer und Lokalisierung. Keines der Mockups reproduziert diese drei Zustände oder den echten Retry. In 02 fehlt zudem die Statistik-Detailauswahl des Produktprotokolls. |
| **Profilwechsel** | Einstellungen als Kopfzeilenknopf, kein erkennbarer Profilumschalter. | „Alex“ mit Dropdown suggeriert ein Profilmenü, bildet aber keinen Wechsel-/Restart-/Reload-Ablauf ab. | Workspace-Auswahl ist sichtbar, kann aber mit dem aktiven Laufzeitprofil verwechselt werden; Einstellungen sind separat. | Der Produktbrowserlauf wechselte synthetische Profile A→B→A und prüfte aktive Anzeige/History nach simuliertem Reload. Kein Mockup zeigt diesen Ablauf. 02 besitzt den naheliegendsten, aber missverständlichen Einstieg; 03 braucht getrennte, explizit benannte Workspace- und Profilkontrollen. |
| **Navigation / 42 Views** | Vollständiger, durchsuchbarer Verzeichniseinstieg hinter „Alle 42 Dashboard-Ansichten“; Kernaktionen bleiben kuratiert. | Vollständiger Katalog über Werkzeug-Rail; passt zum Arbeitsmodus, ist neben dem Live-Inhalt aber sekundär. | Sechs Aufgabenbereiche plus durchsuchbarer Vollkatalog; Navigation ist das zentrale Ordnungsprinzip. | Statischer Check: 42 eindeutige IDs in jeder Variante, 42/42. Auswahl markiert nur ein synthetisches Ziel und öffnet keine echte Produkt-View. 03 ist am besten skalierbar, kann aber gegenüber bekannter Plugin-Suche einen Gruppierungsschritt kosten. |
| **Tag/Nacht** | Grün/helle Flächen tragen die Startseite; umschaltbarer Tag-/Nachtmodus. | Umschaltung vorhanden; dunklere, stärker technisch wirkende Konsole. | Umschaltung vorhanden; Violett betont die Bereichsnavigation. | Alle Theme-/Tastaturprüfungen bestanden; geprüfte normale Textpaare >=4,5:1. Das ist lokaler Mockup-Beleg, kein vollständiger Produktkontrast-Audit. |
| **DE/EN/ES/FR** | Vollständige lokale UI-Umschaltung einschließlich Demo-Status. | Vollständige lokale UI-Umschaltung einschließlich Demo-Status. | Vollständige lokale UI-Umschaltung einschließlich Demo-Status. | 12/12 Variante×Locale-Kombinationen bestanden, inklusive drei synthetischer Aufgaben-Flows je Kombination. Keine fachliche Muttersprachprüfung; nicht mit der Locale-Laufzeit des Produkt-Dashboards gleichzusetzen. |

## Stärken und offene Interaktionsrisiken

- **01:** beste Orientierung für Start/Verbindung und häufige Aktionen; gute Basis gegen visuelle Überladung. Offene Risiken: Ereignis-Retry und Profilwahl fehlen; „Mehr“ muss den 42er-Katalog auffindbar halten; einige Startblöcke sind noch statische Vorschau.
- **02:** beste unmittelbare Sicht auf Live-Aktivität und Status. Offene Risiken: höchste Informationsdichte; außerhalb eines Streams wirkt die Konsole leerer; Profil-Dropdown ist nur ein nicht verdrahteter Vorschlag; Event-Fehler/Retry/Leerzustand fehlen.
- **03:** beste konzeptionelle Skalierung der 42 Views und stärkste Trennung nach Aufgaben. Offene Risiken: Gruppierung kann Wege verlängern; Workspace und Produktprofil müssen sichtbar verschieden sein; Eventhistorie und Retry sind nicht Teil der Startfläche.

## Verifikationsbasis und Grenzen

Der Produktbezug stammt aus dem lokalen Chromium-Audit unter `http://127.0.0.1:3000/dashboard.html`: Eventverlauf Loading → synthetischer Fehler mit Retry → leer; Sofortübersetzung des Fehlers in DE/EN/ES/FR; synthetischer Profilwechsel A→B→A mit aktualisierter Profilanzeige und History nach simuliertem Reload. Dafür wurden ausschließlich abgefangene Fixtures verwendet; es wurden keine echten Profile oder Daten geändert und kein Server neu gestartet. Der Audit bestand aus 24 Browserassertions; der isolierte Profilwechsel gab zweimal einen Switch-POST an den Fixture-Router, ohne echten Restart.

Mockup-Prüfung erneut lokal: Galerie 3/3 Mockups geöffnet; Interaktionscheck 12/12 Variante×Locale-Kombinationen und 36/36 synthetische Aufgaben-Flows bestanden, 252 Overflow-Messungen, keine externen HTTP(S)-Requests oder JavaScript-Fehler. Die Bildvorschauen sind synthetisch und dienen der visuellen Orientierung; HTML bleibt die klickbare Referenz.
