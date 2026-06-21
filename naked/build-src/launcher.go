package main

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const (
	// Node.js installation settings
	nodeVersion  = "20.18.1"
	nodeWinURL   = "https://nodejs.org/dist/v20.18.1/node-v20.18.1-win-x64.zip"
	nodeLinuxURL = "https://nodejs.org/dist/v20.18.1/node-v20.18.1-linux-x64.tar.xz"
	nodeMacURL   = "https://nodejs.org/dist/v20.18.1/node-v20.18.1-darwin-x64.tar.gz"
	
	// GitHub API settings for auto-update
	githubOwner      = "Loggableim"
	githubRepo       = "ltth_desktop2"
	githubBranch     = "main"
	githubAPIURL     = "https://api.github.com"
	updateCheckFile  = "runtime/last_update_check.txt"
	versionSHAFile   = "runtime/version_sha.txt"
	updateInterval   = 24 * time.Hour
	
	// Update download settings
	minUpdateSuccessRate = 90.0 // Minimum percentage of files that must download successfully
	
	// Update modes
	updateModeAuto    = "auto"    // Auto-detect based on existing files
	updateModeRelease = "release" // Stable releases (default)
	updateModeCommit  = "commit"  // Bleeding edge (legacy/dev)
	
	// Version file
	versionFile = "runtime/version.txt"
)

// GitHub API response structures for auto-update
type GitHubCommit struct {
	SHA    string `json:"sha"`
	Commit struct {
		Message string `json:"message"`
		Author  struct {
			Name string    `json:"name"`
			Date time.Time `json:"date"`
		} `json:"author"`
	} `json:"commit"`
}

type GitHubTreeItem struct {
	Path string `json:"path"`
	Type string `json:"type"` // "blob" or "tree"
	SHA  string `json:"sha"`
	Size int    `json:"size"`
	URL  string `json:"url"`
}

type GitHubTree struct {
	Tree      []GitHubTreeItem `json:"tree"`
	Truncated bool             `json:"truncated"`
}

type GitHubBlob struct {
	Content  string `json:"content"`
	Encoding string `json:"encoding"` // "base64"
	Size     int    `json:"size"`
}

// GitHub Release API response structure
type GitHubRelease struct {
	TagName         string    `json:"tag_name"`          // "v1.2.3"
	Name            string    `json:"name"`              // "Release 1.2.3"
	Body            string    `json:"body"`              // Markdown release notes
	PublishedAt     time.Time `json:"published_at"`
	TarballURL      string    `json:"tarball_url"`
	ZipballURL      string    `json:"zipball_url"`
	TargetCommitish string    `json:"target_commitish"` // Usually "main"
	
	// Optional: Pre-built binaries
	Assets []struct {
		Name               string `json:"name"`
		Size               int    `json:"size"`
		BrowserDownloadURL string `json:"browser_download_url"`
		ContentType        string `json:"content_type"`
	} `json:"assets"`
}

// Unified update information
type UpdateInfo struct {
	Available      bool
	CurrentVersion string
	LatestVersion  string
	ReleaseNotes   string
	PublishedAt    time.Time
	CommitSHA      string // For blob API download
}

// writeCounter tracks download progress
type writeCounter struct {
	Total      int64
	Downloaded int64
}

// Write implements io.Writer interface for download progress tracking
func (wc *writeCounter) Write(p []byte) (int, error) {
	n := len(p)
	wc.Downloaded += int64(n)
	wc.printProgress()
	return n, nil
}

func (wc *writeCounter) printProgress() {
	// Clear the line and print progress
	fmt.Printf("\r%s", strings.Repeat(" ", 50))
	fmt.Printf("\rDownload: %.2f MB / %.2f MB (%.0f%%)", 
		float64(wc.Downloaded)/1024/1024,
		float64(wc.Total)/1024/1024,
		float64(wc.Downloaded)/float64(wc.Total)*100)
}

func printHeader() {
	fmt.Println("================================================")
	fmt.Println("  TikTok Stream Tool - Launcher")
	fmt.Println("================================================")
	fmt.Println()
}

// getNodeExecutable returns the path to node executable (portable or global)
func getNodeExecutable() string {
	// Get executable directory
	exePath, err := os.Executable()
	if err != nil {
		return ""
	}
	exeDir := filepath.Dir(exePath)
	
	// Check for portable installation first
	portableNode := filepath.Join(exeDir, "runtime", "node", "node.exe")
	if runtime.GOOS != "windows" {
		portableNode = filepath.Join(exeDir, "runtime", "node", "node")
	}
	
	if _, err := os.Stat(portableNode); err == nil {
		return portableNode
	}
	
	// Check for global installation
	nodePath, err := exec.LookPath("node")
	if err == nil {
		return nodePath
	}
	
	return ""
}

