/**
 * LTTH Launcher - Main Go Application
 *
 * Lightweight Windows launcher using WebView2 for modern UI.
 * Features: Update checking, download, installation, config backup, rollback.
 *
 * Build: go build -ldflags="-H windowsgui -s -w" -o launcher.exe
 * Size: ~5-8 MB (vs ~150 MB for Electron)
 */

package main

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	webview "github.com/jchv/go-webview2"
)

// Configuration constants
const (
	AppName       = "LTTH Launcher"
	AppVersion    = "1.0.0"
	GitHubOwner   = "Loggableim"
	GitHubRepo    = "ltth.app"
	VersionURL    = "https://raw.githubusercontent.com/Loggableim/ltth.app/main/version.json"
	AppZIPBaseURL = "https://ltth.app/app/"
	WindowWidth   = 800
	WindowHeight  = 600
)

// LauncherConfig stores user preferences
type LauncherConfig struct {
	InstallPath      string   `json:"installPath"`
	ConfigPath       string   `json:"configPath"`
	AutoUpdate       bool     `json:"autoUpdate"`
	Language         string   `json:"language"`
	IsFirstRun       bool     `json:"isFirstRun"`
	LastVersion      string   `json:"lastVersion"`
	PreviousVersions []string `json:"previousVersions"`
}

// VersionInfo from remote version.json
type VersionInfo struct {
	Version     string                       `json:"version"`
	ReleaseDate string                       `json:"releaseDate"`
	Status      string                       `json:"status"`
	Changelog   map[string]ChangelogEntry    `json:"changelog"`
}

// ChangelogEntry for a specific version
type ChangelogEntry struct {
	Date    string   `json:"date"`
	Changes []string `json:"changes"`
}

// Global variables
var (
	config       LauncherConfig
	configPath   string
	logFile      *os.File
	w            webview.WebView
	encodedHTML  string // Pre-processed HTML for faster loading
)

func main() {
	// Initialize logging
	initLogging()
	defer logFile.Close()

	log.Println("Starting LTTH Launcher v" + AppVersion)

	// Pre-process HTML once at startup for better performance
	encodedHTML = strings.ReplaceAll(htmlUI, "\n", " ")

	// Load or create configuration
	loadConfig()

	// Create WebView window
	w = webview.NewWithOptions(webview.WebViewOptions{
		Debug:     false,
		AutoFocus: true,
		WindowOptions: webview.WindowOptions{
			Title:  AppName,
			Width:  WindowWidth,
			Height: WindowHeight,
			IconId: 1,
			Center: true,
		},
	})
	if w == nil {
		log.Fatal("Failed to create WebView2 window")
	}
	defer w.Destroy()

	// Bind Go functions to JavaScript
	bindFunctions(w)

	// Load UI
	w.Navigate("data:text/html," + getEncodedHTML())

	// Run the event loop
	w.Run()
}

// initLogging sets up logging to file
func initLogging() {
	logDir := getLogDir()
	os.MkdirAll(logDir, 0755)

	var err error
	logPath := filepath.Join(logDir, "launcher.log")
	logFile, err = os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		log.Printf("Warning: Could not open log file: %v", err)
		return
	}

	log.SetOutput(io.MultiWriter(os.Stdout, logFile))
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)
}

// getLogDir returns the log directory path
func getLogDir() string {
	if runtime.GOOS == "windows" {
		localAppData := os.Getenv("LOCALAPPDATA")
		if localAppData != "" {
			return filepath.Join(localAppData, "LTTH")
		}
	}
	homeDir, _ := os.UserHomeDir()
	return filepath.Join(homeDir, ".ltth")
}

// getConfigPath returns the config file path
func getConfigFilePath() string {
	if runtime.GOOS == "windows" {
		appData := os.Getenv("APPDATA")
		if appData != "" {
			return filepath.Join(appData, "ltth-launcher", "config.json")
		}
	}
	homeDir, _ := os.UserHomeDir()
	return filepath.Join(homeDir, ".ltth-launcher", "config.json")
}

// loadConfig loads or creates the configuration
func loadConfig() {
	configPath = getConfigFilePath()
	
	// Ensure config directory exists
	os.MkdirAll(filepath.Dir(configPath), 0755)

	data, err := os.ReadFile(configPath)
	if err != nil {
		// Create default config
		config = LauncherConfig{
			InstallPath:      "",
			ConfigPath:       "",
			AutoUpdate:       true,
			Language:         "de",
			IsFirstRun:       true,
			LastVersion:      "",
			PreviousVersions: []string{},
		}
		saveConfig()
		return
	}

	if err := json.Unmarshal(data, &config); err != nil {
		log.Printf("Error parsing config: %v", err)
		config = LauncherConfig{
			AutoUpdate: true,
			Language:   "de",
			IsFirstRun: true,
		}
	}
}

// saveConfig saves the configuration to disk
func saveConfig() error {
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(configPath, data, 0644)
}

