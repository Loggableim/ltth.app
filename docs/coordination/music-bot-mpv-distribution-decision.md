# Music Bot: MPV-Liefermodell und Distributionsentscheidung

Stand: 07.10.2026. Read-only Entscheidungsvorlage auf Grundlage offizieller Upstream- und Plattformquellen. Keine Rechtsberatung, keine Produkt- oder Installeränderung.

## Kurzempfehlung

Für den nächsten Release MPV als externe, klar dokumentierte Systemvoraussetzung behandeln. Eine optionale Installation aus den Music-Bot-Einstellungen bleibt eine systemweite Aktion über den vorhandenen Paketmanager. MPV erst bündeln, wenn ein verantwortlicher Release-Owner, reproduzierbare und fixierte Builds sowie ein Lizenz- und Sicherheitswartungsprozess für jedes Zielsystem feststehen.

Das ist eine Empfehlung. Die Betreiber- und Rechtsentscheidungen am Ende dieses Dokuments sind offen.

## Fakten aus offiziellen Quellen

### Upstream-Lieferlage und Plattformen

- Die offizielle [mpv-Installationsseite](https://mpv.io/installation/) nennt Windows- und macOS-Binärpakete überwiegend inoffizielle Drittanbieterbuilds. Die First-Party-CI-Builds sind dort als hauptsächlich für Tests gedacht und möglicherweise funktionsunvollständig beschrieben.
- Für Windows dokumentiert mpv Buildunterstützung mit MinGW-w64, Windows SDK und MSYS2. Die Release-Full-Builds sind statisch gelinkt und werden laut [Windows-Buildanleitung](https://github.com/mpv-player/mpv/blob/master/DOCS/compile-windows.md) im FFmpeg-Builds-Container cross-kompiliert. Das belegt einen nachvollziehbaren Buildweg, aber für LTTH wären weiterhin konkrete Commit-, Toolchain-, Abhängigkeits- und Konfigurationspins nötig.
- Für macOS verweist die Installationsseite auf First-Party-CI (mit Testbuild-Einschränkung), Drittanbieterbuilds und Homebrew/MacPorts. Für Linux verweisen die Anweisungen hauptsächlich auf Distributionen und Drittanbieterquellen; mpv warnt, dass Distributionspakete veraltet, ungepflegt oder nicht unterstützt sein können.
- Das [mpv-Sicherheitsdokument](https://github.com/mpv-player/mpv/blob/master/SECURITY.md) unterstützt nur die jeweils neueste stabile Version mit Sicherheitsupdates. Ältere Releases werden nicht gepflegt.

### Lizenz und Buildzusammensetzung

- Laut [mpv-Copyright-/Lizenzübersicht](https://github.com/mpv-player/mpv/blob/master/Copyright) steht mpv standardmäßig unter GPLv2 oder später. Ein LGPLv2.1+-Build setzt voraus, dass keine GPL-only-Dateien verwendet werden; der Schalter `-Dgpl=false` allein erteilt keine Lizenzfreigabe. Upstream empfiehlt derzeit nicht, das CLI-mpv im LGPL-Modus zu bauen.
- Die Lizenz hängt auch von gelinkten Bibliotheken ab. mpv nennt ausdrücklich FFmpeg als Beispiel: Ein GPL-Build von FFmpeg kann die Lizenz des resultierenden Builds beeinflussen.
- FFmpeg dokumentiert in seinen [Legal Considerations](https://ffmpeg.org/legal.html), dass optionale Komponenten FFmpeg von LGPL auf GPL umstellen können. Die dortige Checkliste verlangt unter anderem eine exakt zum ausgelieferten Build passende Source, Buildkonfiguration und passende Hinweise. Deren konkrete Anwendbarkeit auf ein separat gestartetes mpv-Binary muss anhand des tatsächlichen Artefakts rechtlich geprüft werden.
- Die [GPLv2, Abschnitt 3](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html) nennt für Binärverteilung unter anderem die Bereitstellung des vollständigen maschinenlesbaren korrespondierenden Quellcodes oder unter bestimmten Bedingungen ein mindestens drei Jahre gültiges schriftliches Angebot. Die [GPLv3, Abschnitt 6](https://www.gnu.org/licenses/gpl.en.html) enthält eigene Wege zur Bereitstellung korrespondierender Quellen. Maßgeblich ist die tatsächliche Lizenz jedes enthaltenen Bestandteils.
- Bei eigenem macOS-Vertrieb verlangen Apples Dokumente zur [Notarisierung](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) und zu [distribution-signiertem Code](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac) einen Signierungs-/Notarisierungsworkflow für die verteilten Softwareartefakte. Die konkrete Behandlung einer mitgelieferten mpv-Binary im LTTH-Paket ist plattform- und paketabhängig.

### Aktuelles LTTH-Verhalten (Quellcodebefund)

- MPV ist keine Runtime-Abhängigkeit in `app/package.json`; die Root- und App-Start-/Buildskripte integrieren kein mpv-Binary. Die aktiven LTTH-Installer enthalten keine MPV-Installation.
- Music Bot startet mit dem Standardwert `mpv`. `_ensureMpv()` sucht Kandidaten und prüft jeden mit `--version`; einen gefundenen konkreten Pfad speichert es in der Plugin-Konfiguration.
- Windows-Erkennung: bei benutzerdefiniertem Pfad zuerst dieser Pfad; danach Chocolatey `lib/*mpv*/tools/{mpv.exe,mpv.com}`, Chocolatey `bin`, benutzerspezifischer Scoop-Shim, globaler Scoop-Shim, `Program Files/mpv`, `Program Files (x86)/mpv`, passende WinGet-Benutzerpakete, konfigurierter Wert und abschließend PATH-Auflösung (`where mpv`). Beim Standardwert `mpv` wird der direkte Kandidat zunächst übersprungen; `mpv` wird später dennoch als ausführbarer Kandidat getestet, bevor der per PATH aufgelöste Kandidat angefügt wird.
- macOS/Linux: konfigurierter Pfad bzw. Standard `mpv` und anschließend die PATH-Auflösung. Die Windows-spezifische Suche nach Paketmanagerverzeichnissen gilt dort nicht.
- Bei fehlendem MPV meldet Music Bot einen Setupfehler, deaktiviert Wiedergabe und zeigt ein Pfadfeld sowie eine optionale Installationsaktion. Diese Aktion läuft nur nach Nutzerklick über `POST /api/plugins/music-bot/install/mpv`; abhängig vom OS werden winget, Scoop, Chocolatey (mit Erhöhung), Homebrew oder sudo-basierte Linux-Paketmanager verwendet. Das ist keine stille App-Installation und verändert das Betriebssystem des Nutzers.
- Aktive Nutzerdokumentation erklärt die Systemvoraussetzung und das Verhältnis zum LTTH-Installer nicht durchgängig. Eine separate Code-/Runtime-Erkennung ist kein Beleg für eine aktuell installierte oder live geprüfte mpv-Version.

## Optionen

| | Option A — externe Voraussetzung | Option B — MPV mit LTTH bündeln |
|---|---|---|
| Liefermodell | Betreiber installiert MPV selbst oder startet bewusst die vorhandene Paketmanageraktion. LTTH dokumentiert unterstützte Wege und meldet den erkannten Zustand. | LTTH wählt, baut oder übernimmt festgelegte MPV-Artefakte und installiert sie mit der App oder im pluginverwalteten Runtime-Verzeichnis. |
| Vorteile | Keine eigene MPV-Binarylieferung; Nutzer kann OS-/Paketmanager wählen; weniger Releaseartefakte und eigene Patchverantwortung. | Kontrollierbare Version/Hash und ein reproduzierbares Support-Inventar; weniger PATH- und Paketmanagerdrift; identischerer Ausgangspunkt pro Release. |
| Risiken / Kosten | Paketverfügbarkeit, Version, Features und Updateverhalten variieren. Insbesondere Linux-Distributionen können hinter Upstream liegen; Drittanbieterbuilds sind nicht gleichbedeutend mit Upstream-Verifikation. | Lizenz- und Noticeprüfung pro exaktem Build; korrespondierende Sources/Buildskripte; Versionspins; Abhängigkeits-/SBOM-Inventar; Signierung; Sicherheitsüberwachung und Update-/Rollbackprozess. Keine gleichförmige First-Party-Produktbuildquelle für Windows, macOS und Linux. |
| Betrieb | LTTH muss dokumentieren, was erkannt wird, wie man den Pfad konfiguriert und welche Paketmanageraktion ausgeführt wird. | LTTH wird für mpv und die tatsächlich enthaltenen Abhängigkeiten zum Release-/Updateverantwortlichen. Upstream unterstützt Sicherheitsupdates nur für die aktuelle stabile Version. |

## Entscheidung, die jetzt gebraucht wird

**Minimalentscheidung des Produktowners:**

- **A — externe Systemvoraussetzung** bestätigen. Danach wird in einem separaten Auftrag nur die aktive Nutzerdokumentation/Setupdarstellung konsistent gemacht. Das vorhandene Systeminstallationsverhalten und seine Plattformliste müssen ausdrücklich als optionaler, nutzerinitiierter Vorgang erkennbar bleiben.
- **B — Bündelung grundsätzlich verfolgen** bestätigen. Das autorisiert noch keinen Build oder Download. Zuerst folgt ein eigener Design-/Complianceauftrag mit Zielplattformen und Architekturen, Update-SLA, Vertrauenskette/Signierung, Buildpins, Artefaktquellen sowie Source-/Notice-Bereitstellung.

## Offene Betreiber- und Rechtsentscheidungen

### Betreiber-/Produktowner

- Welche Betriebssysteme und Architekturen sind verbindlich unterstützt? Gilt das für Windows x64/ARM64, macOS Intel/Apple Silicon und welche Linux-Distributionen/ABIs?
- Ist eine optionale Installation durch Systempaketmanager gewollt, und sind deren systemweite Änderungen, Admin-/sudo-Abfragen, Paketquellen und Versionsdrift für Nutzer akzeptabel?
- Falls gebündelt: Wer überwacht MPV und FFmpeg/weitere Komponenten, in welchem Zeitraum werden Sicherheitsupdates ausgeliefert, wie wird ein Release zurückgerollt und wie werden Nutzer über veraltete Versionen informiert?
- Welche Downloadseiten, About-/Creditsansichten und Supportversprechen müssen Lizenz- und Quellcodehinweise enthalten?

### Rechtsprüfung

- Wie ist die konkrete getrennt gestartete MPV-CLI zusammen mit LTTH paketiert rechtlich einzuordnen (eigenständiges Programm/Aggregat oder kombinierte Verteilung) und welche Folgen hat die Paket-/Installerform?
- Für die ausgewählte MPV-/FFmpeg-Konfiguration: Welche Lizenzen gelten tatsächlich, welche Notices und Lizenztexte müssen beiliegen, welcher korrespondierende Quellcode samt Build-/Installationsskripten muss angeboten werden und wie lange/auf welchem Weg?
- Enthält der konkrete FFmpeg-/Abhängigkeitsbuild GPL- oder `nonfree`-Komponenten? Sind zusätzliche Codec-/Patentpflichten in den jeweiligen Zielmärkten betroffen?
- Erfüllt die macOS-Paketierung die anwendbaren Signierungs-/Notarisierungsanforderungen für alle verschachtelten ausführbaren Artefakte?

Diese Vorlage entscheidet keine dieser offenen Rechtsfragen und behauptet nicht, MPV könne nicht gebündelt werden. Sie beschreibt, dass Bündelung ein eigenständiges Liefer-, Compliance- und Wartungsprodukt erfordert.
