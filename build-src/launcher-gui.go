package main

import (
	"archive/zip"
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/getlantern/systray"
	"github.com/pkg/browser"
)

const (
	// CREATE_NO_WINDOW flag for Windows to hide console window
	createNoWindow = 0x08000000
	maxLogBytes    = 100000

	// Node.js settings
	nodeVersionFallback        = "22.14.0"
	defaultBackendPort         = 3000
	serverHealthTimeoutSeconds = 180
	serverHealthTimeout        = time.Duration(serverHealthTimeoutSeconds) * time.Second

	// GitHub API settings for auto-update
	githubOwner    = "Loggableim"
	githubRepo     = "ltth.app"
	githubAPIURL   = "https://api.github.com"
	updateInterval = 24 * time.Hour

	// Version / update state files (relative to exeDir)
	versionFile     = "runtime/version.txt"
	updateCheckFile = "runtime/last_update_check.txt"
)

// NodeRelease represents a single entry from https://nodejs.org/dist/index.json
type NodeRelease struct {
	Version string      `json:"version"` // "v22.14.0"
	LTS     interface{} `json:"lts"`     // false or a string like "Jod"
}

// GitHubRelease represents a GitHub release API response
type GitHubRelease struct {
	TagName     string    `json:"tag_name"`
	Name        string    `json:"name"`
	Body        string    `json:"body"`
	PublishedAt time.Time `json:"published_at"`
	ZipballURL  string    `json:"zipball_url"`
	Prerelease  bool      `json:"prerelease"`
	Assets      []struct {
		Name               string `json:"name"`
		Size               int64  `json:"size"`
		BrowserDownloadURL string `json:"browser_download_url"`
		ContentType        string `json:"content_type"`
	} `json:"assets"`
}

// loggedWriteCounter tracks download progress and logs to a *log.Logger every 2 seconds.
type loggedWriteCounter struct {
	Total      int64
	Downloaded int64
	lastLog    time.Time
	logger     *log.Logger
}

func (wc *loggedWriteCounter) Write(p []byte) (int, error) {
	n := len(p)
	wc.Downloaded += int64(n)
	if wc.logger != nil && time.Since(wc.lastLog) >= 2*time.Second {
		pct := float64(0)
		if wc.Total > 0 {
			pct = float64(wc.Downloaded) / float64(wc.Total) * 100
		}
		wc.logger.Printf("[DOWNLOAD] %.1f MB / %.1f MB (%.0f%%)\n",
			float64(wc.Downloaded)/1024/1024,
			float64(wc.Total)/1024/1024, pct)
		wc.lastLog = time.Now()
	}
	return n, nil
}

type Launcher struct {
	nodePath            string
	appDir              string
	exeDir              string
	configDir           string
	userConfigsDir      string
	progress            int
	status              string
	statusKey           string
	statusFallback      string
	statusArgs          []interface{}
	clients             map[chan string]bool
	clientsMu           sync.Mutex // Protects concurrent map access to clients
	logFile             *os.File
	logger              *log.Logger
	logPath             string
	envFileFixed        bool // Track if we auto-created .env file
	serverPort          int  // Actual port the server responded on
	preferredPort       int
	startupInProgress   bool
	serverStarted       bool
	lastStartError      string
	profiles            []ProfileInfo
	profilesLoaded      time.Time // Last time profiles were loaded
	selectedProfile     string
	locale              string
	translations        map[string]interface{}
	nodeCmd             *exec.Cmd  // Referenz auf laufenden Node-Prozess
	nodeMu              sync.Mutex // Schützt nodeCmd-Zugriff
	startMu             sync.Mutex
	resolvedNodeVersion string // Node.js LTS version resolved at startup
	settings            LauncherSettings
	pluginFailures      []PluginFailure
}

var allowedLocales = []string{"de", "en", "es", "fr"}

var launcherTranslationFallbacks = map[string]map[string]string{
	"de": {
		"app_name":                         "LTTH Launcher",
		"profile.title":                    "Profil",
		"profile.no_profiles":              "Keine Profile gefunden",
		"tabs.changelog":                   "Changelog",
		"tabs.api_keys":                    "API Keys",
		"tabs.community":                   "Community",
		"tabs.logging":                     "Logs",
		"status.progress":                  "Fortschritt",
		"status.initializing":              "Initialisiere...",
		"changelog.title":                  "Changelog",
		"changelog.loading":                "Lade Changelog...",
		"changelog.error":                  "Changelog konnte nicht geladen werden.",
		"api_keys.title":                   "API Keys",
		"api_keys.intro":                   "Konfiguriere optionale API Keys fuer erweiterte Funktionen.",
		"api_keys.mandatory_warning":       "Einige Funktionen benoetigen eigene API Keys.",
		"api_keys.fallback_warning":        "Ohne API Key werden lokale oder eingeschraenkte Fallbacks genutzt.",
		"api_keys.elevenlabs.description":  "ElevenLabs Stimmen und TTS-Funktionen.",
		"api_keys.openai.description":      "OpenAI Funktionen fuer KI-gestuetzte Workflows.",
		"api_keys.siliconflow.description": "SiliconFlow KI-Funktionen.",
		"api_keys.fishAudio.description":   "Fish Audio Stimmen und Audio-Funktionen.",
		"community.title":                  "Community",
		"community.intro":                  "Links zu Projekt, Diskussionen und Support.",
		"community.help_appreciated":       "Feedback und Bugreports helfen bei der Weiterentwicklung.",
		"community.links.repo":             "Repository",
		"community.links.discussions":      "Diskussionen",
		"community.links.issues":           "Issues",
		"community.links.discord":          "Discord",
		"community.contribute":             "Mithelfen?",
		"community.contribute_text":        "Pull Requests, Tests und Feedback sind willkommen.",
		"footer.powered_by":                "Bereitgestellt von LTTH",
		"theme.label":                      "Theme",
		"theme.daymode":                    "Tag",
		"theme.nightmode":                  "Nacht",
		"theme.highcontrast":               "Kontrast",
		"options.keep_open":                "Launcher offen halten",
		"options.keep_open_hint":           "Der Launcher verwaltet den Serverprozess.",
		"options.open_app":                 "App oeffnen",
		"options.app_not_ready":            "App noch nicht bereit",
		"options.app_ready":                "App bereit",
		"logs.title":                       "Logs",
		"logs.intro":                       "Launcher- und Serverlogs fuer Diagnose.",
		"logs.loading":                     "Lade Logs...",
		"logs.empty":                       "Keine Logs vorhanden.",
		"logs.error":                       "Logs konnten nicht geladen werden.",
	},
	"en": {
		"app_name":                         "LTTH Launcher",
		"profile.title":                    "Profile",
		"profile.no_profiles":              "No profiles found",
		"tabs.changelog":                   "Changelog",
		"tabs.api_keys":                    "API Keys",
		"tabs.community":                   "Community",
		"tabs.logging":                     "Logs",
		"status.progress":                  "Progress",
		"status.initializing":              "Initializing...",
		"changelog.title":                  "Changelog",
		"changelog.loading":                "Loading changelog...",
		"changelog.error":                  "Could not load changelog.",
		"api_keys.title":                   "API Keys",
		"api_keys.intro":                   "Configure optional API keys for advanced features.",
		"api_keys.mandatory_warning":       "Some features require your own API keys.",
		"api_keys.fallback_warning":        "Without API keys, local or limited fallbacks are used.",
		"api_keys.elevenlabs.description":  "ElevenLabs voices and TTS features.",
		"api_keys.openai.description":      "OpenAI features for AI-assisted workflows.",
		"api_keys.siliconflow.description": "SiliconFlow AI features.",
		"api_keys.fishAudio.description":   "Fish Audio voices and audio features.",
		"community.title":                  "Community",
		"community.intro":                  "Links to project, discussions, and support.",
		"community.help_appreciated":       "Feedback and bug reports help development.",
		"community.links.repo":             "Repository",
		"community.links.discussions":      "Discussions",
		"community.links.issues":           "Issues",
		"community.links.discord":          "Discord",
		"community.contribute":             "Contribute?",
		"community.contribute_text":        "Pull requests, tests, and feedback are welcome.",
		"footer.powered_by":                "Powered by LTTH",
		"theme.label":                      "Theme",
		"theme.daymode":                    "Day",
		"theme.nightmode":                  "Night",
		"theme.highcontrast":               "High contrast",
		"options.keep_open":                "Keep launcher open",
		"options.keep_open_hint":           "The launcher manages the server process.",
		"options.open_app":                 "Open app",
		"options.app_not_ready":            "App not ready",
		"options.app_ready":                "App ready",
		"logs.title":                       "Logs",
		"logs.intro":                       "Launcher and server logs for diagnostics.",
		"logs.loading":                     "Loading logs...",
		"logs.empty":                       "No logs available.",
		"logs.error":                       "Could not load logs.",
	},
}

const (
	diagnosticOK      = "ok"
	diagnosticWarning = "warning"
	diagnosticError   = "error"
	diagnosticInfo    = "info"

	updateChannelLocal  = "local"
	updateChannelStable = "stable"
	updateChannelBeta   = "beta"

	settingsFile = "runtime/launcher_settings.json"
)

type LauncherSettings struct {
	Locale           string `json:"locale"`
	Theme            string `json:"theme"`
	PreferredPort    int    `json:"preferredPort"`
	KeepLauncherOpen bool   `json:"keepLauncherOpen"`
	SafeMode         bool   `json:"safeMode"`
	UpdateChannel    string `json:"updateChannel"`
	FirstRunComplete bool   `json:"firstRunComplete"`
}

type DiagnosticItem struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Status      string `json:"status"`
	Message     string `json:"message"`
	Details     string `json:"details,omitempty"`
	FixAction   string `json:"fixAction,omitempty"`
	FixLabel    string `json:"fixLabel,omitempty"`
	Blocking    bool   `json:"blocking,omitempty"`
	LastChecked string `json:"lastChecked"`
}

type NodeVersionRecommendation struct {
	Status  string `json:"status"`
	Message string `json:"message"`
	Major   int    `json:"major"`
}

type PluginFailure struct {
	PluginID string `json:"pluginId"`
	Message  string `json:"message"`
}

type ProfileInfo struct {
	Username string    `json:"username"`
	Modified time.Time `json:"modified"`
}

type ServerHealthInfo struct {
	Status  string `json:"status"`
	Success bool   `json:"success"`
	Name    string `json:"name"`
	PID     int    `json:"pid"`
	Port    int    `json:"port"`
}

type VacuumMaintenanceResult struct {
	Success         bool   `json:"success"`
	DeletedUsers    int64  `json:"deletedUsers"`
	CleanupDays     int    `json:"cleanupDays"`
	CleanupDryRun   bool   `json:"cleanupDryRun"`
	VacuumPerformed bool   `json:"vacuumPerformed"`
	Error           string `json:"error"`
}

type VacuumResult struct {
	Success              bool   `json:"success"`
	Profile              string `json:"profile"`
	DatabasePath         string `json:"databasePath"`
	SizeBeforeBytes      int64  `json:"sizeBeforeBytes"`
	SizeAfterBytes       int64  `json:"sizeAfterBytes"`
	FreedBytes           int64  `json:"freedBytes"`
	DurationMillis       int64  `json:"durationMillis"`
	CleanupDays          int    `json:"cleanupDays"`
	CleanupDryRun        bool   `json:"cleanupDryRun"`
	CleanupDeletedUsers  int64  `json:"cleanupDeletedUsers"`
	VacuumPerformed      bool   `json:"vacuumPerformed"`
	MaintenanceScriptOut string `json:"maintenanceScriptOutput"`
}

func NewLauncher() *Launcher {
	defaultSettings := defaultLauncherSettings()
	return &Launcher{
		status:          "Initialisiere...",
		progress:        0,
		clients:         make(map[chan string]bool),
		envFileFixed:    false,
		preferredPort:   defaultSettings.PreferredPort,
		locale:          defaultSettings.Locale, // Default to German
		selectedProfile: "",
		profiles:        []ProfileInfo{},
		settings:        defaultSettings,
	}
}

func defaultLauncherSettings() LauncherSettings {
	return LauncherSettings{
		Locale:           "de",
		Theme:            "night",
		PreferredPort:    defaultBackendPort,
		KeepLauncherOpen: true,
		SafeMode:         false,
		UpdateChannel:    updateChannelLocal,
		FirstRunComplete: false,
	}
}

func validLocale(locale string) bool {
	for _, allowed := range allowedLocales {
		if locale == allowed {
			return true
		}
	}
	return false
}

func validTheme(theme string) bool {
	switch theme {
	case "night", "day", "highcontrast":
		return true
	default:
		return false
	}
}

func validUpdateChannel(channel string) bool {
	switch channel {
	case updateChannelLocal, updateChannelStable, updateChannelBeta:
		return true
	default:
		return false
	}
}

func sanitizeLauncherSettings(settings LauncherSettings) LauncherSettings {
	defaults := defaultLauncherSettings()
	if !validLocale(settings.Locale) {
		settings.Locale = defaults.Locale
	}
	if !validTheme(settings.Theme) {
		settings.Theme = defaults.Theme
	}
	settings.PreferredPort = normalizePort(settings.PreferredPort, defaults.PreferredPort)
	if !validUpdateChannel(settings.UpdateChannel) {
		settings.UpdateChannel = defaults.UpdateChannel
	}
	return settings
}

func (l *Launcher) settingsPath() string {
	return filepath.Join(l.exeDir, settingsFile)
}

func (l *Launcher) loadSettings() LauncherSettings {
	settings := defaultLauncherSettings()
	if l.exeDir == "" {
		l.settings = settings
		return settings
	}

	data, err := os.ReadFile(l.settingsPath())
	if err != nil {
		l.settings = settings
		return settings
	}
	if err := json.Unmarshal(data, &settings); err != nil {
		if l.logger != nil {
			l.logger.Printf("[WARNING] Could not parse launcher settings: %v\n", err)
		}
		settings = defaultLauncherSettings()
	}
	settings = sanitizeLauncherSettings(settings)
	l.settings = settings
	l.locale = settings.Locale
	l.preferredPort = settings.PreferredPort
	return settings
}

func (l *Launcher) saveSettings(settings LauncherSettings) error {
	if l.exeDir == "" {
		return fmt.Errorf("launcher executable directory is not configured")
	}
	settings = sanitizeLauncherSettings(settings)
	settingsDir := filepath.Dir(l.settingsPath())
	if err := os.MkdirAll(settingsDir, 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(l.settingsPath(), data, 0644); err != nil {
		return err
	}
	l.settings = settings
	l.locale = settings.Locale
	l.preferredPort = settings.PreferredPort
	return nil
}

func repairMojibakeText(text string) string {
	replacements := []struct {
		bad  string
		good string
	}{
		{"Ã„", "Ä"},
		{"Ã–", "Ö"},
		{"Ãœ", "Ü"},
		{"Ã¤", "ä"},
		{"Ã¶", "ö"},
		{"Ã¼", "ü"},
		{"ÃŸ", "ß"},
		{"Ã©", "é"},
		{"Ã¨", "è"},
		{"Ã¡", "á"},
		{"Ã³", "ó"},
		{"â€“", "–"},
		{"â€”", "—"},
		{"â†’", "→"},
		{"âœ…", "✅"},
		{"âœ“", "✓"},
		{"âš ï¸", "⚠️"},
		{"âŒ", "❌"},
		{"â„¹ï¸", "ℹ️"},
		{"â±ï¸", "⏱️"},
		{"ðŸ“‹", "📋"},
		{"ðŸ“‚", "📂"},
		{"ðŸ’¡", "💡"},
		{"ðŸ”§", "🔧"},
		{"ðŸ”„", "🔄"},
		{"ðŸš€", "🚀"},
		{"ðŸŽ‰", "🎉"},
		{"ðŸ“¦", "📦"},
		{"ðŸ’¬", "💬"},
		{"ðŸ›", "🐛"},
		{"ðŸŽ®", "🎮"},
	}
	for _, replacement := range replacements {
		text = strings.ReplaceAll(text, replacement.bad, replacement.good)
	}
	return text
}

func getCurrentNodePort() int {
	exePath, err := os.Executable()
	if err != nil {
		return defaultBackendPort
	}

	portFilePath := filepath.Join(filepath.Dir(exePath), ".ltth_port")
	content, err := os.ReadFile(portFilePath)
	if err != nil {
		return defaultBackendPort
	}

	port, err := strconv.Atoi(strings.TrimSpace(string(content)))
	if err != nil || port <= 0 {
		return defaultBackendPort
	}

	return port
}

func dashboardURL(port int) string {
	if port <= 0 {
		port = defaultBackendPort
	}
	return fmt.Sprintf("http://localhost:%d/dashboard.html", port)
}

func serverReadyMessage(port int) string {
	url := dashboardURL(port)
	payload := map[string]interface{}{
		"dashboardUrl": url,
		"redirect":     url,
		"serverReady":  true,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Sprintf(`{"dashboardUrl":"%s","redirect":"%s","serverReady":true}`, url, url)
	}
	return string(data)
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

func normalizePort(port int, fallback int) int {
	if port >= 1 && port <= 65535 {
		return port
	}
	return fallback
}

func backendPortConfig(preferredPort int) (int, int) {
	port := normalizePort(preferredPort, defaultBackendPort)
	return port, port
}

func hiddenCommand(name string, args ...string) *exec.Cmd {
	cmd := exec.Command(name, args...)
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: createNoWindow}
	}
	return cmd
}

func (l *Launcher) runtimePortFilePath() string {
	return filepath.Join(l.exeDir, ".ltth_port")
}

func (l *Launcher) clearRuntimePortFile() {
	portFile := l.runtimePortFilePath()
	if err := os.Remove(portFile); err != nil && !os.IsNotExist(err) {
		l.logAndSync("[WARNING] Could not remove stale runtime port file %s: %v", portFile, err)
		return
	}
	l.logAndSync("[INFO] Cleared stale runtime port file: %s", portFile)
}

func (l *Launcher) readRuntimePortFile() int {
	content, err := os.ReadFile(l.runtimePortFilePath())
	if err != nil {
		return 0
	}
	port, err := strconv.Atoi(strings.TrimSpace(string(content)))
	if err != nil {
		return 0
	}
	return normalizePort(port, 0)
}

func (l *Launcher) candidatePorts() []int {
	seen := map[int]bool{}
	var ports []int
	add := func(port int) {
		port = normalizePort(port, 0)
		if port == 0 || seen[port] {
			return
		}
		seen[port] = true
		ports = append(ports, port)
	}

	add(l.readRuntimePortFile())
	add(l.serverPort)
	add(l.preferredPort)

	base := l.preferredPort
	if base == 0 {
		base = defaultBackendPort
	}
	for port := base; port <= base+50 && port <= 65535; port++ {
		add(port)
	}
	for port := defaultBackendPort; port <= defaultBackendPort+50; port++ {
		add(port)
	}

	return ports
}

func isPortAvailable(port int) bool {
	port = normalizePort(port, 0)
	if port == 0 {
		return false
	}
	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return false
	}
	listener.Close()
	return true
}

func describePortOwner(port int) string {
	if runtime.GOOS == "windows" {
		output, err := hiddenCommand("netstat", "-ano", "-p", "tcp").CombinedOutput()
		if err != nil {
			return fmt.Sprintf("netstat failed: %v", err)
		}
		target := fmt.Sprintf(":%d", port)
		var matches []string
		for _, line := range strings.Split(string(output), "\n") {
			trimmed := strings.TrimSpace(line)
			fields := strings.Fields(trimmed)
			if len(fields) >= 5 &&
				strings.EqualFold(fields[0], "TCP") &&
				strings.EqualFold(fields[len(fields)-2], "LISTENING") &&
				strings.HasSuffix(fields[1], target) {
				pid := fields[len(fields)-1]
				matches = append(matches, fmt.Sprintf("%s (%s)", trimmed, windowsProcessName(pid)))
			}
		}
		if len(matches) > 0 {
			return strings.Join(matches, " | ")
		}
		return "no LISTENING owner found via netstat"
	}

	output, err := hiddenCommand("sh", "-c", fmt.Sprintf("lsof -nP -iTCP:%d -sTCP:LISTEN", port)).CombinedOutput()
	if err != nil {
		return fmt.Sprintf("lsof failed or no owner found: %v", err)
	}
	return strings.TrimSpace(string(output))
}