// bindFunctions binds Go functions to JavaScript
func bindFunctions(w webview.WebView) {
	// Get configuration
	w.Bind("getConfig", func() string {
		data, _ := json.Marshal(map[string]interface{}{
			"installPath":  config.InstallPath,
			"configPath":   config.ConfigPath,
			"autoUpdate":   config.AutoUpdate,
			"language":     config.Language,
			"isFirstRun":   config.IsFirstRun,
			"lastVersion":  config.LastVersion,
		})
		return string(data)
	})

	// Save configuration
	w.Bind("saveConfig", func(jsonStr string) string {
		var updates map[string]interface{}
		if err := json.Unmarshal([]byte(jsonStr), &updates); err != nil {
			return `{"success": false, "error": "Invalid JSON"}`
		}

		if v, ok := updates["installPath"].(string); ok {
			config.InstallPath = v
		}
		if v, ok := updates["configPath"].(string); ok {
			config.ConfigPath = v
		}
		if v, ok := updates["autoUpdate"].(bool); ok {
			config.AutoUpdate = v
		}
		if v, ok := updates["language"].(string); ok {
			config.Language = v
		}
		if v, ok := updates["isFirstRun"].(bool); ok {
			config.IsFirstRun = v
		}
		if v, ok := updates["lastVersion"].(string); ok {
			config.LastVersion = v
		}

		if err := saveConfig(); err != nil {
			return fmt.Sprintf(`{"success": false, "error": "%s"}`, err.Error())
		}
		return `{"success": true}`
	})

	// Get default paths
	w.Bind("getDefaultPaths", func() string {
		localAppData := os.Getenv("LOCALAPPDATA")
		if localAppData == "" {
			homeDir, _ := os.UserHomeDir()
			localAppData = homeDir
		}
		
		data, _ := json.Marshal(map[string]string{
			"installPath": filepath.Join(localAppData, "LTTH", "versions"),
			"configPath":  filepath.Join(localAppData, "LTTH", "config"),
		})
		return string(data)
	})

	// Select directory dialog
	w.Bind("selectDirectory", func(title, defaultPath string) string {
		// Use PowerShell for folder selection (works without cgo)
		script := fmt.Sprintf(`
			Add-Type -AssemblyName System.Windows.Forms
			$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
			$dialog.Description = '%s'
			$dialog.SelectedPath = '%s'
			$dialog.ShowNewFolderButton = $true
			if ($dialog.ShowDialog() -eq 'OK') {
				$dialog.SelectedPath
			}
		`, title, defaultPath)

		cmd := exec.Command("powershell", "-NoProfile", "-Command", script)
		output, err := cmd.Output()
		if err != nil {
			return ""
		}
		return strings.TrimSpace(string(output))
	})

	// Check for updates
	w.Bind("checkUpdates", func() string {
		log.Println("Checking for updates...")
		
		resp, err := http.Get(VersionURL)
		if err != nil {
			log.Printf("Update check failed: %v", err)
			return fmt.Sprintf(`{"success": false, "error": "%s"}`, err.Error())
		}
		defer resp.Body.Close()

		var versionInfo VersionInfo
		if err := json.NewDecoder(resp.Body).Decode(&versionInfo); err != nil {
			return fmt.Sprintf(`{"success": false, "error": "Invalid version data"}`)
		}

		currentVersion := config.LastVersion
		latestVersion := versionInfo.Version
		updateAvailable := currentVersion != "" && compareVersions(latestVersion, currentVersion) > 0
		
		if currentVersion == "" {
			updateAvailable = true
		}

		// Get changelog
		var changelog []string
		if entry, ok := versionInfo.Changelog[latestVersion]; ok {
			changelog = entry.Changes
		}

		result := map[string]interface{}{
			"success":         true,
			"currentVersion":  currentVersion,
			"latestVersion":   latestVersion,
			"updateAvailable": updateAvailable,
			"changelog":       changelog,
			"releaseDate":     versionInfo.ReleaseDate,
			"status":          versionInfo.Status,
		}

		data, _ := json.Marshal(result)
		log.Printf("Update check result: current=%s, latest=%s, available=%v", currentVersion, latestVersion, updateAvailable)
		return string(data)
	})

	// Install update
	w.Bind("installUpdate", func(version string) string {
		log.Printf("Installing version %s...", version)
		
		if config.InstallPath == "" || config.ConfigPath == "" {
			return `{"success": false, "error": "Paths not configured"}`
		}

		// Ensure directories exist
		os.MkdirAll(config.InstallPath, 0755)
		os.MkdirAll(config.ConfigPath, 0755)

		// Backup existing config
		if err := backupConfig(); err != nil {
			log.Printf("Config backup warning: %v", err)
		}

		// Download ZIP
		zipURL := fmt.Sprintf("%sltth_%s.zip", AppZIPBaseURL, version)
		tempDir := filepath.Join(config.InstallPath, ".temp")
		os.MkdirAll(tempDir, 0755)
		zipPath := filepath.Join(tempDir, fmt.Sprintf("ltth_%s.zip", version))

		log.Printf("Downloading from: %s", zipURL)
		if err := downloadFile(zipPath, zipURL); err != nil {
			return fmt.Sprintf(`{"success": false, "error": "Download failed: %s"}`, err.Error())
		}

		// Extract ZIP
		versionDir := filepath.Join(config.InstallPath, version)
		log.Printf("Extracting to: %s", versionDir)
		if err := extractZip(zipPath, versionDir); err != nil {
			return fmt.Sprintf(`{"success": false, "error": "Extraction failed: %s"}`, err.Error())
		}

		// Update config
		if config.LastVersion != "" && config.LastVersion != version {
			config.PreviousVersions = append(config.PreviousVersions, config.LastVersion)
			if len(config.PreviousVersions) > 5 {
				config.PreviousVersions = config.PreviousVersions[len(config.PreviousVersions)-5:]
			}
		}
		config.LastVersion = version
		saveConfig()

		// Cleanup
		os.RemoveAll(tempDir)

		log.Printf("Version %s installed successfully", version)
		return fmt.Sprintf(`{"success": true, "version": "%s"}`, version)
	})

	// Rollback to previous version
	w.Bind("rollback", func() string {
		if len(config.PreviousVersions) == 0 {
			return `{"success": false, "error": "No previous version available"}`
		}

		prevVersion := config.PreviousVersions[len(config.PreviousVersions)-1]
		config.PreviousVersions = config.PreviousVersions[:len(config.PreviousVersions)-1]
		config.LastVersion = prevVersion
		saveConfig()

		log.Printf("Rolled back to version %s", prevVersion)
		return fmt.Sprintf(`{"success": true, "version": "%s"}`, prevVersion)
	})

	// Launch application
	w.Bind("launchApp", func() string {
		if config.InstallPath == "" || config.LastVersion == "" {
			return `{"success": false, "error": "No version installed"}`
		}

		appDir := filepath.Join(config.InstallPath, config.LastVersion)
		
		// Validate that appDir is within installPath (prevent path traversal)
		cleanAppDir := filepath.Clean(appDir)
		cleanInstallPath := filepath.Clean(config.InstallPath)
		relPath, err := filepath.Rel(cleanInstallPath, cleanAppDir)
		if err != nil || strings.HasPrefix(relPath, "..") {
			return `{"success": false, "error": "Invalid installation path"}`
		}
		
		// Look for index.html to open in browser
		indexPath := filepath.Join(cleanAppDir, "index.html")
		if info, err := os.Stat(indexPath); err == nil && !info.IsDir() {
			// Validate file extension for security
			if !strings.HasSuffix(strings.ToLower(indexPath), ".html") {
				return `{"success": false, "error": "Invalid file type"}`
			}
			// Open in default browser using file:// URL
			fileURL := "file:///" + strings.ReplaceAll(indexPath, "\\", "/")
			cmd := exec.Command("cmd", "/c", "start", "", fileURL)
			if err := cmd.Start(); err != nil {
				return fmt.Sprintf(`{"success": false, "error": "%s"}`, err.Error())
			}
			log.Println("Opened app in browser")
			return `{"success": true}`
		}

		// Look for launch.js (Node.js app)
		launchJS := filepath.Join(cleanAppDir, "launch.js")
		if info, err := os.Stat(launchJS); err == nil && !info.IsDir() {
			cmd := exec.Command("node", launchJS)
			cmd.Dir = cleanAppDir
			if err := cmd.Start(); err != nil {
				return fmt.Sprintf(`{"success": false, "error": "%s"}`, err.Error())
			}
			log.Println("Started Node.js app")
			return `{"success": true}`
		}

		return `{"success": false, "error": "No launchable file found"}`
	})

	// Open logs folder
	w.Bind("openLogs", func() {
		logDir := getLogDir()
		exec.Command("explorer", logDir).Start()
	})

	// Close window
	w.Bind("closeWindow", func() {
		w.Terminate()
	})

	// Minimize window (not supported in basic webview, but we can hide/show)
	w.Bind("minimizeWindow", func() {
		// WebView2 basic doesn't support minimize directly
		// User can use title bar
	})

	// Get installed versions
	w.Bind("getInstalledVersions", func() string {
		if config.InstallPath == "" {
			return "[]"
		}

		entries, err := os.ReadDir(config.InstallPath)
		if err != nil {
			return "[]"
		}

		var versions []string
		for _, entry := range entries {
			if entry.IsDir() && !strings.HasPrefix(entry.Name(), ".") {
				versions = append(versions, entry.Name())
			}
		}

		// Sort descending
		sort.Sort(sort.Reverse(sort.StringSlice(versions)))

		data, _ := json.Marshal(versions)
		return string(data)
	})
}

