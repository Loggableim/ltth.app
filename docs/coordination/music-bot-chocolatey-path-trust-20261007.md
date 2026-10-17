# Music Bot Chocolatey-Pfadvertrauen — 2026-10-07

## Auftrag und Umfang

Read-only-Prüfung der erhöht gestarteten MPV-Installation über
`C:\ProgramData\chocolatey\bin\choco.exe`. Es wurden keine Produktdateien,
ACLs, Einstellungen oder Dateien der Installation verändert. Chocolatey,
PowerShell-Elevation, UAC und Installer wurden nicht gestartet.

## Ergebnis

Die vorherige Codeversion prüfte mit `realpath` und `stat` einen bereits
vorhandenen Symlink/Junction, der beim Auflösen aus dem festgelegten Pfad
herausführt: Sie akzeptierte nur den aufgelösten Namen
`C:\ProgramData\chocolatey\bin\choco.exe` und eine reguläre Datei. Node
dokumentiert, dass `realpath` den kanonischen Pfad durch Auflösen symbolischer
Links liefert, während `stat` Links verfolgt. Das belegt keine eindeutige
Dateiidentität: Hardlinks können dieselbe Datei unter mehreren Namen zeigen.
Die vorherige Implementierung las auch nicht für jede Pfadkomponente den
Reparse-Status per Handle. Der erhöhte Chocolatey-Pfad ist im Folgepatch
vollständig entfernt.

**P1-Befund für Installationen ohne vorhandenen Chocolatey-Ordner:** Auf
diesem Host hat `C:\ProgramData` eine `BUILTIN\Users`-ACE mit `Write`.
Microsoft ordnet den Verzeichnis-Schreibrechten das Erstellen von Dateien und
Unterverzeichnissen zu. Fehlt `C:\ProgramData\chocolatey`, kann ein
unprivilegierter Benutzer daher voraussichtlich den Chocolatey-Unterbaum samt
`bin\choco.exe` vorab anlegen. Die Anwendung prüfte zum Auditzeitpunkt weder
Besitzer/DACL noch die Datei-Signatur zur Laufzeit. Ein solches exakt
platzierbares, reguläres `choco.exe` hätte die damalige
Pfad-/`realpath`-/`stat`-Prüfung bestanden. **Das wurde nicht durch
Dateierstellung getestet**; es folgt
aus der beobachteten Parent-ACL und den dokumentierten Directory-Write-Rechten.

Auf diesem Host existiert der Chocolatey-Unterbaum bereits: Er hat eine
geschützte Administrator-DACL, Administratoren als Besitzer, und normale
Benutzer besitzen nur Lesen/Ausführen. Damit verhindert die aktuelle
ACL-Momentaufnahme einen normalen Benutzer-Austausch in diesem vorhandenen
Unterbaum. Die Absicherung ist aber nicht auf Hosts ohne vorhandenen
Administrator-eigenen Unterbaum übertragbar.

Auch **TOCTOU** war in der vorherigen Implementierung nicht allgemein
ausgeschlossen: `realpath` und `stat` schlossen ihre Prüfungen ab; der spätere
erhöhte Start öffnete den Pfad über PowerShell und `cmd.exe` erneut. Ein
Schreiber mit passenden Rechten könnte zwischen Prüfung und Öffnen Datei oder
Verzeichniseintrag austauschen. Die aktuelle DACL schließt das für normale
Benutzer im bestehenden Unterbaum dieses Hosts aus, nicht aber für einen
vorab user-erstellten Unterbaum auf anderen Hosts.

**Empfehlung:** Zusätzliche Windows-DACL-/Owner-Prüfung wäre nötig, bevor der
feste Pfad allgemein als vertrauenswürdig gelten kann. Sie müsste fail-closed
für alle Pfadkomponenten und die Datei prüfen, insbesondere auf untrusted
`FILE_ADD_FILE`, `FILE_ADD_SUBDIRECTORY`, `DELETE`, `WRITE_DAC`, `WRITE_OWNER`
und Datei-Schreibrechte. Nur eine erneute Prüfung direkt vor `spawn` verkürzt
das TOCTOU-Fenster, beseitigt es aber nicht. Der Folgeauftrag hat deshalb den
erhöhten Chocolatey-Fallback vorerst vollständig entfernt.

