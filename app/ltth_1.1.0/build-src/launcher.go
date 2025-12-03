package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

const (
	colorReset  = "\033[0m"
	colorRed    = "\033[31m"
	colorGreen  = "\033[32m"
	colorYellow = "\033[33m"
	colorCyan   = "\033[36m"
)

func printHeader() {
	fmt.Println("================================================")
	fmt.Println("  TikTok Stream Tool - Launcher")
	fmt.Println("================================================")
	fmt.Println()
}

func checkNodeJS() (string, error) {
	nodePath, err := exec.LookPath("node")
	if err != nil {
		return "", fmt.Errorf("Node.js ist nicht installiert")
	}
	return nodePath, nil
}

func getNodeVersion(nodePath string) string {
	cmd := exec.Command(nodePath, "--version")
	output, err := cmd.Output()
	if err != nil {
		return "unknown"
	}
	return string(output)
}

func checkNodeModules(appDir string) bool {
	nodeModulesPath := filepath.Join(appDir, "node_modules")
	info, err := os.Stat(nodeModulesPath)
	if err != nil {
		return false
	}
	return info.IsDir()
}

func installDependencies(appDir string) error {
	fmt.Println("Installiere Abhaengigkeiten... (Das kann beim ersten Start ein paar Minuten dauern)")
	
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/C", "npm", "install", "--cache", "false")
	} else {
		cmd = exec.Command("npm", "install", "--cache", "false")
	}
	
	cmd.Dir = appDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	
	err := cmd.Run()
	if err != nil {
		return fmt.Errorf("Installation fehlgeschlagen: %v", err)
	}
	
	fmt.Println()
	fmt.Println("Installation erfolgreich abgeschlossen!")
	fmt.Println()
	return nil
}

func startTool(nodePath, appDir string) error {
	fmt.Println("Starte Tool...")
	fmt.Println()
	
	launchJS := filepath.Join(appDir, "launch.js")
	cmd := exec.Command(nodePath, launchJS)
	cmd.Dir = appDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	
	return cmd.Run()
}

func pause() {
	fmt.Println()
	fmt.Print("Druecke Enter zum Beenden...")
	fmt.Scanln()
}

func main() {
	printHeader()
	
	// Check Node.js installation
	nodePath, err := checkNodeJS()
	if err != nil {
		fmt.Println("===============================================")
		fmt.Println("  FEHLER: Node.js ist nicht installiert!")
		fmt.Println("===============================================")
		fmt.Println()
		fmt.Println("Bitte installiere Node.js von:")
		fmt.Println("https://nodejs.org")
		fmt.Println()
		fmt.Println("Empfohlen: Node.js LTS Version 18 oder 20")
		fmt.Println()
		pause()
		os.Exit(1)
	}
	
	// Show Node.js version
	fmt.Println("Node.js Version:")
	fmt.Println(getNodeVersion(nodePath))
	
	// Get executable directory and app directory
	exePath, err := os.Executable()
	if err != nil {
		fmt.Printf("Fehler: Kann Programmverzeichnis nicht ermitteln: %v\n", err)
		pause()
		os.Exit(1)
	}
	
	exeDir := filepath.Dir(exePath)
	appDir := filepath.Join(exeDir, "app")
	
	// Check if app directory exists
	if _, err := os.Stat(appDir); os.IsNotExist(err) {
		fmt.Printf("Fehler: app Verzeichnis nicht gefunden in %s\n", exeDir)
		pause()
		os.Exit(1)
	}
	
	// Check and install node_modules if needed
	if !checkNodeModules(appDir) {
		err = installDependencies(appDir)
		if err != nil {
			fmt.Println()
			fmt.Println("===============================================")
			fmt.Printf("  FEHLER: %v\n", err)
			fmt.Println("===============================================")
			fmt.Println()
			pause()
			os.Exit(1)
		}
	}
	
	// Start the tool
	err = startTool(nodePath, appDir)
	if err != nil {
		fmt.Printf("Fehler beim Starten: %v\n", err)
	}
	
	// Pause before exit
	pause()
}