// compareVersions compares two version strings
func compareVersions(v1, v2 string) int {
	// Simple version comparison (works for X.Y.Z format)
	v1Parts := strings.Split(strings.TrimPrefix(v1, "v"), ".")
	v2Parts := strings.Split(strings.TrimPrefix(v2, "v"), ".")

	for i := 0; i < 3; i++ {
		var p1, p2 int
		if i < len(v1Parts) {
			// Parse version part, ignore errors (default to 0)
			if _, err := fmt.Sscanf(v1Parts[i], "%d", &p1); err != nil {
				p1 = 0
			}
		}
		if i < len(v2Parts) {
			// Parse version part, ignore errors (default to 0)
			if _, err := fmt.Sscanf(v2Parts[i], "%d", &p2); err != nil {
				p2 = 0
			}
		}
		if p1 > p2 {
			return 1
		}
		if p1 < p2 {
			return -1
		}
	}
	return 0
}

// downloadFile downloads a file from URL
func downloadFile(filepath string, url string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("bad status: %s", resp.Status)
	}

	out, err := os.Create(filepath)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}

// extractZip extracts a ZIP file
func extractZip(src, dest string) error {
	r, err := zip.OpenReader(src)
	if err != nil {
		return err
	}
	defer r.Close()

	// Clean and normalize destination path
	cleanDest := filepath.Clean(dest)
	os.MkdirAll(cleanDest, 0755)

	for _, f := range r.File {
		// Clean the file name to prevent directory traversal
		cleanName := filepath.Clean(f.Name)
		if strings.HasPrefix(cleanName, "..") {
			return fmt.Errorf("invalid file path in archive: %s", f.Name)
		}
		
		fpath := filepath.Join(cleanDest, cleanName)

		// Security check for zip slip vulnerability using filepath.Rel
		relPath, err := filepath.Rel(cleanDest, fpath)
		if err != nil || strings.HasPrefix(relPath, "..") {
			return fmt.Errorf("invalid file path: %s", fpath)
		}

		if f.FileInfo().IsDir() {
			os.MkdirAll(fpath, 0755)
			continue
		}

		if err := os.MkdirAll(filepath.Dir(fpath), 0755); err != nil {
			return err
		}

		outFile, err := os.OpenFile(fpath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
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

// backupConfig backs up user configuration
func backupConfig() error {
	if config.ConfigPath == "" {
		return nil
	}

	if _, err := os.Stat(config.ConfigPath); os.IsNotExist(err) {
		return nil
	}

	backupDir := filepath.Join(config.ConfigPath, ".backup", time.Now().Format("20060102-150405"))
	os.MkdirAll(backupDir, 0755)

	entries, err := os.ReadDir(config.ConfigPath)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}

		src := filepath.Join(config.ConfigPath, entry.Name())
		dst := filepath.Join(backupDir, entry.Name())

		data, err := os.ReadFile(src)
		if err != nil {
			continue
		}
		os.WriteFile(dst, data, 0644)
	}

	log.Printf("Config backed up to: %s", backupDir)
	return nil
}

// calculateSHA256 calculates SHA256 hash of a file
func calculateSHA256(filepath string) (string, error) {
	f, err := os.Open(filepath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}

	return hex.EncodeToString(h.Sum(nil)), nil
}

// getEncodedHTML returns the pre-processed HTML UI
func getEncodedHTML() string {
	return encodedHTML
}

// Embedded HTML UI
var htmlUI = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LTTH Launcher</title>
<style>
:root {
    --color-primary: #12a116;
    --color-primary-dark: #0d7a10;
    --color-bg: #0e0f10;
    --color-surface: #1a1b1d;
    --color-surface-hover: #252628;
    --color-border: #2a2b2d;
    --color-text: #f5f7f4;
    --color-text-secondary: #b5b7b4;
    --color-text-muted: #6a6b6d;
    --color-success: #42ff73;
    --color-warning: #ffa726;
    --color-error: #ef5350;
    --radius-md: 8px;
    --radius-lg: 12px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; }
body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    color: var(--color-text);
    background: var(--color-bg);
    user-select: none;
}

