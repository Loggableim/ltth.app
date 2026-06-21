package main

import (
	"archive/zip"
	"embed"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	"github.com/pkg/browser"
)

//go:embed assets/*
var assets embed.FS

const (
	repoOwner = "Loggableim"
	repoName  = "pupcidslittletiktokhelper"
	repoBranch = "main"
)

type CloudLauncher struct {
	baseDir    string
	progress   int
	status     string
	clients    map[chan string]bool
	logger     *log.Logger
}

func NewCloudLauncher() *CloudLauncher {
	return &CloudLauncher{
		status:   "Initialisiere Cloud Launcher...",
		progress: 0,
		clients:  make(map[chan string]bool),
		logger:   log.New(os.Stdout, "[LTTH Cloud] ", log.LstdFlags),
	}
}

func (cl *CloudLauncher) updateProgress(value int, status string) {
	cl.progress = value
	cl.status = status
	cl.logger.Printf("[%d%%] %s\n", value, status)
	
	msg := fmt.Sprintf(`{"progress": %d, "status": "%s"}`, value, status)
	for client := range cl.clients {
		select {
		case client <- msg:
		default:
		}
	}
}

func (cl *CloudLauncher) sendError(errMsg string) {
	msg := fmt.Sprintf(`{"error": "%s"}`, errMsg)
	for client := range cl.clients {
		select {
		case client <- msg:
		default:
		}
	}
}