## Quellfundstellen

- `app/plugins/music-bot/main.js:873-890`: Windows-Autoinstall gibt nur
  Winget oder Scoop zurück; ohne diese Wege `null`. Chocolatey-Auflösung,
  Validator und Elevated-Command-Builder wurden entfernt.
- `app/plugins/music-bot/main.js:920-963`: bei fehlendem Installationsbefehl
  endet `_startMpvInstall()` mit `unavailable`, bevor `spawn` erreicht wird.
- `app/plugins/music-bot/main.js:806-825`: allgemeine Fehlerklassifikation;
  ehemals Chocolatey-spezifische Schlüssel können auch durch andere
  Paketmanager-Ausgaben erreicht werden.
- `app/plugins/music-bot/locales/{de,en,es,fr}.json`: manuelle Installation,
  Pfadkonfiguration und neutrale Timeout-/Lock-/Berechtigungstexte.
- `app/test/music-bot-chocolatey-elevation.test.js`: vorgepflanzter
  Standardpfad führt weder zu Elevated Command noch zu Process-Start;
  Erreichbarkeit und Übersetzungen werden geprüft.

## Folgeauftrag — Elevated-Chocolatey deaktiviert (2026-10-07)

- Die erhöhte Chocolatey-Ausführung ist fail-closed deaktiviert, bis eine
  robuste Windows-ACL-/Owner-/TOCTOU-Prüfung vorliegt. Winget und Scoop bleiben
  unverändert; MPV-Discovery über vorhandene Chocolatey-Dateien bleibt ein
  nicht erhöhter Suchpfad.
- Windows-Setup nennt jetzt Winget/Scoop oder die manuelle Installation von
  `https://mpv.io/installation/` plus Pfad unter Einstellungen > Wiedergabe.
  Ohne unterstützten automatischen Weg erscheint die manuelle Anleitung. Für
  Chocolatey-only-Systeme ist eine manuelle Installation erforderlich.
- `mpvInstallTimedOut`, `mpvInstallAdminConfirmation`,
  `mpvInstallPermissionDenied` und `mpvInstallChocolateyLock` sind über
  Prozessausgang/Timeouts weiterhin erreichbar. Sie enthalten neutrale
  Paketmanagertexte; kein Text empfiehlt, LTTH als Administrator zu starten.
  Der sichtbare Chocolatey-Schlüsselname `mpvInstallChocolateyLock` bleibt aus
  Kompatibilitätsgründen intern bestehen; sein sichtbarer Text ist generisch.
  `mpvInstallWindowsPrompt` wurde ebenfalls neutralisiert; aktuell setzt jedoch
  kein Installationsbefehl `opensWindow`.
- RED vorher bestätigt. Danach: Chocolatey-/Origin-Suites 2 Suites, 19 Tests
  bestanden; zwei fokussierte bestehende Windows-MPV-Tests bestanden. Keine
  Installer-, Elevation-, Server- oder UAC-Prozesse gestartet.
- Änderungen bleiben uncommitted und unterliegen CEO-Abnahme.

Technische Quellen:

