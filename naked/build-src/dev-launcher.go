// dev-launcher.go
// Development version of launcher-gui.go
// Build WITHOUT -H windowsgui flag to show terminal window for debugging
// Build command: go build -o dev_launcher.exe dev-launcher.go
package main

import (
	"bufio"
	"bytes"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/pkg/browser"
)

type Launcher struct {
	nodePath     string
	appDir       string
	progress     int
	status       string
	clients      map[chan string]bool
	logFile      *os.File
	logger       *log.Logger
	logPath      string
	envFileFixed bool // Track if we auto-created .env file
	serverPort   int  // Actual port the server responded on
}

func NewLauncher() *Launcher {
	return &Launcher{
		status:       "Initialisiere...",
		progress:     0,
		clients:      make(map[chan string]bool),
		envFileFixed: false,
	}
}

func getCurrentNodePort() int {
	const fallbackPort = 3000

	exePath, err := os.Executable()
	if err != nil {
		return fallbackPort
	}

	portFilePath := filepath.Join(filepath.Dir(exePath), ".ltth_port")
	content, err := os.ReadFile(portFilePath)
	if err != nil {
		return fallbackPort
	}

	port, err := strconv.Atoi(strings.TrimSpace(string(content)))
	if err != nil || port <= 0 {
		return fallbackPort
	}

	return port
}

func rootLogDirForApp(appDir string) string {
	return filepath.Join(filepath.Dir(appDir), "logs")
}

func uniqueArchivePath(destination string) string {
	if _, err := os.Stat(destination); os.IsNotExist(err) {
		return destination
	}

	ext := filepath.Ext(destination)
	base := strings.TrimSuffix(destination, ext)
	for index := 1; index < 1000; index++ {
		candidate := fmt.Sprintf("%s-%d%s", base, index, ext)
		if _, err := os.Stat(candidate); os.IsNotExist(err) {
			return candidate
		}
	}

	return fmt.Sprintf("%s-%d%s", base, time.Now().UnixNano(), ext)
}

func archiveExistingLogFiles(logDir string) (int, error) {
	entries, err := os.ReadDir(logDir)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}

	archiveDir := filepath.Join(logDir, "archive", time.Now().Format("2006-01-02_15-04-05"), "root")
	archived := 0
	var firstErr error

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		sourcePath := filepath.Join(logDir, entry.Name())
		if archived == 0 {
			if err := os.MkdirAll(archiveDir, 0755); err != nil {
				return archived, err
			}
		}

		destinationPath := uniqueArchivePath(filepath.Join(archiveDir, entry.Name()))
		if err := os.Rename(sourcePath, destinationPath); err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		archived++
	}

	return archived, firstErr
}

// setupLogging creates a log file in the root logs directory
func (l *Launcher) setupLogging(appDir string) error {
	logDir := rootLogDirForApp(appDir)
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return fmt.Errorf("failed to create log directory: %v", err)
	}
	archivedCount, archiveErr := archiveExistingLogFiles(logDir)

	timestamp := time.Now().Format("2006-01-02_15-04-05")
	logPath := filepath.Join(logDir, fmt.Sprintf("launcher_%s.log", timestamp))

	// Open with sync flag to ensure writes are flushed immediately
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND|os.O_SYNC, 0644)
	if err != nil {
		return fmt.Errorf("failed to create log file: %v", err)
	}

	l.logFile = logFile
	l.logPath = logPath

	// DEV MODE: Logger writes to file only, but server output goes to both file and console
	// This ensures launcher progress is logged while server errors are visible in terminal
	l.logger = log.New(logFile, "", log.LstdFlags)

	l.logger.Println("========================================")
	l.logger.Println("TikTok Stream Tool - DEV Launcher Log")
	l.logger.Println("========================================")
	l.logger.Printf("Log file: %s\n", logPath)
	l.logger.Printf("Platform: %s\n", runtime.GOOS)
	l.logger.Printf("Architecture: %s\n", runtime.GOARCH)
	l.logger.Printf("Root log directory: %s\n", logDir)
	if archivedCount > 0 {
		l.logger.Printf("[INFO] Archived %d previous log file(s)\n", archivedCount)
	}
	if archiveErr != nil {
		l.logger.Printf("[WARNING] Some previous log files could not be archived: %v\n", archiveErr)
	}
	l.logger.Println("========================================")

	// Force sync to ensure header is written
	if err := logFile.Sync(); err != nil {
		return fmt.Errorf("failed to sync log file: %v", err)
	}

	return nil
}

// closeLogging closes the log file
func (l *Launcher) closeLogging() {
	if l.logFile != nil {
		l.logger.Println("========================================")
		l.logger.Println("Launcher finished")
		l.logger.Println("========================================")
		l.logFile.Sync() // Ensure all writes are flushed
		l.logFile.Close()
	}
}

