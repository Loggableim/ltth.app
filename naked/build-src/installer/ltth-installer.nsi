; ============================================================================
; PupCid's Little TikTool Helper (LTTH) - NSIS Installer Script
; ============================================================================
; Version: 1.2.0
; Description: Professional TikTok LIVE Streaming Tool Installer
; License: CC-BY-NC-4.0
; NSIS Version: 3.11+ (Windows 10/11 compatible)
; Last Updated: 2025-12-18
; ============================================================================

; ============================================================================
; INCLUDES
; ============================================================================
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "Sections.nsh"
!include "WinVer.nsh"
!include "x64.nsh"
!include "WordFunc.nsh"

; Import macros from FileFunc
!insertmacro GetSize
!insertmacro GetTime
!insertmacro DriveSpace
!insertmacro GetRoot

; Import version compare function
!insertmacro VersionCompare

; ============================================================================
; INSTALLER CONFIGURATION
; ============================================================================

; Application Information
!define PRODUCT_NAME "PupCid's Little TikTool Helper"
!define PRODUCT_NAME_SHORT "LTTH"
!define PRODUCT_VERSION "1.3.3"
!define PRODUCT_PUBLISHER "PupCid / Loggableim"
!define PRODUCT_WEB_SITE "https://ltth.app"
!define PRODUCT_DIR_REGKEY "Software\Microsoft\Windows\CurrentVersion\App Paths\launcher.exe"
!define PRODUCT_UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME_SHORT}"
!define PRODUCT_UNINST_ROOT_KEY "HKLM"

; Paths (relative to build-src/installer directory)
!define BUILD_DIR ".."
!define APP_DIR "../../app"
!define ASSETS_DIR "../assets"

; Constants
!define NOSHORTCUTS_ENABLED "1"
!define MIN_DISK_SPACE_MB 500  ; Minimum required disk space in MB

; Installer Properties
Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "LTTH-Setup-${PRODUCT_VERSION}.exe"
InstallDir "$PROGRAMFILES64\${PRODUCT_NAME_SHORT}"
InstallDirRegKey HKLM "${PRODUCT_DIR_REGKEY}" ""
ShowInstDetails show
ShowUnInstDetails show
RequestExecutionLevel admin
SetCompressor /SOLID lzma
SetCompressorDictSize 64
SetDatablockOptimize on
BrandingText "${PRODUCT_NAME} ${PRODUCT_VERSION} © ${PRODUCT_PUBLISHER}"

; Unicode support for international characters (NSIS 3.x)
Unicode True

; Windows 10/11 compatibility - modern manifest support
ManifestDPIAware true
ManifestSupportedOS all

; CRC Check for installer integrity
CRCCheck on

; Silent install support
SilentInstall normal
SilentUnInstall normal

; ============================================================================
; CODE SIGNING CONFIGURATION
; ============================================================================
; Sign the installer and uninstaller using Windows signtool with Certum
; cloud signing certificates from Windows Certificate Store.
;
; To enable signing:
; 1. Set environment variable: SIGN_ENABLED=1
; 2. Install certificate in Windows Certificate Store (use Certum SimplySign Desktop)
; 3. Optional: Set SIGNTOOL_PATH to custom signtool.exe location
; 4. Optional: Set TIMESTAMP_URL to custom timestamp server
;
; The signing process uses sign-file.bat which automatically:
; - Locates signtool.exe in Windows SDK directories
; - Uses /a to automatically select the best certificate
; - Timestamps the signature using DigiCert (or custom server)
; - Verifies the signature after signing
;
; If SIGN_ENABLED is not set to "1", signing is skipped (no error)
; ============================================================================

; Sign the installer executable after it's created
; This is called by NSIS after the installer is built
!finalize 'sign-file.bat "%1"'

; Sign the uninstaller stub before it's embedded in the installer
; The uninstaller is extracted and signed, then re-embedded
!uninstfinalize 'sign-file.bat "%1"'

; ============================================================================
; MODERN UI CONFIGURATION
; ============================================================================

; Modern UI Settings
!define MUI_ABORTWARNING
!define MUI_ICON "${BUILD_DIR}\icon.ico"
!define MUI_UNICON "${BUILD_DIR}\icon.ico"

; Header and Sidebar Images
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "installer-header.bmp"
!define MUI_HEADERIMAGE_UNBITMAP "installer-header.bmp"
!define MUI_WELCOMEFINISHPAGE_BITMAP "installer-sidebar.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "installer-sidebar.bmp"