func checkNodeJS() (string, error) {
	// Check for portable installation first
	exePath, err := os.Executable()
	if err == nil {
		exeDir := filepath.Dir(exePath)
		portableNode := filepath.Join(exeDir, "runtime", "node", "node.exe")
		if runtime.GOOS != "windows" {
			portableNode = filepath.Join(exeDir, "runtime", "node", "node")
		}
		
		if _, err := os.Stat(portableNode); err == nil {
			return portableNode, nil
		}
	}
	
	// Check for global installation
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

// getNodeDownloadURL returns the download URL for the current platform
func getNodeDownloadURL() string {
	switch runtime.GOOS {
	case "windows":
		return nodeWinURL
	case "linux":
		return nodeLinuxURL
	case "darwin":
		return nodeMacURL
	default:
		return nodeWinURL
	}
}

// downloadFile downloads a file from URL with progress display
func downloadFile(filepath, url string) error {
	// Create the file
	out, err := os.Create(filepath)
	if err != nil {
		return err
	}
	defer out.Close()
	
	// Create HTTP client with timeout
	client := &http.Client{
		Timeout: 300 * time.Second, // 5 minutes for large downloads
	}
	
	// Get the data
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	
	// Check server response
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("bad status: %s", resp.Status)
	}
	
	// Create progress counter
	counter := &writeCounter{
		Total: resp.ContentLength,
	}
	
	fmt.Printf("Dateigröße: %.2f MB\n", float64(counter.Total)/1024/1024)
	
	// Write the body to file with progress
	_, err = io.Copy(out, io.TeeReader(resp.Body, counter))
	if err != nil {
		return err
	}
	
	// Print a newline after progress
	fmt.Println()
	
	return nil
}

func checkNodeModules(appDir string) bool {
	nodeModulesPath := filepath.Join(appDir, "node_modules")
	info, err := os.Stat(nodeModulesPath)
	if err != nil {
		return false
	}
	return info.IsDir()
}

