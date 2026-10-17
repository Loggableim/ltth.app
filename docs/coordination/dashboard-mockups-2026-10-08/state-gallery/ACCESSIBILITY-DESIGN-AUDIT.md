# Accessibility- und Design-Audit der Zustands-Mockups

**08.10.2026 · read-only Audit der drei lokalen Prototyp-Richtungen; kleine prototypinterne Korrekturen nach reproduzierten Befunden. Keine Produktdatei geändert.**

## Ergebnis

Der erneute Browserlauf besteht in allen drei Richtungen. Die Tastaturreihenfolge folgt dem DOM von Kopfzeilen-Steuerungen in die jeweilige Navigation und weiter zu Verbindung, Ereignissen und Profilen. Interaktive Stops zeigen jetzt einen violetten 3-px-Fokusrahmen; kein geprüfter Fokusstop liegt außerhalb des 320-px-Viewports. Bedienelemente haben Labels, jede Seite hat genau eine H1, Navigation-Landmarks sind benannt, ARIA-Referenzen sind gültig, und Ereignis-, Verbindungs- sowie Profiländerungen werden über höfliche Statusbereiche angekündigt.

Der Kontrastcheck maß **3.504 Textpaare** in Tag und Nacht, jeweils mit Ladefehler, leerer Historie und gefüllter Historie. Alle liegen bei mindestens **4,5:1**; der niedrigste gemessene Wert ist **5,51:1**. Die Palette erhält Grün für primäre/positive Zustände, Weiß beziehungsweise helle Flächen für die Tagoberfläche und Violett als sekundäre Akzent- und Fokusfarbe. Im Tagmodus sind Text und Aktionen dunkel auf hell beziehungsweise weiß auf dem dunkleren Aktionsgrün; nachts wechseln Flächen zu dunklem Grün/Neutral und Text zu hell.

## Behobene Befunde

1. **Tag-Kontrast primärer Aktion:** Dunkle Schrift `#092113` auf dem dunklen Taggrün `#146b3b` erreichte nur **2,58:1**. Die Tag-Schaltfläche verwendet jetzt weißen Text auf dem Brandgrün.
2. **Tag-Kontrast Logozeichen:** Das dunkle Zeichen lag auf den dunklen Tag-Akzentstopps der ursprünglichen Grün-/Violett-Verlaufsfläche bei **2,45:1**. Der Tagmodus verwendet nun eine helle Grün-/Violett-Tönung mit dunkler Schrift; der Nachtmodus behält den hellen Verlauf mit dunkler Schrift.
3. **Tastaturfokus auf Radiobuttons:** Die Browser-Standardkontur war nur 1 px und `auto`. Inputs besitzen jetzt dieselbe explizite 3-px-Violettkontur wie Buttons, Links und Selects.
4. **Mobile Navigation Richtung 03:** Bei 320 px konnte ein Tab-Fokus auf den Workspace-Link `#audio` rechts aus dem sichtbaren Viewport reichen (rechte Kante bei ca. 347 px). Die mobil horizontal scrollende Linkleiste ist jetzt ein umbrochenes zweispaltiges Grid; alle Fokusziele bleiben im Viewport.
5. **Radio-Semantik:** Die drei Verbindungszustände hatten einzelne Labels, aber keinen benannten Gruppen-Kontext. Sie stehen jetzt in einem `fieldset` mit lokalisierter, visuell versteckter `legend`.

Die Änderungen liegen ausschließlich in `state-gallery.css`; die Auditregression liegt in `audit-accessibility.cjs`. Die drei Mockup-HTMLs und ihre Screenshots sind unverändert beziehungsweise nach der CSS-Korrektur lokal aktualisiert.

## Erweiterter Audit: 200-%-Zoom, Windows-Kontrastmodus und vollständige Tastaturfolge

Die drei Richtungen wurden zusätzlich in drei Browserkonfigurationen geprüft:

