package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestServerReadyMessageProvidesDashboardURL(t *testing.T) {
	msg := serverReadyMessage(4321)

	var payload map[string]interface{}
	if err := json.Unmarshal([]byte(msg), &payload); err != nil {
		t.Fatalf("serverReadyMessage returned invalid JSON: %v", err)
	}

	if payload["serverReady"] != true {
		t.Fatalf("expected serverReady=true, got %#v", payload["serverReady"])
	}
	if payload["dashboardUrl"] != "http://localhost:4321/dashboard.html" {
		t.Fatalf("unexpected dashboardUrl: %#v", payload["dashboardUrl"])
	}
}

func TestUpdateProgressRawClampsProgressForStateAndClients(t *testing.T) {
	launcher := NewLauncher()
	client := make(chan string, 1)
	launcher.clients[client] = true

	launcher.updateProgressRaw(125, "too high")

	if launcher.progress != 100 {
		t.Fatalf("expected stored progress to be clamped to 100, got %d", launcher.progress)
	}

	msg := <-client
	var payload map[string]interface{}
	if err := json.Unmarshal([]byte(msg), &payload); err != nil {
		t.Fatalf("progress update returned invalid JSON: %v", err)
	}
	if payload["progress"] != float64(100) {
		t.Fatalf("expected client progress to be clamped to 100, got %#v", payload["progress"])
	}
}

func TestUpdateProgressRawClampsNegativeProgressToZero(t *testing.T) {
	launcher := NewLauncher()

	launcher.updateProgressRaw(-10, "too low")

	if launcher.progress != 0 {
		t.Fatalf("expected stored progress to be clamped to 0, got %d", launcher.progress)
	}
}

func TestWaitingAttemptProgressNeverReachesCompleteState(t *testing.T) {
	for _, attempt := range []int{54, 500} {
		if got := waitingAttemptProgress(attempt); got != 99 {
			t.Fatalf("waiting attempt %d progress = %d, expected 99", attempt, got)
		}
	}
}

func TestLauncherHTMLKeepsLauncherOpenCheckedByDefault(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("assets", "launcher.html"))
	if err != nil {
		t.Fatalf("failed to read launcher HTML: %v", err)
	}

	input := regexp.MustCompile(`<input[^>]*id="keepLauncherOpen"[^>]*>`).FindString(string(data))
	if input == "" {
		t.Fatal("keepLauncherOpen checkbox not found")
	}
	if !strings.Contains(input, "checked") {
		t.Fatalf("keepLauncherOpen should be checked by default, got: %s", input)
	}
}