.container { height: 100%; display: flex; flex-direction: column; padding: 24px; }
.header { text-align: center; margin-bottom: 32px; }
.logo { width: 64px; height: 64px; margin: 0 auto 16px; background: var(--color-primary); border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: bold; color: white; box-shadow: 0 0 20px rgba(18,161,22,0.3); }
.title { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
.subtitle { color: var(--color-text-secondary); font-size: 13px; }
.version { color: var(--color-primary); font-weight: 600; }

.content { flex: 1; display: flex; flex-direction: column; }
.view { display: none; flex-direction: column; height: 100%; }
.view.active { display: flex; }

.path-group { margin-bottom: 24px; }
.path-label { display: block; font-weight: 600; margin-bottom: 8px; }
.path-desc { font-size: 12px; color: var(--color-text-muted); margin-bottom: 8px; }
.path-row { display: flex; gap: 8px; }
.path-input { flex: 1; padding: 12px 16px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text); font-size: 13px; }
.path-input:focus { outline: none; border-color: var(--color-primary); }

.status-box { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 24px; margin-bottom: 24px; }
.status-row { display: flex; align-items: center; gap: 16px; }
.status-icon { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; font-size: 24px; }
.status-icon.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.status-text { flex: 1; }
.status-title { font-weight: 600; font-size: 15px; display: block; }
.status-subtitle { font-size: 13px; color: var(--color-text-secondary); margin-top: 4px; display: block; }