// Serve the splash screen
func (cl *CloudLauncher) serveSplash(w http.ResponseWriter, r *http.Request) {
	tmplContent, err := assets.ReadFile("assets/splash.html")
	if err != nil {
		http.Error(w, "Failed to load splash screen", http.StatusInternalServerError)
		return
	}

	tmpl, err := template.New("splash").Parse(string(tmplContent))
	if err != nil {
		http.Error(w, "Failed to parse template", http.StatusInternalServerError)
		return
	}

	data := struct {
		Title   string
		Version string
	}{
		Title:   "LTTH Cloud Launcher",
		Version: "1.0.0",
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	tmpl.Execute(w, data)
}

// SSE endpoint for progress updates
func (cl *CloudLauncher) handleSSE(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	clientChan := make(chan string)
	cl.clients[clientChan] = true
	defer func() {
		delete(cl.clients, clientChan)
		close(clientChan)
	}()

	// Send initial status
	initialMsg := fmt.Sprintf(`{"progress": %d, "status": "%s"}`, cl.progress, cl.status)
	fmt.Fprintf(w, "data: %s\n\n", initialMsg)
	w.(http.Flusher).Flush()

	// Listen for updates
	for msg := range clientChan {
		fmt.Fprintf(w, "data: %s\n\n", msg)
		w.(http.Flusher).Flush()
	}
}

// Download repository as ZIP from GitHub
func (cl *CloudLauncher) downloadRepository() error {
	cl.updateProgress(10, "Lade Repository von GitHub herunter...")
	
	// GitHub archive URL
	zipURL := fmt.Sprintf("https://github.com/%s/%s/archive/refs/heads/%s.zip", 
		repoOwner, repoName, repoBranch)
	
	cl.logger.Printf("Downloading from: %s\n", zipURL)
	
	// Download the ZIP file
	resp, err := http.Get(zipURL)
	if err != nil {
		return fmt.Errorf("Download fehlgeschlagen: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("Download fehlgeschlagen: HTTP %d", resp.StatusCode)
	}

	cl.updateProgress(30, "Speichere heruntergeladene Dateien...")

	// Create temp file for ZIP
	tempZip, err := os.CreateTemp("", "ltth-repo-*.zip")
	if err != nil {
		return fmt.Errorf("Kann temporäre Datei nicht erstellen: %v", err)
	}
	defer os.Remove(tempZip.Name())
	defer tempZip.Close()

	// Copy downloaded data to temp file
	_, err = io.Copy(tempZip, resp.Body)
	if err != nil {
		return fmt.Errorf("Speichern fehlgeschlagen: %v", err)
	}

	cl.updateProgress(50, "Extrahiere Dateien...")

	// Extract ZIP
	err = cl.extractZip(tempZip.Name(), cl.baseDir)
	if err != nil {
		return fmt.Errorf("Extraktion fehlgeschlagen: %v", err)
	}

	cl.updateProgress(70, "Repository erfolgreich heruntergeladen")
	return nil
}

// Extract ZIP file
func (cl *CloudLauncher) extractZip(zipPath, destDir string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	for _, f := range r.File {
		// Skip the root directory (e.g., "pupcidslittletiktokhelper-main/")
		// Extract directly to destDir
		fpath := f.Name
		
		// Remove first directory component
		idx := 0
		for i, c := range fpath {
			if c == '/' || c == '\\' {
				idx = i + 1
				break
			}
		}
		if idx > 0 {
			fpath = fpath[idx:]
		}
		
		if fpath == "" {
			continue
		}

		fullPath := filepath.Join(destDir, fpath)

		if f.FileInfo().IsDir() {
			os.MkdirAll(fullPath, os.ModePerm)
			continue
		}

		// Create parent directories
		if err := os.MkdirAll(filepath.Dir(fullPath), os.ModePerm); err != nil {
			return err
		}

		// Extract file
		outFile, err := os.OpenFile(fullPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			return err
		}

		rc, err := f.Open()
		if err != nil {
			outFile.Close()
			return err
		}

		_, err = io.Copy(outFile, rc)
		outFile.Close()
		rc.Close()

		if err != nil {
			return err
		}
	}

	return nil
}

// Check if Node.js is installed
func (cl *CloudLauncher) checkNodeJS() (string, error) {
	cl.updateProgress(75, "Prüfe Node.js Installation...")
	
	nodePath, err := exec.LookPath("node")
	if err != nil {
		return "", fmt.Errorf("Node.js ist nicht installiert")
	}
	
	cl.logger.Printf("Found Node.js at: %s\n", nodePath)
	return nodePath, nil
}

// Install dependencies
func (cl *CloudLauncher) installDependencies(appDir string) error {
	cl.updateProgress(80, "Installiere Abhängigkeiten...")
	
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/C", "npm", "install", "--cache", "false")
	} else {
		cmd = exec.Command("npm", "install", "--cache", "false")
	}
	
	cmd.Dir = appDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	// Set environment variables to skip problematic preinstall checks
	cmd.Env = append(os.Environ(),
		"YOUTUBE_DL_SKIP_PYTHON_CHECK=1",
		"PUPPETEER_SKIP_DOWNLOAD=true",
	)

	err := cmd.Run()
	if err != nil {
		return fmt.Errorf("Installation fehlgeschlagen: %v", err)
	}
	
	return nil
}

// Start the application
func (cl *CloudLauncher) startApplication(nodePath, appDir string) error {
	cl.updateProgress(95, "Starte Anwendung...")
	
	launchJS := filepath.Join(appDir, "launch.js")
	cmd := exec.Command(nodePath, launchJS)
	cmd.Dir = appDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	
	cl.logger.Printf("Starting application: %s %s\n", nodePath, launchJS)
	
	err := cmd.Start()
	if err != nil {
		return fmt.Errorf("Start fehlgeschlagen: %v", err)
	}
	
	cl.updateProgress(100, "Anwendung gestartet!")
	
	// Wait a moment before opening browser
	time.Sleep(2 * time.Second)
	
	// Open browser to the app
	browser.OpenURL("http://localhost:3000")
	
	// Wait for the application to finish
	return cmd.Wait()
}

func (cl *CloudLauncher) run() error {
	// Get executable directory
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("Kann Programmverzeichnis nicht ermitteln: %v", err)
	}
	
	cl.baseDir = filepath.Dir(exePath)
	cl.logger.Printf("Base directory: %s\n", cl.baseDir)
	
	// Start HTTP server in background
	http.HandleFunc("/", cl.serveSplash)
	http.HandleFunc("/events", cl.handleSSE)
	
	go func() {
		cl.logger.Println("Starting web server on :8765")
		if err := http.ListenAndServe(":8765", nil); err != nil {
			cl.logger.Printf("HTTP server error: %v\n", err)
		}
	}()
	
	// Wait a moment for server to start
	time.Sleep(500 * time.Millisecond)
	
	// Open browser to splash screen
	err = browser.OpenURL("http://localhost:8765")
	if err != nil {
		cl.logger.Printf("Failed to open browser: %v\n", err)
	}
	
	// Download repository
	if err := cl.downloadRepository(); err != nil {
		cl.sendError(err.Error())
		return err
	}
	
	// Check Node.js
	nodePath, err := cl.checkNodeJS()
	if err != nil {
		cl.sendError(err.Error())
		return err
	}
	
	// Install dependencies
	appDir := filepath.Join(cl.baseDir, "app")
	if err := cl.installDependencies(appDir); err != nil {
		cl.sendError(err.Error())
		return err
	}
	
	// Start application
	return cl.startApplication(nodePath, appDir)
}

func main() {
	fmt.Println("================================================")
	fmt.Println("  LTTH Cloud Launcher")
	fmt.Println("  https://github.com/Loggableim/pupcidslittletiktokhelper")
	fmt.Println("================================================")
	fmt.Println()
	
	cl := NewCloudLauncher()
	
	if err := cl.run(); err != nil {
		fmt.Fprintf(os.Stderr, "\nERROR: %v\n", err)
		fmt.Println("\nPress Enter to exit...")
		fmt.Scanln()
		os.Exit(1)
	}
}