func TestLauncherHTMLTemplateParsesWithDiagnosticsData(t *testing.T) {
	tmpl, err := template.ParseFiles(filepath.Join("assets", "launcher.html"))
	if err != nil {
		t.Fatalf("launcher template should parse: %v", err)
	}

	data := map[string]interface{}{
		"AppName":            "LTTH",
		"TagLine":            "Open-Source TikTok LIVE Tool",
		"Locale":             "de",
		"Version":            "v1.3.3",
		"HasProfiles":        true,
		"Profiles":           []ProfileInfo{{Username: "pupcid", Modified: time.Now()}},
		"ProfileLabel":       "Benutzerprofil",
		"NoProfilesText":     "Keine Profile",
		"TabChangelog":       "Changelog",
		"TabApiKeys":         "API Keys",
		"TabCommunity":       "Community",
		"StatusTitle":        "Fortschritt",
		"StatusInitializing": "Initialisiere...",
		"ChangelogTitle":     "Changelog",
		"ChangelogLoading":   "Lade...",
		"ChangelogError":     "Fehler",
		"ApiKeysTitle":       "API Keys",
		"ApiKeysIntro":       "Intro",
		"MandatoryWarning":   "Warnung",
		"FallbackWarning":    "Fallback",
		"ElevenLabsDesc":     "ElevenLabs",
		"OpenAIDesc":         "OpenAI",
		"SiliconFlowDesc":    "SiliconFlow",
		"FishAudioDesc":      "FishAudio",
		"CommunityTitle":     "Community",
		"CommunityIntro":     "Intro",
		"HelpAppreciated":    "Danke",
		"LinkRepo":           "Repo",
		"LinkDiscussions":    "Discussions",
		"LinkIssues":         "Issues",
		"LinkDiscord":        "Discord",
		"ContributeQuestion": "Helfen?",
		"ContributeText":     "Text",
		"PoweredBy":          "Powered by",
		"ThemeLabel":         "Theme",
		"ThemeDay":           "Tag",
		"ThemeNight":         "Nacht",
		"ThemeHighContrast":  "Kontrast",
		"KeepOpenLabel":      "Offen halten",
		"KeepOpenHint":       "Logs",
		"OpenAppLabel":       "Zur App",
		"AppNotReady":        "Nicht bereit",
		"AppReady":           "Bereit",
		"TabLogs":            "Logs",
		"LogsTitle":          "Logs",
		"LogsIntro":          "Intro",
		"LogsLoading":        "Lade Logs",
		"LogsEmpty":          "Leer",
		"LogsError":          "Fehler",
		"CurrentTheme":       "night",
		"KeepLauncherOpen":   true,
		"SafeMode":           true,
		"UpdateChannel":      updateChannelBeta,
		"FirstRunComplete":   false,
	}

	var out bytes.Buffer
	if err := tmpl.Execute(&out, data); err != nil {
		t.Fatalf("launcher template should execute: %v", err)
	}
	html := out.String()
	for _, expected := range []string{"tab-diagnostics", "safeModeToggle", "updateChannel", "firstRunPanel"} {
		if !strings.Contains(html, expected) {
			t.Fatalf("rendered launcher template missing %q", expected)
		}
	}
}

func TestResolveProfileDatabasePathRejectsTraversal(t *testing.T) {
	configDir := t.TempDir()
	expectedPath := filepath.Join(configDir, "pup.cid.db")
	if err := os.WriteFile(expectedPath, []byte("placeholder"), 0644); err != nil {
		t.Fatalf("failed to create db placeholder: %v", err)
	}

	resolved, err := resolveProfileDatabasePath(configDir, "pup.cid")
	if err != nil {
		t.Fatalf("expected valid profile path, got: %v", err)
	}
	if resolved != expectedPath {
		t.Fatalf("expected %s, got %s", expectedPath, resolved)
	}

	for _, name := range []string{"", ".", "..", "../evil", `..\evil`, `C:\temp\evil`, "evil/name", "evil:name", "evil\x00name"} {
		if _, err := resolveProfileDatabasePath(configDir, name); err == nil {
			t.Fatalf("expected profile name %q to be rejected", name)
		}
	}
}

func TestSQLiteVacuumScriptUsesExistingDatabaseAndCheckpoint(t *testing.T) {
	script := sqliteVacuumScript()

	for _, expected := range []string{
		"better-sqlite3",
		"fileMustExist",
		"wal_checkpoint(TRUNCATE)",
		"VACUUM",
		"optimize",
	} {
		if !strings.Contains(script, expected) {
			t.Fatalf("vacuum script should contain %q", expected)
		}
	}
}

func startLauncherHealthTestServer(t *testing.T, pid int, name string) (int, func()) {
	t.Helper()

	reportedPort := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/health" {
			http.NotFound(w, r)
			return
		}

		_ = json.NewEncoder(w).Encode(ServerHealthInfo{
			Status:  "ok",
			Success: true,
			Name:    name,
			PID:     pid,
			Port:    reportedPort,
		})
	}))

	parsedURL, err := url.Parse(server.URL)
	if err != nil {
		server.Close()
		t.Fatalf("failed to parse test server URL: %v", err)
	}

	_, portText, err := net.SplitHostPort(parsedURL.Host)
	if err != nil {
		server.Close()
		t.Fatalf("failed to split test server host: %v", err)
	}

	port, err := strconv.Atoi(portText)
	if err != nil {
		server.Close()
		t.Fatalf("failed to parse test server port: %v", err)
	}
	reportedPort = port

	return port, server.Close
}