; Welcome Page Settings
!define MUI_WELCOMEPAGE_TITLE "Welcome to ${PRODUCT_NAME} Setup"
!define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of ${PRODUCT_NAME} ${PRODUCT_VERSION}.$\r$\n$\r$\nProfessional TikTok LIVE streaming tool with overlays, alerts, TTS, automation, and an extensive plugin ecosystem.$\r$\n$\r$\nClick Next to continue."

; Finish Page Settings
!define MUI_FINISHPAGE_TITLE "Installation Complete"
!define MUI_FINISHPAGE_TEXT "${PRODUCT_NAME} has been successfully installed.$\r$\n$\r$\nClick Finish to close this wizard."
!define MUI_FINISHPAGE_RUN "$INSTDIR\launcher.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch ${PRODUCT_NAME}"
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\app\README.md"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Show README"
!define MUI_FINISHPAGE_LINK "Visit ${PRODUCT_WEB_SITE}"
!define MUI_FINISHPAGE_LINK_LOCATION "${PRODUCT_WEB_SITE}"

; License Page Settings
!define MUI_LICENSEPAGE_CHECKBOX

; ============================================================================
; INSTALLER PAGES
; ============================================================================

; Page order
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "license.txt"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY

; Custom Start Menu Configuration Page (using StartMenu.dll)
; This provides a more flexible start menu folder selection dialog
Var StartMenuFolder
Var NoShortcuts
Page custom StartMenuPage

!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; Uninstaller Pages
!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

; ============================================================================
; LANGUAGES
; ============================================================================
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "German"
!insertmacro MUI_LANGUAGE "French"
!insertmacro MUI_LANGUAGE "Spanish"

; Custom language strings for English
LangString DESC_SEC_CORE ${LANG_ENGLISH} "Core application files (required)"
LangString DESC_SEC_NODEJS ${LANG_ENGLISH} "Portable Node.js runtime for running the application"
LangString DESC_SEC_DESKTOP ${LANG_ENGLISH} "Creates a desktop shortcut"
LangString DESC_SEC_STARTMENU ${LANG_ENGLISH} "Creates Start Menu shortcuts"
LangString DESC_SEC_QUICKLAUNCH ${LANG_ENGLISH} "Creates a Quick Launch shortcut"
LangString DESC_SEC_FILEASSOC ${LANG_ENGLISH} "Associates .ltth files with ${PRODUCT_NAME}"
LangString DESC_SEC_FIREWALL ${LANG_ENGLISH} "Adds Windows Firewall exception for network functionality"
LangString DESC_SEC_AUTOSTART ${LANG_ENGLISH} "Automatically starts ${PRODUCT_NAME} when Windows boots"

; Custom language strings for German
LangString DESC_SEC_CORE ${LANG_GERMAN} "Kernanwendungsdateien (erforderlich)"
LangString DESC_SEC_NODEJS ${LANG_GERMAN} "Portable Node.js-Laufzeit zum Ausführen der Anwendung"
LangString DESC_SEC_DESKTOP ${LANG_GERMAN} "Erstellt eine Desktop-Verknüpfung"
LangString DESC_SEC_STARTMENU ${LANG_GERMAN} "Erstellt Startmenü-Verknüpfungen"
LangString DESC_SEC_QUICKLAUNCH ${LANG_GERMAN} "Erstellt eine Schnellzugriff-Verknüpfung"
LangString DESC_SEC_FILEASSOC ${LANG_GERMAN} "Verknüpft .ltth-Dateien mit ${PRODUCT_NAME}"
LangString DESC_SEC_FIREWALL ${LANG_GERMAN} "Fügt Windows-Firewall-Ausnahme für Netzwerkfunktionalität hinzu"
LangString DESC_SEC_AUTOSTART ${LANG_GERMAN} "Startet ${PRODUCT_NAME} automatisch beim Windows-Start"

; Custom language strings for French
LangString DESC_SEC_CORE ${LANG_FRENCH} "Fichiers d'application de base (requis)"
LangString DESC_SEC_NODEJS ${LANG_FRENCH} "Runtime Node.js portable pour exécuter l'application"
LangString DESC_SEC_DESKTOP ${LANG_FRENCH} "Crée un raccourci sur le bureau"
LangString DESC_SEC_STARTMENU ${LANG_FRENCH} "Crée des raccourcis dans le menu Démarrer"
LangString DESC_SEC_QUICKLAUNCH ${LANG_FRENCH} "Crée un raccourci de lancement rapide"
LangString DESC_SEC_FILEASSOC ${LANG_FRENCH} "Associe les fichiers .ltth avec ${PRODUCT_NAME}"
LangString DESC_SEC_FIREWALL ${LANG_FRENCH} "Ajoute une exception au pare-feu Windows pour les fonctionnalités réseau"
LangString DESC_SEC_AUTOSTART ${LANG_FRENCH} "Démarre automatiquement ${PRODUCT_NAME} au démarrage de Windows"

