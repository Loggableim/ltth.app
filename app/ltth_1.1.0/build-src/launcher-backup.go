package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const (
	colorReset  = "\033[0m"
	colorRed    = "\033[31m"
	colorGreen  = "\033[32m"
	colorYellow = "\033[33m"
	colorCyan   = "\033[36m"
	
	// Node.js compatibility constants
	minVisualStudio2019RequiredVersion = 24
	supportedVersionRange = "18.x bis 23.x"
)

var logFile *os.File

func initLogging(exeDir string) error {
	logPath := filepath.Join(exeDir, "launcher-debug.log")
	var err error
	logFile, err = os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return fmt.Errorf("Kann Log-Datei nicht erstellen: %v", err)
	}
	
	log.SetOutput(logFile)
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)
	
	logMsg("========================================")
	logMsg("Launcher Backup - Neuer Start")
	logMsg(fmt.Sprintf("Zeitstempel: %s", time.Now().Format("2006-01-02 15:04:05")))
	logMsg(fmt.Sprintf("Betriebssystem: %s", runtime.GOOS))
	logMsg(fmt.Sprintf("Architektur: %s", runtime.GOARCH))
	logMsg("========================================")
	
	return nil
}

func logMsg(msg string) {
	if logFile != nil {
		log.Println(msg)
	}
	fmt.Println(msg)
}

func logError(msg string, err error) {
	errMsg := fmt.Sprintf("FEHLER: %s: %v", msg, err)
	if logFile != nil {
		log.Println(errMsg)
	}
	fmt.Printf("%s%s%s\n", colorRed, errMsg, colorReset)
}

func logSuccess(msg string) {
	if logFile != nil {
		log.Println("ERFOLG: " + msg)
	}
	fmt.Printf("%s%s%s\n", colorGreen, msg, colorReset)
}

func logWarning(msg string) {
	if logFile != nil {
		log.Println("WARNUNG: " + msg)
	}
	fmt.Printf("%s%s%s\n", colorYellow, msg, colorReset)
}

func logInfo(msg string) {
	if logFile != nil {
		log.Println("INFO: " + msg)
	}
	fmt.Printf("%s%s%s\n", colorCyan, msg, colorReset)
}

func printHeader() {
	fmt.Println("================================================")
	fmt.Println("  TikTok Stream Tool - Backup Launcher")
	fmt.Println("  Mit detailliertem Logging")
	fmt.Println("================================================")
	fmt.Println()
}

func checkNodeJS() (string, error) {
	logInfo("Pruefe Node.js Installation...")
	
	nodePath, err := exec.LookPath("node")
	if err != nil {
		logError("Node.js nicht gefunden", err)
		return "", fmt.Errorf("Node.js ist nicht installiert")
	}
	
	logSuccess(fmt.Sprintf("Node.js gefunden: %s", nodePath))
	return nodePath, nil
}

func getNodeVersion(nodePath string) string {
	logInfo("Hole Node.js Version...")
	
	cmd := exec.Command(nodePath, "--version")
	output, err := cmd.Output()
	if err != nil {
		logError("Kann Node.js Version nicht ermitteln", err)
		return "unknown"
	}
	
	version := strings.TrimSpace(string(output))
	logSuccess(fmt.Sprintf("Node.js Version: %s", version))
	return version
}

func checkNodeVersionCompatibility(nodePath string) bool {
	logInfo("Pruefe Node.js Versions-Kompatibilitaet...")
	
	cmd := exec.Command(nodePath, "--version")
	output, err := cmd.Output()
	if err != nil {
		logWarning("Kann Node.js Version nicht pruefen")
		return true // Allow to continue if we can't check
	}
	
	version := strings.TrimSpace(string(output))
	logInfo(fmt.Sprintf("Geprueft: %s", version))
	
	// Parse version string (e.g., "v24.11.1" -> 24)
	if len(version) > 1 && version[0] == 'v' {
		// Split by dot to get major version
		parts := strings.Split(version[1:], ".")
		if len(parts) > 0 {
			majorVersion, err := strconv.Atoi(parts[0])
			if err != nil {
				logWarning(fmt.Sprintf("Kann Hauptversion nicht parsen: %s", version))
				return true // Allow to continue if we can't parse
			}
			
			logInfo(fmt.Sprintf("Erkannte Hauptversion: %d", majorVersion))
			
			// Check if version requires Visual Studio 2019+ for native module compilation
			if majorVersion >= minVisualStudio2019RequiredVersion {
				logError("Node.js Version nicht kompatibel", fmt.Errorf("Version %s ist zu neu", version))
				logWarning(fmt.Sprintf("Dieses Tool unterstuetzt Node.js %s", supportedVersionRange))
				logWarning(fmt.Sprintf("Node.js v%d+ erfordert Visual Studio 2019+ Build Tools", minVisualStudio2019RequiredVersion))
				return false
			}
		}
	}
	
	logSuccess("Node.js Version ist kompatibel")
	return true
}