func TestStopDetectedLTTHServersTerminatesExternalHealthPID(t *testing.T) {
	port, closeServer := startLauncherHealthTestServer(t, 4242, "LTTH - Pup Cids little TikTool Helper")
	defer closeServer()

	launcher := NewLauncher()
	launcher.exeDir = t.TempDir()
	launcher.preferredPort = port

	var terminated []int
	oldTerminate := terminateProcessTreeByPID
	oldWait := waitForHealthyServerToStop
	terminateProcessTreeByPID = func(pid int) error {
		terminated = append(terminated, pid)
		return nil
	}
	waitForHealthyServerToStop = func(_ *Launcher, _ int, _ time.Duration) bool {
		return true
	}
	defer func() {
		terminateProcessTreeByPID = oldTerminate
		waitForHealthyServerToStop = oldWait
	}()

	stopped, err := launcher.stopDetectedLTTHServers("TEST")
	if err != nil {
		t.Fatalf("expected external LTTH server to stop cleanly, got: %v", err)
	}
	if !stopped {
		t.Fatal("expected stopDetectedLTTHServers to report that a server was stopped")
	}
	foundExpectedPID := false
	for _, pid := range terminated {
		if pid == 4242 {
			foundExpectedPID = true
			break
		}
	}
	if !foundExpectedPID {
		t.Fatalf("expected PID 4242 to be terminated, got %#v", terminated)
	}
}

func TestPrepareFreshBackendStartupStopsOldServerAndResetsPort(t *testing.T) {
	port, closeServer := startLauncherHealthTestServer(t, 5252, "LTTH - Pup Cids little TikTool Helper")
	defer closeServer()

	launcher := NewLauncher()
	launcher.exeDir = t.TempDir()
	launcher.preferredPort = port
	launcher.settings = defaultLauncherSettings()
	launcher.settings.PreferredPort = port

	var terminated []int
	oldTerminate := terminateProcessTreeByPID
	oldWait := waitForHealthyServerToStop
	terminateProcessTreeByPID = func(pid int) error {
		terminated = append(terminated, pid)
		return nil
	}
	waitForHealthyServerToStop = func(_ *Launcher, _ int, _ time.Duration) bool {
		return true
	}
	defer func() {
		terminateProcessTreeByPID = oldTerminate
		waitForHealthyServerToStop = oldWait
	}()

	stopped, err := launcher.prepareFreshBackendStartup("TEST")
	if err != nil {
		t.Fatalf("prepareFreshBackendStartup failed: %v", err)
	}
	if !stopped {
		t.Fatal("expected old LTTH server to be stopped before fresh backend startup")
	}
	if launcher.preferredPort != 3000 {
		t.Fatalf("expected launcher preferred port to reset to 3000, got %d", launcher.preferredPort)
	}

	settings := launcher.loadSettings()
	if settings.PreferredPort != 3000 {
		t.Fatalf("expected persisted preferred port to reset to 3000, got %d", settings.PreferredPort)
	}
	foundExpectedPID := false
	for _, pid := range terminated {
		if pid == 5252 {
			foundExpectedPID = true
			break
		}
	}
	if !foundExpectedPID {
		t.Fatalf("expected PID 5252 to be terminated, got %#v", terminated)
	}
}

func TestPrepareFreshBackendStartupClearsStalePortFileAndStopsPortOwners(t *testing.T) {
	launcher := NewLauncher()
	launcher.exeDir = t.TempDir()
	launcher.preferredPort = 3001
	launcher.settings = defaultLauncherSettings()
	launcher.settings.PreferredPort = 3001
	if err := os.WriteFile(launcher.runtimePortFilePath(), []byte("3001"), 0644); err != nil {
		t.Fatalf("failed to create stale runtime port file: %v", err)
	}

	called := false
	oldStopStale := stopStaleLTTHPortOwners
	stopStaleLTTHPortOwners = func(_ *Launcher, source string) (bool, error) {
		called = source == "TEST"
		return true, nil
	}
	defer func() {
		stopStaleLTTHPortOwners = oldStopStale
	}()

	stopped, err := launcher.prepareFreshBackendStartup("TEST")
	if err != nil {
		t.Fatalf("prepareFreshBackendStartup failed: %v", err)
	}
	if !stopped {
		t.Fatal("expected stale port owner cleanup to be reported as stopped")
	}
	if !called {
		t.Fatal("expected stale LTTH port owner cleanup to be invoked")
	}
	if _, err := os.Stat(launcher.runtimePortFilePath()); !os.IsNotExist(err) {
		t.Fatalf("expected stale runtime port file to be removed, got err=%v", err)
	}
	if launcher.preferredPort != 3000 {
		t.Fatalf("expected startup port to reset to 3000, got %d", launcher.preferredPort)
	}
}