; Custom language strings for Spanish
LangString DESC_SEC_CORE ${LANG_SPANISH} "Archivos de aplicación principales (requeridos)"
LangString DESC_SEC_NODEJS ${LANG_SPANISH} "Runtime Node.js portátil para ejecutar la aplicación"
LangString DESC_SEC_DESKTOP ${LANG_SPANISH} "Crea un acceso directo en el escritorio"
LangString DESC_SEC_STARTMENU ${LANG_SPANISH} "Crea accesos directos en el menú Inicio"
LangString DESC_SEC_QUICKLAUNCH ${LANG_SPANISH} "Crea un acceso directo de inicio rápido"
LangString DESC_SEC_FILEASSOC ${LANG_SPANISH} "Asocia archivos .ltth con ${PRODUCT_NAME}"
LangString DESC_SEC_FIREWALL ${LANG_SPANISH} "Añade excepción del firewall de Windows para funcionalidad de red"
LangString DESC_SEC_AUTOSTART ${LANG_SPANISH} "Inicia automáticamente ${PRODUCT_NAME} cuando Windows arranca"

; ============================================================================
; INSTALLER INITIALIZATION
; ============================================================================

; Splash Screen Function
Function .onInit
  ; Check for administrator privileges
  UserInfo::GetAccountType
  Pop $0
  ${If} $0 != "admin"
    MessageBox MB_ICONSTOP "Administrator privileges required.$\n$\nPlease right-click the installer and select 'Run as Administrator'."
    SetErrorLevel 740 ; ERROR_ELEVATION_REQUIRED
    Quit
  ${EndIf}
  
  ; Check Windows version (minimum Windows 10)
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "This application requires Windows 10 or later.$\n$\nYour Windows version is not supported."
    Abort
  ${EndIf}
  
  ; Detect x64 architecture
  ${If} ${RunningX64}
    DetailPrint "Detected 64-bit Windows"
  ${Else}
    MessageBox MB_ICONEXCLAMATION|MB_YESNO "Warning: You are running 32-bit Windows.$\n$\n${PRODUCT_NAME} is optimized for 64-bit systems. Continue anyway?" IDYES +2
    Abort
  ${EndIf}
  
  ; Initialize plugins directory for AdvSplash
  InitPluginsDir
  
  ; Copy splash screen BMP to plugins directory
  ; The splash-screen.bmp file is located in the same directory as this .nsi script
  File "/oname=$PluginsDir\spltmp.bmp" "splash-screen.bmp"
  
  ; Show splash screen using AdvSplash plugin
  ; advsplash::show Delay FadeIn FadeOut KeyColor FileName
  ; - Delay: 2000ms (2 seconds) - how long to show the splash
  ; - FadeIn: 600ms - fade-in effect duration
  ; - FadeOut: 400ms - fade-out effect duration  
  ; - KeyColor: -1 (no transparency)
  ; - FileName: $PluginsDir\spltmp (without .bmp extension)
  ;
  ; Note: Requires AdvSplash.dll plugin installed in NSIS\Plugins\x86-unicode\
  ; Download from: https://nsis.sourceforge.io/AdvSplash_plug-in
  ; If plugin is not available, installer will show error but continue
  advsplash::show 2000 600 400 -1 $PluginsDir\spltmp
  
  Pop $0 ; $0 has '1' if user closed splash early, '0' if normal, '-1' if error
  
  ; Fallback: If AdvSplash failed (error or not installed), show Banner plugin
  ${If} $0 == -1
    Banner::show /NOUNLOAD /set 76 "Installing ${PRODUCT_NAME}" "Please wait while setup initializes..."
    Sleep 1500
    Banner::destroy
  ${EndIf}
  
  ; Check if LTTH is currently running
  Call CheckRunning
  
  ; Check if already installed
  ReadRegStr $R0 ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "UninstallString"
  StrCmp $R0 "" check_disk_space
  
  ; Get installed version
  ReadRegStr $R1 ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayVersion"
  
  ; Compare versions
  ${VersionCompare} "$R1" "${PRODUCT_VERSION}" $R2
  ; $R2 = 0: versions are equal
  ; $R2 = 1: installed version is newer
  ; $R2 = 2: this version is newer
  
  ${If} $R2 == 0
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION \
    "${PRODUCT_NAME} ${PRODUCT_VERSION} is already installed.$\n$\nClick OK to repair the installation or Cancel to abort." \
    IDOK uninst
    Abort
  ${ElseIf} $R2 == 1
    MessageBox MB_YESNO|MB_ICONEXCLAMATION \
    "A newer version ($R1) of ${PRODUCT_NAME} is already installed.$\n$\nDo you want to downgrade to version ${PRODUCT_VERSION}?" \
    IDYES uninst
    Abort
  ${Else}
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION \
    "${PRODUCT_NAME} $R1 is currently installed.$\n$\nClick OK to upgrade to version ${PRODUCT_VERSION} or Cancel to abort." \
    IDOK uninst
    Abort
  ${EndIf}
  