.progress-bar { height: 8px; background: var(--color-border); border-radius: 4px; margin-top: 16px; overflow: hidden; display: none; }
.progress-bar.active { display: block; }
.progress-fill { height: 100%; background: linear-gradient(90deg, var(--color-primary), #19c724); width: 0%; transition: width 0.3s; }
.progress-text { text-align: center; font-size: 12px; color: var(--color-text-secondary); margin-top: 8px; display: none; }
.progress-text.active { display: block; }

.btn-row { display: flex; gap: 12px; justify-content: center; margin-bottom: 16px; flex-wrap: wrap; }
.btn { padding: 12px 24px; border: none; border-radius: var(--radius-md); font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 8px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: var(--color-primary); color: white; }
.btn-primary:hover:not(:disabled) { background: var(--color-primary-dark); box-shadow: 0 0 20px rgba(18,161,22,0.3); }
.btn-secondary { background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border); }
.btn-secondary:hover:not(:disabled) { border-color: var(--color-primary); color: var(--color-primary); }
.btn-ghost { background: transparent; color: var(--color-text-secondary); padding: 8px 12px; }
.btn-ghost:hover { color: var(--color-text); background: var(--color-surface); }
.btn-lg { padding: 16px 32px; font-size: 16px; }
.btn-success { background: var(--color-primary); color: white; }

.secondary-row { display: flex; gap: 8px; justify-content: center; margin-bottom: 16px; }

.toggle-row { text-align: center; }
.toggle-label { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: var(--color-text-secondary); }
.toggle-label input { display: none; }
.checkmark { width: 18px; height: 18px; border: 2px solid var(--color-border); border-radius: 4px; position: relative; }
.toggle-label input:checked + .checkmark { background: var(--color-primary); border-color: var(--color-primary); }
.toggle-label input:checked + .checkmark::after { content: ''; position: absolute; left: 5px; top: 2px; width: 4px; height: 8px; border: solid white; border-width: 0 2px 2px 0; transform: rotate(45deg); }

.lang-row { display: flex; gap: 8px; justify-content: center; margin-top: 24px; }
.lang-btn { padding: 8px 16px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-secondary); cursor: pointer; font-size: 13px; }
.lang-btn:hover { border-color: var(--color-primary); }
.lang-btn.active { border-color: var(--color-primary); background: rgba(18,161,22,0.1); color: var(--color-primary); }

.modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: none; align-items: center; justify-content: center; z-index: 100; }
.modal.active { display: flex; }
.modal-content { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); width: 90%; max-width: 450px; max-height: 80vh; overflow: hidden; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--color-border); }
.modal-header h2 { font-size: 18px; }
.modal-close { background: none; border: none; color: var(--color-text-secondary); font-size: 20px; cursor: pointer; padding: 4px; }
.modal-close:hover { color: var(--color-text); }
.modal-body { padding: 20px; max-height: 400px; overflow-y: auto; }
.modal-footer { padding: 16px 20px; border-top: 1px solid var(--color-border); display: flex; gap: 12px; justify-content: flex-end; }

.version-compare { display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 24px; }
.version-box { flex: 1; text-align: center; padding: 16px; background: var(--color-bg); border-radius: var(--radius-md); }
.version-box.new { border: 1px solid var(--color-primary); }
.version-box-label { display: block; font-size: 12px; color: var(--color-text-muted); margin-bottom: 4px; }
.version-box-value { font-size: 20px; font-weight: 700; }
.version-box.new .version-box-value { color: var(--color-primary); }
.version-arrow { font-size: 24px; color: var(--color-primary); }

.changelog-section h3 { font-size: 14px; color: var(--color-text-secondary); margin-bottom: 12px; }
.changelog-list { list-style: none; max-height: 150px; overflow-y: auto; }
.changelog-list li { padding: 8px 0 8px 20px; position: relative; font-size: 13px; color: var(--color-text-secondary); border-bottom: 1px solid var(--color-border); }
.changelog-list li:last-child { border-bottom: none; }
.changelog-list li::before { content: '→'; position: absolute; left: 0; color: var(--color-primary); }