// logAndSync logs a message and immediately syncs to disk
// This ensures logs are written even if the process crashes
func (l *Launcher) logAndSync(format string, args ...interface{}) {
	if l.logger != nil {
		if len(args) > 0 {
			l.logger.Printf(format+"\n", args...)
		} else {
			l.logger.Println(format)
		}
		if l.logFile != nil {
			l.logFile.Sync()
		}
	}
}

func (l *Launcher) updateProgress(value int, status string) {
	l.progress = value
	l.status = status

	msg := fmt.Sprintf(`{"progress": %d, "status": "%s"}`, value, status)
	for client := range l.clients {
		select {
		case client <- msg:
		default:
		}
	}
}

func (l *Launcher) sendRedirect() {
	port := l.serverPort
	if port == 0 {
		port = getCurrentNodePort()
	}
	msg := fmt.Sprintf(`{"redirect": "http://localhost:%d/dashboard.html"}`, port)
	for client := range l.clients {
		select {
		case client <- msg:
		default:
		}
	}
}

func (l *Launcher) checkNodeJS() error {
	nodePath, err := exec.LookPath("node")
	if err != nil {
		return fmt.Errorf("Node.js ist nicht installiert")
	}
	l.nodePath = nodePath
	return nil
}

func (l *Launcher) getNodeVersion() string {
	cmd := exec.Command(l.nodePath, "--version")
	output, err := cmd.Output()
	if err != nil {
		return "unknown"
	}
	return string(output)
}

func (l *Launcher) checkNodeModules() bool {
	nodeModulesPath := filepath.Join(l.appDir, "node_modules")
	info, err := os.Stat(nodeModulesPath)
	if err != nil {
		return false
	}
	return info.IsDir()
}

func sanitizeNodeEnvironment(env []string) []string {
	sanitized := make([]string, 0, len(env))
	for _, entry := range env {
		upper := strings.ToUpper(entry)
		if strings.HasPrefix(upper, "NODE_OPTIONS=") ||
			strings.HasPrefix(upper, "NPM_CONFIG_NODE_OPTIONS=") {
			continue
		}
		sanitized = append(sanitized, entry)
	}
	return sanitized
}

func (l *Launcher) verifyNativeModules() error {
	if l.nodePath == "" {
		return fmt.Errorf("Node.js path is empty")
	}

	script := "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.close(); console.log('native-modules-ok')"
	cmd := exec.Command(l.nodePath, "-e", script)
	cmd.Dir = l.appDir
	cmd.Env = sanitizeNodeEnvironment(os.Environ())

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%v\n%s", err, strings.TrimSpace(string(output)))
	}

	l.logAndSync("[SUCCESS] Native Node modules verified: %s", strings.TrimSpace(string(output)))
	return nil
}