uninst:
  ClearErrors
  ; Run uninstaller silently to avoid double prompts
  ExecWait '$R0 /S _?=$INSTDIR'
  
check_disk_space:
  ; Check available disk space
  Call CheckDiskSpace
  
done:
FunctionEnd

; ============================================================================
; CUSTOM START MENU PAGE
; ============================================================================

; StartMenu.dll custom page - allows user to select Start Menu folder
; with option to skip shortcut creation
Function StartMenuPage
  ; Initialize NoShortcuts variable for clarity
  StrCpy $NoShortcuts ""
  
  ; Read last used folder from registry (may not exist on first install)
  ReadRegStr $StartMenuFolder HKLM "${PRODUCT_UNINST_KEY}" "Start Menu Folder"
  
  ; If no previous value, use default
  StrCmp $StartMenuFolder "" 0 +2
    StrCpy $StartMenuFolder "${PRODUCT_NAME_SHORT}"
  
  ; Show the StartMenu selection dialog
  ; /autoadd - automatically adds program name to selected folder
  ; /text - custom header text
  ; /lastused - pre-fill with last used folder
  ; /checknoshortcuts - show "Don't create shortcuts" checkbox
  StartMenu::Select /autoadd \
    /text "Select the Start Menu folder where you would like to create program shortcuts:" \
    /lastused "$StartMenuFolder" \
    /checknoshortcuts "Don't create Start Menu shortcuts" \
    "${PRODUCT_NAME_SHORT}"
  
  Pop $0 ; Return value: "success", "cancel" or error
  Pop $1 ; Selected folder (or >folder if no shortcuts checkbox is checked)
  
  ; Check if user cancelled
  StrCmp $0 "cancel" 0 +2
    Abort
  
  ; Check if user wants no shortcuts
  ; StartMenu.dll prefixes the folder name with '>' when the "Don't create shortcuts" checkbox is checked
  StrCpy $2 $1 1 ; Get first character
  StrCmp $2 ">" 0 +3
    StrCpy $NoShortcuts "${NOSHORTCUTS_ENABLED}"
    StrCpy $1 $1 "" 1 ; Remove > prefix
    
  ; Save the selected folder
  StrCpy $StartMenuFolder $1
FunctionEnd

; ============================================================================
; INSTALLATION SECTIONS
; ============================================================================