func TestBackendPortConfigPinsMaxPortToPreferredPort(t *testing.T) {
	preferred, maxPort := backendPortConfig(3000)
	if preferred != 3000 || maxPort != 3000 {
		t.Fatalf("expected backend port config 3000/3000, got %d/%d", preferred, maxPort)
	}

	preferred, maxPort = backendPortConfig(0)
	if preferred != 3000 || maxPort != 3000 {
		t.Fatalf("expected invalid preferred port to fall back to 3000/3000, got %d/%d", preferred, maxPort)
	}

	preferred, maxPort = backendPortConfig(4321)
	if preferred != 4321 || maxPort != 4321 {
		t.Fatalf("expected manual preferred port to be fixed, got %d/%d", preferred, maxPort)
	}
}

func TestNativeModuleFailureSuggestsDependencyInstallForMissingBinding(t *testing.T) {
	err := fmt.Errorf("exit status 1\nError: Could not locate the bindings file. Tried:\n -> build\\Release\\better_sqlite3.node")

	if !nativeModuleFailureSuggestsDependencyInstall(err) {
		t.Fatal("missing better-sqlite3 binding should trigger dependency install before rebuild")
	}
}

func TestNativeModuleFailureDoesNotSuggestDependencyInstallForAbiMismatch(t *testing.T) {
	err := fmt.Errorf("Error: The module was compiled against a different Node.js version using NODE_MODULE_VERSION 115")

	if nativeModuleFailureSuggestsDependencyInstall(err) {
		t.Fatal("ABI mismatch should use native rebuild path")
	}
}

func TestResolveNpmCommandForPortableNodeUsesMatchingNpmCLI(t *testing.T) {
	nodeDir := filepath.Join(t.TempDir(), "runtime", "node")
	npmCli := filepath.Join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js")
	if err := os.MkdirAll(filepath.Dir(npmCli), 0755); err != nil {
		t.Fatalf("failed to create npm cli dir: %v", err)
	}

	nodeName := "node"
	if runtime.GOOS == "windows" {
		nodeName = "node.exe"
	}
	nodePath := filepath.Join(nodeDir, nodeName)
	if err := os.WriteFile(nodePath, []byte("node"), 0644); err != nil {
		t.Fatalf("failed to create node placeholder: %v", err)
	}
	if err := os.WriteFile(npmCli, []byte("npm"), 0644); err != nil {
		t.Fatalf("failed to create npm cli placeholder: %v", err)
	}

	launcher := NewLauncher()
	npm := launcher.resolveNpmCommandForNode(nodePath)

	if npm.Command != nodePath {
		t.Fatalf("expected npm command to be portable node %q, got %q", nodePath, npm.Command)
	}
	if len(npm.Args) == 0 || npm.Args[0] != npmCli {
		t.Fatalf("expected first npm arg to be npm cli %q, got %#v", npmCli, npm.Args)
	}
}