.hidden { display: none !important; }
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <div class="logo">L</div>
        <h1 class="title">LTTH Launcher</h1>
        <p class="subtitle">PupCid's Little TikTok Helper</p>
    </div>
    
    <div class="content">
        <!-- Setup View -->
        <div class="view active" id="setupView">
            <div class="path-group">
                <label class="path-label" data-i18n="setup.installPath">Installationspfad</label>
                <p class="path-desc" data-i18n="setup.installPathDesc">Hier werden die Programmdateien und Versionen gespeichert.</p>
                <div class="path-row">
                    <input type="text" class="path-input" id="installPathInput" readonly>
                    <button class="btn btn-secondary" id="browseInstallBtn" data-i18n="setup.browse">Durchsuchen...</button>
                </div>
            </div>
            <div class="path-group">
                <label class="path-label" data-i18n="setup.configPath">Konfigurationspfad</label>
                <p class="path-desc" data-i18n="setup.configPathDesc">Hier werden deine persönlichen Einstellungen gespeichert.</p>
                <div class="path-row">
                    <input type="text" class="path-input" id="configPathInput" readonly>
                    <button class="btn btn-secondary" id="browseConfigBtn" data-i18n="setup.browse">Durchsuchen...</button>
                </div>
            </div>
            <div style="flex:1"></div>
            <div class="btn-row">
                <button class="btn btn-primary btn-lg" id="continueBtn" data-i18n="setup.continue">Weiter</button>
            </div>
            <div class="lang-row">
                <button class="lang-btn active" data-lang="de">🇩🇪 Deutsch</button>
                <button class="lang-btn" data-lang="en">🇬🇧 English</button>
            </div>
        </div>
        
        <!-- Main View -->
        <div class="view" id="mainView">
            <div class="status-box">
                <div class="status-row">
                    <div class="status-icon" id="statusIcon">⏳</div>
                    <div class="status-text">
                        <span class="status-title" id="statusTitle" data-i18n="main.checkingUpdates">Prüfe auf Updates...</span>
                        <span class="status-subtitle" id="statusSubtitle"></span>
                    </div>
                </div>
                <div class="progress-bar" id="progressBar">
                    <div class="progress-fill" id="progressFill"></div>
                </div>
                <div class="progress-text" id="progressText">0%</div>
            </div>
            
            <div class="btn-row">
                <button class="btn btn-secondary" id="checkBtn" data-i18n="buttons.checkNow">Jetzt prüfen</button>
                <button class="btn btn-success hidden" id="updateBtn" data-i18n="buttons.installUpdate">Update installieren</button>
                <button class="btn btn-primary" id="startBtn" disabled data-i18n="buttons.start">Starten</button>
            </div>
            
            <div class="secondary-row">
                <button class="btn btn-ghost" id="settingsBtn">⚙️ <span data-i18n="buttons.settings">Einstellungen</span></button>
                <button class="btn btn-ghost" id="logsBtn">📄 <span data-i18n="buttons.logs">Logs</span></button>
            </div>
            
            <div class="toggle-row">
                <label class="toggle-label">
                    <input type="checkbox" id="autoUpdateCheck" checked>
                    <span class="checkmark"></span>
                    <span data-i18n="settings.autoUpdate">Automatische Updates beim Start</span>
                </label>
            </div>
            
            <div style="flex:1"></div>
            
            <div class="lang-row">
                <button class="lang-btn active" data-lang="de">🇩🇪 Deutsch</button>
                <button class="lang-btn" data-lang="en">🇬🇧 English</button>
            </div>
        </div>
    </div>
</div>

<!-- Update Modal -->
<div class="modal" id="updateModal">
    <div class="modal-content">
        <div class="modal-header">
            <h2 data-i18n="update.title">Update verfügbar</h2>
            <button class="modal-close" id="closeUpdateModal">×</button>
        </div>
        <div class="modal-body">
            <div class="version-compare">
                <div class="version-box">
                    <span class="version-box-label" data-i18n="update.currentVersion">Aktuelle Version</span>
                    <span class="version-box-value" id="modalCurrentVersion">-</span>
                </div>
                <div class="version-arrow">→</div>
                <div class="version-box new">
                    <span class="version-box-label" data-i18n="update.newVersion">Neue Version</span>
                    <span class="version-box-value" id="modalNewVersion">-</span>
                </div>
            </div>
            <div class="changelog-section">
                <h3 data-i18n="update.changelog">Änderungen</h3>
                <ul class="changelog-list" id="changelogList"></ul>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-ghost" id="laterBtn" data-i18n="buttons.later">Später</button>
            <button class="btn btn-primary" id="installNowBtn" data-i18n="buttons.installNow">Jetzt installieren</button>
        </div>
    </div>
</div>

<!-- Settings Modal -->
<div class="modal" id="settingsModal">
    <div class="modal-content">
        <div class="modal-header">
            <h2 data-i18n="settings.title">Einstellungen</h2>
            <button class="modal-close" id="closeSettingsModal">×</button>
        </div>
        <div class="modal-body">
            <div class="path-group">
                <label class="path-label" data-i18n="settings.installPath">Installationspfad</label>
                <p class="path-desc" id="settingsInstallPath">-</p>
            </div>
            <div class="path-group">
                <label class="path-label" data-i18n="settings.configPath">Konfigurationspfad</label>
                <p class="path-desc" id="settingsConfigPath">-</p>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-primary" id="closeSettingsBtn" data-i18n="buttons.close">Schließen</button>
        </div>
    </div>