func checkNodeModules(appDir string) bool {
	logInfo("Pruefe node_modules Verzeichnis...")
	
	nodeModulesPath := filepath.Join(appDir, "node_modules")
	logInfo(fmt.Sprintf("Pruefe Pfad: %s", nodeModulesPath))
	
	info, err := os.Stat(nodeModulesPath)
	if err != nil {
		logWarning(fmt.Sprintf("node_modules nicht gefunden: %v", err))
		return false
	}
	
	if !info.IsDir() {
		logWarning("node_modules existiert aber ist kein Verzeichnis")
		return false
	}
	
	logSuccess("node_modules gefunden")
	return true
}

func installDependencies(appDir string) error {
	logInfo("Starte npm install...")
	logInfo("Dies kann beim ersten Start mehrere Minuten dauern")
	
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		logInfo("Verwende Windows CMD fuer npm install")
		cmd = exec.Command("cmd", "/C", "npm", "install")
	} else {
		logInfo("Verwende direktes npm install")
		cmd = exec.Command("npm", "install")
	}
	
	cmd.Dir = appDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	
	logInfo(fmt.Sprintf("Arbeitsverzeichnis: %s", appDir))
	logInfo("Fuehre npm install aus...")
	
	err := cmd.Run()
	if err != nil {
		logError("npm install fehlgeschlagen", err)
		
		// Provide helpful troubleshooting information
		if runtime.GOOS == "windows" {
			logWarning("========================================")
			logWarning("Haeufige Ursachen fuer npm install Fehler:")
			logWarning("1. Node.js Version zu neu (v24+)")
			logWarning("   -> Loesung: Node.js v20 LTS oder v22 installieren")
			logWarning("   -> Download: https://nodejs.org/en/download/")
			logWarning("")
			logWarning("2. Fehlende Visual Studio Build Tools")
			logWarning("   -> Benoetigt fuer better-sqlite3 und andere native Module")
			logWarning("   -> Loesung: Visual Studio Build Tools installieren")
			logWarning("   -> Download: https://visualstudio.microsoft.com/downloads/")
			logWarning("   -> Waehle: 'Desktop development with C++'")
			logWarning("")
			logWarning("3. Alternative: Verwende vorkompilierte Version")
			logWarning("   -> Kontaktiere Support fuer vorkompilierte Pakete")
			logWarning("========================================")
		}
		
		return fmt.Errorf("Installation fehlgeschlagen: %v", err)
	}
	
	logSuccess("npm install erfolgreich abgeschlossen")
	return nil
}

func startTool(nodePath, appDir string) error {
	logInfo("Starte Tool...")
	
	launchJS := filepath.Join(appDir, "launch.js")
	logInfo(fmt.Sprintf("Launch-Script: %s", launchJS))
	
	// Check if launch.js exists
	if _, err := os.Stat(launchJS); os.IsNotExist(err) {
		logError("launch.js nicht gefunden", err)
		return fmt.Errorf("launch.js nicht gefunden: %s", launchJS)
	}
	
	logSuccess("launch.js gefunden")
	logInfo(fmt.Sprintf("Starte: %s %s", nodePath, launchJS))
	
	cmd := exec.Command(nodePath, launchJS)
	cmd.Dir = appDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	
	err := cmd.Run()
	if err != nil {
		logError("Tool konnte nicht gestartet werden", err)
		return err
	}
	
	logSuccess("Tool erfolgreich beendet")
	return nil
}

func pause() {
	fmt.Println()
	fmt.Print("Druecke Enter zum Beenden...")
	fmt.Scanln()
}

