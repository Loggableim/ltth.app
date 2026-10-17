# Isolierte VirtualBox-VM für OBS-Abnahme

Stand: 2026-10-07. Status: eigene VM konfiguriert und Unattended-Vorbereitung erfolgreich ausgeführt; Gast weiterhin ausgeschaltet, Windows-Setup nicht gestartet. Effektiver Zustand und private Auxiliary-ACLs sind verifiziert.

## Auftrag und Grenzen

- Gilt ausschließlich als vorbereitender Beitrag zu Ziel 1, Punkt 2 (OBS-Abnahme).
- Ziel 2 bleibt gesperrt. Die bestehende Reihenfolge aus `ZIELBILD_PRIORITAETEN.md` gilt weiter.
- Bestehende VMs `windows`, `poker`, `nova` und `lastbrowser-acceptance-20261006` wurden nur aufgelistet und bleiben unberührt. Die fremde laufende LastBrowser-VM wird weder geöffnet noch geklont; ihre Zugangsdaten oder Gastdaten werden nicht gelesen.
- Keine ISO-/Softwaredownloads, kein Windows-Setup/Gaststart, keine OBS-/LTTH-Starts, Netzwerk-/Firewalländerung, Profilkopie oder Übertragung produktiver Nutzerdaten. `VBoxManage unattended install` lief ausschließlich für die autorisierte neue VM mit `--start-vm=none`; es erzeugte private Hilfsdateien im eigenen VM-Ordner. Der Gast blieb ausgeschaltet.
- Der spätere OBS-Pilot erhält ein eigenes wegwerfbares Windows-Konto, OBS-Profil und eine eigene Testszene. Für Projektdateien später nur synthetische Fixtures und eine explizit zusammengestellte, schreibgeschützte Datenträger-ISO verwenden; keine Host-Freigabe und kein Profil-/Credential-Transfer.

## Read-only-Befunde

- VirtualBox CLI: `7.2.4r170995`; Virtualisierung wird unterstützt.
- Vor der Einrichtung waren nur vier VMs registriert; `ltth-obs-pilot-20261007` wurde anschließend ausschließlich neu angelegt. Bestehende VMs blieben unberührt.
- Host laut `VBoxManage list hostinfo`: Ryzen 9 5950X, 32 logische Prozessoren / 16 Kerne, 32,686 MiB RAM gesamt, zuletzt **5,470 MiB verfügbar**. Das reicht nicht für einen sicheren 4-GiB-Gaststart; die VM-Konfiguration benötigt diese physische Reserve nicht.
- `C:` hatte vor der Einrichtung 337,431,113,728 Bytes (ca. 314.3 GiB) frei. Zielordner `C:\Virtualbox\VMs\ltth-obs-pilot-20261007` war vorher nicht vorhanden. Die dynamische 100-GiB-VDI belegt nach VirtualBox-Auskunft 2 MiB; Kapazität 102,400 MiB.
- Primäres lokales ISO `C:\Virtualbox\ISOs\Win11_24H2.iso` wurde zuerst als Home/Pro erkannt. Nach CEO-Freigabe wurde das alternative, bereits vorhandene ISO nur read-only geprüft: `C:\projekte\lastbrowser\output\vm-acceptance\media\windows-enterprise-eval-x64-en-us.iso`, 8,225,329,152 Bytes. `VBoxManage unattended detect --iso=... --machine-readable` erkennt `Windows11_64`, `EnterpriseEval`, x64/en-US, Build `10.0.26300.9457`, Image-Index 1. Kein Hash wurde für das Enterprise-Eval-ISO erhoben.
- `VBoxManage showmediuminfo dvd <ISO>` bestätigt `Type: readonly`, `State: locked read`; das Image bleibt am bestehenden LastBrowser-Gast und ist zusätzlich als DVD in der neuen VM referenziert. Keine Kopie oder ISO-Änderung.
- Eine lokale `C:\Program Files\Oracle\VirtualBox\VBoxGuestAdditions.iso` (53,153,792 Bytes) ist vorhanden. Release-Match/Inhalt wurde nicht geprüft; keine Guest Additions installiert.
- VirtualBox-Registry wurde ausschließlich nach der neuen UUID `1d436b46-6288-4c8c-8270-30df1e527329` abgefragt; sie verweist auf `C:\Virtualbox\VMs\ltth-obs-pilot-20261007\ltth-obs-pilot-20261007.vbox`. Der eigene VM-Ordner und die `.vbox` gehören dem aktuellen Windows-Benutzer. Andere Registryeinträge wurden nicht ausgelesen.