func (l *Launcher) installDependencies() error {
	l.logger.Println("[INFO] Starting npm install...")
	l.updateProgress(45, "npm install wird gestartet...")
	time.Sleep(500 * time.Millisecond)

	// Show initial warning about potential delay
	l.updateProgress(45, "HINWEIS: npm install kann mehrere Minuten dauern, besonders bei langsamer Internetverbindung. Bitte warten...")
	time.Sleep(2 * time.Second)

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/C", "npm", "install", "--cache", "false")
	} else {
		cmd = exec.Command("npm", "install", "--cache", "false")
	}

	cmd.Dir = l.appDir

	// Set environment variables to skip problematic preinstall checks
	cmd.Env = sanitizeNodeEnvironment(append(os.Environ(),
		"YOUTUBE_DL_SKIP_PYTHON_CHECK=1",
		"PUPPETEER_SKIP_DOWNLOAD=true",
	))

	// Capture output for logging and progress updates
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("Failed to create stdout pipe: %v", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("Failed to create stderr pipe: %v", err)
	}

	// Start the command
	if err := cmd.Start(); err != nil {
		l.logger.Printf("[ERROR] Failed to start npm install: %v\n", err)
		return fmt.Errorf("Failed to start npm install: %v", err)
	}

	// Track progress with live updates
	progressCounter := 0
	maxProgress := 75
	lastUpdate := time.Now()
	installComplete := false

	// Heartbeat ticker to show activity even when npm produces no output
	heartbeatTicker := time.NewTicker(3 * time.Second)
	defer heartbeatTicker.Stop()

	// Channel to signal when stdout reading is done
	stdoutDone := make(chan bool)

	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			l.logger.Printf("[npm stdout] %s\n", line)
			// Show progress in UI with incremental progress bar
			if len(line) > 0 {
				// Increment progress from 45 to 75 during npm install
				progressCounter++
				currentProgress := 45 + (progressCounter / 2)
				if currentProgress > maxProgress {
					currentProgress = maxProgress
				}

				// Don't truncate - show full line for better visibility
				displayLine := line
				if len(displayLine) > 120 {
					displayLine = displayLine[:117] + "..."
				}
				l.updateProgress(currentProgress, fmt.Sprintf("npm install: %s", displayLine))
				lastUpdate = time.Now()
			}
		}
		stdoutDone <- true
	}()

	// Log errors and collect stderr output for fallback error reporting
	var stderrBuf bytes.Buffer
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			l.logger.Printf("[npm stderr] %s\n", line)
			stderrBuf.WriteString(line + "\n")
		}
	}()

	// Heartbeat goroutine to show activity
	go func() {
		for !installComplete {
			select {
			case <-heartbeatTicker.C:
				// If no output for more than 3 seconds, show activity indicator
				if time.Since(lastUpdate) >= 3*time.Second {
					elapsed := int(time.Since(lastUpdate).Seconds())
					currentProgress := 45 + (progressCounter / 2)
					if currentProgress > maxProgress {
						currentProgress = maxProgress
					}
					if currentProgress < 50 {
						currentProgress = 50 // Show at least 50% during install
					}
					l.updateProgress(currentProgress, fmt.Sprintf("npm install läuft... (%ds) - Bitte warten, Downloads können mehrere Minuten dauern", elapsed))
				}
			}
		}
	}()

	// Wait for command to complete
	err = cmd.Wait()
	installComplete = true

	// Wait for stdout processing to complete
	<-stdoutDone

	if err != nil {
		stderrOutput := stderrBuf.String()
		l.logger.Printf("[ERROR] npm install (with --cache false) failed: %v\n", err)
		if stderrOutput != "" {
			l.logger.Printf("[ERROR] npm stderr output: %s\n", stderrOutput)
		}

		// Fallback: retry without --cache flag
		l.logger.Println("[INFO] Retrying npm install without --cache flag...")
		l.updateProgress(50, "Wiederhole npm install (Fallback ohne --cache)...")
		time.Sleep(1 * time.Second)

		var retryCmd *exec.Cmd
		if runtime.GOOS == "windows" {
			retryCmd = exec.Command("cmd", "/C", "npm", "install")
		} else {
			retryCmd = exec.Command("npm", "install")
		}
		retryCmd.Dir = l.appDir
		retryCmd.Env = append(os.Environ(),
			"YOUTUBE_DL_SKIP_PYTHON_CHECK=1",
			"PUPPETEER_SKIP_DOWNLOAD=true",
		)
		var retryStderr bytes.Buffer
		retryCmd.Stderr = &retryStderr

		if retryErr := retryCmd.Run(); retryErr != nil {
			if retryStderr.Len() > 0 {
				l.logger.Printf("[ERROR] npm install retry stderr: %s\n", retryStderr.String())
			}
			l.logger.Printf("[ERROR] npm install retry also failed: %v\n", retryErr)
			return fmt.Errorf("Installation fehlgeschlagen: %v", retryErr)
		}

		l.logger.Println("[SUCCESS] npm install retry (without --cache) succeeded")
	}

	l.logger.Println("[SUCCESS] npm install completed successfully")
	return nil
}

func (l *Launcher) startTool() (*exec.Cmd, error) {
	launchJS := filepath.Join(l.appDir, "launch.js")
	cmd := exec.Command(l.nodePath, launchJS)
	cmd.Dir = l.appDir

	// Set environment variable to disable automatic browser opening
	// The GUI launcher handles the redirect to dashboard after server is ready
	// Build environment explicitly to ensure OPEN_BROWSER is properly set
	env := []string{}
	for _, e := range os.Environ() {
		// Skip any existing OPEN_BROWSER variable to avoid conflicts
		if strings.HasPrefix(e, "OPEN_BROWSER=") {
			continue
		}
		if strings.HasPrefix(e, "LTTH_LOG_DIR=") || strings.HasPrefix(e, "LTTH_LOG_ARCHIVE_DONE=") || strings.HasPrefix(e, "LTTH_CURRENT_LAUNCHER_LOG=") {
			continue
		}
		upper := strings.ToUpper(e)
		if strings.HasPrefix(upper, "NODE_OPTIONS=") || strings.HasPrefix(upper, "NPM_CONFIG_NODE_OPTIONS=") {
			continue
		}
		env = append(env, e)
	}
	rootLogDir := rootLogDirForApp(l.appDir)
	env = append(env, "OPEN_BROWSER=false")
	env = append(env, fmt.Sprintf("LTTH_LOG_DIR=%s", rootLogDir))
	env = append(env, "LTTH_LOG_ARCHIVE_DONE=true")
	if l.logPath != "" {
		env = append(env, fmt.Sprintf("LTTH_CURRENT_LAUNCHER_LOG=%s", l.logPath))
	}

	// DEV MODE: Force unbuffered output from Node.js
	env = append(env, "NODE_NO_WARNINGS=1") // Reduce noise
	// Force output to be unbuffered - critical for catching crash logs
	if runtime.GOOS == "windows" {
		// On Windows, ensure console output is not buffered
		env = append(env, "PYTHONUNBUFFERED=1")
	}
	cmd.Env = env

	// DEV MODE: Redirect output to BOTH log file AND console for detailed error logging
	if l.logFile != nil {
		// Use MultiWriter to send output to both log file and console
		cmd.Stdout = io.MultiWriter(l.logFile, os.Stdout)
		cmd.Stderr = io.MultiWriter(l.logFile, os.Stderr)
	} else {
		// Fallback to console only if log file isn't available
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
	}
	cmd.Stdin = os.Stdin

	l.logAndSync("Starting Node.js server...")
	l.logAndSync("Command: %s %s", l.nodePath, launchJS)
	l.logAndSync("Working directory: %s", l.appDir)
	l.logAndSync("OPEN_BROWSER environment variable set to: false")
	l.logAndSync("LTTH_LOG_DIR environment variable set to: %s", rootLogDir)
	l.logAndSync("--- Node.js Server Output Start ---")

	// Print to console as well
	fmt.Println()
	fmt.Println("================================================")
	fmt.Println("  DEV MODE: Server output will be visible below")
	fmt.Println("  Output wird in Echtzeit angezeigt (unbuffered)")
	fmt.Println("================================================")
	fmt.Println()

	err := cmd.Start()
	if err != nil {
		return nil, err
	}

	return cmd, nil
}

