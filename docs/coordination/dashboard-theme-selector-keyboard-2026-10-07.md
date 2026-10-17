# Theme selector keyboard access — 2026-10-07

## Befund und Umsetzung

Der Theme-Schalter war ein Button, öffnete aber ein Menü aus nicht fokussierbaren `div`-Optionen. Es fehlten Radio-/Auswahlsemantik, ein einzelner Tab-Stopp, Tastaturbedienung und verlässliche Fokus-Rückgabe.

- Der Popup-Container ist jetzt ein lokalisiertes `radiogroup`. Optionen sind native `button`-Elemente mit `role="radio"`, `aria-checked` und roving `tabindex`; genau die ausgewählte Option ist tabbable.
- Enter oder Leertaste öffnet den Schalter und setzt den Fokus auf die ausgewählte Option. Pfeil rechts/runter und links/rauf bewegen den Radiofokus samt Theme-Auswahl, mit Wrap-around; Home/End springen zum Anfang/Ende.
- Enter/Leertaste auf einer Option wählt sie aus, schließt den Popup und gibt den Fokus an den Theme-Schalter zurück. Escape schließt ebenfalls und stellt den Fokus wieder her. Tab verlässt den Radio-Popup ohne Fokusfalle und schließt ihn.
- Der Schalter und die Radio-Gruppe erhalten ihren zugänglichen Namen aus dem bestehenden Locale-Vertrag. Eine sichtbare 2-px-`focus-visible`-Kontur markiert die Radio-Option.
- Der Browserlauf deckte auf, dass `transition: all` auf den Optionen die geerbte `visibility`-Änderung verzögerte und den Fokuswechsel beim Öffnen verhinderte. Popup-Sichtbarkeit ist jetzt beim Öffnen sofort aktiv und beim Schließen bis zum Ende des Fades sichtbar; Optionsübergänge betreffen nur Hintergrund- und Textfarbe.

## Geänderte Dateien

- `app/public/js/theme-manager.js` — Rollen-/ARIA-Vertrag, Zustandsabgleich, Pfeiltasten, Enter/Leertaste, Escape, Fokusmanagement.
- `app/public/css/themes.css` — native Button-Reset-Stile, sichtbare Fokusmarkierung und sofortige fokussierbare Popup-Sichtbarkeit.
- `app/test/theme-selector-keyboard.test.js` — DOM-Verträge, ausgewählter Zustand, Tab-/Fokus-/Tastaturzustände sowie DE/EN/ES/FR zugängliche Namen.
- `docs/coordination/evidence/dashboard-responsive-20261007/theme-selector-keyboard-browser.cjs` und `.json` — Chromium-Tastaturlauf samt 12 Screenshots/Hashes.
- `docs/coordination/evidence/dashboard-responsive-20261007/patches/theme-selector-keyboard-followon.patch` und `theme-selector-keyboard-followon.json` — Follow-on-Patch, Hash, Basis und Apply-Beleg.
- `docs/coordination/evidence/dashboard-responsive-20261007/prepare-theme-selector-followon.cjs` — rekonstruiert die eingefrorene Patchbasis und erzeugt den abgrenzbaren Follow-on-Diff.

## Eingefrorene Folge und Patch

`chain.json` wurde nicht geändert (SHA-256 `b184e57fbdac0cf44bbcff218ff79321d5d84bdd6684ed4b34ab9c64da63ba5c`). Die vier bestehenden Patchdateien und ihre Hashes sind unverändert: 5AA5 Locale → AAF1 Palette → 609592 Accessibility → 08B03B Responsive Accessibility. Der neue Follow-on baut genau auf diesem eingefrorenen Stand auf; seine Patchdatei hat SHA-256 **`de8ffbe9e51558e3ced115e29d5ea915b280466576b9a25c8934097698a4eb4c`**.

Die Diffbasis wurde aus d692 plus den vier frozen patches rekonstruiert. Der isolierte Candidate bestand sowohl Reverse-Check/Apply als auch Forward-Check/Apply des Follow-on-Patches.

## Verifikation

- Fokussierte Jest-Suites: **6 Suites / 31 Tests PASS**.
- Echter Chromium-DOM-/Tastaturlauf: **12/12 Fälle** für DE/EN/ES/FR und Cid/Night/Day. Pro Fall geprüft wurden genau eine ausgewählte/fokussierbare Radio-Option, Pfeilnavigation, Enter/Space, sichtbarer 2-px-Fokus und Fokus-Rückgabe.
- Escape-Fokus-Rückgabe und Tab-Ausstieg ohne Fokusfalle zusätzlich im repräsentativen DE/Cid-Zustand geprüft.
- Responsive Regression mit neuer Button/Radio-DOM-Struktur: **36/36** Kombinationen ohne Anomalien.
- Null externe Requests und null Pageerrors. Der Browser hat 115 Requests über Playwright-Interception aus lokalen Originalassets beantwortet. Der Browserprozess kann hier keinen Loopback-Socket öffnen; es lief kein echter HTTP-/App-Server.
- `node --check` für Manager, DOM-Test und Browserrunner sowie scoped `git diff --check`: **PASS**.

## Grenzen

Screenreader-Abnahme durch Menschen, Produktserver/Backend, HTTP-Integration, öffentlicher Tunnel, OBS und TikTok-LIVE sind nicht geprüft. Das ist keine öffentliche oder OBS-Liveabnahme. Es gab keine Veröffentlichung, keinen Push und keinen Nutzerprozess-Neustart.