## Angelegte VM (ohne Gaststart)

| Einstellung | Iststand | Grund / Grenze |
|---|---|---|
| Name/Pfad | `ltth-obs-pilot-20261007`, `C:\Virtualbox\VMs\ltth-obs-pilot-20261007` | Neuer, eigener Ordner; keine vorhandene VM wird wiederverwendet. |
| Gast | Windows 11 Enterprise Evaluation x64, ISO-Image-Index 1, en-US | Lokal read-only als `EnterpriseEval` erkannt; Evaluationsbedingungen gelten. Kein Aktivierungsbypass. |
| CPU | 2 vCPU | Windows-11-VM-Minimum; Host hat 32 logische CPUs. |
| RAM | 4,096 MiB konfiguriert | Windows-11-Minimum; für OBS, Browser und LTTH eng. Nicht starten, solange nicht mindestens 8 GiB Host-RAM verfügbar sind; Fremd-VM nicht beenden, VM nicht mit 2 GiB erzwingen. |
| Disk | 100 GiB dynamisch, eigene VDI im VM-Ordner | Abweichung von 64 GiB ist für Windows-Evaluation, OBS, LTTH-Arbeitsstand und synthetische Fixtures begründet. Dynamische Größe wächst bis zum Maximum; vor Erstellung waren über 120 GiB frei. |
| Firmware/Sicherheit | EFI und vTPM 2.0 konfiguriert; Secure Boot noch nicht verifiziert | Eskalierter `showvminfo` bestätigte EFI; das XML bestätigt TPM `v2_0`. Secure Boot wird vom vorhandenen VBoxManage weder angezeigt noch als `modifyvm`-Option angeboten; nicht aus EFI ableiten. |
| Netzwerk | NIC 1–8 deaktiviert (`none`) | Eskalierter `showvminfo` meldet alle Adapter `disabled`. Das XML enthält bei Slot 0 ein `<NAT/>`-Unterelement, aber kein `enabled="true"`; NAT-Modus ist bei deaktiviertem Adapter nicht aktiv. |
| Host-Integration | USB, Drag-and-drop, Zwischenablage, Dateiübertragung, VRDE und Autostart wurden ausgeschaltet; keine Shared Folders angelegt | Sofortiger `showvminfo` bestätigte die Schalter. Transfer später nur über eine dedizierte read-only ISO mit Fixtures/Hashmanifest. |
| Video | 128 MiB VRAM, VMSVGA, 3D-Beschleunigung aus | UI/Browser-/OBS-Sichtprüfung; WebGPU-/GPU-Pass nicht daraus ableiten. Falls OBS/Renderer hier nicht lauffähig ist, konkret als VM-Grenze melden. |

Microsoft nennt für Windows 11 mindestens 4 GB RAM, zwei Prozessoren und 64 GB Speicher sowie UEFI-/Secure-Boot-Fähigkeit und TPM 2.0. VirtualBox lokal bestätigt EFI und TPM-2.0-Optionen; Secure Boot muss vor einem späteren Start gesondert verifiziert werden. OBS-Lauffähigkeit und GPU-/Encoderleistung sind damit nicht garantiert.

## Installations- und Zugangsdaten