- [Node.js v22 `fs.realpath`](https://nodejs.org/download/release/latest-jod/docs/api/fs.html#fsrealpathpath-options-callback): löst `.`/`..` und symbolische Links auf; kanonische Pfade sind wegen Hardlinks nicht eindeutig.
- [Node.js v22 `fs.stat`](https://nodejs.org/download/release/latest-jod/docs/api/fs.html#fsstatpath-options-callback): folgt symbolischen Links.
- [Microsoft: Reparse Points](https://learn.microsoft.com/en-us/windows/win32/fileio/reparse-points): Reparse-Points können Verhalten beim Öffnen eines Pfades ändern.
- [Microsoft: Reparse Points and File Operations](https://learn.microsoft.com/en-us/windows/win32/fileio/reparse-points-and-file-operations): verweist für explizite Behandlung auf handlebasierte Öffnung mit `FILE_FLAG_OPEN_REPARSE_POINT`.
- [Microsoft: File Security and Access Rights](https://learn.microsoft.com/en-us/windows/win32/fileio/file-security-and-access-rights): Zugriffsrechte liegen in Security Descriptors/DACLs; Parent-DACL steuert nicht automatisch den Zugriff auf vorhandene Kinder.
- [Microsoft: Win32_Directory access rights](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-directory): Directory `FILE_ADD_FILE`/`FILE_ADD_SUBDIRECTORY`-Rechte steuern das Erstellen von Dateien/Unterverzeichnissen.

## ACL- und Dateibefund dieses Hosts

Abfragezeit: 2026-10-07 (lokaler Host, nur PowerShell `Get-Item`, `Get-Acl`,
`Get-FileHash` und `Get-AuthenticodeSignature`; keine ACL- oder Dateiänderung).

| Pfad | Besitzer / relevante DACL | Reparse-Status |
| --- | --- | --- |
| `C:\ProgramData` | `NT AUTHORITY\SYSTEM`; `BUILTIN\Users` hat `Write` | kein `ReparsePoint` |
| `C:\ProgramData\chocolatey` | `BUILTIN\Administrators`; geschützte DACL (`D:PAI`), `SYSTEM` und Administratoren `FullControl`, `BUILTIN\Users` nur `ReadAndExecute, Synchronize` | kein `ReparsePoint` |
| `C:\ProgramData\chocolatey\bin` | Administratoren; geerbte DACL wie Chocolatey-Verzeichnis, Benutzer nur `ReadAndExecute, Synchronize` | kein `ReparsePoint` |
| `C:\ProgramData\chocolatey\bin\choco.exe` | Administratoren; geerbte DACL wie Bin-Verzeichnis, Benutzer nur `ReadAndExecute, Synchronize` | kein `ReparsePoint` |

Der schreibbare `ProgramData`-Elternordner ist damit sichtbar; das vorhandene
Chocolatey-Unterverzeichnis hat jedoch eine geschützte DACL und ist für normale
Benutzer nicht schreibbar. Ein fehlendes Unterverzeichnis wäre anders zu
bewerten: Der Parent erlaubt das Vorab-Anlegen eines Childs, das der jetzige
Code dann nicht per Owner/DACL abgleicht. Das ist die relevante
Hostabweichung, die der nächste Codeauftrag absichern muss.

`choco.exe`: 147040 Bytes, Besitzer `BUILTIN\Administrators`,
Authenticode-Status `Valid`, Signierer `Chocolatey Software, Inc.`.

SHA-256:

```text
1FECDAD81B1DA8C252F6B0AAD54273E693FFB33650F6AED95F135F8C2C89B317
```

## Portabler Regressionstestvertrag

Unit-Tests sollen Pfad-, Datei-, Reparse- und ACL-Prüfer injizieren; sie dürfen
keine Installationskommandos, Shells, PowerShell, `Start-Process`, UAC oder
Chocolatey starten. Mindestens abdecken:

1. Exakter Standardpfad, reguläre Datei, finale Identität und sichere DACL
   werden akzeptiert; das bisherige Argumentarray bleibt exakt und wird nur
   an einen Start-Stub übergeben.
2. CWD-/PATH-/`ChocolateyInstall`-Kandidaten, relativer Pfad, UNC-Pfad,
   Symlink/Junction auf ein externes Ziel und nicht reguläre Datei werden
   abgewiesen.
3. ACL- oder Owner-Abfragefehler, beschreibbare Verzeichnis-/Datei-ACL,
   nicht vertrauenswürdiger Besitzer und ein vorab von `BUILTIN\\Users`
   angelegter Chocolatey-Unterbaum werden fail-closed abgewiesen.
4. Pfad-/Dateiidentitätsänderung zwischen Preflight und Start wird in einem
   injizierten Race-Test abgewiesen oder durch die Startschnittstelle
   ausgeschlossen.
5. Es wird geprüft, dass `where choco`, Umgebungspfade und beliebige
   Shell-Auflösung nicht zur Ermittlung des erhöhten Executables dienen.
6. Bestehendes Verhalten für Winget/Scoop bleibt unverändert.

Für einen separaten Windows-Integrationstest können kontrollierte Dateien und
Reparse-Fixtures in einem temporären Verzeichnis verwendet werden. Auch dieser
Test darf ausschließlich Prüfergebnisse und den injizierten Start-Stub
beobachten; er startet nie ein echtes Programm erhöht.