// extractZipWithFlatStructure extracts a zip file, removing the root directory
func extractZipWithFlatStructure(zipPath, destDir string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()
	
	// Find the root directory name (e.g., "node-v20.18.1-win-x64/")
	var rootDir string
	if len(r.File) > 0 {
		rootDir = strings.Split(r.File[0].Name, "/")[0] + "/"
	}
	
	for _, f := range r.File {
		// Skip the root directory itself
		if f.Name == rootDir {
			continue
		}
		
		// Remove root directory from path
		targetPath := strings.TrimPrefix(f.Name, rootDir)
		if targetPath == "" {
			continue
		}
		
		fpath := filepath.Join(destDir, targetPath)
		
		// Check for ZipSlip vulnerability
		if !strings.HasPrefix(fpath, filepath.Clean(destDir)+string(os.PathSeparator)) {
			return fmt.Errorf("illegal file path: %s", fpath)
		}
		
		if f.FileInfo().IsDir() {
			// Create directory
			os.MkdirAll(fpath, os.ModePerm)
			continue
		}
		
		// Create parent directory if needed
		if err := os.MkdirAll(filepath.Dir(fpath), os.ModePerm); err != nil {
			return err
		}
		
		// Extract file
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

// extractTar extracts a tar archive (for Linux/macOS) with structure flattening
func extractTar(tarPath, destDir string) error {
	// Use tar command to extract
	var cmd *exec.Cmd
	
	if strings.HasSuffix(tarPath, ".tar.xz") {
		cmd = exec.Command("tar", "-xJf", tarPath, "-C", destDir, "--strip-components=1")
	} else if strings.HasSuffix(tarPath, ".tar.gz") {
		cmd = exec.Command("tar", "-xzf", tarPath, "-C", destDir, "--strip-components=1")
	} else {
		return fmt.Errorf("unsupported archive format")
	}
	
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("tar extraction failed: %v, output: %s", err, string(output))
	}
	
	return nil
}

// extractNodeArchive extracts the Node.js archive based on platform
func extractNodeArchive(archivePath, destDir string) error {
	if runtime.GOOS == "windows" {
		return extractZipWithFlatStructure(archivePath, destDir)
	}
	return extractTar(archivePath, destDir)
}

// writeNodeVersion writes the Node.js version to version.txt
func writeNodeVersion(nodeDir, version string) error {
	versionFile := filepath.Join(nodeDir, "version.txt")
	return os.WriteFile(versionFile, []byte(version), 0644)
}

// getInstalledNodeVersion reads the installed Node.js version from version.txt
func getInstalledNodeVersion(nodeDir string) string {
	versionFile := filepath.Join(nodeDir, "version.txt")
	data, err := os.ReadFile(versionFile)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

// installNodePortable installs portable Node.js with retry logic
func installNodePortable() (string, error) {
	exePath, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("kann Programmverzeichnis nicht ermitteln: %v", err)
	}
	
	exeDir := filepath.Dir(exePath)
	runtimeDir := filepath.Join(exeDir, "runtime")
	nodeDir := filepath.Join(runtimeDir, "node")
	
	// Create runtime directory
	if err := os.MkdirAll(runtimeDir, 0755); err != nil {
		return "", fmt.Errorf("kann runtime Verzeichnis nicht erstellen: %v", err)
	}
	
	fmt.Println()
	fmt.Println("===============================================")
	fmt.Println("  Node.js wird installiert...")
	fmt.Println("===============================================")
	fmt.Println()
	
	downloadURL := getNodeDownloadURL()
	fmt.Printf("Download: %s\n", downloadURL)
	
	// Determine archive extension
	var archiveExt string
	if runtime.GOOS == "windows" {
		archiveExt = ".zip"
	} else if runtime.GOOS == "linux" {
		archiveExt = ".tar.xz"
	} else {
		archiveExt = ".tar.gz"
	}
	
	archivePath := filepath.Join(runtimeDir, "node"+archiveExt)
	
	// Download with retry logic
	var downloadErr error
	maxRetries := 3
	for attempt := 1; attempt <= maxRetries; attempt++ {
		if attempt > 1 {
			fmt.Printf("\nDownload fehlgeschlagen, Versuch %d von %d...\n", attempt, maxRetries)
		}
		
		downloadErr = downloadFile(archivePath, downloadURL)
		if downloadErr == nil {
			break
		}
		
		// Clean up partial download
		os.Remove(archivePath)
	}
	
	if downloadErr != nil {
		return "", fmt.Errorf("download fehlgeschlagen nach %d Versuchen: %v\n\nBitte installiere Node.js manuell von:\nhttps://nodejs.org", maxRetries, downloadErr)
	}
	
	fmt.Println("Extrahiere Node.js...")
	
	// Extract archive
	if err := extractNodeArchive(archivePath, nodeDir); err != nil {
		os.RemoveAll(nodeDir) // Cleanup on failure
		os.Remove(archivePath)
		return "", fmt.Errorf("extraktion fehlgeschlagen: %v", err)
	}
	
	// Clean up archive
	os.Remove(archivePath)
	
	// Write version file
	if err := writeNodeVersion(nodeDir, nodeVersion); err != nil {
		fmt.Printf("Warnung: Konnte version.txt nicht schreiben: %v\n", err)
	}
	
	// Validate installation
	nodeExe := filepath.Join(nodeDir, "node.exe")
	if runtime.GOOS != "windows" {
		nodeExe = filepath.Join(nodeDir, "node")
	}
	
	if _, err := os.Stat(nodeExe); os.IsNotExist(err) {
		return "", fmt.Errorf("node executable nicht gefunden nach Installation")
	}
	
	fmt.Println()
	fmt.Println("Node.js erfolgreich installiert!")
	fmt.Println()
	
	return nodeExe, nil
}

// checkNodeUpdate checks if an update is available
// Note: Uses simple string comparison. Works for same version format (e.g., "20.18.1" vs "20.18.0")
// but may not work correctly for semantic version comparison with different digit counts.
func checkNodeUpdate(nodeDir string) (bool, error) {
	fmt.Println("Portable Node.js Auto-Update deaktiviert; verwende bestehende Installation.")
	return false, nil

	installedVersion := getInstalledNodeVersion(nodeDir)
	if installedVersion == "" {
		// No version file, assume update needed
		return true, nil
	}
	
	// Compare versions (simple string comparison works for same format)
	if installedVersion != nodeVersion {
		return true, nil
	}
	
	return false, nil
}

// updateNodePortable updates the portable Node.js installation
func updateNodePortable() error {
	return fmt.Errorf("portable Node.js auto-update is disabled")

	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("kann Programmverzeichnis nicht ermitteln: %v", err)
	}
	
	exeDir := filepath.Dir(exePath)
	runtimeDir := filepath.Join(exeDir, "runtime")
	nodeDir := filepath.Join(runtimeDir, "node")
	nodeNewDir := filepath.Join(runtimeDir, "node_new")
	nodeBackupDir := filepath.Join(runtimeDir, "node.backup")
	
	oldVersion := getInstalledNodeVersion(nodeDir)
	
	fmt.Println()
	fmt.Printf("Node.js Update verfügbar: v%s → v%s\n", oldVersion, nodeVersion)
	fmt.Println("Aktualisiere Node.js...")
	
	downloadURL := getNodeDownloadURL()
	
	// Determine archive extension
	var archiveExt string
	if runtime.GOOS == "windows" {
		archiveExt = ".zip"
	} else if runtime.GOOS == "linux" {
		archiveExt = ".tar.xz"
	} else {
		archiveExt = ".tar.gz"
	}
	
	archivePath := filepath.Join(runtimeDir, "node_update"+archiveExt)
	
	// Download new version
	if err := downloadFile(archivePath, downloadURL); err != nil {
		return fmt.Errorf("download fehlgeschlagen: %v", err)
	}
	
	// Extract to temporary directory
	if err := os.MkdirAll(nodeNewDir, 0755); err != nil {
		os.Remove(archivePath)
		return fmt.Errorf("kann temporäres Verzeichnis nicht erstellen: %v", err)
	}
	
	if err := extractNodeArchive(archivePath, nodeNewDir); err != nil {
		os.RemoveAll(nodeNewDir)
		os.Remove(archivePath)
		return fmt.Errorf("extraktion fehlgeschlagen: %v", err)
	}
	
	// Clean up archive
	os.Remove(archivePath)
	
	// Backup old installation
	os.RemoveAll(nodeBackupDir) // Remove old backup if exists
	if err := os.Rename(nodeDir, nodeBackupDir); err != nil {
		os.RemoveAll(nodeNewDir)
		return fmt.Errorf("backup fehlgeschlagen: %v", err)
	}
	
	// Move new version to final location
	if err := os.Rename(nodeNewDir, nodeDir); err != nil {
		// Try to restore backup
		if restoreErr := os.Rename(nodeBackupDir, nodeDir); restoreErr != nil {
			return fmt.Errorf("installation fehlgeschlagen: %v (Backup-Wiederherstellung auch fehlgeschlagen: %v)", err, restoreErr)
		}
		return fmt.Errorf("installation fehlgeschlagen: %v (alte Version wiederhergestellt)", err)
	}
	
	// Write new version file
	if err := writeNodeVersion(nodeDir, nodeVersion); err != nil {
		fmt.Printf("Warnung: Konnte version.txt nicht schreiben: %v\n", err)
	}
	
	fmt.Printf("Node.js erfolgreich aktualisiert auf v%s!\n", nodeVersion)
	fmt.Println()
	
	return nil
}