- `unattended detect --iso=... --machine-readable` bestätigte das vorhandene Enterprise-Evaluation-Medium (Image-Index 1, x64/en-US). Danach wurde die autorisierte Unattended-Vorbereitung für ausschließlich die eigene UUID ausgeführt.
- Erfolgreicher Aufruf am 2026-10-07 01:01:24 Europe/Vienna (2026-10-06 23:01:24 UTC), Exitcode 0, für genau diese VM-UUID. Er nutzte das kurzlebige Konto `ltth-obs-test`, ein einzigartiges zufälliges Testpasswort über `--user-password-file=stdin`, `--no-install-additions` und `--start-vm=none`. Passwortinhalt und Shell-Eingabe wurden weder ausgegeben noch protokolliert oder in dieses Dokument aufgenommen; VBoxManage-stdout/stderr wurden verworfen. Der PowerShell-Wrapper gab zusätzlich zwei nichtvertrauliche `System.Threading.Tasks.VoidTaskResult`-Zeilen und die Erfolgsbestätigung aus.
- Dateinamen-/Größeninventar aus dem eigenen VM-Ordner (ohne Inhalte): `Unattended-1d436b46-6288-4c8c-8270-30df1e527329-autounattend.xml` (13,051 Bytes), `Unattended-1d436b46-6288-4c8c-8270-30df1e527329-aux-iso.viso` (354 Bytes), `Unattended-1d436b46-6288-4c8c-8270-30df1e527329-VBOXPOST.CMD` (2,551 Bytes). Antwortdatei/Hilfsmedien können Klartext-Zugangsdaten enthalten und bleiben private Auxiliary-Artefakte; sie sind nur im eigenen VM-Ordner abgelegt, nicht im Git, in einer Freigabe oder in einem Backup. Ein späterer `Get-FileHash`-Versuch wurde vom Dateisystem mit „Access denied“ abgewiesen; ACLs wurden nicht gelockert, Inhalte nicht geöffnet, daher keine SHA-256-Werte behauptet.
- Der DACL des exakt eigenen VM-Ordners wurde nach UUID-/Pfadprüfung rekursiv auf den aktuellen Benutzer, SYSTEM und lokale Administratoren beschränkt und danach für alle sechs Objekte bestätigt. Keine ACL eines anderen VM-Ordners wurde geändert.
- `--no-install-additions` ist beabsichtigt; Guest Additions/Guest Control sind daher nicht verfügbar. Für späteren Dateiübertrag nur synthetische Fixtures plus Hashmanifest auf einer eigens erstellten schreibgeschützten Daten-ISO bereitstellen und im Gast manuell über die VirtualBox-Konsole kopieren. Keine Shared Folders, Zwischenablage, Drag-and-drop oder Netzverbindung einschalten.
- Lokal existiert `C:\Program Files\Oracle\VirtualBox\VBoxGuestAdditions.iso` (53,153,792 Bytes); der Versions-/Hash-Match wurde nicht geprüft. Falls spätere Automation mit Guest Control nötig wird, zunächst nach gesonderter Freigabe Version und Hash gegen die installierte VirtualBox verifizieren und offline installieren; die übrigen Integrationswege bleiben aus.
- `unattended install` bereitete nur die Installation vor. Durch `--start-vm=none` lief weder Windows-Setup noch Gaststart. Frischer read-only `showvminfo`-Abruf am 2026-10-07 01:06:51 Europe/Vienna bestätigte weiterhin `VMState="poweroff"`, `nic1` bis `nic8="none"`, 4,096 MiB, 2 CPUs, EFI und VRDE aus. Kein Produktiv-/Microsoft-Login, Key oder Projektzugang verwendet; kein Aktivierungsbypass. Evaluation-Bedingungen des Mediums gelten. Kein Extension Pack eingeplant.
## Einrichtung und Verifikation