; Core Application (Required)
Section "!LTTH Core Application" SEC_CORE
  SectionIn RO  ; Read-only (required)
  
  ; Backup existing user data if upgrading
  Call BackupUserData
  
  SetOutPath "$INSTDIR"
  SetOverwrite on
  
  ; Show progress banner
  Banner::show /NOUNLOAD "Installing Core Files" "Installing launcher and executables..."
  
  ; Install launcher executable
  File "${BUILD_DIR}\launcher.exe"
  File "${BUILD_DIR}\icon.ico"
  
  ; Install build-src resources (assets and locales for launcher GUI)
  SetOutPath "$INSTDIR\build-src\assets"
  File /nonfatal "${BUILD_DIR}\assets\launcher.html"
  SetOutPath "$INSTDIR\build-src\locales"
  File /nonfatal "${BUILD_DIR}\locales\*.json"
  SetOutPath "$INSTDIR"
  
  ; Install ltthgit.exe (optional cloud launcher)
  IfFileExists "${BUILD_DIR}\ltthgit.exe" 0 +2
    File "${BUILD_DIR}\ltthgit.exe"
  
  Banner::destroy
  
  ; Install app directory
  Banner::show /NOUNLOAD "Installing Application" "Copying application files..."
  SetOutPath "$INSTDIR\app"
  
  ; Copy root-level files first (exclude backup files and git files)
  File /nonfatal /x "*.md~" /x ".git*" "${APP_DIR}\*.*"
  
  ; Copy subdirectories individually, excluding runtime-generated directories:
  ; - logs: Contains Winston audit files (.*.json) that cause NSIS errors
  ; - node_modules: Runtime dependencies installed by npm
  ; Using /nonfatal to skip files that can't be opened (e.g., locked files, permission issues)
  ; IMPORTANT: If compilation fails with "failed opening file" errors, extract the repo to a SHORT path
  ;            Windows MAX_PATH limit (260 chars) causes issues with long download paths
  ;            Recommended: C:\ltth\ or C:\build\ (NOT C:\Users\...\Downloads\...)
  File /nonfatal /r /x "*.md~" /x ".git*" /x "*.tmp" /x "*.bak" "${APP_DIR}\data"
  File /nonfatal /r /x "*.md~" /x ".git*" /x "*.tmp" /x "*.bak" "${APP_DIR}\docs"
  File /nonfatal /r /x "*.md~" /x ".git*" /x "*.tmp" /x "*.bak" "${APP_DIR}\locales"
  File /nonfatal /r /x "*.md~" /x ".git*" /x "*.tmp" /x "*.bak" "${APP_DIR}\modules"
  File /nonfatal /r /x "*.md~" /x ".git*" /x "*.tmp" /x "*.bak" "${APP_DIR}\plugins"
  File /nonfatal /r /x "*.md~" /x ".git*" /x "*.tmp" /x "*.bak" "${APP_DIR}\public"
  File /nonfatal /r /x "*.md~" /x ".git*" /x "*.tmp" /x "*.bak" "${APP_DIR}\routes"
  File /nonfatal /r /x "*.md~" /x ".git*" /x "*.tmp" /x "*.bak" "${APP_DIR}\scripts"
  File /nonfatal /r /x "*.md~" /x ".git*" /x "*.tmp" /x "*.bak" "${APP_DIR}\test"
  File /nonfatal /r /x "*.md~" /x ".git*" /x "*.tmp" /x "*.bak" "${APP_DIR}\tts"
  File /nonfatal /r /x "*.md~" /x ".git*" /x "*.tmp" /x "*.bak" "${APP_DIR}\user_configs"
  File /nonfatal /r /x "*.md~" /x ".git*" /x "*.tmp" /x "*.bak" "${APP_DIR}\user_data"
  File /nonfatal /r /x "*.md~" /x ".git*" /x "*.tmp" /x "*.bak" "${APP_DIR}\wiki"
  
  ; Create runtime directories that were excluded from packaging
  ; These directories are needed for the application to run properly
  CreateDirectory "$INSTDIR\app\logs"
  
  Banner::destroy
  
  ; Create uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  
  ; Write registry keys
  WriteRegStr HKLM "${PRODUCT_DIR_REGKEY}" "" "$INSTDIR\launcher.exe"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "URLInfoAbout" "${PRODUCT_WEB_SITE}"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "HelpLink" "${PRODUCT_WEB_SITE}"
  WriteRegDWORD ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "NoModify" 1
  WriteRegDWORD ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "NoRepair" 1
  
  ; Calculate and write install size
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}" "EstimatedSize" "$0"
  
  ; Save Start Menu folder choice to registry (for future installations and uninstaller)
  ; This is done here after the uninstall key is created to ensure the key exists
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "Start Menu Folder" "$StartMenuFolder"
SectionEnd

; Node.js Portable Runtime (Optional but Recommended)
Section "Node.js Portable Runtime" SEC_NODEJS
  Banner::show /NOUNLOAD "Installing Node.js" "Installing portable Node.js runtime..."
  
  SetOutPath "$INSTDIR\node"
  
  ; Check if Node.js portable exists
  IfFileExists "${ASSETS_DIR}\node\node.exe" 0 nodejs_missing
    File /r "${ASSETS_DIR}\node\*.*"
    Goto nodejs_done
    
nodejs_missing:
  Banner::destroy
  MessageBox MB_ICONINFORMATION|MB_OK "Node.js portable not found in build-src\assets\node\$\n$\nPlease download Node.js portable and place it in the assets folder before building.$\n$\nDownload from: https://nodejs.org/dist/latest-v18.x/$\n$\nInstallation will continue without Node.js."
  Goto nodejs_done
  
nodejs_done:
  Banner::destroy
SectionEnd

; Desktop Shortcut
Section "Desktop Shortcut" SEC_DESKTOP
  CreateShortCut "$DESKTOP\${PRODUCT_NAME_SHORT}.lnk" "$INSTDIR\launcher.exe" "" "$INSTDIR\icon.ico" 0