func windowsProcessName(pid string) string {
	if strings.TrimSpace(pid) == "" {
		return "process unknown"
	}
	output, err := hiddenCommand("tasklist", "/FI", "PID eq "+pid, "/FO", "CSV", "/NH").CombinedOutput()
	if err != nil {
		return "process name unavailable"
	}
	line := strings.TrimSpace(string(output))
	if line == "" || strings.Contains(line, "INFO:") {
		return "process name unavailable"
	}
	parts := strings.Split(line, `","`)
	if len(parts) == 0 {
		return "process name unavailable"
	}
	return strings.Trim(parts[0], `"`)
}

func (l *Launcher) logPortDiagnostics() {
	preferred := normalizePort(l.preferredPort, defaultBackendPort)
	if isPortAvailable(preferred) {
		l.logAndSync("[INFO] Preferred port %d is available", preferred)
		return
	}

	l.logAndSync("[WARNING] Preferred port %d is already in use", preferred)
	l.logAndSync("[WARNING] Port owner details: %s", describePortOwner(preferred))
	l.logAndSync("[WARNING] Backend port is fixed to %d; no automatic fallback port will be used.", preferred)
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func clampProgress(value int) int {
	if value < 0 {
		return 0
	}
	if value > 100 {
		return 100
	}
	return value
}

func waitingAttemptProgress(attemptCount int) int {
	return minInt(99, 93+(attemptCount/5))
}

var (
	terminateProcessTreeByPID  = terminateProcessTreeByPIDOS
	waitForHealthyServerToStop = defaultWaitForHealthyServerToStop
	stopStaleLTTHPortOwners    = defaultStopStaleLTTHPortOwners
)

// loadTranslations loads i18n strings from locale files
func (l *Launcher) loadTranslations(locale string) error {
	// Try build-src/locales first (for development), then locales (for installed version)
	localesDir := filepath.Join(l.exeDir, "build-src", "locales")
	localePath := filepath.Join(localesDir, locale+".json")

	// If build-src/locales doesn't exist, try the locales directory directly (installed version)
	if _, err := os.Stat(localesDir); os.IsNotExist(err) {
		localesDir = filepath.Join(l.exeDir, "locales")
		localePath = filepath.Join(localesDir, locale+".json")
	}

	// Fallback to de.json if file not found
	if _, err := os.Stat(localePath); os.IsNotExist(err) {
		localePath = filepath.Join(localesDir, "de.json")
	}

	data, err := os.ReadFile(localePath)
	if err != nil {
		if l.logger != nil {
			l.logger.Printf("[WARNING] Could not load translations from %s: %v\n", localePath, err)
		}
		return nil
	}

	err = json.Unmarshal(data, &l.translations)
	if err != nil {
		if l.logger != nil {
			l.logger.Printf("[ERROR] Could not parse translations: %v\n", err)
		}
		return err
	}

	if l.logger != nil {
		l.logger.Printf("[INFO] Loaded translations for locale: %s\n", locale)
	}
	return nil
}

// getTranslation retrieves a translation by key path (e.g., "status.initializing")
func (l *Launcher) getTranslation(key string) string {
	if l.translations == nil {
		return l.getLauncherTranslationFallback(key)
	}

	parts := strings.Split(key, ".")
	current := l.translations

	for i, part := range parts {
		if val, ok := current[part]; ok {
			if i == len(parts)-1 {
				if str, ok := val.(string); ok {
					return repairMojibakeText(str)
				}
			} else if nested, ok := val.(map[string]interface{}); ok {
				current = nested
			}
		}
	}

	return l.getLauncherTranslationFallback(key)
}

func (l *Launcher) getLauncherTranslationFallback(key string) string {
	locale := l.locale
	if locale == "" {
		locale = "de"
	}
	if translations, ok := launcherTranslationFallbacks[locale]; ok {
		if value, ok := translations[key]; ok {
			return value
		}
	}
	if translations, ok := launcherTranslationFallbacks["en"]; ok {
		if value, ok := translations[key]; ok {
			return value
		}
	}
	return key
}

func (l *Launcher) getTranslationWithFallback(key string, fallback string) string {
	translated := l.getTranslation(key)
	if translated == "" || translated == key {
		return fallback
	}
	return translated
}

func (l *Launcher) translateStatus(key string, fallback string, args ...interface{}) string {
	text := fallback
	if key != "" {
		text = l.getTranslationWithFallback(key, fallback)
	}
	if len(args) > 0 {
		return fmt.Sprintf(text, args...)
	}
	return text
}

func (l *Launcher) currentStatus() string {
	if l.statusKey != "" {
		return l.translateStatus(l.statusKey, l.statusFallback, l.statusArgs...)
	}
	return l.status
}

// truncateLogData keeps the most recent portion of log data up to maxBytes.
// It attempts to start from the next newline after the truncation point to
// avoid presenting partial log lines where possible.
func truncateLogData(data []byte, maxBytes int) []byte {
	if len(data) <= maxBytes {
		return data
	}

	start := len(data) - maxBytes
	if idx := bytes.IndexByte(data[start:], '\n'); idx >= 0 && start+idx+1 <= len(data) {
		return data[start+idx+1:]
	}

	return data[start:]
}

// getDefaultConfigDir mirrors the app's ConfigPathManager default paths
func (l *Launcher) getDefaultConfigDir() string {
	homeDir, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "windows":
		localAppData := os.Getenv("LOCALAPPDATA")
		if localAppData == "" {
			localAppData = filepath.Join(homeDir, "AppData", "Local")
		}
		return filepath.Join(localAppData, "ltth.app")
	case "darwin":
		return filepath.Join(homeDir, "Library", "Application Support", "ltth.app")
	default:
		return filepath.Join(homeDir, ".local", "share", "ltth.app")
	}
}

// initConfigPaths resolves the persistent config directory and user_configs path
func (l *Launcher) initConfigPaths() {
	l.configDir = l.getDefaultConfigDir()

	// Check for custom config path in .config_path (same behavior as ConfigPathManager)
	customPathFile := filepath.Join(l.appDir, ".config_path")
	if data, err := os.ReadFile(customPathFile); err == nil {
		candidate := strings.TrimSpace(string(data))
		if candidate != "" {
			if info, err := os.Stat(candidate); err == nil && info.IsDir() {
				testFile := filepath.Join(candidate, ".write_test")
				if err := os.WriteFile(testFile, []byte("test"), 0644); err == nil {
					os.Remove(testFile)
					l.configDir = candidate
					if l.logger != nil {
						l.logger.Printf("[INFO] Using custom config path from .config_path: %s\n", candidate)
					}
				} else if l.logger != nil {
					l.logger.Printf("[WARNING] Custom config path not writable, using default: %v\n", err)
				}
			} else if l.logger != nil {
				l.logger.Printf("[WARNING] Custom config path invalid, using default: %v\n", err)
			}
		}
	}

	l.userConfigsDir = filepath.Join(l.configDir, "user_configs")

	if err := os.MkdirAll(l.userConfigsDir, 0755); err != nil && l.logger != nil {
		l.logger.Printf("[WARNING] Could not create user_configs dir %s: %v\n", l.userConfigsDir, err)
	}
}

func (l *Launcher) readProfilesFromDir(dir string) []ProfileInfo {
	if dir == "" {
		return []ProfileInfo{}
	}

	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return []ProfileInfo{}
	}

	files, err := os.ReadDir(dir)
	if err != nil {
		if l.logger != nil {
			l.logger.Printf("[ERROR] Could not read user_configs at %s: %v\n", dir, err)
		}
		return []ProfileInfo{}
	}

	profiles := []ProfileInfo{}
	for _, file := range files {
		if file.IsDir() || !strings.HasSuffix(file.Name(), ".db") {
			continue
		}

		username := strings.TrimSuffix(file.Name(), ".db")
		info, err := file.Info()
		if err != nil {
			continue
		}

		profiles = append(profiles, ProfileInfo{
			Username: username,
			Modified: info.ModTime(),
		})
	}

	return profiles
}

func validateProfileName(profileName string) error {
	name := strings.TrimSpace(profileName)
	if name == "" {
		return fmt.Errorf("no active profile selected")
	}
	if name == "." || name == ".." {
		return fmt.Errorf("invalid profile name")
	}
	if strings.ContainsAny(name, `/\<>:"|?*`) || filepath.VolumeName(name) != "" {
		return fmt.Errorf("invalid profile name")
	}
	for _, r := range name {
		if r < 32 || r == 127 {
			return fmt.Errorf("invalid profile name")
		}
	}
	return nil
}

func resolveProfileDatabasePath(userConfigsDir string, profileName string) (string, error) {
	if userConfigsDir == "" {
		return "", fmt.Errorf("user config directory is not configured")
	}

	name := strings.TrimSpace(profileName)
	if err := validateProfileName(name); err != nil {
		return "", err
	}

	baseDir, err := filepath.Abs(userConfigsDir)
	if err != nil {
		return "", fmt.Errorf("could not resolve user config directory: %w", err)
	}

	dbPath, err := filepath.Abs(filepath.Join(baseDir, name+".db"))
	if err != nil {
		return "", fmt.Errorf("could not resolve profile database path: %w", err)
	}

	rel, err := filepath.Rel(baseDir, dbPath)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) || filepath.IsAbs(rel) {
		return "", fmt.Errorf("profile database path escapes user config directory")
	}

	info, err := os.Stat(dbPath)
	if err != nil {
		return "", fmt.Errorf("profile database not found: %w", err)
	}
	if info.IsDir() {
		return "", fmt.Errorf("profile database path is a directory")
	}

	return dbPath, nil
}

func (l *Launcher) currentProfileName() string {
	if name := strings.TrimSpace(l.selectedProfile); name != "" {
		return name
	}

	if l.userConfigsDir != "" {
		activeProfilePath := filepath.Join(l.userConfigsDir, ".active_profile")
		data, err := os.ReadFile(activeProfilePath)
		if err == nil {
			if name := strings.TrimSpace(string(data)); name != "" {
				return name
			}
		}
	}

	if len(l.profiles) == 1 {
		return l.profiles[0].Username
	}

	return ""
}

func (l *Launcher) activeProfileDatabasePath() (string, string, error) {
	profileName := l.currentProfileName()
	if profileName == "" {
		l.loadUserProfiles()
		profileName = l.currentProfileName()
	}
	if profileName == "" {
		return "", "", fmt.Errorf("no active profile selected")
	}

	dbPath, err := resolveProfileDatabasePath(l.userConfigsDir, profileName)
	if err == nil {
		return profileName, dbPath, nil
	}

	legacyDir := filepath.Join(l.appDir, "user_configs")
	if l.appDir != "" && filepath.Clean(legacyDir) != filepath.Clean(l.userConfigsDir) {
		if legacyPath, legacyErr := resolveProfileDatabasePath(legacyDir, profileName); legacyErr == nil {
			return profileName, legacyPath, nil
		}
	}

	return "", "", err
}

func databaseFootprintBytes(dbPath string) int64 {
	var total int64
	for _, path := range []string{dbPath, dbPath + "-wal", dbPath + "-shm", dbPath + "-journal"} {
		info, err := os.Stat(path)
		if err == nil && !info.IsDir() {
			total += info.Size()
		}
	}
	return total
}

func copyFile(src, dest string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	if err := os.MkdirAll(filepath.Dir(dest), 0755); err != nil {
		return err
	}
	out, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Sync()
}

func (l *Launcher) createProfileBackup(profileName string, reason string) (string, error) {
	if reason == "" {
		reason = "maintenance"
	}
	dbPath, err := resolveProfileDatabasePath(l.userConfigsDir, profileName)
	if err != nil && l.appDir != "" {
		legacyDir := filepath.Join(l.appDir, "user_configs")
		if filepath.Clean(legacyDir) != filepath.Clean(l.userConfigsDir) {
			dbPath, err = resolveProfileDatabasePath(legacyDir, profileName)
		}
	}
	if err != nil {
		return "", err
	}

	timestamp := time.Now().Format("2006-01-02_15-04-05")
	backupDir := filepath.Join(l.configDir, "profile-backups", strings.TrimSpace(profileName), timestamp+"-"+reason)
	backupPath := filepath.Join(backupDir, filepath.Base(dbPath))
	if err := copyFile(dbPath, backupPath); err != nil {
		return "", err
	}

	for _, suffix := range []string{"-wal", "-shm", "-journal"} {
		sidecar := dbPath + suffix
		if info, err := os.Stat(sidecar); err == nil && !info.IsDir() {
			if err := copyFile(sidecar, filepath.Join(backupDir, filepath.Base(sidecar))); err != nil {
				return "", err
			}
		}
	}

	metadata := map[string]interface{}{
		"profile":   strings.TrimSpace(profileName),
		"reason":    reason,
		"createdAt": time.Now().Format(time.RFC3339),
		"source":    dbPath,
	}
	if data, err := json.MarshalIndent(metadata, "", "  "); err == nil {
		_ = os.WriteFile(filepath.Join(backupDir, "backup.json"), data, 0644)
	}
	return backupPath, nil
}

func (l *Launcher) latestProfileBackup(profileName string) (string, error) {
	if err := validateProfileName(profileName); err != nil {
		return "", err
	}
	root := filepath.Join(l.configDir, "profile-backups", strings.TrimSpace(profileName))
	entries, err := os.ReadDir(root)
	if err != nil {
		return "", err
	}
	var latest os.DirEntry
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		if latest == nil || entry.Name() > latest.Name() {
			latest = entry
		}
	}
	if latest == nil {
		return "", fmt.Errorf("no backup found for profile %s", profileName)
	}
	dbPath := filepath.Join(root, latest.Name(), strings.TrimSpace(profileName)+".db")
	if _, err := os.Stat(dbPath); err != nil {
		return "", err
	}
	return dbPath, nil
}

func (l *Launcher) restoreLatestProfileBackup(profileName string) (map[string]interface{}, error) {
	if l.startupInProgress || l.isNodeRunning() || l.serverStarted {
		return nil, fmt.Errorf("stop the server before restoring a profile backup")
	}
	backupDB, err := l.latestProfileBackup(profileName)
	if err != nil {
		return nil, err
	}
	currentDB, err := resolveProfileDatabasePath(l.userConfigsDir, profileName)
	if err != nil {
		return nil, err
	}
	safetyBackup, err := l.createProfileBackup(profileName, "pre-restore")
	if err != nil {
		return nil, fmt.Errorf("pre-restore backup failed: %w", err)
	}
	if err := copyFile(backupDB, currentDB); err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"success":      true,
		"profile":      profileName,
		"restoredFrom": backupDB,
		"safetyBackup": safetyBackup,
	}, nil
}

func (l *Launcher) repairActiveProfileDatabase() (map[string]interface{}, error) {
	profileName, dbPath, err := l.activeProfileDatabasePath()
	if err != nil {
		return nil, err
	}
	backupPath, err := l.createProfileBackup(profileName, "repair")
	if err != nil {
		return nil, fmt.Errorf("backup before repair failed: %w", err)
	}

	nodePath := l.nodeExecutableForMaintenance()
	if nodePath == "" {
		return nil, fmt.Errorf("Node.js executable not available for database repair")
	}
	script := `
const dbPath = process.env.LTTH_REPAIR_DB;
const Database = require('better-sqlite3');
const db = new Database(dbPath, { fileMustExist: true });
try {
  db.pragma('busy_timeout = 30000');
  const integrity = db.pragma('quick_check', { simple: true });
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.pragma('optimize');
  console.log(String(integrity || 'ok'));
} finally {
  db.close();
}
`
	cmd := hiddenCommand(nodePath, "-e", script)
	cmd.Dir = l.appDir
	cmd.Env = sanitizeNodeEnvironment(append(os.Environ(), fmt.Sprintf("LTTH_REPAIR_DB=%s", dbPath)))
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("database repair failed: %v\n%s", err, strings.TrimSpace(string(output)))
	}
	return map[string]interface{}{
		"success":    true,
		"profile":    profileName,
		"database":   dbPath,
		"backupPath": backupPath,
		"integrity":  strings.TrimSpace(string(output)),
	}, nil
}

func nodeVersionDiagnostic(version string) NodeVersionRecommendation {
	trimmed := strings.TrimSpace(strings.TrimPrefix(version, "v"))
	parts := strings.Split(trimmed, ".")
	if len(parts) == 0 || parts[0] == "" {
		return NodeVersionRecommendation{Status: diagnosticError, Message: "Node.js Version konnte nicht gelesen werden.", Major: 0}
	}
	major, err := strconv.Atoi(parts[0])
	if err != nil {
		return NodeVersionRecommendation{Status: diagnosticError, Message: "Node.js Version ist ungültig.", Major: 0}
	}
	if major < 18 {
		return NodeVersionRecommendation{Status: diagnosticError, Message: "Node.js ist zu alt. Empfohlen ist Node.js 22 LTS.", Major: major}
	}
	if major >= 24 {
		return NodeVersionRecommendation{Status: diagnosticWarning, Message: "Node.js ist sehr neu. Falls native Module brechen, Node.js 22 LTS verwenden.", Major: major}
	}
	return NodeVersionRecommendation{Status: diagnosticOK, Message: "Node.js Version ist im unterstützten Bereich.", Major: major}
}

func shouldUseGlobalNodeVersion(version string) bool {
	return nodeVersionDiagnostic(version).Status == diagnosticOK
}