- **200-%-Zoom-Äquivalent:** Chromium mit `deviceScaleFactor=2` und 720 CSS-Pixeln Layoutbreite (entspricht 1440 physischen Pixeln bei effektiv verdoppelter Darstellung). Inhalt, Überschrift, Tastaturfokus und Seitenbreite blieben nutzbar; kein horizontaler Überlauf.
- **Windows forced-colors / High Contrast:** Chromium `forced-colors: active` mit Fehler, leerer und gefüllter Ereignishistorie. Die Systemfarb-Emulation behielt Text-/Bedienelementkontrast über 4,5:1, sichtbaren Tastaturfokus und alle Statushinweise; 320/390/720 CSS-Pixel liefen ohne Seitenüberlauf. Die gerenderten lokalen Vorschauen stehen hier: [01](forced-colors-01-overview.png), [02](forced-colors-02-live-console.png), [03](forced-colors-03-workspaces.png).
- **Reine Tastaturdurchquerung:** Der Fokus wurde ohne Maus von einer frisch geladenen Seite aus mit der Tab-Reihenfolge über sämtliche sichtbaren Links, Buttons, Selects und die ausgewählte Radio-Gruppe geführt. Jeder Stop hatte einen Namen, einen sichtbaren Fokusindikator und lag im Viewport. Die Folge wurde bei 320 px in allen Locales, außerdem im 200-%-Layout und forced-colors-Zustand durchlaufen.

Diese Erweiterung fand keine weiteren reproduzierbaren Barrieren; die Mockup-CSS musste dafür nicht nachgebessert werden. Der Zoomlauf ist eine messbare Layout-/Pixelratio-Emulation, kein Aufruf der Browser-Chrome-Zoomsteuerung. Forced-colors wurde vom Chromium-Testbrowser emuliert, nicht über die Windows-Systemeinstellungen aktiviert.

## Verifikation

- `node audit-accessibility.cjs` — **PASS**: 3 Varianten, 4 Locales, Tag/Nacht plus forced-colors; 4.848 Assertions, 3.924 Kontrastpaare (Minimum 5,51:1), 84 Overflow-Messungen und 180 reine Tastatur-Fokusstopps über 320/390/720 CSS-Pixel und 200-%-Zoom-Äquivalent; 0 externe Requests, 0 JavaScript-Fehler.
- `node verify-state-gallery.cjs` — **PASS**: 12 Variante-/Locale-Läufe, 12 vollständige Zustandsflüsse, 468 Assertions und 216 Overflow-Messungen; keine externen Requests oder JavaScript-Fehler. Screenshots wurden aktualisiert.
- Der Galerieindex lud alle drei lokalen Vorschau-PNGs und öffnete alle Mockups; bei 320 px gab es keinen horizontalen Seitenüberlauf.

## Entscheidung und Grenzen

Dieses Audit wählt **keine** der drei Produkt-/Informationsarchitekturen aus. Es zeigt, dass die lokalen Oberflächen mit den Korrekturen in den geprüften Browserzuständen brauchbar sind; die Wahl zwischen ruhigem Überblick (01), Live-Konsole (02) und Arbeitsbereichen (03) bleibt offen. Richtung 03 braucht bei einer späteren Umsetzung weiter eine klare Trennung zwischen Workspace und aktivem Laufzeitprofil.

Die Tests verwenden lokales Chromium/Edge und ausschließlich synthetische HTML-Zustände. Sie prüfen keine echte Screenreader-Ausgabe, 200-%-Zoom, Betriebssystem-Hochkontrast/forced-colors, echte Profile, Persistenz oder Produkt-Laufzeit. Die Kontrastmessung wertet gerenderte Texte sowie beide expliziten Logo-Verlaufstopps aus; sie ist kein vollständiger Pixel-Audit sämtlicher Anti-Aliasing-Ränder oder später hinzugefügter Inhalte.


