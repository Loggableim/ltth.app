# Farbvergleich: LTTH-Grün, Weiß und Violett in Tag und Nacht

Stand: 2026-10-08 · lokale Mockup-Renderings, keine Produktdatei geändert

## Maßstab und Nachweis

Geprüft wurden die tatsächlich gerenderten Desktopansichten bei 1440 × 900 CSS-Pixeln in beiden Modi sowie die Mockup-Palette gegen die LTTH-Logo-Varianten `app/public/ltthlogo_daymode.png` und `app/public/ltthlogo_nightmode.png`. Die Logos verwenden eine klare Dreiergruppe: Grün, Weiß und sattes Violett. Die drei Mockups wechseln im Tagmodus zu hellen Flächen und dunklerer Schrift/Akzenten und im Nachtmodus zu dunklen Flächen, heller Schrift und helleren Akzenten.

Die aktualisierten Browseraufnahmen liegen unter `responsive-check/`:

- [01 Nacht](responsive-check/01-overview-desktop-1440x900-night.png) · [01 Tag](responsive-check/01-overview-desktop-1440x900-day.png)
- [02 Nacht](responsive-check/02-live-console-desktop-1440x900-night.png) · [02 Tag](responsive-check/02-live-console-desktop-1440x900-day.png)
- [03 Nacht](responsive-check/03-workspaces-desktop-1440x900-night.png) · [03 Tag](responsive-check/03-workspaces-desktop-1440x900-day.png)

`verify-responsive.cjs` prüfte 15 Kombinationen (drei Mockups × fünf Viewports) und erzeugte 30 Nacht-/Tag-Screenshots. Alle Modi hatten sichtbaren Tastaturfokus, keine horizontalen Überläufe und keine verdeckten Controls. `verify-design-colors.cjs` maß 124 sichtbare Text-/Bedienpaare; alle waren mindestens 4,5:1, darunter jeweils Tag und Nacht. Das sind Mockupmessungen, kein Produktkontrastnachweis.

## Vergleich

| Richtung | Visuelle Stärken | Größte Schwäche zur Logo-Präferenz |
|---|---|---|
| **01 · Creator-Überblick** | Grün ist die aktive Leitfarbe für Verbindung, primäre Aktion und Status. Nachtflächen sind tiefgrün mit weißer Schrift; Tagflächen sind weiß/mint. Violett ist sauber als sekundärer Fortschritts-/Linkakzent reserviert. Die geringe Dichte lässt die Farben gut wirken, ohne sie zu überladen. | Violett ist auf der ersten Bildschirmhöhe noch wenig präsent und wirkt insgesamt am leisesten der drei Markenfarben. Der Logo-Violettanteil wird hauptsächlich in sekundären Elementen gespiegelt. |
| **02 · Live-Konsole** | Das kräftige Grün verbindet Connect-CTA, Live-Verlauf und Status; weiße Flächen tragen den Tagmodus und Violett markiert ergänzende Fortschritts-/Linkelemente. Die Farbrollen sind bei Tag und Nacht gut lesbar und im Betrieb schnell zu unterscheiden. | Die Nacht-Neutrals haben einen leicht bläulich-kühlen Einschlag; die Konsole zeigt mehr farbige Status-/Datenflächen zugleich. Violett bleibt ebenfalls sekundär, während die Informationsdichte stärker mit der Farbwirkung konkurriert. |
| **03 · Arbeitsbereiche** | Grün markiert Gruppen, Symbole und Aktionen; Violett prägt aktive Auswahl und sekundäre Flächen, wodurch die Logo-Farbgruppe sofort erkennbar ist. Tag- und Nachtflächen wechseln konsistent. | Im Tagmodus kippt der Grundton sichtbar in Lavendel, während Weiß und Grün gegenüber Violett zurücktreten. Im Nachtmodus wirken große Flächen violett-schwarz. Das bringt die Balance weg von gleichwertigen Markenfarben hin zu Violett als Leitfarbe. |

## Empfehlung

**Richtung 01 ist die beste Grundlage für die gewünschte Markenwirkung und die ruhige Dashboard-Startfläche.** Sie stellt Grün als klare Handlungsfarbe und Weiß/helles Mint als ruhige Tagflächen heraus, ohne die Nachtansicht aufzuhellen. Violett sollte bei einer nächsten visuellen Runde auf der ersten Bildschirmhöhe etwas konsequenter in Fortschritt oder ausgewählten Sekundäraktionen erscheinen, damit es gegenüber dem Logo nicht zu zurückhaltend wirkt. Richtung 02 ist die stärkste Referenz für einen deutlicheren violetten Datenakzent; Richtung 03 sollte nicht als Farbgrundlage dienen, solange der Tagmodus so lavendelfarben bleibt.

Es wurden keine Styles geändert; daher gibt es keine Vorher-/Nachher-Änderung. Die Empfehlung bezieht sich nur auf den Farbvergleich dieser Prototypen, nicht auf eine Produktfreigabe.