SectionEnd

; Start Menu Shortcuts
Section "Start Menu Shortcuts" SEC_STARTMENU
  ; Check if user chose not to create shortcuts
  ; (NoShortcuts is set to "1" when the checkbox was checked)
  StrCmp $NoShortcuts "${NOSHORTCUTS_ENABLED}" skip_shortcuts
  
  ; Create Start Menu folder and shortcuts
  CreateDirectory "$SMPROGRAMS\$StartMenuFolder"
  CreateShortCut "$SMPROGRAMS\$StartMenuFolder\${PRODUCT_NAME_SHORT}.lnk" "$INSTDIR\launcher.exe" "" "$INSTDIR\icon.ico" 0
  CreateShortCut "$SMPROGRAMS\$StartMenuFolder\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  
  ; Optional: Add README and other shortcuts
  IfFileExists "$INSTDIR\app\README.md" 0 +2
    CreateShortCut "$SMPROGRAMS\$StartMenuFolder\README.lnk" "$INSTDIR\app\README.md"
  
skip_shortcuts:
SectionEnd

; Quick Launch Shortcut (Windows 7+)
Section /o "Quick Launch Shortcut" SEC_QUICKLAUNCH
  CreateShortCut "$QUICKLAUNCH\${PRODUCT_NAME_SHORT}.lnk" "$INSTDIR\launcher.exe" "" "$INSTDIR\icon.ico" 0
SectionEnd

; File Associations
Section /o "File Associations" SEC_FILEASSOC
  DetailPrint "Registering file associations..."
  
  ; Register .ltth file extension (for LTTH configuration files)
  WriteRegStr HKCR ".ltth" "" "LTTH.ConfigFile"
  WriteRegStr HKCR "LTTH.ConfigFile" "" "${PRODUCT_NAME} Configuration"
  WriteRegStr HKCR "LTTH.ConfigFile\DefaultIcon" "" "$INSTDIR\icon.ico"
  WriteRegStr HKCR "LTTH.ConfigFile\shell\open\command" "" '"$INSTDIR\launcher.exe" "%1"'
  
  ; Notify Windows of file association changes
  System::Call 'shell32.dll::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
SectionEnd

; Windows Firewall Exception
Section /o "Windows Firewall Exception" SEC_FIREWALL
  DetailPrint "Adding Windows Firewall exception..."
  
  ; Add firewall rule for launcher.exe
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="${PRODUCT_NAME}" dir=in action=allow program="$INSTDIR\launcher.exe" enable=yes profile=private,domain'
  
  ; Check if successful
  Pop $0
  ${If} $0 == 0
    DetailPrint "Firewall exception added successfully"
  ${Else}
    DetailPrint "Warning: Could not add firewall exception (this may require manual configuration)"
  ${EndIf}
SectionEnd

; Auto-start with Windows
Section /o "Run at Windows Startup" SEC_AUTOSTART
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_NAME_SHORT}" "$INSTDIR\launcher.exe"
SectionEnd

; ============================================================================
; SECTION DESCRIPTIONS
; ============================================================================

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_CORE} $(DESC_SEC_CORE)
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_NODEJS} $(DESC_SEC_NODEJS)
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_DESKTOP} $(DESC_SEC_DESKTOP)
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_STARTMENU} $(DESC_SEC_STARTMENU)
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_QUICKLAUNCH} $(DESC_SEC_QUICKLAUNCH)
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_FILEASSOC} $(DESC_SEC_FILEASSOC)
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_FIREWALL} $(DESC_SEC_FIREWALL)
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_AUTOSTART} $(DESC_SEC_AUTOSTART)
!insertmacro MUI_FUNCTION_DESCRIPTION_END

; ============================================================================
; UNINSTALLER
; ============================================================================

Section "Uninstall"
  ; Show progress
  Banner::show /NOUNLOAD "Uninstalling ${PRODUCT_NAME}" "Removing files and shortcuts..."
  
  ; Ask if user wants to keep user data
  MessageBox MB_YESNO|MB_ICONQUESTION "Do you want to keep your user data and settings?$\n$\n(Choosing 'No' will permanently delete all your data)" IDYES keep_data
  
  ; Remove user data if user chose not to keep it
  RMDir /r "$INSTDIR\app\user_data"
  RMDir /r "$INSTDIR\app\user_configs"
  