func TestNodeCommandEnvironmentPrependsPortableNodeAndRemovesNodeOptions(t *testing.T) {
	nodeDir := filepath.Join(t.TempDir(), "runtime", "node")
	nodeName := "node"
	if runtime.GOOS == "windows" {
		nodeName = "node.exe"
	}
	nodePath := filepath.Join(nodeDir, nodeName)

	env := nodeCommandEnvironment([]string{
		"NODE_OPTIONS=--require bad.js",
		"NPM_CONFIG_NODE_OPTIONS=--require bad.js",
		"Path=C:\\OtherTools",
	}, nodePath)

	for _, entry := range env {
		upper := strings.ToUpper(entry)
		if strings.HasPrefix(upper, "NODE_OPTIONS=") || strings.HasPrefix(upper, "NPM_CONFIG_NODE_OPTIONS=") {
			t.Fatalf("node option leaked into child environment: %s", entry)
		}
	}

	pathValue := ""
	for _, entry := range env {
		key, value, ok := strings.Cut(entry, "=")
		if ok && strings.EqualFold(key, "Path") {
			pathValue = value
			break
		}
	}
	if pathValue == "" {
		t.Fatal("expected path entry in environment")
	}
	if got := strings.Split(pathValue, string(os.PathListSeparator))[0]; got != nodeDir {
		t.Fatalf("expected node dir to be first path entry, got %q from %q", got, pathValue)
	}
}

func TestLauncherStatusPayloadIncludesExternallyDetectedServer(t *testing.T) {
	port, closeServer := startLauncherHealthTestServer(t, 4343, "LTTH - Pup Cids little TikTool Helper")
	defer closeServer()

	launcher := NewLauncher()
	launcher.exeDir = t.TempDir()
	launcher.preferredPort = port

	payload := launcher.statusPayload()

	if payload["serverRunning"] != true {
		t.Fatalf("expected externally detected server to be reported as running, got %#v", payload["serverRunning"])
	}
	if payload["serverPort"] != port {
		t.Fatalf("expected serverPort %d, got %#v", port, payload["serverPort"])
	}
	if payload["vacuumAvailable"] != false {
		t.Fatalf("expected VACUUM to be unavailable while external server is running, got %#v", payload["vacuumAvailable"])
	}
}

func TestLauncherStatusPayloadDoesNotRunHeavyDiagnostics(t *testing.T) {
	launcher := NewLauncher()
	launcher.exeDir = t.TempDir()
	launcher.preferredPort = 3000

	payload := launcher.statusPayload()
	if _, ok := payload["diagnostics"]; ok {
		t.Fatal("statusPayload must not include diagnostics because status is polled frequently")
	}
}

func TestWindowsConsoleCommandsAreHidden(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows console-window behavior only applies on Windows")
	}

	cmd := hiddenCommand("netstat", "-ano")
	if cmd.SysProcAttr == nil {
		t.Fatal("hiddenCommand should set SysProcAttr on Windows")
	}
	if cmd.SysProcAttr.CreationFlags&createNoWindow == 0 {
		t.Fatalf("hiddenCommand should set CREATE_NO_WINDOW, flags=%#x", cmd.SysProcAttr.CreationFlags)
	}
}