func installDependencies(appDir, nodePath string) error {
	fmt.Println("Installiere Abhaengigkeiten... (Das kann beim ersten Start ein paar Minuten dauern)")
	
	// Determine npm path based on Node.js path
	var npmPath string
	if strings.Contains(nodePath, filepath.Join("runtime", "node")) {
		// Use portable npm
		exePath, err := os.Executable()
		if err == nil {
			exeDir := filepath.Dir(exePath)
			nodeDir := filepath.Join(exeDir, "runtime", "node")
			if runtime.GOOS == "windows" {
				npmPath = filepath.Join(nodeDir, "npm.cmd")
			} else {
				npmPath = filepath.Join(nodeDir, "bin", "npm")
			}
		}
	}
	
	var cmd *exec.Cmd
	if npmPath != "" && runtime.GOOS == "windows" {
		// Use portable npm on Windows
		cmd = exec.Command("cmd", "/C", npmPath, "install", "--cache", "false")
	} else if npmPath != "" {
		// Use portable npm on Unix
		cmd = exec.Command(npmPath, "install", "--cache", "false")
	} else if runtime.GOOS == "windows" {
		// Fallback to global npm on Windows
		cmd = exec.Command("cmd", "/C", "npm", "install", "--cache", "false")
	} else {
		// Fallback to global npm on Unix
		cmd = exec.Command("npm", "install", "--cache", "false")
	}
	
	cmd.Dir = appDir
	// Set environment variables to skip problematic preinstall checks
	cmd.Env = append(os.Environ(),
		"YOUTUBE_DL_SKIP_PYTHON_CHECK=1",
		"PUPPETEER_SKIP_DOWNLOAD=true",
	)
	// Capture stderr for error reporting; stdout is discarded (silent install)
	var stderrBuf bytes.Buffer
	cmd.Stderr = &stderrBuf

	err := cmd.Run()
	if err != nil {
		stderrOutput := stderrBuf.String()
		fmt.Printf("Fehler beim ersten npm install Versuch: %v\n", err)
		if stderrOutput != "" {
			fmt.Printf("npm Fehlerausgabe:\n%s\n", stderrOutput)
		}

		// Fallback: retry without --cache flag
		fmt.Println("Wiederhole Installation ohne --cache Flag...")

		var retryCmd *exec.Cmd
		if npmPath != "" && runtime.GOOS == "windows" {
			retryCmd = exec.Command("cmd", "/C", npmPath, "install")
		} else if npmPath != "" {
			retryCmd = exec.Command(npmPath, "install")
		} else if runtime.GOOS == "windows" {
			retryCmd = exec.Command("cmd", "/C", "npm", "install")
		} else {
			retryCmd = exec.Command("npm", "install")
		}
		retryCmd.Dir = appDir
		retryCmd.Env = append(os.Environ(),
			"YOUTUBE_DL_SKIP_PYTHON_CHECK=1",
			"PUPPETEER_SKIP_DOWNLOAD=true",
		)
		var retryStderr bytes.Buffer
		retryCmd.Stderr = &retryStderr

		if retryErr := retryCmd.Run(); retryErr != nil {
			if retryStderr.Len() > 0 {
				fmt.Printf("Fallback-Fehlerausgabe:\n%s\n", retryStderr.String())
			}
			return fmt.Errorf("Installation fehlgeschlagen: %v", retryErr)
		}

		fmt.Println("Installation erfolgreich mit Fallback-Methode (ohne --cache)!")
		fmt.Println()
		return nil
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

// ============================================
// Auto-Update Functions
// ============================================

// shouldCheckForUpdates checks if enough time has passed since last update check (rate limiting)
func shouldCheckForUpdates() bool {
	exePath, err := os.Executable()
	if err != nil {
		return true // Check anyway if we can't determine path
	}
	
	exeDir := filepath.Dir(exePath)
	checkFilePath := filepath.Join(exeDir, updateCheckFile)
	
	data, err := os.ReadFile(checkFilePath)
	if err != nil {
		return true // No previous check, so check now
	}
	
	lastCheck, err := time.Parse(time.RFC3339, strings.TrimSpace(string(data)))
	if err != nil {
		return true // Invalid timestamp, check again
	}
	
	return time.Since(lastCheck) >= updateInterval
}

// updateLastCheckTime saves the current time as last update check time
func updateLastCheckTime() {
	exePath, err := os.Executable()
	if err != nil {
		return
	}
	
	exeDir := filepath.Dir(exePath)
	runtimeDir := filepath.Join(exeDir, "runtime")
	
	// Ensure runtime directory exists
	os.MkdirAll(runtimeDir, 0755)
	
	checkFilePath := filepath.Join(exeDir, updateCheckFile)
	timestamp := time.Now().Format(time.RFC3339)
	os.WriteFile(checkFilePath, []byte(timestamp), 0644)
}

// getLocalCommitSHA reads the local commit SHA from version_sha.txt
func getLocalCommitSHA() (string, error) {
	exePath, err := os.Executable()
	if err != nil {
		return "", err
	}
	
	exeDir := filepath.Dir(exePath)
	shaFilePath := filepath.Join(exeDir, versionSHAFile)
	
	data, err := os.ReadFile(shaFilePath)
	if err != nil {
		return "", err
	}
	
	return strings.TrimSpace(string(data)), nil
}

// writeLocalCommitSHA writes the commit SHA to version_sha.txt
func writeLocalCommitSHA(sha string) error {
	exePath, err := os.Executable()
	if err != nil {
		return err
	}
	
	exeDir := filepath.Dir(exePath)
	runtimeDir := filepath.Join(exeDir, "runtime")
	
	// Ensure runtime directory exists
	os.MkdirAll(runtimeDir, 0755)
	
	shaFilePath := filepath.Join(exeDir, versionSHAFile)
	return os.WriteFile(shaFilePath, []byte(sha), 0644)
}

// ============================================
// Version Management (Releases-based)
// ============================================

// getVersionFilePath returns the path to runtime/version.txt
func getVersionFilePath() string {
	exePath, _ := os.Executable()
	return filepath.Join(filepath.Dir(exePath), versionFile)
}

// getLocalVersion reads the current version from runtime/version.txt
func getLocalVersion() (string, error) {
	data, err := os.ReadFile(getVersionFilePath())
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(data)), nil
}

// writeLocalVersion writes the version to runtime/version.txt
func writeLocalVersion(version string) error {
	exePath, err := os.Executable()
	if err != nil {
		return err
	}
	
	exeDir := filepath.Dir(exePath)
	runtimeDir := filepath.Join(exeDir, "runtime")
	os.MkdirAll(runtimeDir, 0755)
	
	return os.WriteFile(getVersionFilePath(), []byte(version), 0644)
}

// compareVersions compares two semantic version strings
// Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
// Note: Invalid version parts default to 0 for graceful degradation
func compareVersions(v1, v2 string) int {
	// Remove "v" prefix if present
	v1 = strings.TrimPrefix(v1, "v")
	v2 = strings.TrimPrefix(v2, "v")
	
	parts1 := strings.Split(v1, ".")
	parts2 := strings.Split(v2, ".")
	
	maxLen := len(parts1)
	if len(parts2) > maxLen {
		maxLen = len(parts2)
	}
	
	for i := 0; i < maxLen; i++ {
		var n1, n2 int
		
		if i < len(parts1) {
			// Extract numeric part (ignore pre-release suffixes like "-beta")
			numStr := strings.Split(parts1[i], "-")[0]
			// Ignore parsing errors - invalid parts default to 0 for graceful comparison
			n1, _ = strconv.Atoi(numStr)
		}
		
		if i < len(parts2) {
			numStr := strings.Split(parts2[i], "-")[0]
			// Ignore parsing errors - invalid parts default to 0 for graceful comparison
			n2, _ = strconv.Atoi(numStr)
		}
		
		if n1 > n2 {
			return 1
		}
		if n1 < n2 {
			return -1
		}
	}
	
	return 0
}

// detectUpdateMode auto-detects the appropriate update mode
// Priority: ENV var > version.txt exists > version_sha.txt exists > default
func detectUpdateMode() string {
	// Priority 1: Explicit environment variable
	if mode := os.Getenv("LTTH_UPDATE_MODE"); mode != "" {
		return mode
	}
	
	// Priority 2: version.txt exists → Release Mode
	if _, err := os.Stat(getVersionFilePath()); err == nil {
		return updateModeRelease
	}
	
	// Priority 3: version_sha.txt exists → Commit Mode
	exePath, err := os.Executable()
	if err == nil {
		exeDir := filepath.Dir(exePath)
		shaFilePath := filepath.Join(exeDir, versionSHAFile)
		if _, err := os.Stat(shaFilePath); err == nil {
			return updateModeCommit
		}
	}
	
	// Default: Release Mode
	return updateModeRelease
}

// getLatestCommitSHA fetches the latest commit SHA from GitHub
func getLatestCommitSHA() (string, error) {
	url := fmt.Sprintf("%s/repos/%s/%s/commits/%s",
		githubAPIURL, githubOwner, githubRepo, githubBranch)
	
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", err
	}
	
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}
	
	var commit GitHubCommit
	if err := json.NewDecoder(resp.Body).Decode(&commit); err != nil {
		return "", err
	}
	
	return commit.SHA, nil
}