keep_data:
  
  ; Remove files and directories
  Delete "$INSTDIR\launcher.exe"
  Delete "$INSTDIR\ltthgit.exe"
  Delete "$INSTDIR\icon.ico"
  Delete "$INSTDIR\Uninstall.exe"
  Delete "$INSTDIR\install.log"
  
  ; Remove app directory (excluding user data if kept)
  RMDir /r "$INSTDIR\app\logs"
  RMDir /r "$INSTDIR\app\modules"
  RMDir /r "$INSTDIR\app\plugins"
  RMDir /r "$INSTDIR\app\public"
  RMDir /r "$INSTDIR\app\routes"
  RMDir /r "$INSTDIR\app\scripts"
  RMDir /r "$INSTDIR\app\test"
  RMDir /r "$INSTDIR\app\tts"
  RMDir /r "$INSTDIR\app\docs"
  RMDir /r "$INSTDIR\app\data"
  RMDir /r "$INSTDIR\app\locales"
  RMDir /r "$INSTDIR\app\wiki"
  Delete "$INSTDIR\app\*.*"
  
  ; Remove build-src directory (launcher resources)
  RMDir /r "$INSTDIR\build-src"
  
  ; Remove node directory
  RMDir /r "$INSTDIR\node"
  
  ; Remove shortcuts
  Delete "$DESKTOP\${PRODUCT_NAME_SHORT}.lnk"
  Delete "$QUICKLAUNCH\${PRODUCT_NAME_SHORT}.lnk"
  
  ; Remove Start Menu shortcuts
  ; Read the saved folder name from registry
  ReadRegStr $StartMenuFolder HKLM "${PRODUCT_UNINST_KEY}" "Start Menu Folder"
  
  ; If we have a start menu folder, remove shortcuts
  StrCmp $StartMenuFolder "" skip_startmenu_removal
  Delete "$SMPROGRAMS\$StartMenuFolder\${PRODUCT_NAME_SHORT}.lnk"
  Delete "$SMPROGRAMS\$StartMenuFolder\Uninstall.lnk"
  Delete "$SMPROGRAMS\$StartMenuFolder\README.lnk"
  RMDir "$SMPROGRAMS\$StartMenuFolder"
  
skip_startmenu_removal:
  
  ; Remove file associations
  DeleteRegKey HKCR ".ltth"
  DeleteRegKey HKCR "LTTH.ConfigFile"
  
  ; Notify Windows of file association changes
  System::Call 'shell32.dll::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
  
  ; Remove Windows Firewall exception
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${PRODUCT_NAME}"'
  
  ; Remove auto-start registry entry
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_NAME_SHORT}"
  
  ; Try to remove installation directory (will fail if user data was kept)
  RMDir "$INSTDIR\app"
  RMDir "$INSTDIR"
  
  ; Remove registry keys
  DeleteRegKey ${PRODUCT_UNINST_ROOT_KEY} "${PRODUCT_UNINST_KEY}"
  DeleteRegKey HKLM "${PRODUCT_DIR_REGKEY}"
  
  Banner::destroy
  
  MessageBox MB_ICONINFORMATION|MB_OK "${PRODUCT_NAME} has been successfully uninstalled.$\n$\nThank you for using ${PRODUCT_NAME}!"
SectionEnd

; ============================================================================
; VPATCH UPDATER INTEGRATION
; ============================================================================
; VPatch Integration Notes:
; 
; To enable automatic updates using VPatch:
; 1. Install VPatch plugin for NSIS (copy VPatch.dll to NSIS\Plugins)
; 2. Generate patch files using GenPat.exe (included with VPatch)
; 3. Create update server to host patch files
; 4. Add update check logic to launcher or app
;
; Example VPatch usage:
; VPatch::vpatchfile "old-version.exe" "new-version.exe" "patch.dat"
; Pop $0 ; Return value
;
; For implementation:
; - Create separate update installer that applies patches
; - Implement version checking in launcher.exe
; - Download and apply patches when available
; - See NSIS\Docs\VPatch\Readme.html for full documentation
;
; This section is prepared for future implementation.
; The actual update mechanism should be implemented in the launcher application.

; ============================================================================
; HELPER FUNCTIONS
; ============================================================================

; Check for running instances
Function CheckRunning
check_again:
  ; Try to find launcher.exe process using tasklist
  nsExec::ExecToStack 'tasklist /FI "IMAGENAME eq launcher.exe" /NH'
  Pop $0 ; Return value
  Pop $1 ; Output
  
  ; Check if process is running (output will contain "launcher.exe" if running)
  StrCmp $1 "" notrunning  ; Empty output means no process found
  
  ; Check if output contains "INFO:" which means no tasks found
  Push $1
  Push "INFO:"
  Call StrStrCheck
  Pop $2
  
  StrCmp $2 "" found_process notrunning
  