</div>

<script>
// Localization
const locales = {
    de: {
        setup: { title: "Willkommen beim LTTH Launcher", installPath: "Installationspfad", installPathDesc: "Hier werden die Programmdateien und Versionen gespeichert.", configPath: "Konfigurationspfad", configPathDesc: "Hier werden deine persönlichen Einstellungen gespeichert.", browse: "Durchsuchen...", continue: "Weiter", pathRequired: "Bitte wähle gültige Pfade aus." },
        main: { checkingUpdates: "Prüfe auf Updates...", upToDate: "Auf dem neuesten Stand", updateAvailable: "Update verfügbar", noVersion: "Keine Version installiert", ready: "Bereit zum Starten", version: "Version" },
        buttons: { checkNow: "Jetzt prüfen", installUpdate: "Update installieren", settings: "Einstellungen", logs: "Logs", start: "Starten", later: "Später", installNow: "Jetzt installieren", close: "Schließen" },
        settings: { title: "Einstellungen", autoUpdate: "Automatische Updates beim Start", installPath: "Installationspfad", configPath: "Konfigurationspfad" },
        update: { title: "Update verfügbar", currentVersion: "Aktuelle Version", newVersion: "Neue Version", changelog: "Änderungen" },
        progress: { download: "Herunterladen...", extract: "Entpacken...", complete: "Fertig!" },
        errors: { network: "Netzwerkfehler", launch: "Start fehlgeschlagen" }
    },
    en: {
        setup: { title: "Welcome to LTTH Launcher", installPath: "Installation Path", installPathDesc: "This is where program files and versions will be stored.", configPath: "Configuration Path", configPathDesc: "This is where your personal settings will be stored.", browse: "Browse...", continue: "Continue", pathRequired: "Please select valid paths." },
        main: { checkingUpdates: "Checking for updates...", upToDate: "Up to date", updateAvailable: "Update available", noVersion: "No version installed", ready: "Ready to start", version: "Version" },
        buttons: { checkNow: "Check Now", installUpdate: "Install Update", settings: "Settings", logs: "Logs", start: "Start", later: "Later", installNow: "Install Now", close: "Close" },
        settings: { title: "Settings", autoUpdate: "Automatic updates on startup", installPath: "Installation Path", configPath: "Configuration Path" },
        update: { title: "Update Available", currentVersion: "Current Version", newVersion: "New Version", changelog: "Changes" },
        progress: { download: "Downloading...", extract: "Extracting...", complete: "Complete!" },
        errors: { network: "Network error", launch: "Launch failed" }
    }
};

let lang = 'de';
let config = {};
let updateInfo = null;

function t(key) {
    const keys = key.split('.');
    let val = locales[lang];
    for (const k of keys) { val = val?.[k]; }
    return val || key;
}

function applyLang() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });
}

async function init() {
    config = JSON.parse(await getConfig());
    lang = config.language || 'de';
    applyLang();
    
    if (config.isFirstRun || !config.installPath) {
        showView('setupView');
        const paths = JSON.parse(await getDefaultPaths());
        document.getElementById('installPathInput').value = config.installPath || paths.installPath;
        document.getElementById('configPathInput').value = config.configPath || paths.configPath;
    } else {
        showView('mainView');
        document.getElementById('autoUpdateCheck').checked = config.autoUpdate;
        if (config.autoUpdate) {
            checkUpdates();
        } else {
            updateStatus('ready');
        }
    }
}

function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

async function checkUpdates() {
    updateStatus('checking');
    document.getElementById('checkBtn').disabled = true;
    
    try {
        const result = JSON.parse(await window.checkUpdates());
        if (!result.success) throw new Error(result.error);
        
        updateInfo = result;
        
        if (result.updateAvailable) {
            updateStatus('update', result.latestVersion);
            document.getElementById('updateBtn').classList.remove('hidden');
        } else if (result.currentVersion) {
            updateStatus('upToDate');
        } else {
            updateStatus('noVersion');
            document.getElementById('updateBtn').classList.remove('hidden');
        }
        
        document.getElementById('startBtn').disabled = !result.currentVersion;
    } catch (e) {
        updateStatus('error', e.message);
    }
    
    document.getElementById('checkBtn').disabled = false;
}