func TestRepairMojibakeTextRestoresCommonLauncherText(t *testing.T) {
	input := "PrÃ¼fe Ã„nderungen âœ… âš ï¸"
	got := repairMojibakeText(input)
	want := "Prüfe Änderungen ✅ ⚠️"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestLauncherTranslationFallbacksCoverTemplateKeys(t *testing.T) {
	launcher := NewLauncher()
	launcher.locale = "de"
	launcher.translations = map[string]interface{}{}

	requiredKeys := []string{
		"app_name",
		"profile.title",
		"profile.no_profiles",
		"tabs.changelog",
		"tabs.api_keys",
		"tabs.community",
		"tabs.logging",
		"status.progress",
		"status.initializing",
		"changelog.title",
		"changelog.loading",
		"changelog.error",
		"api_keys.title",
		"api_keys.intro",
		"api_keys.mandatory_warning",
		"api_keys.fallback_warning",
		"api_keys.elevenlabs.description",
		"api_keys.openai.description",
		"api_keys.siliconflow.description",
		"api_keys.fishAudio.description",
		"community.title",
		"community.intro",
		"community.help_appreciated",
		"community.links.repo",
		"community.links.discussions",
		"community.links.issues",
		"community.links.discord",
		"community.contribute",
		"community.contribute_text",
		"footer.powered_by",
		"theme.label",
		"theme.daymode",
		"theme.nightmode",
		"theme.highcontrast",
		"options.keep_open",
		"options.keep_open_hint",
		"options.open_app",
		"options.app_not_ready",
		"options.app_ready",
		"logs.title",
		"logs.intro",
		"logs.loading",
		"logs.empty",
		"logs.error",
	}

	for _, key := range requiredKeys {
		got := launcher.getTranslation(key)
		if got == "" || got == key {
			t.Fatalf("missing launcher translation fallback for %q, got %q", key, got)
		}
	}
}

func TestLauncherSettingsRoundTripAndDefaults(t *testing.T) {
	launcher := NewLauncher()
	launcher.exeDir = t.TempDir()

	settings := launcher.loadSettings()
	if settings.Locale != "de" || settings.Theme != "night" || settings.PreferredPort != 3000 {
		t.Fatalf("unexpected default settings: %#v", settings)
	}
	if !settings.KeepLauncherOpen {
		t.Fatal("launcher should keep open by default")
	}
	if settings.UpdateChannel != updateChannelLocal {
		t.Fatalf("local snapshot should default to local update channel, got %q", settings.UpdateChannel)
	}

	settings.Locale = "en"
	settings.Theme = "day"
	settings.PreferredPort = 4321
	settings.KeepLauncherOpen = false
	settings.SafeMode = true
	settings.UpdateChannel = updateChannelBeta
	settings.FirstRunComplete = true
	if err := launcher.saveSettings(settings); err != nil {
		t.Fatalf("saveSettings failed: %v", err)
	}

	loaded := launcher.loadSettings()
	if loaded.Locale != "en" || loaded.Theme != "day" || loaded.PreferredPort != 4321 ||
		loaded.KeepLauncherOpen || !loaded.SafeMode || loaded.UpdateChannel != updateChannelBeta || !loaded.FirstRunComplete {
		t.Fatalf("settings did not round trip: %#v", loaded)
	}
}

func TestCollectDiagnosticsReportsCoreLauncherHealth(t *testing.T) {
	launcher := NewLauncher()
	launcher.exeDir = t.TempDir()
	launcher.appDir = filepath.Join(launcher.exeDir, "app")
	launcher.configDir = filepath.Join(launcher.exeDir, "config")
	launcher.userConfigsDir = filepath.Join(launcher.configDir, "user_configs")
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to reserve test port: %v", err)
	}
	_, portText, err := net.SplitHostPort(listener.Addr().String())
	if err != nil {
		listener.Close()
		t.Fatalf("failed to split test port: %v", err)
	}
	freePort, err := strconv.Atoi(portText)
	listener.Close()
	if err != nil {
		t.Fatalf("failed to parse test port: %v", err)
	}
	launcher.preferredPort = freePort
	nodePath, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node executable not available for diagnostics test")
	}
	launcher.nodePath = nodePath
	launcher.selectedProfile = "pupcid"
	if err := os.MkdirAll(filepath.Join(launcher.appDir, "node_modules", "express"), 0755); err != nil {
		t.Fatalf("failed to create fake node_modules: %v", err)
	}
	if err := os.MkdirAll(launcher.userConfigsDir, 0755); err != nil {
		t.Fatalf("failed to create fake user config dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(launcher.userConfigsDir, "pupcid.db"), []byte("db"), 0644); err != nil {
		t.Fatalf("failed to create fake profile db: %v", err)
	}

	items := launcher.collectDiagnostics()
	byID := map[string]DiagnosticItem{}
	for _, item := range items {
		byID[item.ID] = item
	}

	for _, id := range []string{"node", "dependencies", "preferred_port", "profile", "database"} {
		item, ok := byID[id]
		if !ok {
			t.Fatalf("diagnostic item %q missing from %#v", id, items)
		}
		if id == "node" && item.Status == diagnosticWarning {
			continue
		}
		if item.Status != diagnosticOK {
			t.Fatalf("expected diagnostic %q to be ok, got %#v", id, item)
		}
	}
}