// ============================================
// GitHub Releases API Integration
// ============================================

// getLatestRelease fetches the latest release from GitHub
func getLatestRelease() (*GitHubRelease, error) {
	url := fmt.Sprintf("%s/repos/%s/%s/releases/latest",
		githubAPIURL, githubOwner, githubRepo)
	
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("no releases found")
	}
	
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}
	
	var release GitHubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return nil, err
	}
	
	return &release, nil
}

// checkForReleasesUpdate checks for updates using GitHub Releases
func checkForReleasesUpdate() (*UpdateInfo, error) {
	// Get latest release from GitHub
	release, err := getLatestRelease()
	if err != nil {
		return nil, err
	}
	
	// Get local version
	localVersion, err := getLocalVersion()
	if err != nil {
		// First installation - save current version
		if writeErr := writeLocalVersion(release.TagName); writeErr != nil {
			// Log but don't fail - update check can continue
			fmt.Printf("Warning: Failed to write version file: %v\n", writeErr)
		}
		return &UpdateInfo{
			Available:      false,
			CurrentVersion: release.TagName,
			LatestVersion:  release.TagName,
		}, nil
	}
	
	// Compare versions
	updateAvailable := compareVersions(release.TagName, localVersion) > 0
	
	// Get commit SHA from the release for downloading
	commitSHA := ""
	if updateAvailable {
		// Fetch the commit SHA from the target commitish
		commitSHA, err = getLatestCommitSHA()
		if err != nil {
			// If we can't get commit SHA, we can't download the update
			return nil, fmt.Errorf("failed to get commit SHA for download: %v", err)
		}
	}
	
	return &UpdateInfo{
		Available:      updateAvailable,
		CurrentVersion: localVersion,
		LatestVersion:  release.TagName,
		ReleaseNotes:   release.Body,
		PublishedAt:    release.PublishedAt,
		CommitSHA:      commitSHA,
	}, nil
}