// checkServerHealth checks if the server is responding
func (l *Launcher) checkServerHealth() bool {
	return l.checkServerHealthOnPort(getCurrentNodePort())
}

// checkServerHealthOnPort checks if the server is responding on a specific port
func (l *Launcher) checkServerHealthOnPort(port int) bool {
	client := &http.Client{
		Timeout: 2 * time.Second,
	}

	url := fmt.Sprintf("http://localhost:%d/dashboard.html", port)
	resp, err := client.Get(url)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	return resp.StatusCode == 200
}

// waitForServer waits for the server to be ready or timeout
func (l *Launcher) waitForServer(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		if l.checkServerHealth() {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}

	return fmt.Errorf("Server did not start within %v", timeout)
}

// autoFixEnvFile checks if .env exists and creates it from .env.example if missing
func (l *Launcher) autoFixEnvFile() error {
	envPath := filepath.Join(l.appDir, ".env")
	envExamplePath := filepath.Join(l.appDir, ".env.example")

	// Check if .env already exists
	if _, err := os.Stat(envPath); err == nil {
		l.logger.Println("[INFO] .env file already exists")
		return nil
	}

	// Check if .env.example exists
	if _, err := os.Stat(envExamplePath); os.IsNotExist(err) {
		l.logger.Println("[WARNING] .env.example not found, cannot auto-create .env")
		return fmt.Errorf(".env.example not found")
	}

	l.logger.Println("[AUTO-FIX] Creating .env from .env.example...")
	l.updateProgress(85, "🔧 Auto-Fix: Erstelle .env Datei...")

	// Read .env.example
	input, err := os.ReadFile(envExamplePath)
	if err != nil {
		l.logger.Printf("[ERROR] Failed to read .env.example: %v\n", err)
		return err
	}

	// Write to .env
	err = os.WriteFile(envPath, input, 0644)
	if err != nil {
		l.logger.Printf("[ERROR] Failed to write .env: %v\n", err)
		return err
	}

	l.logger.Println("[SUCCESS] .env file created successfully")
	l.updateProgress(86, "✅ .env Datei erstellt!")
	l.envFileFixed = true // Mark that we fixed the .env file
	time.Sleep(1 * time.Second)

	return nil
}

// autoFixPort delegates port management to the Node.js backend.
func (l *Launcher) autoFixPort() {
	l.logger.Println("[INFO] Port-Management is delegated to Node.js with dynamic .ltth_port discovery.")
	l.updateProgress(87, "🔌 Port-Management wird an Node.js delegiert (.ltth_port)...")
}

// autoFixYtDlp checks if yt-dlp is available and logs a warning if it is missing
func (l *Launcher) autoFixYtDlp() {
	l.logger.Println("[INFO] Checking yt-dlp availability...")

	// Check if the npm-bundled binary from youtube-dl-exec exists.
	// The youtube-dl-exec package (added as an npm dependency) downloads the yt-dlp binary
	// into its own bin/ directory during postinstall. Path: node_modules/youtube-dl-exec/bin/yt-dlp(.exe)
	npmBinaryName := "yt-dlp"
	if runtime.GOOS == "windows" {
		npmBinaryName = "yt-dlp.exe"
	}
	npmBinaryPath := filepath.Join(l.appDir, "node_modules", "youtube-dl-exec", "bin", npmBinaryName)
	if _, err := os.Stat(npmBinaryPath); err == nil {
		l.logger.Printf("[INFO] yt-dlp npm-bundled binary found: %s\n", npmBinaryPath)
		return
	}

	// Check if yt-dlp is already available in system PATH
	for _, ytdlpCmd := range []string{"yt-dlp", "yt_dlp"} {
		cmd := exec.Command(ytdlpCmd, "--version")
		if output, err := cmd.CombinedOutput(); err == nil {
			l.logger.Printf("[INFO] yt-dlp found in PATH: %s\n", strings.TrimSpace(string(output)))
			return
		}
	}

	l.logger.Println("[WARNING] yt-dlp not found. The Music Bot requires yt-dlp to function. " +
		"Run 'npm install' in the app directory to restore the bundled binary, " +
		"or set a custom path in Music Bot settings.")
}