func classifyPluginFailures(logText string) []PluginFailure {
	var failures []PluginFailure
	seen := map[string]bool{}
	for _, line := range strings.Split(logText, "\n") {
		lower := strings.ToLower(line)
		if !strings.Contains(lower, "plugin") || !(strings.Contains(lower, "failed") || strings.Contains(lower, "error")) {
			continue
		}

		pluginID := ""
		if strings.Contains(line, "Plugin ") {
			after := strings.SplitN(line, "Plugin ", 2)[1]
			pluginID = strings.Fields(after)[0]
		}
		if pluginID == "" && strings.Contains(line, "plugins/") {
			after := strings.SplitN(line, "plugins/", 2)[1]
			pluginID = strings.Split(after, "/")[0]
		}
		if pluginID == "" && strings.Contains(line, `plugins\`) {
			after := strings.SplitN(line, `plugins\`, 2)[1]
			pluginID = strings.Split(after, `\`)[0]
		}
		pluginID = strings.Trim(pluginID, ` "'():;,.`)
		if pluginID == "" {
			continue
		}
		key := pluginID + "|" + line
		if seen[key] {
			continue
		}
		seen[key] = true
		failures = append(failures, PluginFailure{
			PluginID: pluginID,
			Message:  repairMojibakeText(strings.TrimSpace(line)),
		})
	}
	return failures
}

func selectReleaseForChannel(releases []GitHubRelease, channel string) (*GitHubRelease, error) {
	if channel == updateChannelLocal {
		return nil, fmt.Errorf("local snapshot channel does not use network releases")
	}
	for i := range releases {
		release := releases[i]
		if strings.TrimSpace(release.ZipballURL) == "" {
			continue
		}
		if channel == updateChannelStable && !release.Prerelease {
			return &release, nil
		}
		if channel == updateChannelBeta {
			return &release, nil
		}
	}
	return nil, fmt.Errorf("no release available for channel %s", channel)
}

func diagnosticTimestamp() string {
	return time.Now().Format(time.RFC3339)
}

func (l *Launcher) collectDiagnostics() []DiagnosticItem {
	now := diagnosticTimestamp()
	items := []DiagnosticItem{}

	nodeStatus := DiagnosticItem{
		ID:          "node",
		Label:       "Node.js",
		Status:      diagnosticError,
		Message:     "Node.js wurde nicht gefunden.",
		FixAction:   "node-install",
		FixLabel:    "Portable Node.js installieren",
		Blocking:    true,
		LastChecked: now,
	}
	if strings.TrimSpace(l.nodePath) != "" {
		if _, err := os.Stat(l.nodePath); err == nil {
			version := l.getNodeVersion()
			recommendation := nodeVersionDiagnostic(version)
			nodeStatus.Status = recommendation.Status
			nodeStatus.Message = strings.TrimSpace(version)
			nodeStatus.Details = recommendation.Message
			nodeStatus.FixAction = "node-repair"
			nodeStatus.FixLabel = "Node.js reparieren"
			nodeStatus.Blocking = recommendation.Status == diagnosticError
		} else {
			nodeStatus.Details = err.Error()
		}
	}
	items = append(items, nodeStatus)

	deps := DiagnosticItem{
		ID:          "dependencies",
		Label:       "Dependencies",
		Status:      diagnosticError,
		Message:     "node_modules fehlt oder ist unvollständig.",
		FixAction:   "dependencies-install",
		FixLabel:    "Dependencies installieren",
		Blocking:    true,
		LastChecked: now,
	}
	if l.checkNodeModules() {
		deps.Status = diagnosticOK
		deps.Message = "Dependencies sind installiert."
		deps.FixAction = "dependencies-install"
		deps.FixLabel = "Dependencies neu installieren"
		deps.Blocking = false
	}
	items = append(items, deps)

	port := normalizePort(l.preferredPort, defaultBackendPort)
	portItem := DiagnosticItem{
		ID:          "preferred_port",
		Label:       "Port",
		Status:      diagnosticOK,
		Message:     fmt.Sprintf("Wunschport %d ist frei.", port),
		LastChecked: now,
	}
	if !isPortAvailable(port) {
		portItem.Status = diagnosticWarning
		portItem.Message = fmt.Sprintf("Wunschport %d ist belegt. Der Launcher stoppt alte LTTH-Instanzen vor dem Start; andere Prozesse müssen beendet oder ein anderer Port gewählt werden.", port)
		portItem.Details = describePortOwner(port)
		portItem.FixAction = "port-auto"
		portItem.FixLabel = "Freien Port wählen"
	}
	items = append(items, portItem)

	profileName := l.currentProfileName()
	profileItem := DiagnosticItem{
		ID:          "profile",
		Label:       "Profil",
		Status:      diagnosticWarning,
		Message:     "Kein aktives Profil ausgewählt.",
		LastChecked: now,
	}
	if profileName != "" {
		profileItem.Status = diagnosticOK
		profileItem.Message = "Aktives Profil: " + profileName
	}
	items = append(items, profileItem)

	dbItem := DiagnosticItem{
		ID:          "database",
		Label:       "Datenbank",
		Status:      diagnosticWarning,
		Message:     "Keine aktive Profildatenbank gefunden.",
		FixAction:   "profile-repair",
		FixLabel:    "Profil reparieren",
		LastChecked: now,
	}
	if _, dbPath, err := l.activeProfileDatabasePath(); err == nil {
		dbItem.Status = diagnosticOK
		dbItem.Message = "Datenbank gefunden."
		dbItem.Details = fmt.Sprintf("%s (%s)", dbPath, formatBytesForStatus(databaseFootprintBytes(dbPath)))
		dbItem.FixAction = "profile-backup"
		dbItem.FixLabel = "Backup erstellen"
	} else {
		dbItem.Details = err.Error()
	}
	items = append(items, dbItem)

	if len(l.pluginFailures) > 0 {
		items = append(items, DiagnosticItem{
			ID:          "plugins",
			Label:       "Plugins",
			Status:      diagnosticWarning,
			Message:     fmt.Sprintf("%d Plugin-Fehler erkannt.", len(l.pluginFailures)),
			FixAction:   "safe-mode",
			FixLabel:    "Safe Mode starten",
			LastChecked: now,
		})
	} else {
		items = append(items, DiagnosticItem{
			ID:          "plugins",
			Label:       "Plugins",
			Status:      diagnosticOK,
			Message:     "Keine Plugin-Startfehler erkannt.",
			LastChecked: now,
		})
	}

	return items
}

func formatBytesForStatus(bytes int64) string {
	value := float64(bytes)
	units := []string{"B", "KB", "MB", "GB", "TB"}
	unit := 0
	for value >= 1024 && unit < len(units)-1 {
		value /= 1024
		unit++
	}
	if unit == 0 || value >= 10 {
		return fmt.Sprintf("%.0f %s", value, units[unit])
	}
	return fmt.Sprintf("%.1f %s", value, units[unit])
}

func writeJSON(w http.ResponseWriter, payload interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(payload)
}

func methodAllowed(w http.ResponseWriter, r *http.Request, method string) bool {
	if r.Method == method {
		return true
	}
	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	return false
}

func addZipFileFromBytes(zw *zip.Writer, name string, data []byte) error {
	header := &zip.FileHeader{
		Name:   filepath.ToSlash(name),
		Method: zip.Deflate,
	}
	header.SetModTime(time.Now())
	writer, err := zw.CreateHeader(header)
	if err != nil {
		return err
	}
	_, err = writer.Write(data)
	return err
}

func addZipFileFromPath(zw *zip.Writer, name string, sourcePath string) error {
	data, err := os.ReadFile(sourcePath)
	if err != nil {
		return err
	}
	return addZipFileFromBytes(zw, name, data)
}

func (l *Launcher) refreshPluginFailuresFromLogs() {
	var combined []string
	if l.logPath != "" {
		if content, err := l.readLogContent(l.logPath); err == nil {
			combined = append(combined, content)
		}
	}
	if serverLog := l.findLatestServerLog(); serverLog != "" {
		if content, err := l.readLogContent(serverLog); err == nil {
			combined = append(combined, content)
		}
	}
	l.pluginFailures = classifyPluginFailures(strings.Join(combined, "\n"))
}

func (l *Launcher) exportDiagnosticPackage() (string, error) {
	l.refreshPluginFailuresFromLogs()
	diagnostics := map[string]interface{}{
		"createdAt":      time.Now().Format(time.RFC3339),
		"status":         l.statusPayload(),
		"diagnostics":    l.collectDiagnostics(),
		"pluginFailures": l.pluginFailures,
		"settings":       l.settings,
		"exeDir":         l.exeDir,
		"appDir":         l.appDir,
		"configDir":      l.configDir,
	}

	logDir := rootLogDirForApp(l.appDir)
	diagnosticDir := filepath.Join(logDir, "diagnostics")
	if err := os.MkdirAll(diagnosticDir, 0755); err != nil {
		return "", err
	}
	zipPath := filepath.Join(diagnosticDir, fmt.Sprintf("ltth-diagnostics-%s.zip", time.Now().Format("2006-01-02_15-04-05")))
	file, err := os.Create(zipPath)
	if err != nil {
		return "", err
	}
	defer file.Close()

	zw := zip.NewWriter(file)
	defer zw.Close()

	data, _ := json.MarshalIndent(diagnostics, "", "  ")
	if err := addZipFileFromBytes(zw, "diagnostics.json", data); err != nil {
		return "", err
	}
	if l.logPath != "" {
		_ = addZipFileFromPath(zw, "logs/"+filepath.Base(l.logPath), l.logPath)
	}
	if serverLog := l.findLatestServerLog(); serverLog != "" {
		_ = addZipFileFromPath(zw, "logs/"+filepath.Base(serverLog), serverLog)
	}
	if _, err := os.Stat(l.settingsPath()); err == nil {
		_ = addZipFileFromPath(zw, "runtime/launcher_settings.json", l.settingsPath())
	}
	for _, name := range []string{"package.json", "package-lock.json"} {
		path := filepath.Join(l.appDir, name)
		if _, err := os.Stat(path); err == nil {
			_ = addZipFileFromPath(zw, "app/"+name, path)
		}
	}
	return zipPath, nil
}

func (l *Launcher) chooseFreePreferredPort() int {
	start := normalizePort(l.preferredPort, defaultBackendPort)
	for port := start; port <= start+50 && port <= 65535; port++ {
		if isPortAvailable(port) {
			return port
		}
	}
	for port := defaultBackendPort; port <= defaultBackendPort+50; port++ {
		if isPortAvailable(port) {
			return port
		}
	}
	return start
}

func (l *Launcher) resetStartupPortToDefault() error {
	if l.preferredPort == defaultBackendPort && l.settings.PreferredPort == defaultBackendPort {
		return nil
	}

	previousPort := normalizePort(l.preferredPort, 0)
	settings := l.settings
	if settings.Locale == "" {
		settings = defaultLauncherSettings()
	}
	settings.PreferredPort = defaultBackendPort
	l.preferredPort = defaultBackendPort
	l.settings = settings

	if previousPort != 0 && previousPort != defaultBackendPort {
		l.logAndSync("[STARTUP] Resetting backend port from %d to fixed launcher port %d", previousPort, defaultBackendPort)
	} else {
		l.logAndSync("[STARTUP] Backend port fixed to %d", defaultBackendPort)
	}

	return l.saveSettings(settings)
}

func (l *Launcher) prepareFreshBackendStartup(source string) (bool, error) {
	stopped, err := l.stopDetectedLTTHServers(source)
	if err != nil {
		return stopped, err
	}
	stoppedPorts, err := stopStaleLTTHPortOwners(l, source)
	if err != nil {
		return stopped || stoppedPorts, err
	}
	if stoppedPorts {
		stopped = true
	}
	l.clearRuntimePortFile()
	if err := l.resetStartupPortToDefault(); err != nil {
		return stopped, err
	}
	return stopped, nil
}

func parseListeningPortPIDs(netstatOutput string, ports []int) map[int][]int {
	portSet := map[int]bool{}
	for _, port := range ports {
		port = normalizePort(port, 0)
		if port != 0 {
			portSet[port] = true
		}
	}

	result := map[int][]int{}
	seen := map[string]bool{}
	for _, line := range strings.Split(netstatOutput, "\n") {
		fields := strings.Fields(strings.TrimSpace(line))
		if len(fields) < 5 || !strings.EqualFold(fields[0], "TCP") || !strings.EqualFold(fields[len(fields)-2], "LISTENING") {
			continue
		}
		portText := fields[1]
		colon := strings.LastIndex(portText, ":")
		if colon < 0 || colon == len(portText)-1 {
			continue
		}
		port, err := strconv.Atoi(portText[colon+1:])
		if err != nil || !portSet[port] {
			continue
		}
		pid, err := strconv.Atoi(fields[len(fields)-1])
		if err != nil || pid <= 0 {
			continue
		}
		key := fmt.Sprintf("%d:%d", port, pid)
		if seen[key] {
			continue
		}
		seen[key] = true
		result[port] = append(result[port], pid)
	}
	return result
}

func isManagedLTTHProcessCommandLine(commandLine string, exeDir string, appDir string) bool {
	normalized := strings.ToLower(filepath.ToSlash(commandLine))
	if normalized == "" || (!strings.Contains(normalized, "server.js") && !strings.Contains(normalized, "launch.js")) {
		return false
	}

	for _, root := range []string{exeDir, appDir} {
		if root == "" {
			continue
		}
		if absRoot, err := filepath.Abs(root); err == nil {
			root = absRoot
		}
		if strings.Contains(normalized, strings.ToLower(filepath.ToSlash(root))) {
			return true
		}
	}

	return strings.Contains(normalized, "/runtime/node/")
}

func uniquePorts(ports []int) []int {
	seen := map[int]bool{}
	var result []int
	for _, port := range ports {
		port = normalizePort(port, 0)
		if port == 0 || seen[port] {
			continue
		}
		seen[port] = true
		result = append(result, port)
	}
	return result
}

func defaultStopStaleLTTHPortOwners(l *Launcher, source string) (bool, error) {
	if runtime.GOOS != "windows" {
		return false, nil
	}
	output, err := hiddenCommand("netstat", "-ano", "-p", "tcp").CombinedOutput()
	if err != nil {
		return false, fmt.Errorf("netstat failed while checking stale LTTH ports: %w", err)
	}

	portPIDs := parseListeningPortPIDs(string(output), uniquePorts(l.candidatePorts()))
	if len(portPIDs) == 0 {
		return false, nil
	}

	if source == "" {
		source = "INFO"
	}

	stopped := false
	var failures []string
	for port, pids := range portPIDs {
		for _, pid := range pids {
			commandLine := windowsProcessCommandLine(pid)
			if !isManagedLTTHProcessCommandLine(commandLine, l.exeDir, l.appDir) {
				l.logAndSync("[%s] Port %d is owned by PID %d, but it does not look like this LTTH server. Owner: %s", source, port, pid, strings.TrimSpace(commandLine))
				continue
			}

			l.logAndSync("[%s] Stale LTTH port owner detected on port %d with PID %d. Stopping it before startup.", source, port, pid)
			if err := terminateProcessTreeByPID(pid); err != nil {
				failures = append(failures, fmt.Sprintf("could not stop stale LTTH port owner PID %d on port %d: %v", pid, port, err))
				continue
			}
			stopped = true
			if !waitForPortAvailable(port, 15*time.Second) {
				failures = append(failures, fmt.Sprintf("port %d was still occupied after stopping PID %d", port, pid))
			}
		}
	}

	if len(failures) > 0 {
		return stopped, errors.New(strings.Join(failures, "; "))
	}
	return stopped, nil
}

func windowsProcessCommandLine(pid int) string {
	if pid <= 0 {
		return ""
	}
	script := fmt.Sprintf("(Get-CimInstance Win32_Process -Filter \"ProcessId = %d\").CommandLine", pid)
	output, err := hiddenCommand("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script).CombinedOutput()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(output))
}

func waitForPortAvailable(port int, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if isPortAvailable(port) {
			return true
		}
		time.Sleep(250 * time.Millisecond)
	}
	return isPortAvailable(port)
}

func (l *Launcher) updateSettingsFromRequest(r *http.Request) (LauncherSettings, error) {
	settings := l.settings
	if settings.Locale == "" {
		settings = l.loadSettings()
	}

	var payload LauncherSettings
	if r.Body != nil {
		decoder := json.NewDecoder(io.LimitReader(r.Body, 4096))
		if err := decoder.Decode(&payload); err != nil && err != io.EOF {
			return settings, err
		}
	}
	if payload.Locale != "" {
		settings.Locale = payload.Locale
	}
	if payload.Theme != "" {
		settings.Theme = payload.Theme
	}
	if payload.PreferredPort != 0 {
		settings.PreferredPort = payload.PreferredPort
	}
	settings.KeepLauncherOpen = payload.KeepLauncherOpen
	settings.SafeMode = payload.SafeMode
	if payload.UpdateChannel != "" {
		settings.UpdateChannel = payload.UpdateChannel
	}
	settings.FirstRunComplete = payload.FirstRunComplete
	return sanitizeLauncherSettings(settings), nil
}

func (l *Launcher) applyFixAction(action string) (map[string]interface{}, error) {
	switch action {
	case "dependencies-install":
		if l.nodePath == "" {
			if err := l.checkNodeJS(); err != nil {
				return nil, err
			}
		}
		if err := l.installDependencies(); err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "action": action}, nil
	case "node-install":
		nodePath, err := l.installNodePortable()
		if err != nil {
			return nil, err
		}
		l.nodePath = nodePath
		return map[string]interface{}{"success": true, "action": action, "nodePath": nodePath}, nil
	case "node-repair":
		if err := l.removePortableNode(); err != nil {
			return nil, err
		}
		nodePath, err := l.installNodePortable()
		if err != nil {
			return nil, err
		}
		l.nodePath = nodePath
		return map[string]interface{}{"success": true, "action": action, "nodePath": nodePath}, nil
	case "node-remove":
		if err := l.removePortableNode(); err != nil {
			return nil, err
		}
		l.nodePath = ""
		return map[string]interface{}{"success": true, "action": action}, nil
	case "port-auto":
		port := l.chooseFreePreferredPort()
		settings := l.settings
		settings.PreferredPort = port
		if err := l.saveSettings(settings); err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "action": action, "preferredPort": port}, nil
	case "profile-backup":
		profile := l.currentProfileName()
		if profile == "" {
			return nil, fmt.Errorf("no active profile selected")
		}
		backupPath, err := l.createProfileBackup(profile, "manual")
		if err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "action": action, "backupPath": backupPath}, nil
	case "profile-repair":
		result, err := l.repairActiveProfileDatabase()
		if err != nil {
			return nil, err
		}
		result["action"] = action
		return result, nil
	case "profile-restore":
		profile := l.currentProfileName()
		if profile == "" {
			return nil, fmt.Errorf("no active profile selected")
		}
		result, err := l.restoreLatestProfileBackup(profile)
		if err != nil {
			return nil, err
		}
		result["action"] = action
		return result, nil
	case "safe-mode":
		settings := l.settings
		settings.SafeMode = true
		if err := l.saveSettings(settings); err != nil {
			return nil, err
		}
		return map[string]interface{}{"success": true, "action": action, "safeMode": true}, nil
	case "adopt-server":
		port, ok := l.detectHealthyServerPort()
		if !ok {
			return nil, fmt.Errorf("no running LTTH server detected")
		}
		l.serverPort = port
		l.serverStarted = true
		l.startupInProgress = false
		l.lastStartError = ""
		return map[string]interface{}{"success": true, "action": action, "serverPort": port}, nil
	default:
		return nil, fmt.Errorf("unknown fix action: %s", action)
	}
}

func (l *Launcher) removePortableNode() error {
	nodeDir := filepath.Join(l.exeDir, "runtime", "node")
	absRuntime, err := filepath.Abs(filepath.Join(l.exeDir, "runtime"))
	if err != nil {
		return err
	}
	absNode, err := filepath.Abs(nodeDir)
	if err != nil {
		return err
	}
	rel, err := filepath.Rel(absRuntime, absNode)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) || filepath.IsAbs(rel) {
		return fmt.Errorf("portable node path escapes runtime directory")
	}
	return os.RemoveAll(absNode)
}

func fetchReleases() ([]GitHubRelease, error) {
	url := fmt.Sprintf("%s/repos/%s/%s/releases", githubAPIURL, githubOwner, githubRepo)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "LTTH-Launcher")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	var releases []GitHubRelease
	if err := json.NewDecoder(io.LimitReader(resp.Body, 2*1024*1024)).Decode(&releases); err != nil {
		return nil, err
	}
	return releases, nil
}

func (l *Launcher) checkUpdateForCurrentChannel() (map[string]interface{}, error) {
	settings := l.settings
	if settings.UpdateChannel == "" {
		settings = l.loadSettings()
	}
	if settings.UpdateChannel == updateChannelLocal {
		return map[string]interface{}{
			"success":   true,
			"channel":   updateChannelLocal,
			"disabled":  true,
			"available": false,
			"message":   "Lokaler Snapshot: Netzwerk-Updates sind deaktiviert.",
		}, nil
	}
	releases, err := fetchReleases()
	if err != nil {
		return nil, err
	}
	release, err := selectReleaseForChannel(releases, settings.UpdateChannel)
	if err != nil {
		return nil, err
	}
	localVersion, _ := getLocalVersion()
	available := localVersion == "" || compareVersions(release.TagName, localVersion) > 0
	return map[string]interface{}{
		"success":        true,
		"channel":        settings.UpdateChannel,
		"available":      available,
		"currentVersion": localVersion,
		"latestVersion":  release.TagName,
		"releaseName":    release.Name,
		"publishedAt":    release.PublishedAt,
		"prerelease":     release.Prerelease,
	}, nil
}

func (l *Launcher) applyUpdateForCurrentChannel() (map[string]interface{}, error) {
	settings := l.settings
	if settings.UpdateChannel == "" {
		settings = l.loadSettings()
	}
	if settings.UpdateChannel == updateChannelLocal {
		return nil, fmt.Errorf("local snapshot channel does not apply network updates")
	}
	releases, err := fetchReleases()
	if err != nil {
		return nil, err
	}
	release, err := selectReleaseForChannel(releases, settings.UpdateChannel)
	if err != nil {
		return nil, err
	}
	if err := l.downloadAndApplyUpdate(release); err != nil {
		return nil, err
	}
	return map[string]interface{}{"success": true, "channel": settings.UpdateChannel, "version": release.TagName}, nil
}