// checkForUpdates checks if an update is available (unified for both modes)
// Returns: hasUpdate, commitSHA, releaseInfo (may be nil), error
func checkForUpdates() (bool, string, *UpdateInfo, error) {
	return false, "", nil, nil

	// 1. Check rate limiting
	if !shouldCheckForUpdates() {
		return false, "", nil, nil
	}
	
	// 2. Detect update mode
	mode := detectUpdateMode()
	
	// 3. Check for updates based on mode
	if mode == updateModeRelease {
		// Release mode - use GitHub Releases API
		updateInfo, err := checkForReleasesUpdate()
		if err != nil {
			// Fallback to commit mode on error
			hasUpdate, sha, err := checkForCommitUpdates()
			return hasUpdate, sha, nil, err
		}
		
		if updateInfo.Available {
			return true, updateInfo.CommitSHA, updateInfo, nil
		}
		
		updateLastCheckTime()
		return false, "", nil, nil
	}
	
	// Commit mode (legacy/dev) - use commit SHA checking
	hasUpdate, sha, err := checkForCommitUpdates()
	return hasUpdate, sha, nil, err
}

// checkForCommitUpdates checks for updates using commit SHA (legacy mode)
func checkForCommitUpdates() (bool, string, error) {
	// Get latest commit SHA from GitHub
	latestSHA, err := getLatestCommitSHA()
	if err != nil {
		return false, "", err
	}
	
	// Read local SHA
	localSHA, err := getLocalCommitSHA()
	if err != nil {
		// First installation - save current SHA
		writeLocalCommitSHA(latestSHA)
		return false, "", nil
	}
	
	// Compare
	if localSHA != latestSHA {
		return true, latestSHA, nil
	}
	
	updateLastCheckTime()
	return false, "", nil
}