func TestProfileBackupIsCreatedBeforeMaintenance(t *testing.T) {
	launcher := NewLauncher()
	launcher.exeDir = t.TempDir()
	launcher.configDir = filepath.Join(launcher.exeDir, "config")
	launcher.userConfigsDir = filepath.Join(launcher.configDir, "user_configs")
	if err := os.MkdirAll(launcher.userConfigsDir, 0755); err != nil {
		t.Fatalf("failed to create user config dir: %v", err)
	}
	dbPath := filepath.Join(launcher.userConfigsDir, "pupcid.db")
	if err := os.WriteFile(dbPath, []byte("profile database"), 0644); err != nil {
		t.Fatalf("failed to create profile db: %v", err)
	}

	backupPath, err := launcher.createProfileBackup("pupcid", "vacuum")
	if err != nil {
		t.Fatalf("createProfileBackup failed: %v", err)
	}
	data, err := os.ReadFile(backupPath)
	if err != nil {
		t.Fatalf("failed to read backup: %v", err)
	}
	if string(data) != "profile database" {
		t.Fatalf("backup content mismatch: %q", string(data))
	}
	if !strings.Contains(backupPath, filepath.Join("profile-backups", "pupcid")) {
		t.Fatalf("backup should live in profile-backups/pupcid, got %s", backupPath)
	}
}

func TestPluginFailureLinesAreClassifiedByPluginID(t *testing.T) {
	logText := strings.Join([]string{
		"2026-04-30 [error] Plugin soundboard init() failed: missing file",
		"2026-04-30 [error] Failed to require plugin entry file C:/app/plugins/quiz-show/main.js: syntax error",
		"2026-04-30 [error] unrelated backend error",
	}, "\n")

	failures := classifyPluginFailures(logText)
	if len(failures) != 2 {
		t.Fatalf("expected 2 plugin failures, got %#v", failures)
	}
	if failures[0].PluginID != "soundboard" || failures[1].PluginID != "quiz-show" {
		t.Fatalf("unexpected plugin IDs: %#v", failures)
	}
}

func TestSelectReleaseForUpdateChannel(t *testing.T) {
	releases := []GitHubRelease{
		{TagName: "v1.4.0-beta.2", Prerelease: true, ZipballURL: "https://example.invalid/beta.zip"},
		{TagName: "v1.3.3", Prerelease: false, ZipballURL: "https://example.invalid/stable.zip"},
	}

	stable, err := selectReleaseForChannel(releases, updateChannelStable)
	if err != nil {
		t.Fatalf("stable release selection failed: %v", err)
	}
	if stable.TagName != "v1.3.3" {
		t.Fatalf("expected stable release v1.3.3, got %s", stable.TagName)
	}

	beta, err := selectReleaseForChannel(releases, updateChannelBeta)
	if err != nil {
		t.Fatalf("beta release selection failed: %v", err)
	}
	if beta.TagName != "v1.4.0-beta.2" {
		t.Fatalf("expected beta release v1.4.0-beta.2, got %s", beta.TagName)
	}

	if _, err := selectReleaseForChannel(releases, updateChannelLocal); err == nil {
		t.Fatal("local snapshot channel must not select a network release")
	}
}

func TestNodeVersionRecommendationUsesSemverRange(t *testing.T) {
	cases := []struct {
		version string
		status  string
	}{
		{"v16.20.2", diagnosticError},
		{"v18.19.0", diagnosticOK},
		{"v22.14.0", diagnosticOK},
		{"v24.13.0", diagnosticWarning},
		{"not-a-version", diagnosticError},
	}

	for _, tc := range cases {
		got := nodeVersionDiagnostic(tc.version)
		if got.Status != tc.status {
			t.Fatalf("nodeVersionDiagnostic(%q) status = %s, expected %s: %#v", tc.version, got.Status, tc.status, got)
		}
	}
}

func TestShouldUseGlobalNodeVersionRejectsTooNewRuntime(t *testing.T) {
	cases := []struct {
		version string
		want    bool
	}{
		{"v18.19.0", true},
		{"v22.14.0", true},
		{"v24.16.0", false},
		{"v16.20.2", false},
		{"unknown", false},
	}

	for _, tc := range cases {
		if got := shouldUseGlobalNodeVersion(tc.version); got != tc.want {
			t.Fatalf("shouldUseGlobalNodeVersion(%q) = %v, expected %v", tc.version, got, tc.want)
		}
	}
}