- Nach CEO-Freigabe wurden nur die neue VM `ltth-obs-pilot-20261007`, die eigene 100-GiB-dynamische VDI und ihre leeren SATA-/DVD-Controller erstellt. Die Windows-Evaluation-ISO wurde als DVD angeschlossen.
- Der Einrichtungslauf endete durch den falschen Prüfaufruf `showmediuminfo <ISO>` mit Exitcode 1; VBoxManage behandelte das ISO als Festplattenmedium. VM/VDI wurden dadurch nicht zurückgerollt. Danach korrekt ausgeführt als `showmediuminfo dvd <ISO>`: `readonly`, `locked read`.
- Das direkt nach `modifyvm` gelesene `showvminfo --machinereadable` meldete `VMState="poweroff"`, NIC 1–8 `none`, 4,096 MiB, 2 CPUs, EFI, VMSVGA, 3D aus, Clipboard/Drag-and-drop/USB/VRDE aus. `list runningvms` zeigte damals nur `lastbrowser-acceptance-20261006`; der neue Gast wurde nicht gestartet.
- Standard-Sandbox-Aufrufe von `showvminfo` scheiterten an der Ausführungsumgebung; das war kein nachgewiesener VM-Session-Lock. Ein schmal eskalierter read-only Abruf der eigenen VM-UUID gelang anschließend.
- Der aktuelle effektive `showvminfo`-Status bestätigt `VMState="poweroff"`, `memory=4096`, `cpus=2`, Firmware `EFI`, NIC 1–8 `none`/`disabled`, VRDE/USB/Clipboard/Dateiübertragung/Drag-and-drop aus. Der DVD-Eintrag verweist auf das Enterprise-Evaluation-ISO, die SATA-Platte auf die eigene VDI.
- Read-only `.vbox`-XML im eigenen Ordner bestätigt UUID, EFI, TPM `v2_0`, VDI-Verknüpfung und 4,096 MiB. Bei Netzwerkslot 0 steht `<NAT/>` ohne `enabled="true"`; der erfolgreiche effektive VBoxManage-Status bestätigt, dass der Adapter deaktiviert ist. Die XML-Datei warnt vor manuellem Editieren; sie wurde nicht geändert. Das eigene Logs-Unterverzeichnis existiert nicht, da die VM nie gebootet wurde. VBoxSVC-weite Logs wurden nicht gelesen.
- ACL-Nachprüfung: DACL aller sechs Objekte im exakt eigenen VM-Ordner enthält nur aktuellen Benutzer, SYSTEM und lokale Administratoren; keine unerwarteten ACEs. Die Einschränkung erfolgte nach Verifikation von UUID, absolutem Zielpfad und fehlenden Reparse Points. Keine anderen Pfade oder VM-Ordner geändert.
- Secure Boot wurde nicht geprüft oder verändert. Die vorhandene VBoxManage-Hilfe enthält keine entsprechende CLI-Option; `showvminfo` listet keinen Secure-Boot-Status. Oracle dokumentiert die Einstellung in der VirtualBox-Manager-GUI. Keine GUI-/VM-Änderung vorgenommen.

## Offene Entscheidungen / nächste Schritte

1. Der Gaststart bleibt ausdrücklich auf später verschoben. Vor einer künftigen, separat freigegebenen Installation/Abnahme RAM erneut prüfen; niemals eine fremde VM beenden, um Ressourcen freizumachen.
2. Secure Boot ist nicht verifiziert oder verändert. Vor dem späteren Windows-Setup im VirtualBox-Manager gezielt nur den Status dieser VM prüfen, falls die konkrete Installations-/Abnahmeanforderung es verlangt; EFI allein ist kein Secure-Boot-Nachweis.
3. Der geplante Fixture-Transfer ist eine schreibgeschützte Daten-ISO mit synthetischen Daten und Hashmanifest. OBS-Pilot und jede Nutzung externer Dienste benötigen weiterhin eine eigene Freigabe; Ziel 2 bleibt gesperrt.
4. Guest Additions sind nicht installiert. Für spätere Automatisierung zuerst lokalen ISO-Release/Hash verifizieren und die Installation separat autorisieren. Bis dahin manueller Offline-Transfer per read-only ISO und VirtualBox-Konsole.
Eine Registrierung der eigenen VM ist bereits in `VirtualBox.xml` nachgewiesen. Daher gibt es aktuell keinen belegten Grund für eine erneute Registrierung. Falls nach CEO-Review trotzdem ein Registrierungsfehler nachweisbar bleibt, zunächst einen zielgenauen Recovery-Plan für genau diese UUID/Datei vorlegen; bis dahin weder `unregistervm` noch `registervm`, Löschen oder Klonen ausführen.

## Quellen

- Microsoft, [Windows 11 requirements](https://learn.microsoft.com/en-us/windows/whats-new/windows-11-requirements) (Hardware- und VM-Mindestanforderungen).
- Oracle, [VirtualBox User Guide 7.2](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/index.html) (VM-/Unattended-Installationsoptionen; das lokale `VBoxManage unattended detect` ist direkt ausgeführt worden).
- Oracle, [Working with Virtual Machines, Secure Boot](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/working-with-vms.html) (Secure Boot wird als Einstellung im VirtualBox-Manager beschrieben; die installierte VBoxManage-CLI zeigt keine entsprechende Option).
- Microsoft, [Licensing Windows for use with virtual machines](https://download.microsoft.com/download/9/8/D/98D6A56C-4D79-40F4-8462-DA3ECBA2DC2C/Licensing_Windows_Desktop_OS_for_Virtual_Machines.pdf) (allgemeine Virtualisierungslizenzierungsübersicht; maßgeblich bleiben die dem konkreten ISO und der bestehenden Lizenz beigefügten Bedingungen).
