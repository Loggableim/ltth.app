# Lokale Zustands-Galerie

Öffne [`index.html`](index.html), um die drei synthetischen Zustands-Mockups zu vergleichen. Jede Variante ist eine eigenständige, lokal ladbare HTML-Seite mit gemeinsamem CSS und lokalem JavaScript:

- [01 · Creator-Überblick](01-overview.html) priorisiert ruhige Startfläche, Verbindung und Ereignisverlauf.
- [02 · Live-Konsole](02-live-console.html) stellt den Ereignisstrom zentral und Profil/Systemstatus in eine Seitenleiste.
- [03 · Arbeitsbereiche](03-workspaces.html) ordnet Ereignisse, Verbindung und Profile in aufgabenorientierte Navigation ein.

## Demo-Zustände

Beim Öffnen zeigt der Ereignisverlauf kurz den Ladezustand und wechselt dann in einen lokalen Fehlerzustand. **Erneut versuchen** simuliert erneut Laden und danach einen leeren Verlauf. **Beispielereignisse anzeigen** zeigt synthetische Daten für **Demo B**; Demo A hat absichtlich keinen Eintrag. Der Profilwähler aktualisiert die aktive Profilanzeige sofort und schaltet die sichtbare Beispielhistorie A↔B um. Es wird nichts gespeichert, kein echter Profilwechsel ausgeführt und kein Server neu gestartet.

Die Verbindungssteuerung wählt Offline, Verbunden und Live als reine Präsentationszustände. Tag/Nacht und Deutsch, Englisch, Spanisch sowie Französisch sind lokal bedienbar. Tastaturfokus ist sichtbar; Retry, Beispielereignisse und Theme lassen sich mit der Tastatur auslösen.

Vorschaubilder: [01](01-overview.png), [02](02-live-console.png), [03](03-workspaces.png). Sie zeigen den lokalen Fehlerzustand und nicht den Produktstand.

Accessibility-/Designbefund: [ACCESSIBILITY-DESIGN-AUDIT.md](ACCESSIBILITY-DESIGN-AUDIT.md) mit lokalen Kontrast-, Semantik- und Keyboard-Nachweisen sowie den prototypinternen Korrekturen.

## Reproduzierbare Prüfung

Aus dem Repository-Root:

```powershell
node docs/coordination/dashboard-mockups-2026-10-08/state-gallery/verify-state-gallery.cjs
```

Der lokale Playwright-Check prüft alle drei Varianten in vier Locales, einschließlich Laden → Fehler/Retry → leer/gefüllt, aktiver Profilanzeige Demo A↔B, synchronisiertem Live-Status sowie Tastaturumschaltung Tag/Nacht. Er misst 320, 390 und 720 CSS-Pixel in den Ereigniszuständen und beiden Themeflächen.

**Letzter Lauf: PASS** — 12 Varianten/Locales, 12 vollständige State-Flows, 468 Assertions, 216 Überlaufmessungen, 0 externe HTTP(S)-Requests und 0 JavaScript-Fehler. Der 320-Pixel-Galerieindex wurde ebenfalls lokal geprüft; alle drei Screenshots und Demo-Links laden. Screenshots wurden mit Edge über `file://` erzeugt.

Zusätzlicher Accessibility-Lauf: `node docs/coordination/dashboard-mockups-2026-10-08/state-gallery/audit-accessibility.cjs` — 4.848 Assertions, 3.924 Textkontraste, 180 Fokusstopps und 84 Überlaufmessungen, bestanden. Er umfasst auch das 200-%-Zoom-Äquivalent (720 CSS-Pixel bei DPR 2) und Chromium-Emulation für `forced-colors: active`; Screenshots dieser Kontrastansicht liegen bei.

Diese Fixture prüft Darstellung und Frontend-Demo-Verhalten. Sie belegt weder echte Backend-Profile-Isolation noch Persistenz, echte Eventdaten, Serverneustart oder TikTok-Verbindung.