// getRepositoryTree fetches the repository tree from GitHub
func getRepositoryTree(commitSHA string) (*GitHubTree, error) {
	url := fmt.Sprintf("%s/repos/%s/%s/git/trees/%s?recursive=1",
		githubAPIURL, githubOwner, githubRepo, commitSHA)
	
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}
	
	var tree GitHubTree
	if err := json.NewDecoder(resp.Body).Decode(&tree); err != nil {
		return nil, err
	}
	
	return &tree, nil
}

// filterRelevantFiles filters the tree items to only include files we want to update
func filterRelevantFiles(items []GitHubTreeItem) []GitHubTreeItem {
	var filtered []GitHubTreeItem
	
	// Whitelist - paths we want to update
	allowedPaths := []string{
		"app/",
		"plugins/",
		"game-engine/",
		"package.json",
		"package-lock.json",
	}
	
	// Blacklist - paths we never want to touch
	excludePaths := []string{
		"launcher.exe",
		"runtime/",
		"logs/",
		"data/",
		"node_modules/",
		".git/",
		"build-src/",
		".github/",
		".gitignore",
		"README.md",
		"LICENSE",
	}
	
	for _, item := range items {
		// Check whitelist
		allowed := false
		for _, prefix := range allowedPaths {
			if strings.HasPrefix(item.Path, prefix) || item.Path == strings.TrimSuffix(prefix, "/") {
				allowed = true
				break
			}
		}
		if !allowed {
			continue
		}
		
		// Check blacklist
		excluded := false
		for _, prefix := range excludePaths {
			if strings.HasPrefix(item.Path, prefix) || item.Path == strings.TrimSuffix(prefix, "/") {
				excluded = true
				break
			}
		}
		if excluded {
			continue
		}
		
		filtered = append(filtered, item)
	}
	
	return filtered
}

// downloadFileFromGitHub downloads a single file from GitHub using the Blob API
func downloadFileFromGitHub(baseDir string, file GitHubTreeItem) error {
	// Create directory structure
	filePath := filepath.Join(baseDir, file.Path)
	os.MkdirAll(filepath.Dir(filePath), 0755)
	
	// If it's a tree (directory), just create it
	if file.Type == "tree" {
		return os.MkdirAll(filePath, 0755)
	}
	
	// Download blob
	url := fmt.Sprintf("%s/repos/%s/%s/git/blobs/%s",
		githubAPIURL, githubOwner, githubRepo, file.SHA)
	
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}
	
	// Parse JSON
	var blob GitHubBlob
	if err := json.NewDecoder(resp.Body).Decode(&blob); err != nil {
		return err
	}
	
	// Decode Base64 content
	content, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(blob.Content, "\n", ""))
	if err != nil {
		return err
	}
	
	// Write file
	return os.WriteFile(filePath, content, 0644)
}

// downloadUpdate downloads and applies an update from GitHub
func downloadUpdate(commitSHA string) error {
	return fmt.Errorf("app auto-update is disabled")

	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("kann Programmverzeichnis nicht ermitteln: %v", err)
	}
	exeDir := filepath.Dir(exePath)
	
	fmt.Println()
	fmt.Println("===============================================")
	fmt.Println("  Update wird heruntergeladen...")
	fmt.Println("===============================================")
	fmt.Println()
	
	// 1. Get repository tree
	tree, err := getRepositoryTree(commitSHA)
	if err != nil {
		return fmt.Errorf("konnte Repository-Tree nicht abrufen: %v", err)
	}
	
	// 2. Filter relevant files
	relevantFiles := filterRelevantFiles(tree.Tree)
	
	if len(relevantFiles) == 0 {
		fmt.Println("Keine Dateien zu aktualisieren.")
		return nil
	}
	
	fmt.Printf("Lade %d Dateien herunter...\n\n", len(relevantFiles))
	
	// 3. Download each file
	successCount := 0
	for i, file := range relevantFiles {
		fmt.Printf("[%d/%d] %s\n", i+1, len(relevantFiles), file.Path)
		
		err := downloadFileFromGitHub(exeDir, file)
		if err != nil {
			fmt.Printf("  ⚠️  Fehler: %v\n", err)
			continue
		}
		successCount++
	}
	
	fmt.Println()
	
	// Check if enough files were downloaded successfully
	// We consider the update successful if at least minUpdateSuccessRate% of files downloaded
	successRate := float64(successCount) / float64(len(relevantFiles)) * 100
	if successRate < minUpdateSuccessRate {
		return fmt.Errorf("zu viele Fehler beim Download (%.1f%% erfolgreich)", successRate)
	}
	
	// 4. Write new SHA
	if err := writeLocalCommitSHA(commitSHA); err != nil {
		return fmt.Errorf("konnte version_sha.txt nicht aktualisieren: %v", err)
	}
	
	fmt.Println("✅ Update erfolgreich installiert!")
	fmt.Println()
	
	return nil
}