func (l *Launcher) rollbackLastUpdate() (map[string]interface{}, error) {
	backupRoot := filepath.Join(l.exeDir, "runtime", "update_backups")
	entries, err := os.ReadDir(backupRoot)
	if err != nil {
		return nil, err
	}
	var latest os.DirEntry
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		if latest == nil || entry.Name() > latest.Name() {
			latest = entry
		}
	}
	if latest == nil {
		return nil, fmt.Errorf("no update backup found")
	}
	backupApp := filepath.Join(backupRoot, latest.Name(), "app")
	if info, err := os.Stat(backupApp); err != nil || !info.IsDir() {
		return nil, fmt.Errorf("latest backup does not contain app directory")
	}
	failedApp := filepath.Join(l.exeDir, "runtime", "failed_update_app_"+time.Now().Format("2006-01-02_15-04-05"))
	if _, err := os.Stat(l.appDir); err == nil {
		if err := os.Rename(l.appDir, failedApp); err != nil {
			return nil, fmt.Errorf("could not move current app before rollback: %w", err)
		}
	}
	if err := os.Rename(backupApp, l.appDir); err != nil {
		_ = os.Rename(failedApp, l.appDir)
		return nil, fmt.Errorf("rollback restore failed: %w", err)
	}
	return map[string]interface{}{"success": true, "backup": latest.Name(), "failedApp": failedApp}, nil
}

type vacuumMaintenanceOptions struct {
	CleanupDays int
	DryRun      bool
	SkipVacuum  bool
}

func sqliteVacuumScript() string {
	return `
const dbPath = process.env.LTTH_VACUUM_DB;
if (!dbPath) {
  throw new Error('LTTH_VACUUM_DB is missing');
}
const Database = require('better-sqlite3');

function parseBoolean(rawValue, defaultValue) {
  if (typeof rawValue !== 'string') {
    return defaultValue;
  }
  const normalized = rawValue.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

const cleanupDays = Number(process.env.LTTH_VACUUM_CLEANUP_DAYS || '0');
const cleanupDryRun = parseBoolean(process.env.LTTH_VACUUM_DRY_RUN, false);
const skipVacuum = parseBoolean(process.env.LTTH_VACUUM_SKIP, false);
const output = {
  success: true,
  deletedUsers: 0,
  cleanupDays: 0,
  cleanupDryRun: cleanupDryRun,
  vacuumPerformed: false,
  error: ''
};

function normalizeCleanupDays(raw) {
  if (!Number.isFinite(raw) || raw <= 0) {
    return 0;
  }
  const value = Math.floor(raw);
  return value > 0 ? value : 0;
}

const db = new Database(dbPath, { fileMustExist: true });
try {
  const activeCleanupDays = normalizeCleanupDays(cleanupDays);
  if (activeCleanupDays > 0) {
    const cutoff = '-' + activeCleanupDays + ' days';
    const whereClause = 'last_seen_at IS NOT NULL AND last_seen_at < datetime("now", ?)';
    const tableExists = db.prepare('SELECT name FROM sqlite_master WHERE type = "table" AND name = "user_statistics"').get();
    output.cleanupDays = activeCleanupDays;
    if (!tableExists) {
      output.deletedUsers = 0;
    } else {
      const count = db.prepare('SELECT COUNT(*) as count FROM user_statistics WHERE ' + whereClause).get(cutoff).count || 0;
      if (cleanupDryRun) {
        output.deletedUsers = Number(count);
      } else if (count > 0) {
        const deleteResult = db.prepare('DELETE FROM user_statistics WHERE ' + whereClause).run(cutoff);
        output.deletedUsers = Number(deleteResult.changes || 0);
      } else {
        output.deletedUsers = 0;
      }
    }
  } else {
    output.cleanupDays = activeCleanupDays;
  }

  db.pragma('busy_timeout = 30000');
  if (!skipVacuum) {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.exec('VACUUM');
    db.pragma('optimize');
    output.vacuumPerformed = true;
  }
} catch (error) {
  output.success = false;
  output.error = String(error && (error.message || error.stack || error));
  if (error && error.stack) {
    console.error(error.stack);
  } else if (output.error) {
    console.error(output.error);
  }
  process.exitCode = 1;
} finally {
  db.close();
}
console.log(JSON.stringify(output));
`
}

func (l *Launcher) nodeExecutableForMaintenance() string {
	if strings.TrimSpace(l.nodePath) != "" {
		return l.nodePath
	}
	if nodePath := l.getNodeExecutable(); nodePath != "" {
		return nodePath
	}
	nodePath, err := exec.LookPath("node")
	if err != nil {
		return ""
	}
	return nodePath
}

func parseMaintenanceScriptOutput(rawOutput string) (VacuumMaintenanceResult, error) {
	output := VacuumMaintenanceResult{}
	trimmed := strings.TrimSpace(rawOutput)
	if trimmed == "" {
		return output, fmt.Errorf("maintenance script returned no output")
	}
	start := strings.Index(trimmed, "{")
	end := strings.LastIndex(trimmed, "}")
	if start == -1 || end == -1 || end <= start {
		return output, fmt.Errorf("maintenance script output not JSON: %s", trimmed)
	}
	fragment := trimmed[start : end+1]
	if err := json.Unmarshal([]byte(fragment), &output); err != nil {
		return output, fmt.Errorf("unable to parse maintenance output: %w: %s", err, trimmed)
	}
	return output, nil
}

func sanitizeVacuumRequestDays(value int) (int, error) {
	if value < 0 {
		return 0, fmt.Errorf("cleanup days cannot be negative")
	}
	if value > 3650 {
		return 0, fmt.Errorf("cleanup days too high")
	}
	return value, nil
}

func (l *Launcher) vacuumActiveProfileDatabase(options vacuumMaintenanceOptions) (VacuumResult, error) {
	result := VacuumResult{}

	profileName, dbPath, err := l.activeProfileDatabasePath()
	if err != nil {
		return result, err
	}

	nodePath := l.nodeExecutableForMaintenance()
	if nodePath == "" {
		return result, fmt.Errorf("Node.js executable not found")
	}
	if l.appDir == "" {
		return result, fmt.Errorf("app directory is not configured")
	}
	if !l.checkNodeModules() {
		return result, fmt.Errorf("node_modules not found at %s", filepath.Join(l.appDir, "node_modules"))
	}
	if err := l.verifyNativeModulesWithPath(nodePath); err != nil {
		l.logAndSync("[WARNING] Native module verification failed before vacuum: %v", err)
		if err := l.rebuildNativeModulesWithPath(nodePath); err != nil {
			return result, fmt.Errorf("native modules verification failed: %w", err)
		}
		if err := l.verifyNativeModulesWithPath(nodePath); err != nil {
			return result, fmt.Errorf("native modules still invalid after rebuild: %w", err)
		}
	}

	cleanupDays, err := sanitizeVacuumRequestDays(options.CleanupDays)
	if err != nil {
		return result, err
	}
	options.CleanupDays = cleanupDays

	result.Profile = profileName
	result.DatabasePath = dbPath
	result.SizeBeforeBytes = databaseFootprintBytes(dbPath)
	result.CleanupDays = options.CleanupDays
	result.CleanupDryRun = options.DryRun
	result.VacuumPerformed = !options.SkipVacuum
	if backupPath, err := l.createProfileBackup(profileName, "vacuum"); err != nil {
		return result, fmt.Errorf("backup before vacuum failed: %w", err)
	} else {
		l.logAndSync("[MAINTENANCE] Profile backup before VACUUM: %s", backupPath)
	}

	cmd := hiddenCommand(nodePath, "-e", sqliteVacuumScript())
	cmd.Dir = l.appDir
	cmd.Env = append(
		sanitizeNodeEnvironment(os.Environ()),
		"LTTH_VACUUM_DB="+dbPath,
		fmt.Sprintf("LTTH_VACUUM_CLEANUP_DAYS=%d", options.CleanupDays),
		fmt.Sprintf("LTTH_VACUUM_DRY_RUN=%t", options.DryRun),
		fmt.Sprintf("LTTH_VACUUM_SKIP=%t", options.SkipVacuum),
	)
	setSysProcAttr(cmd)

	startedAt := time.Now()
	output, err := cmd.CombinedOutput()
	result.MaintenanceScriptOut = strings.TrimSpace(string(output))
	result.DurationMillis = time.Since(startedAt).Milliseconds()
	result.SizeAfterBytes = databaseFootprintBytes(dbPath)
	result.FreedBytes = result.SizeBeforeBytes - result.SizeAfterBytes

	maintenance, parseErr := parseMaintenanceScriptOutput(result.MaintenanceScriptOut)
	if parseErr == nil {
		result.CleanupDeletedUsers = maintenance.DeletedUsers
		result.CleanupDays = maintenance.CleanupDays
		result.CleanupDryRun = maintenance.CleanupDryRun
		result.VacuumPerformed = maintenance.VacuumPerformed
		if !maintenance.Success {
			err = fmt.Errorf("%s", maintenance.Error)
		}
	} else {
		l.logAndSync("[WARNING] Could not parse maintenance script output: %v", parseErr)
		if err == nil && options.SkipVacuum {
			result.VacuumPerformed = false
		}
	}

	if err != nil {
		detail := strings.TrimSpace(result.MaintenanceScriptOut)
		if detail == "" {
			detail = err.Error()
		}
		return result, fmt.Errorf("database vacuum failed: %s", detail)
	}

	result.Success = true
	return result, nil
}

func (l *Launcher) findLatestServerLog() string {
	logDir := rootLogDirForApp(l.appDir)
	entries, err := os.ReadDir(logDir)
	if err != nil {
		return ""
	}

	var latestPath string
	var latestTime time.Time

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".log") {
			continue
		}

		// Skip launcher logs to avoid duplication
		if strings.HasPrefix(entry.Name(), "launcher_") {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		if latestPath == "" || info.ModTime().After(latestTime) {
			latestTime = info.ModTime()
			latestPath = filepath.Join(logDir, entry.Name())
		}
	}

	return latestPath
}

func (l *Launcher) readLogContent(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}

	data = truncateLogData(data, maxLogBytes)
	return repairMojibakeText(string(data)), nil
}