function updateStatus(status, detail) {
    const icon = document.getElementById('statusIcon');
    const title = document.getElementById('statusTitle');
    const subtitle = document.getElementById('statusSubtitle');
    
    icon.classList.remove('spin');
    
    switch(status) {
        case 'checking':
            icon.textContent = '⏳';
            icon.classList.add('spin');
            title.textContent = t('main.checkingUpdates');
            subtitle.textContent = '';
            break;
        case 'upToDate':
            icon.textContent = '✅';
            title.textContent = t('main.upToDate');
            subtitle.textContent = t('main.ready');
            break;
        case 'update':
            icon.textContent = '📥';
            title.textContent = t('main.updateAvailable');
            subtitle.textContent = t('update.newVersion') + ': ' + detail;
            break;
        case 'noVersion':
            icon.textContent = '⚠️';
            title.textContent = t('main.noVersion');
            subtitle.textContent = '';
            break;
        case 'ready':
            icon.textContent = '✅';
            title.textContent = t('main.ready');
            subtitle.textContent = config.lastVersion ? t('main.version') + ' ' + config.lastVersion : '';
            break;
        case 'error':
            icon.textContent = '❌';
            title.textContent = t('errors.network');
            subtitle.textContent = detail || '';
            break;
    }
}

function showProgress(show) {
    document.getElementById('progressBar').classList.toggle('active', show);
    document.getElementById('progressText').classList.toggle('active', show);
}

function setProgress(percent, text) {
    document.getElementById('progressFill').style.width = percent + '%';
    document.getElementById('progressText').textContent = text || percent + '%';
}

async function installUpdate() {
    if (!updateInfo) return;
    
    closeModal('updateModal');
    showProgress(true);
    document.querySelectorAll('.btn').forEach(b => b.disabled = true);
    
    setProgress(10, t('progress.download'));
    
    const result = JSON.parse(await window.installUpdate(updateInfo.latestVersion));
    
    if (result.success) {
        setProgress(100, t('progress.complete'));
        config = JSON.parse(await getConfig());
        document.getElementById('updateBtn').classList.add('hidden');
        updateStatus('upToDate');
        document.getElementById('startBtn').disabled = false;
    } else {
        updateStatus('error', result.error);
    }
    
    showProgress(false);
    document.querySelectorAll('.btn').forEach(b => b.disabled = false);
}

async function launchApp() {
    document.getElementById('startBtn').disabled = true;
    document.getElementById('startBtn').textContent = '...';
    
    const result = JSON.parse(await window.launchApp());
    
    if (result.success) {
        setTimeout(() => closeWindow(), 500);
    } else {
        alert(t('errors.launch') + ': ' + result.error);
        document.getElementById('startBtn').disabled = false;
        document.getElementById('startBtn').textContent = t('buttons.start');
    }
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function showUpdateModal() {
    if (!updateInfo) return;
    document.getElementById('modalCurrentVersion').textContent = updateInfo.currentVersion || '-';
    document.getElementById('modalNewVersion').textContent = updateInfo.latestVersion;
    
    const list = document.getElementById('changelogList');
    list.innerHTML = '';
    (updateInfo.changelog || []).slice(0, 10).forEach(c => {
        const li = document.createElement('li');
        li.textContent = c;
        list.appendChild(li);
    });
    
    openModal('updateModal');
}

// Event listeners
document.getElementById('browseInstallBtn').onclick = async () => {
    const path = await selectDirectory(t('setup.installPath'), document.getElementById('installPathInput').value);
    if (path) document.getElementById('installPathInput').value = path;
};

document.getElementById('browseConfigBtn').onclick = async () => {
    const path = await selectDirectory(t('setup.configPath'), document.getElementById('configPathInput').value);
    if (path) document.getElementById('configPathInput').value = path;
};

document.getElementById('continueBtn').onclick = async () => {
    const installPath = document.getElementById('installPathInput').value;
    const configPath = document.getElementById('configPathInput').value;
    
    if (!installPath || !configPath) {
        alert(t('setup.pathRequired'));
        return;
    }
    
    await saveConfig(JSON.stringify({ installPath, configPath, isFirstRun: false }));
    config = JSON.parse(await getConfig());
    showView('mainView');
    checkUpdates();
};

document.getElementById('checkBtn').onclick = checkUpdates;
document.getElementById('updateBtn').onclick = showUpdateModal;
document.getElementById('startBtn').onclick = launchApp;
document.getElementById('settingsBtn').onclick = () => {
    document.getElementById('settingsInstallPath').textContent = config.installPath || '-';
    document.getElementById('settingsConfigPath').textContent = config.configPath || '-';
    openModal('settingsModal');
};
document.getElementById('logsBtn').onclick = () => openLogs();

document.getElementById('autoUpdateCheck').onchange = async (e) => {
    await saveConfig(JSON.stringify({ autoUpdate: e.target.checked }));
};

document.getElementById('closeUpdateModal').onclick = () => closeModal('updateModal');
document.getElementById('laterBtn').onclick = () => closeModal('updateModal');
document.getElementById('installNowBtn').onclick = installUpdate;
document.getElementById('closeSettingsModal').onclick = () => closeModal('settingsModal');
document.getElementById('closeSettingsBtn').onclick = () => closeModal('settingsModal');

document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.onclick = async () => {
        lang = btn.dataset.lang;
        await saveConfig(JSON.stringify({ language: lang }));
        applyLang();
    };
});

init();
</script>
</body>
</html>`