func (l *Launcher) runLauncher() {
	time.Sleep(1 * time.Second) // Give browser time to load

	// Phase 1: Check Node.js (0-20%)
	l.updateProgress(0, "Prüfe Node.js Installation...")
	l.logAndSync("[Phase 1] Checking Node.js installation...")
	time.Sleep(500 * time.Millisecond)

	err := l.checkNodeJS()
	if err != nil {
		l.logAndSync("[ERROR] Node.js check failed: %v", err)
		l.updateProgress(0, "FEHLER: Node.js ist nicht installiert!")
		time.Sleep(5 * time.Second)
		l.closeLogging()
		os.Exit(1)
	}

	l.updateProgress(10, "Node.js gefunden...")
	l.logAndSync("[SUCCESS] Node.js found at: %s", l.nodePath)
	time.Sleep(300 * time.Millisecond)

	version := l.getNodeVersion()
	l.updateProgress(20, fmt.Sprintf("Node.js Version: %s", version))
	l.logger.Printf("[INFO] Node.js version: %s\n", version)
	time.Sleep(300 * time.Millisecond)

	// Phase 2: Find directories (20-30%)
	l.updateProgress(25, "Prüfe App-Verzeichnis...")
	l.logger.Printf("[Phase 2] Checking app directory: %s\n", l.appDir)
	time.Sleep(300 * time.Millisecond)

	if _, err := os.Stat(l.appDir); os.IsNotExist(err) {
		l.logger.Printf("[ERROR] App directory not found: %s\n", l.appDir)
		l.updateProgress(25, "FEHLER: app Verzeichnis nicht gefunden")
		time.Sleep(5 * time.Second)
		l.closeLogging()
		os.Exit(1)
	}

	l.updateProgress(30, "App-Verzeichnis gefunden...")
	l.logger.Printf("[SUCCESS] App directory exists: %s\n", l.appDir)
	time.Sleep(300 * time.Millisecond)

	// Phase 3: Check and install dependencies (30-80%)
	l.updateProgress(30, "Prüfe Abhängigkeiten...")
	l.logger.Println("[Phase 3] Checking dependencies...")
	time.Sleep(300 * time.Millisecond)

	if !l.checkNodeModules() {
		l.updateProgress(40, "Installiere Abhängigkeiten...")
		l.logger.Println("[INFO] node_modules not found, installing dependencies...")
		time.Sleep(500 * time.Millisecond)
		l.updateProgress(45, "HINWEIS: npm install kann einige Minuten dauern, bitte das Fenster offen halten und warten")

		err = l.installDependencies()
		if err != nil {
			l.logger.Printf("[ERROR] Dependency installation failed: %v\n", err)
			l.updateProgress(45, fmt.Sprintf("FEHLER: %v", err))
			time.Sleep(5 * time.Second)
			l.closeLogging()
			os.Exit(1)
		}

		l.updateProgress(80, "Installation abgeschlossen!")
		l.logger.Println("[SUCCESS] Dependencies installed successfully")
	} else {
		l.updateProgress(80, "Abhängigkeiten bereits installiert...")
		l.logger.Println("[INFO] Dependencies already installed")
	}
	time.Sleep(300 * time.Millisecond)

	// Phase 3.5: Auto-fix common issues (80-89%)
	l.updateProgress(82, "Prüfe Konfiguration...")
	l.logger.Println("[Phase 3.5] Auto-fixing common issues...")
	time.Sleep(300 * time.Millisecond)

	// Auto-fix: Create .env file if missing
	if err := l.autoFixEnvFile(); err != nil {
		l.logger.Printf("[WARNING] Could not auto-create .env: %v\n", err)
	}

	// Auto-fix: Check port availability
	l.autoFixPort()

	// Auto-fix: Install yt-dlp if missing
	l.autoFixYtDlp()

	l.updateProgress(89, "Konfiguration geprüft!")
	time.Sleep(300 * time.Millisecond)

	// Phase 4: Start tool (90-100%)
	l.updateProgress(90, "Starte Tool...")
	l.logger.Println("[Phase 4] Starting Node.js server...")
	time.Sleep(500 * time.Millisecond)

	// Start the tool
	cmd, err := l.startTool()
	if err != nil {
		l.logger.Printf("[ERROR] Failed to start server: %v\n", err)
		l.updateProgress(90, fmt.Sprintf("FEHLER beim Starten: %v", err))
		l.updateProgress(90, "Prüfe bitte die Log-Dateien im logs/ Ordner für Details.")
		time.Sleep(30 * time.Second)
		l.closeLogging()
		os.Exit(1)
	}

	// Monitor if the process exits prematurely
	processDied := make(chan error, 1)
	go func() {
		processDied <- cmd.Wait()
	}()

	// Wait for server to be ready
	l.updateProgress(93, "Warte auf Server-Start...")
	l.logger.Println("[INFO] Waiting for server health check (60s timeout)...")
	l.logger.Println("[INFO] Checking if server responds on current .ltth_port (fallback 3000)...")

	// Check server health with process monitoring
	healthCheckTimeout := time.After(60 * time.Second)
	healthCheckTicker := time.NewTicker(1 * time.Second)
	defer healthCheckTicker.Stop()

	serverReady := false
	attemptCount := 0
	lastLogTime := time.Now()

	for !serverReady {
		select {
		case err := <-processDied:
			// Process exited before server was ready
			// CRITICAL: Give time for buffered output to flush
			time.Sleep(500 * time.Millisecond)

			// Force flush all output streams
			os.Stdout.Sync()
			os.Stderr.Sync()

			// Ensure log file is flushed to capture all server output
			if l.logFile != nil {
				l.logFile.Sync()
				time.Sleep(200 * time.Millisecond)
			}

			fmt.Println()
			fmt.Println()
			fmt.Println("❌❌❌ SERVER CRASHED BEIM START! ❌❌❌")
			fmt.Println()

			l.logAndSync("--- Node.js Server Output End ---")
			l.logAndSync("[ERROR] ===========================================")
			l.logAndSync("[ERROR] Node.js process exited prematurely: %v", err)
			l.logAndSync("[ERROR] Server crashed during startup!")
			l.logAndSync("[ERROR] Check the server output above for the actual error")
			l.logAndSync("[ERROR] ===========================================")
			l.logAndSync("[ERROR] Häufige Ursachen:")
			l.logAndSync("[ERROR]  - Fehlende .env Datei (kopiere .env.example zu .env)")
			l.logAndSync("[ERROR]  - Port 3000 bereits belegt")
			l.logAndSync("[ERROR]  - Fehlende Dependencies (führe 'npm install' aus)")
			l.logAndSync("[ERROR]  - Syntax-Fehler im Code")
			l.logAndSync("[ERROR] ===========================================")

			// Check if we just fixed the .env file - if so, retry once
			if l.envFileFixed {
				l.logAndSync("[AUTO-FIX] .env file was just created - attempting restart...")
				l.updateProgress(95, "🔄 .env erstellt - starte Server neu...")
				time.Sleep(3 * time.Second)

				// Mark that we already tried the fix
				l.envFileFixed = false

				// Start server again
				cmd, err = l.startTool()
				if err != nil {
					l.logAndSync("[ERROR] Retry failed to start server: %v", err)
				} else {
					// Monitor the restarted process
					go func() {
						processDied <- cmd.Wait()
					}()

					l.updateProgress(96, "🔄 Server neugestartet - warte auf Antwort...")
					l.logAndSync("[INFO] Server restarted after .env fix - waiting for health check...")

					// Reset the ticker for another try
					continue
				}
			}

			l.updateProgress(95, "⚠️ Server konnte nicht starten!")
			time.Sleep(2 * time.Second)
			l.updateProgress(96, "📋 Alle Auto-Fixes wurden versucht")
			time.Sleep(2 * time.Second)
			l.updateProgress(97, "💡 Prüfe logs/launcher_*.log für Details")
			time.Sleep(2 * time.Second)
			l.updateProgress(98, "💡 Oder führe manuell: cd app && npm install")
			time.Sleep(2 * time.Second)
			l.updateProgress(99, "💡 Oder prüfe ob Port 3000 frei ist")
			time.Sleep(2 * time.Second)

			// DEV MODE: Wait for user input instead of auto-closing
			fmt.Println("\n================================================")
			fmt.Println("  ❌ SERVER START FEHLGESCHLAGEN")
			fmt.Println("================================================")
			fmt.Println("\nFehlerdetails siehe oben.")
			fmt.Println("Log-Datei: logs/launcher_*.log")
			fmt.Println("\nDrücke Enter zum Beenden...")
			bufio.NewReader(os.Stdin).ReadBytes('\n')

			l.closeLogging()
			os.Exit(1)
		case <-healthCheckTicker.C:
			attemptCount++

			// Log progress every 5 seconds
			if time.Since(lastLogTime) >= 5*time.Second {
				l.logger.Printf("[INFO] Health check attempt %d (waiting for server to respond)...\n", attemptCount)
				l.updateProgress(93+(attemptCount/5), fmt.Sprintf("Warte auf Server... (Versuch %d)", attemptCount))
				lastLogTime = time.Now()
			}

			if l.checkServerHealth() {
				resolvedPort := getCurrentNodePort()
				l.logger.Printf("[SUCCESS] Server responded on port %d!\n", resolvedPort)
				l.serverPort = resolvedPort
				serverReady = true
			}
		case <-healthCheckTimeout:
			l.logger.Println("[ERROR] Server health check timed out after 60 seconds")
			l.logger.Println("[ERROR] Server did not respond. Check the log above for error messages.")
			l.logger.Println("[ERROR] ===========================================")
			l.logger.Println("[ERROR] Mögliche Probleme:")
			l.logger.Println("[ERROR]  - Server startet, aber hängt sich bei Initialisierung auf")
			l.logger.Println("[ERROR]  - Dependencies werden geladen (kann lange dauern)")
			l.logger.Println("[ERROR]  - Datenbank-Migration läuft")
			l.logger.Println("[ERROR]  - Portbereich 3000-3050 ist blockiert durch Firewall")
			l.logger.Println("[ERROR] ===========================================")

			l.updateProgress(95, "⏱️ Server-Start Timeout (60s)")
			time.Sleep(2 * time.Second)
			l.updateProgress(96, "📋 Server antwortet nicht - prüfe logs/")
			time.Sleep(2 * time.Second)
			l.updateProgress(97, "💡 Server läuft evtl. noch im Hintergrund")
			time.Sleep(2 * time.Second)
			l.updateProgress(98, fmt.Sprintf("💡 Warte 2-3 Minuten und öffne localhost:%d", getCurrentNodePort()))
			time.Sleep(2 * time.Second)

			// DEV MODE: Wait for user input instead of auto-closing
			fmt.Println("\n================================================")
			fmt.Println("  ⏱️ SERVER TIMEOUT")
			fmt.Println("================================================")
			fmt.Println("\nServer antwortet nicht nach 60 Sekunden.")
			fmt.Println("Prüfe logs/ für Details oder warte noch etwas.")
			fmt.Println("\nDrücke Enter zum Beenden...")
			bufio.NewReader(os.Stdin).ReadBytes('\n')

			l.closeLogging()
			os.Exit(1)
		}
	}

	l.updateProgress(100, "Server erfolgreich gestartet!")
	l.logger.Println("[SUCCESS] Server is running and healthy!")
	time.Sleep(500 * time.Millisecond)
	l.updateProgress(100, "Weiterleitung zum Dashboard...")
	l.logger.Println("[INFO] Redirecting to dashboard...")
	time.Sleep(500 * time.Millisecond)
	l.sendRedirect()

	// DEV MODE: Keep launcher running to monitor server and catch crashes
	time.Sleep(3 * time.Second)

	fmt.Println()
	fmt.Println("================================================")
	fmt.Println("  DEV MODE: Launcher bleibt aktiv")
	fmt.Println("  Server-Prozess wird überwacht")
	fmt.Println("  Bei Crash bleibt Terminal offen für Logs")
	fmt.Println("================================================")
	fmt.Println()
	l.logger.Println("[DEV MODE] Launcher staying active to monitor server process")

	// Wait for server process to exit (crash or shutdown)
	// The processDied channel is still being monitored by the goroutine from line 530
	err = <-processDied

	// CRITICAL: Give time for buffered output to flush before showing crash message
	// This ensures we can see the actual error that caused the crash
	time.Sleep(500 * time.Millisecond)

	// Force flush stdout/stderr
	os.Stdout.Sync()
	os.Stderr.Sync()

	// Server has crashed or exited - flush log file
	if l.logFile != nil {
		l.logFile.Sync()
		time.Sleep(200 * time.Millisecond)
	}

	// Print prominent crash message to console
	fmt.Println()
	fmt.Println()
	fmt.Println("████████████████████████████████████████████████")
	fmt.Println("██                                            ██")
	fmt.Println("██        ❌ SERVER CRASH DETECTED! ❌         ██")
	fmt.Println("██                                            ██")
	fmt.Println("████████████████████████████████████████████████")
	fmt.Println()

	l.logAndSync("--- Node.js Server Output End ---")
	l.logAndSync("[ERROR] ===========================================")
	l.logAndSync("[ERROR] Server crashed after successful startup!")
	l.logAndSync("[ERROR] Exit status: %v", err)
	l.logAndSync("[ERROR] Check the server output above for error details")
	l.logAndSync("[ERROR] ===========================================")

	fmt.Println("❌ Der Server ist abgestürzt!")
	if err != nil {
		fmt.Printf("   Exit-Status: %v\n", err)
	}
	fmt.Println()
	fmt.Println("📋 LETZTE AUSGABE VOR DEM CRASH:")
	fmt.Println("   Sieh dir die Zeilen DIREKT ÜBER dieser Meldung an!")
	fmt.Println()
	fmt.Println("💾 Vollständige Logs in: logs/launcher_*.log")
	fmt.Println()
	fmt.Println("⚠️  HÄUFIGE CRASH-URSACHEN:")
	fmt.Println("   - Ungültige TikTok Username")
	fmt.Println("   - Netzwerkprobleme")
	fmt.Println("   - TikTok API Änderungen")
	fmt.Println("   - Fehlende Permissions")
	fmt.Println()
	fmt.Println("👉 Drücke Enter zum Beenden...")
	fmt.Println()

	// Wait for user to press Enter before closing
	bufio.NewReader(os.Stdin).ReadBytes('\n')

	l.closeLogging()
	os.Exit(1)
}