// loadUserProfiles scans for user profiles in user_configs directory
func (l *Launcher) loadUserProfiles() {
	primaryProfiles := l.readProfilesFromDir(l.userConfigsDir)

	// Fallback to app directory (legacy location) if none found in persistent storage
	if len(primaryProfiles) == 0 {
		legacyDir := filepath.Join(l.appDir, "user_configs")
		primaryProfiles = l.readProfilesFromDir(legacyDir)
		if len(primaryProfiles) > 0 && l.logger != nil {
			l.logger.Printf("[INFO] Found %d user profile(s) in legacy app directory\n", len(primaryProfiles))
		}
	}

	l.profiles = primaryProfiles
	l.profilesLoaded = time.Now()
	if l.logger != nil {
		l.logger.Printf("[INFO] Found %d user profile(s)\n", len(primaryProfiles))
	}
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

	// Only write to file (not stdout) because in GUI mode stdout doesn't exist
	// This prevents silent failures when built with -H windowsgui
	l.logger = log.New(logFile, "", log.LstdFlags)

	l.logger.Println("========================================")
	l.logger.Println("TikTok Stream Tool - Launcher Log")
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

func (l *Launcher) logStartupPreflight(templatePath string) {
	l.logAndSync("Launcher started successfully")
	l.logAndSync("Executable directory: %s", l.exeDir)
	l.logAndSync("App directory: %s", l.appDir)
	l.logAndSync("Working directory: %s", mustGetwd())
	l.logAndSync("Template path: %s", templatePath)

	for _, requiredPath := range []string{
		l.appDir,
		filepath.Join(l.appDir, "launch.js"),
		filepath.Join(l.appDir, "server.js"),
		filepath.Join(l.appDir, "package.json"),
		filepath.Join(l.appDir, "modules", "logger.js"),
	} {
		if info, err := os.Stat(requiredPath); err != nil {
			l.logAndSync("[PREFLIGHT] MISSING: %s (%v)", requiredPath, err)
		} else if info.IsDir() {
			l.logAndSync("[PREFLIGHT] OK dir: %s", requiredPath)
		} else {
			l.logAndSync("[PREFLIGHT] OK file: %s (%d bytes)", requiredPath, info.Size())
		}
	}
}

func mustGetwd() string {
	wd, err := os.Getwd()
	if err != nil {
		return fmt.Sprintf("unknown (%v)", err)
	}
	return wd
}

func (l *Launcher) logFatalAndExit(message string, code int) {
	l.logAndSync("[FATAL] %s", message)
	l.closeLogging()
	os.Exit(code)
}

func (l *Launcher) updateProgressRaw(value int, status string) {
	value = clampProgress(value)
	l.progress = value
	l.status = repairMojibakeText(status)

	statusJSON, _ := json.Marshal(l.status) // properly escaped
	msg := fmt.Sprintf(`{"progress": %d, "status": %s}`, value, string(statusJSON))
	l.clientsMu.Lock()
	for client := range l.clients {
		select {
		case client <- msg:
		default:
		}
	}
	l.clientsMu.Unlock()
}

func (l *Launcher) updateProgress(value int, status string) {
	l.statusKey = ""
	l.statusArgs = nil
	l.statusFallback = ""
	l.updateProgressRaw(value, status)
}

func (l *Launcher) updateProgressLocalized(value int, key string, fallback string, args ...interface{}) {
	l.statusKey = key
	l.statusFallback = fallback
	l.statusArgs = args
	statusText := l.translateStatus(key, fallback, args...)
	l.updateProgressRaw(value, statusText)
}

func (l *Launcher) sendRedirect() {
	port := l.serverPort
	if port == 0 {
		port = getCurrentNodePort()
	}
	msg := serverReadyMessage(port)
	l.clientsMu.Lock()
	for client := range l.clients {
		select {
		case client <- msg:
		default:
		}
	}
	l.clientsMu.Unlock()
}

func (l *Launcher) checkNodeJS() error {
	// 1. Check portable installation first
	portableNode := l.getPortableNodeExecutable()
	if portableNode != "" {
		l.nodePath = portableNode
		return nil
	}

	// 2. Use a compatible global Node.js only if it is in the supported range.
	globalNode := l.getGlobalNodeExecutable()
	if globalNode != "" {
		version := getNodeVersionForExecutable(globalNode)
		if shouldUseGlobalNodeVersion(version) {
			l.nodePath = globalNode
			return nil
		}
		target := l.resolvedNodeVersion
		if strings.TrimSpace(target) == "" {
			target = nodeVersionFallback
		}
		l.logAndSync("[WARNING] Global Node.js %s at %s is outside the supported startup range; installing portable Node.js %s.", strings.TrimSpace(version), globalNode, target)
	} else {
		l.logAndSync("[INFO] Node.js not found – installing portable version...")
	}

	// 3. No compatible Node.js found → install portable version.
	nodePath, err := l.installNodePortable()
	if err != nil {
		return fmt.Errorf("Node.js Installation fehlgeschlagen: %v", err)
	}
	l.nodePath = nodePath
	return nil
}

func (l *Launcher) getNodeVersion() string {
	return getNodeVersionForExecutable(l.nodePath)
}

func getNodeVersionForExecutable(nodePath string) string {
	cmd := hiddenCommand(nodePath, "--version")
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

func samePathEntry(a, b string) bool {
	if runtime.GOOS == "windows" {
		return strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
	}
	return filepath.Clean(a) == filepath.Clean(b)
}

func prependPathEntry(env []string, dir string) []string {
	dir = strings.TrimSpace(dir)
	if dir == "" {
		return env
	}

	pathKey := "PATH"
	if runtime.GOOS == "windows" {
		pathKey = "Path"
	}

	result := make([]string, 0, len(env)+1)
	foundPath := false
	for _, entry := range env {
		key, value, ok := strings.Cut(entry, "=")
		isPath := ok && (key == "PATH" || (runtime.GOOS == "windows" && strings.EqualFold(key, "Path")))
		if !isPath {
			result = append(result, entry)
			continue
		}

		if foundPath {
			continue
		}
		foundPath = true
		pathKey = key

		parts := []string{dir}
		for _, existing := range filepath.SplitList(value) {
			if strings.TrimSpace(existing) == "" || samePathEntry(existing, dir) {
				continue
			}
			parts = append(parts, existing)
		}
		result = append(result, pathKey+"="+strings.Join(parts, string(os.PathListSeparator)))
	}

	if !foundPath {
		result = append(result, pathKey+"="+dir)
	}
	return result
}

func nodeCommandEnvironment(env []string, nodePath string) []string {
	sanitized := sanitizeNodeEnvironment(env)
	nodePath = strings.TrimSpace(nodePath)
	if nodePath == "" {
		return sanitized
	}
	return prependPathEntry(sanitized, filepath.Dir(nodePath))
}

func (l *Launcher) verifyNativeModulesWithPath(nodePath string) error {
	nodePath = strings.TrimSpace(nodePath)
	if nodePath == "" {
		nodePath = strings.TrimSpace(l.nodePath)
	}
	if nodePath == "" {
		return fmt.Errorf("Node.js path is empty")
	}

	script := "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.close(); console.log('native-modules-ok')"
	cmd := hiddenCommand(nodePath, "-e", script)
	cmd.Dir = l.appDir
	cmd.Env = nodeCommandEnvironment(os.Environ(), nodePath)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%v\n%s", err, strings.TrimSpace(string(output)))
	}

	l.logAndSync("[SUCCESS] Native Node modules verified: %s", strings.TrimSpace(string(output)))
	return nil
}

func (l *Launcher) verifyNativeModules() error {
	return l.verifyNativeModulesWithPath(l.nodePath)
}

func (l *Launcher) installDependencies() error {
	l.logger.Println("[INFO] Starting npm install...")
	l.updateProgressLocalized(45, "status.npm_install_start", "npm install wird gestartet...")
	time.Sleep(500 * time.Millisecond)

	// Show initial warning about potential delay
	l.updateProgressLocalized(45, "status.npm_install_delay_notice", "HINWEIS: npm install kann mehrere Minuten dauern, besonders bei langsamer Internetverbindung. Bitte warten...")
	time.Sleep(2 * time.Second)

	npm := l.resolveNpmCommand()
	l.logAndSync("[INFO] Using npm: %s", npm.Label)

	cmd := npm.execCommand("install")

	cmd.Dir = l.appDir

	// Set environment variables to skip problematic preinstall checks
	cmd.Env = nodeCommandEnvironment(append(os.Environ(),
		"YOUTUBE_DL_SKIP_PYTHON_CHECK=1",
		"PUPPETEER_SKIP_DOWNLOAD=true",
	), l.nodePath)

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
				l.updateProgressLocalized(currentProgress, "status.npm_install_line", "npm install: %s", displayLine)
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
					l.updateProgressLocalized(currentProgress, "status.npm_install_running", "npm install läuft... (%ds) - Bitte warten, Downloads können mehrere Minuten dauern", elapsed)
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
		l.updateProgressLocalized(50, "status.npm_install_retry", "Wiederhole npm install (Fallback ohne --cache)...")
		time.Sleep(1 * time.Second)

		retryCmd := npm.execCommand("install")
		retryCmd.Dir = l.appDir
		retryCmd.Env = nodeCommandEnvironment(append(os.Environ(),
			"YOUTUBE_DL_SKIP_PYTHON_CHECK=1",
			"PUPPETEER_SKIP_DOWNLOAD=true",
		), l.nodePath)
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
	cmd := hiddenCommand(l.nodePath, launchJS)
	cmd.Dir = l.appDir
	preferredPort, maxPort := backendPortConfig(l.preferredPort)

	// Set environment variable to disable automatic browser opening
	// The GUI launcher handles the redirect to dashboard after server is ready
	// Build environment explicitly to ensure OPEN_BROWSER is properly set
	env := []string{}
	for _, e := range os.Environ() {
		// Skip any existing OPEN_BROWSER variable to avoid conflicts
		if strings.HasPrefix(e, "OPEN_BROWSER=") {
			continue
		}
		if strings.HasPrefix(e, "LTTH_PORT=") || strings.HasPrefix(e, "LTTH_MAX_PORT=") {
			continue
		}
		if strings.HasPrefix(e, "LTTH_LOG_DIR=") || strings.HasPrefix(e, "LTTH_LOG_ARCHIVE_DONE=") || strings.HasPrefix(e, "LTTH_CURRENT_LAUNCHER_LOG=") {
			continue
		}
		if strings.HasPrefix(e, "LTTH_SAFE_MODE=") || strings.HasPrefix(e, "DISABLE_PLUGINS=") {
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
	env = append(env, fmt.Sprintf("LTTH_PORT=%d", preferredPort))
	env = append(env, fmt.Sprintf("LTTH_MAX_PORT=%d", maxPort))
	env = append(env, fmt.Sprintf("LTTH_LOG_DIR=%s", rootLogDir))
	env = append(env, "LTTH_LOG_ARCHIVE_DONE=true")
	if l.logPath != "" {
		env = append(env, fmt.Sprintf("LTTH_CURRENT_LAUNCHER_LOG=%s", l.logPath))
	}
	if l.settings.SafeMode {
		env = append(env, "LTTH_SAFE_MODE=true", "DISABLE_PLUGINS=true", "DISABLE_SWAGGER=true")
		l.logAndSync("[SAFE-MODE] Starting backend with plugins disabled.")
	}
	cmd.Env = env

	// Redirect both stdout and stderr to log file only (not os.Stdout because GUI mode has no console)
	if l.logFile != nil {
		cmd.Stdout = l.logFile
		cmd.Stderr = l.logFile
	}
	// Note: We don't redirect stdin in GUI mode as there's no console

	l.logAndSync("Starting Node.js server...")
	l.logAndSync("Command: %s %s", l.nodePath, launchJS)
	l.logAndSync("Working directory: %s", l.appDir)
	l.logAndSync("OPEN_BROWSER environment variable set to: false")
	l.logAndSync("LTTH_PORT environment variable set to: %d", preferredPort)
	l.logAndSync("LTTH_MAX_PORT environment variable set to: %d", maxPort)
	l.logAndSync("LTTH_LOG_DIR environment variable set to: %s", rootLogDir)
	l.clearRuntimePortFile()
	l.logPortDiagnostics()
	l.logAndSync("--- Node.js Server Output Start ---")

	setSysProcAttr(cmd)

	err := cmd.Start()
	if err != nil {
		return nil, err
	}

	l.nodeMu.Lock()
	l.nodeCmd = cmd
	l.nodeMu.Unlock()

	return cmd, nil
}

// killNodeProcess beendet den Node-Child-Prozess sauber.
// Auf Windows: taskkill /T um auch Child-Prozesse von Node zu beenden.
// Auf Unix: SIGTERM an die Prozessgruppe, dann SIGKILL-Fallback nach 3s.
func (l *Launcher) killNodeProcess() {
	l.nodeMu.Lock()
	cmd := l.nodeCmd
	l.nodeMu.Unlock()

	if cmd == nil || cmd.Process == nil {
		return
	}

	pid := cmd.Process.Pid
	if l.logger != nil {
		l.logger.Printf("[INFO] Terminating Node.js process (PID: %d)...\n", pid)
	}

	killNodeProcessOS(cmd, pid)

	l.nodeMu.Lock()
	l.nodeCmd = nil
	l.nodeMu.Unlock()

	if l.logger != nil {
		l.logger.Printf("[INFO] Node.js process (PID: %d) terminated.\n", pid)
	}
}

// checkServerHealth checks if the server is responding
func (l *Launcher) checkServerHealth() bool {
	port, ok := l.detectHealthyServerPort()
	if ok {
		l.serverPort = port
		return true
	}
	return false
}

// checkServerHealthOnPort checks if the server is responding on a specific port
func (l *Launcher) checkServerHealthOnPort(port int) bool {
	return l.checkServerHealthOnPortWithTimeout(port, 2*time.Second)
}

func (l *Launcher) checkServerHealthOnPortWithTimeout(port int, timeout time.Duration) bool {
	_, ok := l.getServerHealthOnPortWithTimeout(port, timeout)
	return ok
}

func (l *Launcher) getServerHealthOnPortWithTimeout(port int, timeout time.Duration) (ServerHealthInfo, bool) {
	var payload ServerHealthInfo
	client := &http.Client{
		Timeout: timeout,
	}

	url := fmt.Sprintf("http://localhost:%d/api/health", port)
	resp, err := client.Get(url)
	if err != nil {
		return payload, false
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return payload, false
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&payload); err != nil {
		return payload, false
	}

	ok := payload.Success && payload.Status == "ok" && strings.Contains(payload.Name, "LTTH")
	return payload, ok
}

func (l *Launcher) detectHealthyServerPort() (int, bool) {
	for _, port := range l.candidatePorts() {
		if l.checkServerHealthOnPortWithTimeout(port, 350*time.Millisecond) {
			return port, true
		}
	}
	return 0, false
}

func (l *Launcher) detectedLTTHServers() []ServerHealthInfo {
	seen := map[string]bool{}
	var servers []ServerHealthInfo

	for _, port := range l.candidatePorts() {
		health, ok := l.getServerHealthOnPortWithTimeout(port, 350*time.Millisecond)
		if !ok {
			continue
		}
		if health.Port == 0 {
			health.Port = port
		}

		key := fmt.Sprintf("port:%d", health.Port)
		if health.PID > 0 {
			key = fmt.Sprintf("pid:%d", health.PID)
		}
		if seen[key] {
			continue
		}

		seen[key] = true
		servers = append(servers, health)
	}

	return servers
}

func defaultWaitForHealthyServerToStop(l *Launcher, port int, timeout time.Duration) bool {
	if port <= 0 {
		return true
	}

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if !l.checkServerHealthOnPortWithTimeout(port, 250*time.Millisecond) {
			return true
		}
		time.Sleep(300 * time.Millisecond)
	}

	return false
}

func (l *Launcher) stopDetectedLTTHServers(source string) (bool, error) {
	servers := l.detectedLTTHServers()
	if len(servers) == 0 {
		return false, nil
	}

	if source == "" {
		source = "INFO"
	}

	stopped := false
	var failures []string
	for _, server := range servers {
		if server.PID <= 0 {
			failures = append(failures, fmt.Sprintf("LTTH server on port %d did not report a PID", server.Port))
			continue
		}

		l.logAndSync("[%s] Existing LTTH server detected on port %d with PID %d. Stopping it before continuing.", source, server.Port, server.PID)
		if err := terminateProcessTreeByPID(server.PID); err != nil {
			failures = append(failures, fmt.Sprintf("could not stop LTTH server PID %d on port %d: %v", server.PID, server.Port, err))
			continue
		}

		stopped = true
		if !waitForHealthyServerToStop(l, server.Port, 15*time.Second) {
			failures = append(failures, fmt.Sprintf("LTTH server PID %d on port %d did not stop in time", server.PID, server.Port))
		}
	}

	if stopped {
		l.clearRuntimePortFile()
		l.startMu.Lock()
		l.serverStarted = false
		l.serverPort = 0
		l.startupInProgress = false
		l.startMu.Unlock()
	}

	if len(failures) > 0 {
		return stopped, errors.New(strings.Join(failures, "; "))
	}

	return stopped, nil
}

func (l *Launcher) detectRuntimeServerPortSince(startedAt time.Time) (int, bool) {
	portFile := l.runtimePortFilePath()
	info, err := os.Stat(portFile)
	if err != nil {
		return 0, false
	}

	if info.ModTime().Before(startedAt.Add(-2 * time.Second)) {
		return 0, false
	}

	port := l.readRuntimePortFile()
	if port == 0 {
		return 0, false
	}

	if health, ok := l.getServerHealthOnPortWithTimeout(port, 750*time.Millisecond); ok {
		if health.Port != 0 && health.Port != port {
			l.logAndSync("[WARNING] Health port mismatch: file=%d payload=%d", port, health.Port)
			return 0, false
		}
		return port, true
	}

	return 0, false
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

func (l *Launcher) isNodeRunning() bool {
	l.nodeMu.Lock()
	defer l.nodeMu.Unlock()
	return l.nodeCmd != nil && l.nodeCmd.Process != nil && l.nodeCmd.ProcessState == nil
}

func (l *Launcher) statusPayload() map[string]interface{} {
	runtimePort := l.readRuntimePortFile()
	nodeRunning := l.isNodeRunning()
	detectedPort, detectedRunning := l.detectHealthyServerPort()
	serverPort := l.serverPort
	if detectedRunning {
		serverPort = detectedPort
	}
	serverRunning := l.serverStarted || detectedRunning

	if !serverRunning && !nodeRunning && !l.startupInProgress {
		runtimePort = 0
		serverPort = 0
	}

	return map[string]interface{}{
		"progress":          l.progress,
		"status":            l.currentStatus(),
		"preferredPort":     l.preferredPort,
		"runtimePort":       runtimePort,
		"serverPort":        serverPort,
		"serverRunning":     serverRunning,
		"nodeRunning":       nodeRunning,
		"startupInProgress": l.startupInProgress,
		"lastStartError":    l.lastStartError,
		"logPath":           l.logPath,
		"activeProfile":     l.currentProfileName(),
		"vacuumAvailable":   !l.startupInProgress && !nodeRunning && !serverRunning,
		"settings":          l.settings,
		"safeMode":          l.settings.SafeMode,
		"updateChannel":     l.settings.UpdateChannel,
		"firstRunComplete":  l.settings.FirstRunComplete,
		"pluginFailures":    l.pluginFailures,
	}
}

func (l *Launcher) setPreferredPort(port int) error {
	port = normalizePort(port, 0)
	if port == 0 {
		return fmt.Errorf("invalid port")
	}
	l.startMu.Lock()
	defer l.startMu.Unlock()
	if l.isNodeRunning() && l.serverStarted {
		return fmt.Errorf("server is already running on port %d", l.serverPort)
	}
	l.preferredPort = port
	settings := l.settings
	settings.PreferredPort = port
	_ = l.saveSettings(settings)
	l.logAndSync("[INFO] Preferred launcher port changed to %d", port)
	l.updateProgressLocalized(l.progress, "status.port_selected", "Port %d ausgewählt", port)
	return nil
}

func (l *Launcher) markServerStartDone(err error) {
	l.startMu.Lock()
	defer l.startMu.Unlock()
	l.startupInProgress = false
	if err != nil {
		l.lastStartError = err.Error()
		l.serverStarted = false
	}
}

func (l *Launcher) manualStartServer(port int) error {
	port = normalizePort(port, l.preferredPort)
	if port == 0 {
		port = defaultBackendPort
	}

	l.startMu.Lock()
	if l.startupInProgress {
		l.startMu.Unlock()
		return fmt.Errorf("server start is already in progress")
	}
	if l.isNodeRunning() {
		l.startMu.Unlock()
		return fmt.Errorf("server process is already running")
	}
	l.startMu.Unlock()

	if stopped, err := l.stopDetectedLTTHServers("MANUAL"); err != nil {
		return err
	} else if stopped {
		l.updateProgressLocalized(88, "status.old_instance_stopped", "Alte Server-Instanz gestoppt.")
	}

	l.startMu.Lock()
	l.preferredPort = port
	l.startupInProgress = true
	l.serverStarted = false
	l.lastStartError = ""
	l.startMu.Unlock()

	l.logAndSync("[MANUAL] Manual server start requested on preferred port %d", port)
	l.updateProgressLocalized(90, "status.manual_starting", "Manueller Serverstart auf Port %d...", port)

	startedAt := time.Now()
	cmd, err := l.startTool()
	if err != nil {
		l.markServerStartDone(err)
		l.updateProgressLocalized(95, "status.start_error", "FEHLER beim Starten: %v", err)
		return err
	}

	processDied := make(chan error, 1)
	go func(startedCmd *exec.Cmd) {
		waitErr := startedCmd.Wait()
		l.nodeMu.Lock()
		if l.nodeCmd == startedCmd {
			l.nodeCmd = nil
		}
		l.nodeMu.Unlock()
		processDied <- waitErr
	}(cmd)

	go func() {
		timeout := time.After(serverHealthTimeout)
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case waitErr := <-processDied:
				err := fmt.Errorf("node process exited before ready: %v", waitErr)
				l.logAndSync("[ERROR] Manual server start failed: %v", err)
				l.updateProgressLocalized(95, "status.server_failed_start", "Server konnte nicht starten!")
				l.markServerStartDone(err)
				return
			case <-ticker.C:
				if port, ok := l.detectRuntimeServerPortSince(startedAt); ok {
					l.serverPort = port
					l.serverStarted = true
					l.logAndSync("[SUCCESS] Manual server start healthy on port %d", port)
					l.updateProgressLocalized(100, "status.server_started", "Server erfolgreich gestartet!")
					l.markServerStartDone(nil)
					l.sendRedirect()
					go func() {
						waitErr := <-processDied
						l.logAndSync("[INFO] Manually started Node.js process exited: %v", waitErr)
						l.serverStarted = false
					}()
					return
				}
			case <-timeout:
				err := fmt.Errorf("manual server start timed out after %d seconds", serverHealthTimeoutSeconds)
				l.logAndSync("[ERROR] %v", err)
				l.updateProgressLocalized(95, "status.server_timeout", "Server-Start Timeout (%ds)", serverHealthTimeoutSeconds)
				l.markServerStartDone(err)
				return
			}
		}
	}()

	return nil
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
	l.updateProgressLocalized(85, "status.env_creating", "🔧 Auto-Fix: Erstelle .env Datei...")

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
	l.updateProgressLocalized(86, "status.env_created", "✅ .env Datei erstellt!")
	l.envFileFixed = true // Mark that we fixed the .env file
	time.Sleep(1 * time.Second)

	return nil
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
		cmd := hiddenCommand(ytdlpCmd, "--version")
		if output, err := cmd.CombinedOutput(); err == nil {
			l.logger.Printf("[INFO] yt-dlp found in PATH: %s\n", strings.TrimSpace(string(output)))
			return
		}
	}

	l.logger.Println("[WARNING] yt-dlp not found. The Music Bot requires yt-dlp to function. " +
		"Run 'npm install' in the app directory to restore the bundled binary, " +
		"or set a custom path in Music Bot settings.")
}

// autoFixPort reports fixed-port readiness before starting the backend.
func (l *Launcher) autoFixPort() {
	preferred := normalizePort(l.preferredPort, defaultBackendPort)

	if existingPort, ok := l.detectHealthyServerPort(); ok {
		l.logAndSync("[INFO] Existing LTTH server detected on port %d; startup cleanup will stop it before a fresh backend starts.", existingPort)
		l.updateProgressLocalized(87, "status.port_existing", "Bestehender LTTH-Server wird vor Neustart gestoppt...")
		return
	}

	if isPortAvailable(preferred) {
		l.logAndSync("[INFO] Preferred backend port %d is available", preferred)
		l.updateProgressLocalized(87, "status.port_available", "Port %d ist frei", preferred)
		return
	}

	l.logAndSync("[WARNING] Preferred backend port %d is occupied.", preferred)
	l.logAndSync("[WARNING] Port owner details: %s", describePortOwner(preferred))
	l.logAndSync("[WARNING] Backend startup stays fixed to port %d. If this is not LTTH, stop the other process or choose another port manually.", preferred)
	l.updateProgressLocalized(87, "status.port_occupied", "Port %d ist belegt", preferred)
}

// ============================================================
// Node.js portable install / update helpers
// ============================================================

// fetchNodeLTSVersion fetches the latest LTS version string from nodejs.org.
// Falls back to nodeVersionFallback on any error.
func fetchNodeLTSVersion(logger *log.Logger) string {
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get("https://nodejs.org/dist/index.json")
	if err != nil {
		if logger != nil {
			logger.Printf("[WARNING] Could not fetch Node.js LTS version: %v - using fallback %s\n", err, nodeVersionFallback)
		}
		return nodeVersionFallback
	}
	defer resp.Body.Close()

	var releases []NodeRelease
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		if logger != nil {
			logger.Printf("[WARNING] Could not parse nodejs.org index.json: %v - using fallback %s\n", err, nodeVersionFallback)
		}
		return nodeVersionFallback
	}

	for _, r := range releases {
		if _, isBool := r.LTS.(bool); !isBool {
			// LTS is a string like "Jod" → this is an active LTS release
			version := strings.TrimPrefix(r.Version, "v")
			if logger != nil {
				logger.Printf("[INFO] Resolved Node.js LTS version: %s\n", version)
			}
			return version
		}
	}

	if logger != nil {
		logger.Printf("[WARNING] No LTS release found in nodejs.org index - using fallback %s\n", nodeVersionFallback)
	}
	return nodeVersionFallback
}

// buildNodeDownloadURL returns the download URL for the given Node.js version on the
// current platform and architecture (including ARM64 support).
func buildNodeDownloadURL(version string) string {
	goos := runtime.GOOS
	goarch := runtime.GOARCH
	archStr := "x64"
	if goarch == "arm64" {
		archStr = "arm64"
	}
	switch goos {
	case "windows":
		return fmt.Sprintf("https://nodejs.org/dist/v%s/node-v%s-win-%s.zip", version, version, archStr)
	case "linux":
		return fmt.Sprintf("https://nodejs.org/dist/v%s/node-v%s-linux-%s.tar.xz", version, version, archStr)
	case "darwin":
		return fmt.Sprintf("https://nodejs.org/dist/v%s/node-v%s-darwin-%s.tar.gz", version, version, archStr)
	default:
		return fmt.Sprintf("https://nodejs.org/dist/v%s/node-v%s-win-x64.zip", version, version)
	}
}

// getNodeExecutable returns the path to the node executable, checking the portable
// runtime/node directory first and then the system PATH.
func (l *Launcher) getNodeExecutable() string {
	if portableNode := l.getPortableNodeExecutable(); portableNode != "" {
		return portableNode
	}
	return l.getGlobalNodeExecutable()
}

func (l *Launcher) getPortableNodeExecutable() string {
	var portableNode string
	if runtime.GOOS == "windows" {
		portableNode = filepath.Join(l.exeDir, "runtime", "node", "node.exe")
	} else {
		portableNode = filepath.Join(l.exeDir, "runtime", "node", "node")
	}
	if _, err := os.Stat(portableNode); err == nil {
		return portableNode
	}
	return ""
}

func (l *Launcher) getGlobalNodeExecutable() string {
	nodePath, err := exec.LookPath("node")
	if err == nil {
		return nodePath
	}
	return ""
}

// downloadFileHTTP downloads a URL to dest with a 10-minute timeout and loggedWriteCounter logging.
func (l *Launcher) downloadFileHTTP(url, dest string) error {
	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d for %s", resp.StatusCode, url)
	}

	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()

	counter := &loggedWriteCounter{
		Total:  resp.ContentLength,
		logger: l.logger,
	}
	_, err = io.Copy(out, io.TeeReader(resp.Body, counter))
	return err
}