found_process:
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION \
  "${PRODUCT_NAME} is currently running.$\n$\nPlease close it and click Retry to continue, or Cancel to abort installation." \
  IDRETRY check_again IDCANCEL abort
  
abort:
  Quit
  
notrunning:
FunctionEnd

; Helper function to check if string contains substring
Function StrStrCheck
  Exch $R0 ; Needle
  Exch
  Exch $R1 ; Haystack
  Push $R2
  Push $R3
  Push $R4
  Push $R5
  StrLen $R2 $R0
  StrLen $R3 $R1
  StrCpy $R4 0
  
  ${While} $R4 < $R3
    StrCpy $R5 $R1 $R2 $R4
    ${If} $R5 == $R0
      StrCpy $R0 $R4
      Goto done
    ${EndIf}
    IntOp $R4 $R4 + 1
  ${EndWhile}
  StrCpy $R0 ""
  
done:
  Pop $R5
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Exch $R0
FunctionEnd

; Check available disk space
Function CheckDiskSpace
  ; Get the drive where installation is happening
  StrCpy $0 $INSTDIR 2
  
  ; Get free space on drive (in KB)
  ${GetRoot} "$INSTDIR" $1
  ${DriveSpace} "$1" "/D=F /S=K" $2 $3
  
  ; Convert required MB to KB
  IntOp $4 ${MIN_DISK_SPACE_MB} * 1024
  
  ; Compare available space with required space
  IntCmp $2 $4 space_ok space_ok space_error
  
space_error:
  ; Convert KB to MB for display
  IntOp $5 $2 / 1024
  MessageBox MB_ICONSTOP \
  "Insufficient disk space!$\n$\nRequired: ${MIN_DISK_SPACE_MB} MB$\nAvailable: $5 MB$\n$\nPlease free up disk space and try again."
  Abort
  
space_ok:
FunctionEnd

; Backup user data before upgrade
Function BackupUserData
  ; Check if this is an upgrade (user_data directory exists)
  IfFileExists "$INSTDIR\app\user_data\*.*" 0 no_backup
  
  DetailPrint "Backing up user data..."
  
  ; Create backup directory with timestamp using NSIS time functions
  ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6
  ; $0 = Year, $1 = Month, $2 = Day, $3 = DayOfWeek, $4 = Hour, $5 = Minute, $6 = Second
  
  StrCpy $7 "$INSTDIR\app\user_data_backup_$0$1$2_$4$5$6"
  
  ; Copy user data to backup
  CopyFiles /SILENT "$INSTDIR\app\user_data\*.*" "$7"
  
  ; Save backup path to registry for restore option
  WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "LastBackupPath" "$7"
  
  DetailPrint "User data backed up to: $7"
  
no_backup:
FunctionEnd

; Post-installation tasks
Function .onInstSuccess
  ; Create installation log
  ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6
  FileOpen $7 "$INSTDIR\install.log" w
  FileWrite $7 "Installation completed successfully$\r$\n"
  FileWrite $7 "Product: ${PRODUCT_NAME}$\r$\n"
  FileWrite $7 "Version: ${PRODUCT_VERSION}$\r$\n"
  FileWrite $7 "Install Date: $0-$1-$2 $4:$5:$6$\r$\n"
  FileWrite $7 "Install Path: $INSTDIR$\r$\n"
  FileClose $7
  
  MessageBox MB_ICONINFORMATION|MB_OK \
  "${PRODUCT_NAME} ${PRODUCT_VERSION} has been successfully installed!$\n$\nYou can now launch the application from the Start Menu or Desktop shortcut."
FunctionEnd

; Installation failed
Function .onInstFailed
  MessageBox MB_ICONEXCLAMATION|MB_OK \
  "Installation failed. Please check the installation log for details.$\n$\nCommon issues:$\n- Insufficient disk space$\n- Missing administrator privileges$\n- Antivirus interference$\n$\nPlease try again or contact support."
FunctionEnd

; Uninstaller initialization
Function un.onInit
  MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 \
  "Are you sure you want to completely remove ${PRODUCT_NAME} and all of its components?" \
  IDYES +2
  Abort
FunctionEnd

; Uninstaller success
Function un.onUninstSuccess
  HideWindow
FunctionEnd

; ============================================================================
; END OF INSTALLER SCRIPT
; ============================================================================