// End of Auto-Update Functions
// ============================================

// getInstallationPath prompts the user for the installation directory
// Returns the chosen directory path
func getInstallationPath() (string, error) {
	fmt.Println()
	fmt.Println("===============================================")
	fmt.Println("  Installationspfad waehlen")
	fmt.Println("===============================================")
	fmt.Println()
	
	// Get default path (executable directory)
	exePath, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("Kann Programmverzeichnis nicht ermitteln: %v", err)
	}
	defaultPath := filepath.Dir(exePath)
	
	fmt.Printf("Standard-Installationspfad: %s\n", defaultPath)
	fmt.Println()
	fmt.Println("Optionen:")
	fmt.Println("  [1] Standard-Pfad verwenden (empfohlen)")
	fmt.Println("  [2] Eigenen Pfad angeben")
	fmt.Println()
	fmt.Print("Bitte waehle eine Option (1/2): ")
	
	var choice string
	fmt.Scanln(&choice)
	choice = strings.TrimSpace(choice)
	
	if choice == "2" {
		fmt.Println()
		fmt.Print("Bitte gib den gewuenschten Installationspfad ein: ")
		
		// Read input (note: Scanln stops at spaces, so users should quote paths with spaces)
		var customPath string
		fmt.Scanln(&customPath)
		customPath = strings.TrimSpace(customPath)
		
		// Handle quoted paths (remove quotes if present)
		if len(customPath) >= 2 && customPath[0] == '"' && customPath[len(customPath)-1] == '"' {
			customPath = customPath[1 : len(customPath)-1]
		}
		
		if customPath == "" {
			fmt.Println("⚠️  Kein Pfad angegeben, verwende Standard-Pfad.")
			return defaultPath, nil
		}
		
		// Create directory if it doesn't exist
		if err := os.MkdirAll(customPath, 0755); err != nil {
			return "", fmt.Errorf("Kann Verzeichnis nicht erstellen: %v", err)
		}
		
		fmt.Printf("✓ Verwende Installationspfad: %s\n", customPath)
		return customPath, nil
	}
	
	// Default: use standard path
	fmt.Printf("✓ Verwende Standard-Pfad: %s\n", defaultPath)
	return defaultPath, nil
}

func main() {
	printHeader()
	
	// === Ask for Installation Path ===
	installPath, err := getInstallationPath()
	if err != nil {
		fmt.Printf("❌ Fehler: %v\n", err)
		pause()
		os.Exit(1)
	}
	fmt.Println()
	
	// Change to installation directory
	if err := os.Chdir(installPath); err != nil {
		fmt.Printf("❌ Fehler: Kann nicht zum Installationspfad wechseln: %v\n", err)
		pause()
		os.Exit(1)
	}
	
	// === Auto-Update Check ===
	fmt.Println("Auto-Update deaktiviert; verwende lokalen Stand.")
	
	// === Node.js Check ===
	// Check Node.js installation
	nodePath, err := checkNodeJS()
	if err != nil {
		// No Node.js found - install portable version
		fmt.Println("Node.js nicht gefunden. Installiere portable Version...")
		
		var installErr error
		nodePath, installErr = installNodePortable()
		if installErr != nil {
			fmt.Println()
			fmt.Println("===============================================")
			fmt.Printf("  FEHLER: Node.js Installation fehlgeschlagen!\n")
			fmt.Println("===============================================")
			fmt.Println()
			fmt.Printf("%v\n", installErr)
			fmt.Println()
			pause()
			os.Exit(1)
		}
	} else {
		// Node.js found - check if it's portable and needs update
		exePath, err := os.Executable()
		if err == nil {
			exeDir := filepath.Dir(exePath)
			nodeDir := filepath.Join(exeDir, "runtime", "node")
			
			// Check if this is a portable installation
			if strings.Contains(nodePath, filepath.Join("runtime", "node")) {
				// Check for updates
				updateAvailable, err := checkNodeUpdate(nodeDir)
				if err == nil && updateAvailable {
					if updateErr := updateNodePortable(); updateErr != nil {
						fmt.Printf("Warnung: Node.js Update fehlgeschlagen: %v\n", updateErr)
						fmt.Println("Verwende bestehende Installation...")
					} else {
						// Update successful, update nodePath
						nodePath = getNodeExecutable()
					}
				}
			}
		}
	}
	
	// Show Node.js version
	fmt.Println("Node.js Version:")
	fmt.Println(getNodeVersion(nodePath))
	
	// Use installation path for app directory
	appDir := filepath.Join(installPath, "app")
	
	// Check if app directory exists
	if _, err := os.Stat(appDir); os.IsNotExist(err) {
		fmt.Printf("Fehler: app Verzeichnis nicht gefunden in %s\n", installPath)
		pause()
		os.Exit(1)
	}
	
	// Check and install node_modules if needed
	if !checkNodeModules(appDir) {
		err = installDependencies(appDir, nodePath)
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