// extractZipWithFlatStructure extracts a ZIP archive into destDir, stripping the
// single top-level directory that GitHub and nodejs.org archives typically contain.
func extractZipWithFlatStructure(zipPath, destDir string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	// Find the root directory prefix (e.g. "node-v22.14.0-win-x64/")
	var rootDir string
	if len(r.File) > 0 {
		rootDir = strings.Split(r.File[0].Name, "/")[0] + "/"
	}

	for _, f := range r.File {
		if f.Name == rootDir {
			continue
		}

		targetPath := strings.TrimPrefix(f.Name, rootDir)
		if targetPath == "" {
			continue
		}

		fpath := filepath.Join(destDir, filepath.FromSlash(targetPath))

		// Guard against ZipSlip
		if !strings.HasPrefix(filepath.Clean(fpath)+string(os.PathSeparator), filepath.Clean(destDir)+string(os.PathSeparator)) {
			return fmt.Errorf("illegal file path in archive: %s", fpath)
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
		rc.Close()
		outFile.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

// extractTar extracts a .tar.xz or .tar.gz archive using the system tar command,
// stripping the top-level directory (--strip-components=1).
func extractTar(tarPath, destDir string) error {
	var cmd *exec.Cmd
	if strings.HasSuffix(tarPath, ".tar.xz") {
		cmd = hiddenCommand("tar", "-xJf", tarPath, "-C", destDir, "--strip-components=1")
	} else if strings.HasSuffix(tarPath, ".tar.gz") {
		cmd = hiddenCommand("tar", "-xzf", tarPath, "-C", destDir, "--strip-components=1")
	} else {
		return fmt.Errorf("unsupported archive format: %s", tarPath)
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("tar extraction failed: %v, output: %s", err, string(output))
	}
	return nil
}

// installNodePortable downloads and installs a portable Node.js into runtime/node/.
// Returns the path to the node executable on success.
func (l *Launcher) installNodePortable() (string, error) {
	version := l.resolvedNodeVersion
	if version == "" {
		version = nodeVersionFallback
	}

	runtimeDir := filepath.Join(l.exeDir, "runtime")
	nodeDir := filepath.Join(runtimeDir, "node")

	if err := os.MkdirAll(nodeDir, 0755); err != nil {
		return "", fmt.Errorf("cannot create runtime/node: %v", err)
	}

	downloadURL := buildNodeDownloadURL(version)
	l.logAndSync("[INFO] Downloading Node.js %s from %s", version, downloadURL)
	l.updateProgressLocalized(15, "status.nodejs_downloading", "Lade Node.js %s herunter...", version)

	var archiveExt string
	switch runtime.GOOS {
	case "windows":
		archiveExt = ".zip"
	case "linux":
		archiveExt = ".tar.xz"
	default:
		archiveExt = ".tar.gz"
	}

	archivePath := filepath.Join(runtimeDir, "node_download"+archiveExt)

	// Download with retry logic (max 3 attempts)
	var downloadErr error
	for attempt := 1; attempt <= 3; attempt++ {
		if attempt > 1 {
			l.logAndSync("[INFO] Download attempt %d of 3...", attempt)
			l.updateProgressLocalized(15, "status.nodejs_download_retry", "Download-Versuch %d von 3...", attempt)
		}
		downloadErr = l.downloadFileHTTP(downloadURL, archivePath)
		if downloadErr == nil {
			break
		}
		os.Remove(archivePath)
	}
	if downloadErr != nil {
		return "", fmt.Errorf("Node.js download failed after 3 attempts: %v", downloadErr)
	}
	defer os.Remove(archivePath)

	l.logAndSync("[INFO] Extracting Node.js archive...")
	l.updateProgressLocalized(22, "status.nodejs_extracting", "Extrahiere Node.js...")

	if err := os.MkdirAll(nodeDir, 0755); err != nil {
		return "", fmt.Errorf("cannot create node dir: %v", err)
	}

	var extractErr error
	if runtime.GOOS == "windows" {
		extractErr = extractZipWithFlatStructure(archivePath, nodeDir)
	} else {
		extractErr = extractTar(archivePath, nodeDir)
	}
	if extractErr != nil {
		os.RemoveAll(nodeDir)
		return "", fmt.Errorf("extraction failed: %v", extractErr)
	}

	// Write version file
	versionFilePath := filepath.Join(nodeDir, "version.txt")
	if err := os.WriteFile(versionFilePath, []byte(version), 0644); err != nil {
		l.logAndSync("[WARNING] Could not write node version.txt: %v", err)
	}

	// Validate
	var nodeExe string
	if runtime.GOOS == "windows" {
		nodeExe = filepath.Join(nodeDir, "node.exe")
	} else {
		nodeExe = filepath.Join(nodeDir, "node")
	}
	if _, err := os.Stat(nodeExe); os.IsNotExist(err) {
		return "", fmt.Errorf("node executable not found after installation")
	}

	l.logAndSync("[SUCCESS] Node.js %s installed at %s", version, nodeExe)
	return nodeExe, nil
}

// getInstalledNodeVersion reads the version from runtime/node/version.txt.
func (l *Launcher) getInstalledNodeVersion() string {
	data, err := os.ReadFile(filepath.Join(l.exeDir, "runtime", "node", "version.txt"))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

// checkAndUpdateNodePortable checks if the portable Node.js installation matches
// l.resolvedNodeVersion and performs an in-place update if it does not.
// Returns true if an update was performed.
func (l *Launcher) checkAndUpdateNodePortable() (bool, error) {
	installed := l.getInstalledNodeVersion()
	target := l.resolvedNodeVersion
	if target == "" {
		target = nodeVersionFallback
	}

	if installed == target {
		return false, nil
	}

	l.logAndSync("[INFO] Node.js update available: %s → %s", installed, target)
	l.updateProgressLocalized(18, "status.nodejs_updating", "Node.js Update: %s → %s", installed, target)

	runtimeDir := filepath.Join(l.exeDir, "runtime")
	nodeDir := filepath.Join(runtimeDir, "node")
	nodeNewDir := filepath.Join(runtimeDir, "node_new")
	nodeBackupDir := filepath.Join(runtimeDir, "node.backup")

	// Download new version into node_new/
	if err := os.MkdirAll(nodeNewDir, 0755); err != nil {
		return false, fmt.Errorf("cannot create node_new dir: %v", err)
	}

	downloadURL := buildNodeDownloadURL(target)
	var archiveExt string
	switch runtime.GOOS {
	case "windows":
		archiveExt = ".zip"
	case "linux":
		archiveExt = ".tar.xz"
	default:
		archiveExt = ".tar.gz"
	}
	archivePath := filepath.Join(runtimeDir, "node_update"+archiveExt)

	if err := l.downloadFileHTTP(downloadURL, archivePath); err != nil {
		os.RemoveAll(nodeNewDir)
		return false, fmt.Errorf("Node.js update download failed: %v", err)
	}
	defer os.Remove(archivePath)

	var extractErr error
	if runtime.GOOS == "windows" {
		extractErr = extractZipWithFlatStructure(archivePath, nodeNewDir)
	} else {
		extractErr = extractTar(archivePath, nodeNewDir)
	}
	if extractErr != nil {
		os.RemoveAll(nodeNewDir)
		return false, fmt.Errorf("Node.js update extraction failed: %v", extractErr)
	}

	// Backup old installation
	os.RemoveAll(nodeBackupDir)
	if err := os.Rename(nodeDir, nodeBackupDir); err != nil {
		os.RemoveAll(nodeNewDir)
		return false, fmt.Errorf("Node.js backup failed: %v", err)
	}

	// Move new into place
	if err := os.Rename(nodeNewDir, nodeDir); err != nil {
		// Restore backup
		_ = os.Rename(nodeBackupDir, nodeDir)
		return false, fmt.Errorf("Node.js install failed: %v", err)
	}

	// Write version file
	versionFilePath := filepath.Join(nodeDir, "version.txt")
	if err := os.WriteFile(versionFilePath, []byte(target), 0644); err != nil {
		l.logAndSync("[WARNING] Could not write node version.txt: %v", err)
	}

	// Clean up backup
	os.RemoveAll(nodeBackupDir)

	// Update nodePath
	l.nodePath = l.getNodeExecutable()
	l.logAndSync("[SUCCESS] Node.js updated to %s", target)
	return true, nil
}

type npmCommand struct {
	Command string
	Args    []string
	Label   string
}

func (n npmCommand) execCommand(extraArgs ...string) *exec.Cmd {
	args := append([]string{}, n.Args...)
	args = append(args, extraArgs...)

	lowerCommand := strings.ToLower(n.Command)
	if runtime.GOOS == "windows" && (strings.HasSuffix(lowerCommand, ".cmd") || strings.HasSuffix(lowerCommand, ".bat")) {
		shellArgs := append([]string{"/C", n.Command}, args...)
		return hiddenCommand("cmd", shellArgs...)
	}
	return hiddenCommand(n.Command, args...)
}

func (l *Launcher) resolveNpmCommand() npmCommand {
	return l.resolveNpmCommandForNode(l.nodePath)
}

func fallbackNpmCommand() npmCommand {
	name := "npm"
	if runtime.GOOS == "windows" {
		name = "npm.cmd"
	}
	return npmCommand{Command: name, Label: name}
}

func (l *Launcher) resolveNpmCommandForNode(nodePath string) npmCommand {
	nodePath = strings.TrimSpace(nodePath)
	if nodePath == "" {
		return fallbackNpmCommand()
	}

	nodeDir := filepath.Dir(nodePath)
	npmCliCandidates := []string{
		filepath.Join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js"),
		filepath.Join(nodeDir, "..", "node_modules", "npm", "bin", "npm-cli.js"),
		filepath.Join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
	}
	for _, npmCli := range npmCliCandidates {
		if info, err := os.Stat(npmCli); err == nil && !info.IsDir() {
			return npmCommand{
				Command: nodePath,
				Args:    []string{npmCli},
				Label:   fmt.Sprintf("%s %s", nodePath, npmCli),
			}
		}
	}

	npmName := "npm"
	if runtime.GOOS == "windows" {
		npmName = "npm.cmd"
	}
	adjacentNpm := filepath.Join(nodeDir, npmName)
	if info, err := os.Stat(adjacentNpm); err == nil && !info.IsDir() {
		return npmCommand{Command: adjacentNpm, Label: adjacentNpm}
	}

	return fallbackNpmCommand()
}

// rebuildNativeModules runs `npm rebuild better-sqlite3` in the app directory.
func (l *Launcher) rebuildNativeModules() error {
	return l.rebuildNativeModulesWithPath(l.nodePath)
}

func (l *Launcher) rebuildNativeModulesWithPath(nodePath string) error {
	npm := l.resolveNpmCommand()
	if nodePath = strings.TrimSpace(nodePath); nodePath != "" {
		npm = l.resolveNpmCommandForNode(nodePath)
	}
	cmd := npm.execCommand("rebuild", "better-sqlite3")
	cmd.Dir = l.appDir
	cmd.Env = nodeCommandEnvironment(append(os.Environ(), "PUPPETEER_SKIP_DOWNLOAD=true"), nodePath)

	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	if err := cmd.Run(); err != nil {
		l.logAndSync("[WARNING] better-sqlite3 rebuild failed: %v\n%s", err, buf.String())
		return err
	}
	l.logAndSync("[SUCCESS] better-sqlite3 rebuilt successfully\n%s", strings.TrimSpace(buf.String()))
	return nil
}

// ============================================================
// Auto-Update (GitHub Releases)
// ============================================================

// getVersionFilePath returns the absolute path to runtime/version.txt.
func getVersionFilePath() string {
	exePath, _ := os.Executable()
	return filepath.Join(filepath.Dir(exePath), versionFile)
}

// getLocalVersion reads the current app version from runtime/version.txt.
func getLocalVersion() (string, error) {
	data, err := os.ReadFile(getVersionFilePath())
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(data)), nil
}

// writeLocalVersion writes the given version string to runtime/version.txt.
func writeLocalVersion(version string) error {
	runtimeDir := filepath.Join(filepath.Dir(getVersionFilePath()))
	os.MkdirAll(runtimeDir, 0755)
	return os.WriteFile(getVersionFilePath(), []byte(version), 0644)
}

// shouldCheckForUpdates returns true if enough time has passed since the last
// update check (rate-limiting based on runtime/last_update_check.txt).
func shouldCheckForUpdates() bool {
	exePath, err := os.Executable()
	if err != nil {
		return true
	}
	checkFilePath := filepath.Join(filepath.Dir(exePath), updateCheckFile)
	data, err := os.ReadFile(checkFilePath)
	if err != nil {
		return true
	}
	lastCheck, err := time.Parse(time.RFC3339, strings.TrimSpace(string(data)))
	if err != nil {
		return true
	}
	return time.Since(lastCheck) >= updateInterval
}

// updateLastCheckTime saves the current timestamp to runtime/last_update_check.txt.
func updateLastCheckTime() {
	exePath, err := os.Executable()
	if err != nil {
		return
	}
	exeDir := filepath.Dir(exePath)
	runtimeDir := filepath.Join(exeDir, "runtime")
	os.MkdirAll(runtimeDir, 0755)
	checkFilePath := filepath.Join(exeDir, updateCheckFile)
	os.WriteFile(checkFilePath, []byte(time.Now().Format(time.RFC3339)), 0644)
}

// fetchLatestRelease fetches the latest release metadata from the GitHub API.
func fetchLatestRelease() (*GitHubRelease, error) {
	url := fmt.Sprintf("%s/repos/%s/%s/releases/latest", githubAPIURL, githubOwner, githubRepo)
	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "LTTH-Launcher/1.0")

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

// compareVersions compares two semantic version strings.
// Returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal.
func compareVersions(v1, v2 string) int {
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
			numStr := strings.Split(parts1[i], "-")[0]
			n1, _ = strconv.Atoi(numStr)
		}
		if i < len(parts2) {
			numStr := strings.Split(parts2[i], "-")[0]
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

func extractAppSubdirFromGitHubZip(zipPath, destDir string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	cleanDest, err := filepath.Abs(destDir)
	if err != nil {
		return err
	}
	foundApp := false
	for _, f := range r.File {
		name := filepath.ToSlash(f.Name)
		parts := strings.SplitN(name, "/", 3)
		if len(parts) < 3 || parts[1] != "app" {
			continue
		}
		relPath := parts[2]
		if relPath == "" {
			continue
		}
		foundApp = true
		targetPath, err := filepath.Abs(filepath.Join(cleanDest, filepath.FromSlash(relPath)))
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(cleanDest, targetPath)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) || filepath.IsAbs(rel) {
			return fmt.Errorf("illegal file path in update archive: %s", f.Name)
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(targetPath, 0755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, f.Mode())
		if err != nil {
			rc.Close()
			return err
		}
		_, copyErr := io.Copy(out, rc)
		closeErr := out.Close()
		rc.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	if !foundApp {
		return fmt.Errorf("update archive did not contain app/")
	}
	return nil
}

// downloadAndApplyUpdate downloads the zipball of the given release and applies
// it by replacing the app/ directory (with backup + rollback on failure).
func (l *Launcher) downloadAndApplyUpdate(release *GitHubRelease) error {
	if release == nil {
		return fmt.Errorf("release is required")
	}
	if strings.TrimSpace(release.ZipballURL) == "" {
		return fmt.Errorf("release %s does not include a zipball URL", release.TagName)
	}
	if l.isNodeRunning() || l.serverStarted || l.startupInProgress {
		return fmt.Errorf("stop the server before applying an update")
	}

	runtimeDir := filepath.Join(l.exeDir, "runtime")
	os.MkdirAll(runtimeDir, 0755)

	zipDest := filepath.Join(runtimeDir, "update_download.zip")
	l.logAndSync("[INFO] Downloading update %s from %s", release.TagName, release.ZipballURL)
	l.updateProgressLocalized(6, "status.update_downloading", "Lade Update %s herunter...", release.TagName)

	if err := l.downloadFileHTTP(release.ZipballURL, zipDest); err != nil {
		return fmt.Errorf("update download failed: %v", err)
	}
	defer os.Remove(zipDest)

	l.logAndSync("[INFO] Applying update %s...", release.TagName)
	l.updateProgressLocalized(8, "status.update_applying", "Installiere Update %s...", release.TagName)

	appDir := l.appDir
	backupDir := filepath.Join(runtimeDir, "update_backups", time.Now().Format("2006-01-02_15-04-05")+"-"+strings.TrimPrefix(release.TagName, "v"), "app")

	// Backup existing app/
	os.RemoveAll(backupDir)
	if _, err := os.Stat(appDir); err == nil {
		if err := os.MkdirAll(filepath.Dir(backupDir), 0755); err != nil {
			return fmt.Errorf("backup directory creation failed: %v", err)
		}
		if err := os.Rename(appDir, backupDir); err != nil {
			return fmt.Errorf("backup of app/ failed: %v", err)
		}
	}

	if err := os.MkdirAll(appDir, 0755); err != nil {
		_ = os.Rename(backupDir, appDir)
		return fmt.Errorf("cannot create app/ dir: %v", err)
	}

	if err := extractAppSubdirFromGitHubZip(zipDest, appDir); err != nil {
		os.RemoveAll(appDir)
		_ = os.Rename(backupDir, appDir)
		return fmt.Errorf("update extraction failed: %v", err)
	}

	// Success – remove backup
	if _, err := os.Stat(filepath.Join(appDir, "package.json")); err != nil {
		os.RemoveAll(appDir)
		_ = os.Rename(backupDir, appDir)
		return fmt.Errorf("update payload is missing app/package.json: %v", err)
	}

	// Write version
	if err := writeLocalVersion(release.TagName); err != nil {
		l.logAndSync("[WARNING] Could not write version file: %v", err)
	}

	// Re-run npm install if node_modules is missing
	if _, err := os.Stat(filepath.Join(appDir, "node_modules")); os.IsNotExist(err) {
		l.logAndSync("[INFO] node_modules missing after update, running npm install...")
		l.updateProgressLocalized(9, "status.update_npm_install", "npm install nach Update...")
		if err := l.installDependencies(); err != nil {
			l.logAndSync("[WARNING] npm install after update failed: %v", err)
		}
	}

	l.logAndSync("[SUCCESS] Update %s applied", release.TagName)
	return nil
}

// createDesktopShortcut creates a .lnk shortcut on the Windows Desktop (once).
func (l *Launcher) createDesktopShortcut() {
	if runtime.GOOS != "windows" {
		return
	}
	exePath, err := os.Executable()
	if err != nil {
		return
	}
	desktop := filepath.Join(os.Getenv("USERPROFILE"), "Desktop", "LTTH.lnk")
	if _, err := os.Stat(desktop); err == nil {
		return // already exists
	}
	script := fmt.Sprintf(`
$s = (New-Object -COM WScript.Shell).CreateShortcut('%s')
$s.TargetPath = '%s'
$s.WorkingDirectory = '%s'
$s.Description = "PupCid's Little TikTool Helper"
$s.Save()
`, desktop, exePath, filepath.Dir(exePath))
	tmp := filepath.Join(l.exeDir, "_sc.ps1")
	if err := os.WriteFile(tmp, []byte(script), 0644); err != nil {
		return
	}
	hiddenCommand("powershell", "-ExecutionPolicy", "Bypass", "-NonInteractive", "-File", tmp).Run()
	os.Remove(tmp)
	l.logAndSync("[INFO] Desktop shortcut created: %s", desktop)
}

func (l *Launcher) startTrayMenu(launcherURL string) {
	if os.Getenv("LTTH_DISABLE_TRAY") == "true" {
		l.logAndSync("[INFO] Tray menu disabled by LTTH_DISABLE_TRAY=true")
		return
	}

	go systray.Run(func() {
		systray.SetTitle("LTTH")
		systray.SetTooltip("PupCid's Little TikTool Helper")
		for _, iconPath := range []string{
			filepath.Join(l.exeDir, "build-src", "icon.ico"),
			filepath.Join(l.exeDir, "icon.ico"),
		} {
			if data, err := os.ReadFile(iconPath); err == nil {
				systray.SetIcon(data)
				break
			}
		}

		openLauncher := systray.AddMenuItem("Launcher öffnen", "Launcher UI im Browser öffnen")
		openDashboard := systray.AddMenuItem("Dashboard öffnen", "LTTH Dashboard öffnen")
		startServer := systray.AddMenuItem("Server starten", "Server mit dem gespeicherten Port starten")
		stopServer := systray.AddMenuItem("Server stoppen", "Node.js Server stoppen")
		safeMode := systray.AddMenuItemCheckbox("Safe Mode", "Plugins beim Start deaktivieren", l.settings.SafeMode)
		exportDiagnostics := systray.AddMenuItem("Diagnosepaket exportieren", "Logs und Status als ZIP schreiben")
		systray.AddSeparator()
		quit := systray.AddMenuItem("Beenden", "Launcher und verwalteten Server beenden")

		go func() {
			for {
				select {
				case <-openLauncher.ClickedCh:
					_ = browser.OpenURL(launcherURL)
				case <-openDashboard.ClickedCh:
					port := l.serverPort
					if port == 0 {
						port = l.readRuntimePortFile()
					}
					if port == 0 {
						if detected, ok := l.detectHealthyServerPort(); ok {
							port = detected
						}
					}
					if port > 0 {
						_ = browser.OpenURL(dashboardURL(port))
					} else {
						_ = browser.OpenURL(launcherURL)
					}
				case <-startServer.ClickedCh:
					go func() {
						if err := l.manualStartServer(l.preferredPort); err != nil {
							l.logAndSync("[TRAY] Server start failed: %v", err)
						}
					}()
				case <-stopServer.ClickedCh:
					l.killNodeProcess()
					if _, err := l.stopDetectedLTTHServers("TRAY"); err != nil {
						l.logAndSync("[TRAY] Server stop failed: %v", err)
					}
				case <-safeMode.ClickedCh:
					settings := l.settings
					settings.SafeMode = !settings.SafeMode
					if err := l.saveSettings(settings); err != nil {
						l.logAndSync("[TRAY] Could not save safe mode: %v", err)
						continue
					}
					if settings.SafeMode {
						safeMode.Check()
					} else {
						safeMode.Uncheck()
					}
				case <-exportDiagnostics.ClickedCh:
					if path, err := l.exportDiagnosticPackage(); err != nil {
						l.logAndSync("[TRAY] Diagnostic export failed: %v", err)
					} else {
						l.logAndSync("[TRAY] Diagnostic export written: %s", path)
					}
				case <-quit.ClickedCh:
					l.killNodeProcess()
					l.closeLogging()
					systray.Quit()
					os.Exit(0)
				}
			}
		}()
	}, func() {
		l.logAndSync("[INFO] Tray menu stopped")
	})
}

func (l *Launcher) runLauncher() {
	time.Sleep(1 * time.Second) // Give browser time to load

	// Phase 0: App auto-update is intentionally disabled.
	l.updateProgressLocalized(0, "status.update_disabled", "App Auto-Update deaktiviert")
	l.logAndSync("[Phase 0] App auto-update disabled; startup will not download GitHub releases.")
	time.Sleep(300 * time.Millisecond)
	time.Sleep(300 * time.Millisecond)

	// Phase 1: Check / Install / Update Node.js (10–30%)
	l.updateProgressLocalized(10, "status.checking_nodejs", "Prüfe Node.js Installation...")
	l.logAndSync("[Phase 1] Checking Node.js installation...")
	time.Sleep(500 * time.Millisecond)

	err := l.checkNodeJS()
	if err != nil {
		l.logAndSync("[ERROR] Node.js check/install failed: %v", err)
		l.updateProgressLocalized(10, "status.nodejs_missing", "FEHLER: Node.js konnte nicht installiert werden!")
		time.Sleep(5 * time.Second)
		l.closeLogging()
		os.Exit(1)
	}

	l.updateProgressLocalized(20, "status.nodejs_found", "Node.js gefunden...")
	l.logAndSync("[SUCCESS] Node.js found at: %s", l.nodePath)
	time.Sleep(300 * time.Millisecond)

	// Do not auto-update the portable Node.js runtime on startup.
	nodeWasUpdated := false
	if strings.Contains(l.nodePath, filepath.Join("runtime", "node")) {
		l.logAndSync("[INFO] Portable Node.js auto-update disabled; using installed Node.js.")
	}

	version := l.getNodeVersion()
	l.updateProgressLocalized(29, "status.nodejs_version", "Node.js Version: %s", version)
	l.logger.Printf("[INFO] Node.js version: %s\n", version)
	time.Sleep(300 * time.Millisecond)

	// Phase 2: Find directories (30–35%)
	l.updateProgressLocalized(30, "status.checking_app_dir", "Prüfe App-Verzeichnis...")
	l.logger.Printf("[Phase 2] Checking app directory: %s\n", l.appDir)
	time.Sleep(300 * time.Millisecond)

	if _, err := os.Stat(l.appDir); os.IsNotExist(err) {
		l.logger.Printf("[ERROR] App directory not found: %s\n", l.appDir)
		l.updateProgressLocalized(30, "status.app_dir_missing", "FEHLER: app Verzeichnis nicht gefunden")
		time.Sleep(5 * time.Second)
		l.closeLogging()
		os.Exit(1)
	}

	l.updateProgressLocalized(35, "status.app_dir_found", "App-Verzeichnis gefunden...")
	l.logger.Printf("[SUCCESS] App directory exists: %s\n", l.appDir)
	time.Sleep(300 * time.Millisecond)

	// Phase 3: Check and install dependencies (35–80%)
	l.updateProgressLocalized(35, "status.checking_dependencies", "Prüfe Abhängigkeiten...")
	l.logger.Println("[Phase 3] Checking dependencies...")
	time.Sleep(300 * time.Millisecond)

	if !l.checkNodeModules() {
		l.updateProgressLocalized(40, "status.installing_dependencies", "Installiere Abhängigkeiten...")
		l.logger.Println("[INFO] node_modules not found, installing dependencies...")
		time.Sleep(500 * time.Millisecond)
		l.updateProgressLocalized(45, "status.installation_hint", "HINWEIS: npm install kann einige Minuten dauern, bitte das Fenster offen halten und warten")

		err = l.installDependencies()
		if err != nil {
			l.logger.Printf("[ERROR] Dependency installation failed: %v\n", err)
			l.updateProgressLocalized(45, "status.installation_failed", "FEHLER: %v", err)
			time.Sleep(5 * time.Second)
			l.closeLogging()
			os.Exit(1)
		}

		l.updateProgressLocalized(80, "status.installation_done", "Installation abgeschlossen!")
		l.logger.Println("[SUCCESS] Dependencies installed successfully")
	} else if nodeWasUpdated {
		// Node.js was updated → rebuild native modules
		l.updateProgressLocalized(40, "status.rebuilding_native", "Baue native Module neu (better-sqlite3)...")
		l.logger.Println("[INFO] Node.js was updated, rebuilding native modules...")
		if err := l.rebuildNativeModules(); err != nil {
			l.logger.Printf("[WARNING] Native module rebuild failed: %v\n", err)
		}
		l.updateProgressLocalized(80, "status.dependencies_installed", "Abhängigkeiten geprüft...")
	} else {
		l.updateProgressLocalized(80, "status.dependencies_installed", "Abhängigkeiten bereits installiert...")
		l.logger.Println("[INFO] Dependencies already installed")
	}
	time.Sleep(300 * time.Millisecond)

	l.updateProgressLocalized(81, "status.checking_native_modules", "Prüfe native Node-Module...")
	l.logger.Println("[Phase 3.1] Verifying native Node modules...")
	if err := l.verifyNativeModules(); err != nil {
		l.logAndSync("[WARNING] Native module verification failed: %v", err)
		l.updateProgressLocalized(82, "status.rebuilding_native", "Baue native Module neu (better-sqlite3)...")
		if rebuildErr := l.rebuildNativeModules(); rebuildErr != nil {
			l.logAndSync("[WARNING] Native module rebuild failed: %v", rebuildErr)
			l.updateProgressLocalized(83, "status.reinstalling_dependencies", "Installiere Abhängigkeiten neu...")
			if installErr := l.installDependencies(); installErr != nil {
				l.logAndSync("[ERROR] Dependency reinstall after native module failure failed: %v", installErr)
				l.updateProgressLocalized(95, "status.installation_failed", "FEHLER: %v", installErr)
				time.Sleep(5 * time.Second)
				l.closeLogging()
				os.Exit(1)
			}
		}
		if verifyErr := l.verifyNativeModules(); verifyErr != nil {
			l.logAndSync("[ERROR] Native modules still fail after repair: %v", verifyErr)
			l.updateProgressLocalized(95, "status.native_modules_failed", "Native Module konnten nicht repariert werden")
			time.Sleep(5 * time.Second)
			l.closeLogging()
			os.Exit(1)
		}
	}

	// Phase 3.5: Auto-fix common issues (80-89%)
	l.updateProgressLocalized(82, "status.checking_config", "Prüfe Konfiguration...")
	l.logger.Println("[Phase 3.5] Auto-fixing common issues...")
	time.Sleep(300 * time.Millisecond)

	// Auto-fix: Create .env file if missing
	if err := l.autoFixEnvFile(); err != nil {
		l.logger.Printf("[WARNING] Could not auto-create .env: %v\n", err)
	}

	// Startup policy: replace old LTTH servers and launch fresh on port 3000.
	if stopped, err := l.prepareFreshBackendStartup("STARTUP"); err != nil {
		l.logAndSync("[ERROR] Could not prepare fresh backend startup: %v", err)
		l.updateProgressLocalized(95, "status.stop_old_instance_failed", "Alte Server-Instanz konnte nicht gestoppt werden: %v", err)
		l.updateProgressLocalized(100, "status.manual_start_available", "Manueller Start ist im Launcher verfügbar. Logs prüfen und Port wählen.")
		return
	} else if stopped {
		l.updateProgressLocalized(86, "status.old_instance_stopped", "Alte Server-Instanz gestoppt.")
		time.Sleep(500 * time.Millisecond)
	}

	// Auto-fix: Check port availability
	l.autoFixPort()

	// Auto-fix: Install yt-dlp if missing
	l.autoFixYtDlp()

	l.updateProgressLocalized(89, "status.config_ok", "Konfiguration geprüft!")
	time.Sleep(300 * time.Millisecond)

	// Phase 4: Start tool (89-100%)
	l.updateProgressLocalized(90, "status.starting_tool", "Starte Tool...")
	l.logger.Println("[Phase 4] Starting Node.js server...")
	time.Sleep(500 * time.Millisecond)

	if stopped, err := l.stopDetectedLTTHServers("STARTUP"); err != nil {
		l.logAndSync("[ERROR] Could not stop existing LTTH server before startup: %v", err)
		l.updateProgressLocalized(95, "status.stop_old_instance_failed", "Alte Server-Instanz konnte nicht gestoppt werden: %v", err)
		l.updateProgressLocalized(100, "status.manual_start_available", "Manueller Start ist im Launcher verfügbar. Logs prüfen und Port wählen.")
		return
	} else if stopped {
		l.updateProgressLocalized(90, "status.old_instance_stopped", "Alte Server-Instanz gestoppt.")
		time.Sleep(500 * time.Millisecond)
	}

	// Start the tool
	l.startMu.Lock()
	l.startupInProgress = true
	l.lastStartError = ""
	l.serverStarted = false
	l.startMu.Unlock()

	startedAt := time.Now()
	cmd, err := l.startTool()
	if err != nil {
		l.logger.Printf("[ERROR] Failed to start server: %v\n", err)
		l.markServerStartDone(err)
		l.updateProgressLocalized(90, "status.start_error", "FEHLER beim Starten: %v", err)
		l.updateProgressLocalized(90, "status.check_logs", "Prüfe bitte die Log-Dateien im logs/ Ordner für Details.")
		l.updateProgressLocalized(100, "status.manual_start_available", "Manueller Start ist im Launcher verfügbar. Logs prüfen und Port wählen.")
		return
	}

	// Monitor if the process exits prematurely
	processDied := make(chan error, 1)
	go func() {
		waitErr := cmd.Wait()
		l.nodeMu.Lock()
		if l.nodeCmd == cmd {
			l.nodeCmd = nil
		}
		l.nodeMu.Unlock()
		processDied <- waitErr
	}()

	// Wait for server to be ready
	l.updateProgressLocalized(93, "status.waiting_for_server_start", "Warte auf Server-Start...")
	l.logger.Printf("[INFO] Waiting for server health check (%ds timeout)...\n", serverHealthTimeoutSeconds)
	l.logger.Println("[INFO] Checking if server responds on the fresh runtime port file (fixed startup port 3000)...")

	// Check server health with process monitoring
	healthCheckTimeout := time.After(serverHealthTimeout)
	healthCheckTicker := time.NewTicker(1 * time.Second)
	defer healthCheckTicker.Stop()

	serverReady := false
	attemptCount := 0
	lastLogTime := time.Now()

	for !serverReady {
		select {
		case err := <-processDied:
			// Process exited before server was ready
			// Ensure log file is flushed to capture all server output
			if l.logFile != nil {
				l.logFile.Sync()
				time.Sleep(100 * time.Millisecond) // Give a moment for any buffered writes
			}

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
				l.updateProgressLocalized(95, "status.env_restart", "🔄 .env erstellt - starte Server neu...")
				time.Sleep(3 * time.Second)

				// Mark that we already tried the fix
				l.envFileFixed = false

				// Start server again
				startedAt = time.Now()
				cmd, err = l.startTool()
				if err != nil {
					l.logAndSync("[ERROR] Retry failed to start server: %v", err)
				} else {
					// Monitor the restarted process
					go func() {
						waitErr := cmd.Wait()
						l.nodeMu.Lock()
						if l.nodeCmd == cmd {
							l.nodeCmd = nil
						}
						l.nodeMu.Unlock()
						processDied <- waitErr
					}()

					l.updateProgressLocalized(96, "status.server_restart_wait", "🔄 Server neugestartet - warte auf Antwort...")
					l.logAndSync("[INFO] Server restarted after .env fix - waiting for health check...")

					// Reset the ticker for another try
					continue
				}
			}

			l.updateProgressLocalized(95, "status.server_failed_start", "⚠️ Server konnte nicht starten!")
			time.Sleep(2 * time.Second)
			l.updateProgressLocalized(96, "status.auto_fixes_done", "📋 Alle Auto-Fixes wurden versucht")
			time.Sleep(2 * time.Second)
			l.updateProgressLocalized(97, "status.check_launcher_logs", "💡 Prüfe logs/launcher_*.log für Details")
			time.Sleep(2 * time.Second)
			l.updateProgressLocalized(98, "status.manual_install_hint", "💡 Oder führe manuell: cd app && npm install")
			time.Sleep(2 * time.Second)
			l.updateProgressLocalized(99, "status.port_check_hint", "💡 Oder prüfe ob Port 3000 frei ist")
			time.Sleep(2 * time.Second)
			l.markServerStartDone(fmt.Errorf("node process exited before ready: %v", err))
			l.updateProgressLocalized(100, "status.manual_start_available", "Manueller Start ist im Launcher verfügbar. Logs prüfen und Port wählen.")
			return
		case <-healthCheckTicker.C:
			attemptCount++

			// Log progress every 5 seconds
			if time.Since(lastLogTime) >= 5*time.Second {
				l.logger.Printf("[INFO] Health check attempt %d (waiting for server to respond)...\n", attemptCount)
				l.updateProgressLocalized(waitingAttemptProgress(attemptCount), "status.waiting_attempt", "Warte auf Server... (Versuch %d)", attemptCount)
				lastLogTime = time.Now()
			}

			if port, ok := l.detectRuntimeServerPortSince(startedAt); ok {
				l.serverPort = port
				resolvedPort := l.serverPort
				l.logger.Printf("[SUCCESS] Server responded on port %d!\n", resolvedPort)
				l.serverPort = resolvedPort
				l.serverStarted = true
				l.markServerStartDone(nil)
				serverReady = true
			}
		case <-healthCheckTimeout:
			l.logger.Printf("[ERROR] Server health check timed out after %d seconds\n", serverHealthTimeoutSeconds)
			l.logger.Println("[ERROR] Server did not respond. Check the log above for error messages.")
			l.logger.Println("[ERROR] ===========================================")
			l.logger.Println("[ERROR] Mögliche Probleme:")
			l.logger.Println("[ERROR]  - Server startet, aber hängt sich bei Initialisierung auf")
			l.logger.Println("[ERROR]  - Dependencies werden geladen (kann lange dauern)")
			l.logger.Println("[ERROR]  - Datenbank-Migration läuft")
			l.logger.Println("[ERROR]  - Port 3000 ist blockiert durch Firewall oder einen anderen Prozess")
			l.logger.Println("[ERROR] ===========================================")

			l.updateProgressLocalized(95, "status.server_timeout", "Server-Start Timeout (%ds)", serverHealthTimeoutSeconds)
			time.Sleep(2 * time.Second)
			l.updateProgressLocalized(96, "status.server_no_response", "📋 Server antwortet nicht - prüfe logs/")
			time.Sleep(2 * time.Second)
			l.updateProgressLocalized(97, "status.server_maybe_running", "💡 Server läuft evtl. noch im Hintergrund")
			time.Sleep(2 * time.Second)
			l.updateProgressLocalized(98, "status.wait_manual_open", fmt.Sprintf("💡 Warte 2-3 Minuten und öffne localhost:%d", getCurrentNodePort()))
			time.Sleep(2 * time.Second)
			l.markServerStartDone(fmt.Errorf("server health check timed out after %d seconds", serverHealthTimeoutSeconds))
			l.updateProgressLocalized(100, "status.manual_start_available", "Manueller Start ist im Launcher verfügbar. Logs prüfen und Port wählen.")
			return
		}
	}

	l.updateProgressLocalized(100, "status.server_started", "Server erfolgreich gestartet!")
	l.logger.Println("[SUCCESS] Server is running and healthy!")
	time.Sleep(500 * time.Millisecond)
	l.updateProgressLocalized(100, "status.redirecting_dashboard", "Weiterleitung zum Dashboard...")
	l.logger.Println("[INFO] Redirecting to dashboard...")
	time.Sleep(500 * time.Millisecond)
	l.sendRedirect()

	// Warte bis Node-Prozess endet (bleibt offen solange App läuft).
	// Das verhindert, dass der Launcher-Prozess einfach stirbt und Node als Zombie weiterläuft.
	if l.logger != nil {
		l.logger.Println("[INFO] Server running. Launcher stays alive to manage Node process lifecycle.")
		l.logger.Println("[INFO] Close this launcher window to also stop the Node.js server.")
	}

	// Blockiere hier bis Node sich selbst beendet (z.B. nach Restart/Exit-Code 75)
	exitStatus := <-processDied
	if l.logger != nil {
		l.logger.Printf("[INFO] Node.js process exited: %v\n", exitStatus)
	}
	l.serverStarted = false

	l.closeLogging()
	os.Exit(0)
}

// parseChangelogToHTML converts markdown changelog to HTML
func parseChangelogToHTML(markdown string) string {
	lines := strings.Split(markdown, "\n")
	var html strings.Builder
	inList := false

	// Only show the first 50 lines (recent changes)
	maxLines := 50
	if len(lines) > maxLines {
		lines = lines[:maxLines]
	}

	for _, line := range lines {
		line = strings.TrimRight(line, "\r")

		// Skip the title and format line
		if strings.HasPrefix(line, "# Changelog") {
			continue
		}
		if strings.HasPrefix(line, "All notable changes") {
			continue
		}
		if strings.HasPrefix(line, "The format is") {
			continue
		}

		// Handle headers
		if strings.HasPrefix(line, "## ") {
			if inList {
				html.WriteString("</ul>")
				inList = false
			}
			version := strings.TrimPrefix(line, "## ")
			html.WriteString(fmt.Sprintf("<div class='changelog-version'>%s</div>", template.HTMLEscapeString(version)))
		} else if strings.HasPrefix(line, "### ") {
			if inList {
				html.WriteString("</ul>")
				inList = false
			}
			title := strings.TrimPrefix(line, "### ")
			html.WriteString(fmt.Sprintf("<h3>%s</h3>", template.HTMLEscapeString(title)))
		} else if strings.HasPrefix(line, "- ") {
			if !inList {
				html.WriteString("<ul>")
				inList = true
			}
			item := strings.TrimPrefix(line, "- ")
			// Handle bold text **text** by replacing pairs of **
			for strings.Contains(item, "**") {
				// Find first pair and replace
				firstPos := strings.Index(item, "**")
				if firstPos != -1 {
					// Replace first ** with <strong>
					item = item[:firstPos] + "<strong>" + item[firstPos+2:]
					// Find next ** and replace with </strong>
					secondPos := strings.Index(item[firstPos:], "**")
					if secondPos != -1 {
						actualPos := firstPos + secondPos
						item = item[:actualPos] + "</strong>" + item[actualPos+2:]
					} else {
						// Unmatched **, revert the change
						item = strings.Replace(item, "<strong>", "**", 1)
						break
					}
				} else {
					break
				}
			}
			html.WriteString(fmt.Sprintf("<li>%s</li>", item))
		} else if strings.TrimSpace(line) == "" {
			if inList {
				html.WriteString("</ul>")
				inList = false
			}
		} else if !strings.HasPrefix(line, "[") {
			// Regular paragraph
			if inList {
				html.WriteString("</ul>")
				inList = false
			}
			if strings.TrimSpace(line) != "" {
				html.WriteString(fmt.Sprintf("<p>%s</p>", template.HTMLEscapeString(line)))
			}
		}
	}

	if inList {
		html.WriteString("</ul>")
	}

	return html.String()
}

func main() {
	launcher := NewLauncher()
	defer func() {
		if recovered := recover(); recovered != nil {
			if launcher.logger != nil {
				launcher.logAndSync("[FATAL] Launcher panic: %v", recovered)
				launcher.logAndSync("[FATAL] Stack trace:\n%s", string(debug.Stack()))
				launcher.closeLogging()
			}
			os.Exit(1)
		}
	}()

	// Get executable directory
	exePath, err := os.Executable()
	if err != nil {
		log.Fatal("Kann Programmverzeichnis nicht ermitteln:", err)
	}

	exeDir := filepath.Dir(exePath)
	launcher.exeDir = exeDir
	launcher.appDir = filepath.Join(exeDir, "app")

	// Template path with fallback (development vs. installed)
	templatePath := filepath.Join(exeDir, "build-src", "assets", "launcher.html")
	if _, err := os.Stat(templatePath); os.IsNotExist(err) {
		templatePath = filepath.Join(exeDir, "assets", "launcher.html")
	}

	// Setup logging immediately
	if err := launcher.setupLogging(launcher.appDir); err != nil {
		// If logging fails, create a fallback logger that does nothing
		// (since stdout doesn't exist in GUI mode)
		launcher.logger = log.New(io.Discard, "", log.LstdFlags)
	}

	launcher.logStartupPreflight(templatePath)
	launcher.loadSettings()
	launcher.logAndSync("[INFO] Launcher settings loaded: locale=%s theme=%s port=%d safeMode=%v updateChannel=%s",
		launcher.settings.Locale,
		launcher.settings.Theme,
		launcher.settings.PreferredPort,
		launcher.settings.SafeMode,
		launcher.settings.UpdateChannel)

	// Keep startup offline and deterministic. Portable Node auto-update is disabled,
	// so resolving the latest LTS from the network only delays diagnostics on broken systems.
	launcher.resolvedNodeVersion = nodeVersionFallback
	launcher.logAndSync("[INFO] Node.js fallback/runtime version target: %s", launcher.resolvedNodeVersion)

	// Resolve persistent config paths and ensure user_configs exists
	launcher.initConfigPaths()

	// Load user profiles
	launcher.loadUserProfiles()

	// Load default translations so status updates can use them immediately
	launcher.loadTranslations(launcher.locale)
	launcher.statusKey = "status.initializing"
	launcher.statusFallback = "Initialisiere..."
	launcher.status = launcher.translateStatus("status.initializing", "Initialisiere...")

	// Setup HTTP server
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Get language from query parameter or use default
		lang := r.URL.Query().Get("lang")
		if lang == "" {
			lang = launcher.settings.Locale
		} else {
			valid := false
			for _, l := range allowedLocales {
				if lang == l {
					valid = true
					break
				}
			}
			if valid {
				launcher.locale = lang
				settings := launcher.settings
				settings.Locale = lang
				_ = launcher.saveSettings(settings)
			} else {
				lang = launcher.locale
			}
		}

		// Get theme from query parameter (default to night)
		theme := r.URL.Query().Get("theme")
		switch theme {
		case "day", "night", "highcontrast":
			settings := launcher.settings
			settings.Theme = theme
			_ = launcher.saveSettings(settings)
		default:
			theme = launcher.settings.Theme
			if !validTheme(theme) {
				theme = "night"
			}
		}

		// Load translations
		launcher.loadTranslations(lang)
		launcher.status = launcher.currentStatus()

		// Reload profiles if they haven't been loaded recently (cache for 5 seconds)
		if time.Since(launcher.profilesLoaded) > 5*time.Second {
			launcher.loadUserProfiles()
		}

		// Parse template
		tmpl, err := template.ParseFiles(templatePath)
		if err != nil {
			launcher.logAndSync("[ERROR] Could not load template: %v", err)
			http.Error(w, "Template error", http.StatusInternalServerError)
			return
		}

		// Prepare template data
		localVer, err := getLocalVersion()
		if err != nil || localVer == "" {
			localVer = "–"
		}
		data := map[string]interface{}{
			"AppName":            launcher.getTranslation("app_name"),
			"TagLine":            "Open-Source TikTok LIVE Tool",
			"Locale":             lang,
			"Version":            localVer,
			"HasProfiles":        len(launcher.profiles) > 0,
			"Profiles":           launcher.profiles,
			"ProfileLabel":       launcher.getTranslation("profile.title"),
			"NoProfilesText":     launcher.getTranslation("profile.no_profiles"),
			"TabChangelog":       launcher.getTranslation("tabs.changelog"),
			"TabApiKeys":         launcher.getTranslation("tabs.api_keys"),
			"TabCommunity":       launcher.getTranslation("tabs.community"),
			"StatusTitle":        launcher.getTranslation("status.progress"),
			"StatusInitializing": launcher.getTranslation("status.initializing"),
			"ChangelogTitle":     launcher.getTranslation("changelog.title"),
			"ChangelogLoading":   launcher.getTranslation("changelog.loading"),
			"ChangelogError":     launcher.getTranslation("changelog.error"),
			"ApiKeysTitle":       launcher.getTranslation("api_keys.title"),
			"ApiKeysIntro":       launcher.getTranslation("api_keys.intro"),
			"MandatoryWarning":   launcher.getTranslation("api_keys.mandatory_warning"),
			"FallbackWarning":    launcher.getTranslation("api_keys.fallback_warning"),
			"ElevenLabsDesc":     launcher.getTranslation("api_keys.elevenlabs.description"),
			"OpenAIDesc":         launcher.getTranslation("api_keys.openai.description"),
			"SiliconFlowDesc":    launcher.getTranslation("api_keys.siliconflow.description"),
			"FishAudioDesc":      launcher.getTranslation("api_keys.fishAudio.description"),
			"CommunityTitle":     launcher.getTranslation("community.title"),
			"CommunityIntro":     launcher.getTranslation("community.intro"),
			"HelpAppreciated":    launcher.getTranslation("community.help_appreciated"),
			"LinkRepo":           launcher.getTranslation("community.links.repo"),
			"LinkDiscussions":    launcher.getTranslation("community.links.discussions"),
			"LinkIssues":         launcher.getTranslation("community.links.issues"),
			"LinkDiscord":        launcher.getTranslation("community.links.discord"),
			"ContributeQuestion": launcher.getTranslation("community.contribute"),
			"ContributeText":     launcher.getTranslation("community.contribute_text"),
			"PoweredBy":          launcher.getTranslation("footer.powered_by"),
			"ThemeLabel":         launcher.getTranslation("theme.label"),
			"ThemeDay":           launcher.getTranslation("theme.daymode"),
			"ThemeNight":         launcher.getTranslation("theme.nightmode"),
			"ThemeHighContrast":  launcher.getTranslation("theme.highcontrast"),
			"KeepOpenLabel":      launcher.getTranslation("options.keep_open"),
			"KeepOpenHint":       launcher.getTranslation("options.keep_open_hint"),
			"OpenAppLabel":       launcher.getTranslation("options.open_app"),
			"AppNotReady":        launcher.getTranslation("options.app_not_ready"),
			"AppReady":           launcher.getTranslation("options.app_ready"),
			"TabLogs":            launcher.getTranslation("tabs.logging"),
			"LogsTitle":          launcher.getTranslation("logs.title"),
			"LogsIntro":          launcher.getTranslation("logs.intro"),
			"LogsLoading":        launcher.getTranslation("logs.loading"),
			"LogsEmpty":          launcher.getTranslation("logs.empty"),
			"LogsError":          launcher.getTranslation("logs.error"),
			"CurrentTheme":       theme,
			"KeepLauncherOpen":   launcher.settings.KeepLauncherOpen,
			"SafeMode":           launcher.settings.SafeMode,
			"UpdateChannel":      launcher.settings.UpdateChannel,
			"FirstRunComplete":   launcher.settings.FirstRunComplete,
		}

		tmpl.Execute(w, data)
	})

	http.HandleFunc("/logo", func(w http.ResponseWriter, r *http.Request) {
		// Get theme from query parameter (default: night)
		theme := r.URL.Query().Get("theme")
		if theme == "" {
			theme = "night"
		}

		for _, logoPath := range []string{
			filepath.Join(launcher.exeDir, "build-src", "assets", "launcher-logo.png"),
			filepath.Join(launcher.exeDir, "assets", "launcher-logo.png"),
		} {
			if info, err := os.Stat(logoPath); err == nil && !info.IsDir() {
				http.ServeFile(w, r, logoPath)
				return
			}
		}

		// Determine logo path based on theme
		var themeLogoPath string
		switch theme {
		case "day":
			themeLogoPath = filepath.Join(launcher.appDir, "public", "ltthlogo_daymode.png")
		case "highcontrast":
			themeLogoPath = filepath.Join(launcher.appDir, "public", "ltthlogo_night-highcontrast-mode.png")
		default: // night
			themeLogoPath = filepath.Join(launcher.appDir, "public", "ltthlogo_nightmode.png")
		}

		http.ServeFile(w, r, themeLogoPath)
	})

	http.HandleFunc("/logs", func(w http.ResponseWriter, r *http.Request) {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}

		ip := net.ParseIP(host)
		if ip == nil || !ip.IsLoopback() {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}

		var parts []string

		// Include launcher log if available
		if launcher.logFile != nil {
			if content, err := launcher.readLogContent(launcher.logFile.Name()); err == nil {
				parts = append(parts, fmt.Sprintf("=== Launcher Log ===\n%s", content))
			} else if launcher.logger != nil {
				launcher.logger.Printf("[WARNING] Could not read launcher log: %v\n", err)
			}
		}

		// Include server log (latest app log) if available
		serverLogPath := launcher.findLatestServerLog()
		if serverLogPath != "" && (launcher.logFile == nil || filepath.Clean(serverLogPath) != filepath.Clean(launcher.logFile.Name())) {
			if content, err := launcher.readLogContent(serverLogPath); err == nil {
				parts = append(parts, fmt.Sprintf("=== Server Log (%s) ===\n%s", filepath.Base(serverLogPath), content))
			} else if launcher.logger != nil {
				launcher.logger.Printf("[WARNING] Could not read server log: %v\n", err)
			}
		}

		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		if len(parts) == 0 {
			w.WriteHeader(http.StatusOK)
			return
		}

		w.Write([]byte(strings.Join(parts, "\n\n")))
	})

	http.HandleFunc("/api/launcher/status", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, launcher.statusPayload())
	})

	http.HandleFunc("/api/launcher/settings", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case "GET":
			writeJSON(w, map[string]interface{}{"success": true, "settings": launcher.settings})
		case "POST":
			settings, err := launcher.updateSettingsFromRequest(r)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if err := launcher.saveSettings(settings); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			writeJSON(w, map[string]interface{}{"success": true, "settings": launcher.settings})
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	http.HandleFunc("/api/launcher/diagnostics", func(w http.ResponseWriter, r *http.Request) {
		if !methodAllowed(w, r, "GET") {
			return
		}
		launcher.refreshPluginFailuresFromLogs()
		writeJSON(w, map[string]interface{}{
			"success":        true,
			"diagnostics":    launcher.collectDiagnostics(),
			"pluginFailures": launcher.pluginFailures,
		})
	})

	http.HandleFunc("/api/launcher/fix", func(w http.ResponseWriter, r *http.Request) {
		if !methodAllowed(w, r, "POST") {
			return
		}
		action := strings.TrimSpace(r.URL.Query().Get("action"))
		if action == "" {
			http.Error(w, "missing action", http.StatusBadRequest)
			return
		}
		result, err := launcher.applyFixAction(action)
		if err != nil {
			launcher.logAndSync("[FIX] Action %s failed: %v", action, err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, result)
	})

	http.HandleFunc("/api/launcher/export-diagnostics", func(w http.ResponseWriter, r *http.Request) {
		if !methodAllowed(w, r, "POST") {
			return
		}
		zipPath, err := launcher.exportDiagnosticPackage()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]interface{}{"success": true, "path": zipPath})
	})

	http.HandleFunc("/api/launcher/adopt-server", func(w http.ResponseWriter, r *http.Request) {
		if !methodAllowed(w, r, "POST") {
			return
		}
		result, err := launcher.applyFixAction("adopt-server")
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, result)
	})

	http.HandleFunc("/api/launcher/update/check", func(w http.ResponseWriter, r *http.Request) {
		if !methodAllowed(w, r, "POST") {
			return
		}
		result, err := launcher.checkUpdateForCurrentChannel()
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, result)
	})

	http.HandleFunc("/api/launcher/update/apply", func(w http.ResponseWriter, r *http.Request) {
		if !methodAllowed(w, r, "POST") {
			return
		}
		result, err := launcher.applyUpdateForCurrentChannel()
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, result)
	})

	http.HandleFunc("/api/launcher/update/rollback", func(w http.ResponseWriter, r *http.Request) {
		if !methodAllowed(w, r, "POST") {
			return
		}
		result, err := launcher.rollbackLastUpdate()
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, result)
	})

	http.HandleFunc("/api/launcher/port", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		port, err := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("port")))
		if err != nil {
			http.Error(w, "Invalid port", http.StatusBadRequest)
			return
		}
		if err := launcher.setPreferredPort(port); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "preferredPort": launcher.preferredPort})
	})

	http.HandleFunc("/api/launcher/start-server", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		port := launcher.preferredPort
		if rawPort := strings.TrimSpace(r.URL.Query().Get("port")); rawPort != "" {
			if parsedPort, err := strconv.Atoi(rawPort); err == nil {
				port = parsedPort
			}
		}

		if err := launcher.manualStartServer(port); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "preferredPort": launcher.preferredPort})
	})

	http.HandleFunc("/api/launcher/stop-server", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		launcher.logAndSync("[MANUAL] Stop server requested from launcher UI")
		launcher.killNodeProcess()
		if _, err := launcher.stopDetectedLTTHServers("MANUAL"); err != nil {
			launcher.logAndSync("[ERROR] Stop server request could not stop all LTTH instances: %v", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		launcher.clearRuntimePortFile()
		launcher.serverStarted = false
		launcher.serverPort = 0
		launcher.markServerStartDone(fmt.Errorf("server stopped manually"))
		launcher.updateProgressLocalized(100, "status.manual_start_available", "Server gestoppt. Manueller Start ist verfügbar.")

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
	})

	http.HandleFunc("/api/launcher/open-app", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		port := launcher.serverPort
		if port == 0 {
			port = launcher.readRuntimePortFile()
		}
		if port == 0 {
			if detectedPort, ok := launcher.detectHealthyServerPort(); ok {
				port = detectedPort
			}
		}
		if port == 0 {
			http.Error(w, "server is not reachable", http.StatusBadRequest)
			return
		}

		url := fmt.Sprintf("http://localhost:%d/dashboard.html", port)
		launcher.logAndSync("[MANUAL] Opening dashboard: %s", url)
		_ = browser.OpenURL(url)

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "url": url})
	})

	http.HandleFunc("/api/launcher/vacuum-database", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		if launcher.startupInProgress || launcher.isNodeRunning() || launcher.serverStarted {
			http.Error(w, "Server vor VACUUM stoppen, damit die Datenbank nicht gesperrt ist.", http.StatusConflict)
			return
		}
		if detectedPort, ok := launcher.detectHealthyServerPort(); ok {
			http.Error(w, fmt.Sprintf("Server laeuft noch auf Port %d. Bitte vor VACUUM stoppen.", detectedPort), http.StatusConflict)
			return
		}

		var cleanupReq struct {
			CleanupDays *int `json:"cleanupDays"`
			DryRun      bool `json:"dryRun"`
			SkipVacuum  bool `json:"skipVacuum"`
		}
		cleanupDaysSpecified := false
		if r.Body != nil {
			decoder := json.NewDecoder(io.LimitReader(r.Body, 1024))
			if err := decoder.Decode(&cleanupReq); err != nil && err != io.EOF {
				http.Error(w, "Invalid request payload", http.StatusBadRequest)
				return
			}
			if cleanupReq.CleanupDays != nil {
				cleanupDaysSpecified = true
			}
		}

		cleanupDays := 0
		if cleanupReq.CleanupDays != nil {
			cleanupDays = *cleanupReq.CleanupDays
		}

		if !cleanupDaysSpecified {
			if value := strings.TrimSpace(r.URL.Query().Get("cleanupDays")); value != "" {
				if parsed, parseErr := strconv.Atoi(value); parseErr == nil && parsed >= 0 {
					cleanupDays = parsed
					cleanupDaysSpecified = true
				}
			}
		}
		if !cleanupDaysSpecified {
			cleanupDays = 90
		}

		launcher.logAndSync("[MAINTENANCE] SQLite VACUUM requested for active profile")
		result, err := launcher.vacuumActiveProfileDatabase(vacuumMaintenanceOptions{
			CleanupDays: cleanupDays,
			DryRun:      cleanupReq.DryRun,
			SkipVacuum:  cleanupReq.SkipVacuum,
		})
		if err != nil {
			launcher.logAndSync("[ERROR] SQLite VACUUM failed: %v", err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		launcher.logAndSync("[MAINTENANCE] SQLite VACUUM finished for profile %s: before=%d after=%d freed=%d duration=%dms",
			result.Profile,
			result.SizeBeforeBytes,
			result.SizeAfterBytes,
			result.FreedBytes,
			result.DurationMillis)

		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		json.NewEncoder(w).Encode(result)
	})

	http.HandleFunc("/api/select-profile", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		profile := r.URL.Query().Get("profile")
		launcher.selectedProfile = profile
		launcher.logAndSync("[INFO] Selected profile: %s", profile)

		// Save selected profile to file for the app to use
		if err := os.MkdirAll(launcher.userConfigsDir, 0755); err != nil && launcher.logger != nil {
			launcher.logger.Printf("[WARNING] Could not ensure user_configs dir: %v\n", err)
		}
		profileFile := filepath.Join(launcher.userConfigsDir, ".active_profile")
		os.WriteFile(profileFile, []byte(profile), 0644)

		w.WriteHeader(http.StatusOK)
	})

	http.HandleFunc("/changelog", func(w http.ResponseWriter, r *http.Request) {
		changelogPath := filepath.Join(exeDir, "CHANGELOG.md")
		content, err := os.ReadFile(changelogPath)
		if err != nil {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write([]byte("<p style='color: #999;'>Changelog konnte nicht geladen werden.</p>"))
			return
		}

		// Parse markdown and convert to HTML (simple conversion)
		html := parseChangelogToHTML(string(content))
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(html))
	})

	http.HandleFunc("/events", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		client := make(chan string, 10)
		launcher.clientsMu.Lock()
		launcher.clients[client] = true
		launcher.clientsMu.Unlock()

		// Send initial state
		initialStatus := launcher.currentStatus()
		initialStatusJSON, _ := json.Marshal(initialStatus)
		msg := fmt.Sprintf(`{"progress": %d, "status": %s}`, launcher.progress, string(initialStatusJSON))
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
				launcher.clientsMu.Lock()
				delete(launcher.clients, client)
				launcher.clientsMu.Unlock()
				return
			}
		}
	})

	// Bind HTTP server – try fixed port first, fall back to any available port
	listener, err := net.Listen("tcp", "127.0.0.1:58734")
	if err != nil {
		listener, err = net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			launcher.logFatalAndExit(fmt.Sprintf("Cannot bind launcher UI server: %v", err), 1)
		}
		launcher.logAndSync("[WARNING] Port 58734 in use, falling back to port %s", listener.Addr().String())
	}
	launcherAddr := listener.Addr().String()
	launcherURL := fmt.Sprintf("http://%s", launcherAddr)
	launcher.logAndSync("[INFO] Launcher UI listening on %s", launcherAddr)

	// Start HTTP server
	go func() {
		if err := http.Serve(listener, nil); err != nil {
			launcher.logAndSync("[ERROR] Launcher HTTP server stopped: %v", err)
		}
	}()

	// Give server time to start
	time.Sleep(500 * time.Millisecond)

	// Open browser
	browser.OpenURL(launcherURL)
	launcher.startTrayMenu(launcherURL)

	// Create desktop shortcut (Windows, once)
	launcher.createDesktopShortcut()

	// Run launcher
	go launcher.runLauncher()

	// Signal-Handler: Node-Prozess beim Beenden des Launchers sauber terminieren
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	go func() {
		sig := <-sigCh
		if launcher.logger != nil {
			launcher.logger.Printf("[INFO] Signal received (%v) – shutting down Node.js...\n", sig)
		}
		launcher.killNodeProcess()
		launcher.closeLogging()
		os.Exit(0)
	}()

	// Keep running
	select {}
}