func main() {
	launcher := NewLauncher()

	// Get executable directory
	exePath, err := os.Executable()
	if err != nil {
		log.Fatal("Kann Programmverzeichnis nicht ermitteln:", err)
	}

	exeDir := filepath.Dir(exePath)
	launcher.appDir = filepath.Join(exeDir, "app")
	bgImagePath := filepath.Join(launcher.appDir, "launcherbg.jpg")

	// Setup logging immediately
	if err := launcher.setupLogging(launcher.appDir); err != nil {
		// If logging fails, create a fallback logger that does nothing
		// (since stdout doesn't exist in GUI mode)
		launcher.logger = log.New(io.Discard, "", log.LstdFlags)
	}

	launcher.logAndSync("Launcher started successfully")
	launcher.logAndSync("Executable directory: %s", exeDir)
	launcher.logAndSync("App directory: %s", launcher.appDir)

	// Setup HTTP server
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		tmpl := template.Must(template.New("index").Parse(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>TikTok Stream Tool - Launcher</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            width: 100vw;
            height: 100vh;
            background-color: #f5f5f5;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            position: relative;
        }
        
        .launcher-container {
            width: 1536px;
            height: 1024px;
            max-width: 95vw;
            max-height: 95vh;
            background-image: url(/bg);
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            position: relative;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            display: flex;
            align-items: center;
            justify-content: flex-end;
        }
        
        .progress-container {
            position: absolute;
            right: 5%;
            width: 36%;
            height: 70%;
            padding: 3%;
            background-color: rgba(255, 255, 255, 0.95);
            border-radius: 15px;
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
            border: 1px solid rgba(0, 0, 0, 0.1);
            display: flex;
            flex-direction: column;
        }
        
        .status-text {
            color: #333;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 15px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            line-height: 1.4;
            flex: 1;
            overflow-y: auto;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }
        
        .progress-bar-bg {
            width: 100%;
            height: 35px;
            background-color: #e0e0e0;
            border-radius: 20px;
            overflow: hidden;
            box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
            flex-shrink: 0;
        }
        
        .progress-bar-fill {
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, #00d4ff, #0099ff);
            border-radius: 20px;
            transition: width 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 14px;
            box-shadow: 0 2px 4px rgba(0, 153, 255, 0.3);
        }
    </style>
</head>
<body>
    <div class="launcher-container">
        <div class="progress-container">
            <div class="status-text" id="status">Initialisiere...</div>
            <div class="progress-bar-bg">
                <div class="progress-bar-fill" id="progressBar">0%</div>
            </div>
        </div>
    </div>
    
    <script>
        const evtSource = new EventSource('/events');
        
        evtSource.onmessage = function(event) {
            const data = JSON.parse(event.data);
            
            // Handle redirect
            if (data.redirect) {
                evtSource.close();
                // Wait a moment for the dashboard to be ready, then redirect
                setTimeout(function() {
                    window.location.replace(data.redirect);
                }, 2000);
                return;
            }
            
            // Handle progress updates
            const progressBar = document.getElementById('progressBar');
            const statusText = document.getElementById('status');
            
            progressBar.style.width = data.progress + '%';
            progressBar.textContent = data.progress + '%';
            statusText.textContent = data.status;
        };
    </script>
</body>
</html>
`))
		tmpl.Execute(w, nil)
	})

	http.HandleFunc("/bg", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, bgImagePath)
	})

	http.HandleFunc("/events", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		client := make(chan string, 10)
		launcher.clients[client] = true

		// Send initial state
		msg := fmt.Sprintf(`{"progress": %d, "status": "%s"}`, launcher.progress, launcher.status)
		fmt.Fprintf(w, "data: %s\n\n", msg)
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}

		// Listen for updates
		for {
			select {
			case msg := <-client:
				fmt.Fprintf(w, "data: %s\n\n", msg)
				if f, ok := w.(http.Flusher); ok {
					f.Flush()
				}
			case <-r.Context().Done():
				delete(launcher.clients, client)
				return
			}
		}
	})

	// Start HTTP server
	go func() {
		if err := http.ListenAndServe("127.0.0.1:58734", nil); err != nil {
			log.Fatal(err)
		}
	}()

	// Give server time to start
	time.Sleep(500 * time.Millisecond)

	// Open browser
	browser.OpenURL("http://127.0.0.1:58734")

	// Run launcher
	go launcher.runLauncher()

	// Keep running
	select {}
}