func main() {
	printHeader()
	
	// Get executable directory first
	exePath, err := os.Executable()
	if err != nil {
		fmt.Printf("KRITISCHER FEHLER: Kann Programmverzeichnis nicht ermitteln: %v\n", err)
		pause()
		os.Exit(1)
	}
	
	exeDir := filepath.Dir(exePath)
	fmt.Printf("Programmverzeichnis: %s\n", exeDir)
	fmt.Println()
	
	// Initialize logging
	err = initLogging(exeDir)
	if err != nil {
		fmt.Printf("WARNUNG: Logging konnte nicht initialisiert werden: %v\n", err)
		fmt.Println("Fahre ohne Logging fort...")
		fmt.Println()
	} else {
		logPath := filepath.Join(exeDir, "launcher-debug.log")
		logSuccess(fmt.Sprintf("Logging aktiviert: %s", logPath))
	}
	
	// Check Node.js installation
	nodePath, err := checkNodeJS()
	if err != nil {
		fmt.Println()
		fmt.Println("===============================================")
		fmt.Println("  FEHLER: Node.js ist nicht installiert!")
		fmt.Println("===============================================")
		fmt.Println()
		fmt.Println("Bitte installiere Node.js von:")
		fmt.Println("https://nodejs.org")
		fmt.Println()
		fmt.Println("Empfohlen: Node.js LTS Version 18 oder 20")
		fmt.Println()
		logError("Node.js nicht installiert - Programm wird beendet", err)
		pause()
		if logFile != nil {
			logFile.Close()
		}
		os.Exit(1)
	}
	
	// Show Node.js version
	version := getNodeVersion(nodePath)
	fmt.Printf("Node.js Version: %s\n", version)
	
	// Check Node.js version compatibility
	if !checkNodeVersionCompatibility(nodePath) {
		fmt.Println()
		fmt.Println("===============================================")
		fmt.Println("  WARNUNG: Node.js Version Inkompatibilitaet!")
		fmt.Println("===============================================")
		fmt.Println()
		fmt.Println("Deine Node.js Version ist zu neu (v24+).")
		fmt.Println()
		fmt.Println("Dieses Tool benoetigt Node.js v18, v20 oder v22.")
		fmt.Println()
		fmt.Println("Node.js v24+ erfordert Visual Studio 2019 oder neuer")
		fmt.Println("mit 'Desktop development with C++' Workload fuer")
		fmt.Println("die Kompilierung nativer Module (better-sqlite3).")
		fmt.Println()
		fmt.Println("EMPFOHLENE LOESUNG:")
		fmt.Println("1. Deinstalliere Node.js v24")
		fmt.Println("2. Installiere Node.js v20 LTS von:")
		fmt.Println("   https://nodejs.org/en/download/")
		fmt.Println()
		fmt.Println("ALTERNATIVE (Erweitert):")
		fmt.Println("1. Installiere Visual Studio Build Tools 2019+")
		fmt.Println("2. Waehle 'Desktop development with C++' Workload")
		fmt.Println("3. Download: https://visualstudio.microsoft.com/downloads/")
		fmt.Println()
		fmt.Print("Moechtest Du trotzdem fortfahren? (j/n): ")
		
		var response string
		fmt.Scanln(&response)
		
		if response != "j" && response != "J" {
			logInfo("Benutzer hat Installation abgebrochen")
			if logFile != nil {
				logFile.Close()
			}
			os.Exit(0)
		}
		
		logWarning("Benutzer faehrt mit inkompatibler Node.js Version fort")
	}
	
	fmt.Println()
	
	appDir := filepath.Join(exeDir, "app")
	logInfo(fmt.Sprintf("App-Verzeichnis: %s", appDir))
	
	// Check if app directory exists
	if _, err := os.Stat(appDir); os.IsNotExist(err) {
		logError("app Verzeichnis nicht gefunden", err)
		fmt.Printf("Fehler: app Verzeichnis nicht gefunden in %s\n", exeDir)
		pause()
		if logFile != nil {
			logFile.Close()
		}
		os.Exit(1)
	}
	
	logSuccess("app Verzeichnis gefunden")
	
	// Check and install node_modules if needed
	if !checkNodeModules(appDir) {
		fmt.Println()
		err = installDependencies(appDir)
		if err != nil {
			fmt.Println()
			fmt.Println("===============================================")
			fmt.Printf("  FEHLER: %v\n", err)
			fmt.Println("===============================================")
			fmt.Println()
			pause()
			if logFile != nil {
				logFile.Close()
			}
			os.Exit(1)
		}
		fmt.Println()
	} else {
		logInfo("node_modules bereits vorhanden, ueberspringe Installation")
	}
	
	// Start the tool
	fmt.Println()
	err = startTool(nodePath, appDir)
	if err != nil {
		logError("Fehler beim Starten des Tools", err)
		fmt.Printf("Fehler beim Starten: %v\n", err)
	}
	
	// Close log file before exit
	if logFile != nil {
		logMsg("Launcher wird beendet")
		logMsg("========================================")
		logFile.Close()
	}
	
	// Pause before exit
	pause()
}
