package main

import (
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
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
	port, closeServer := startLauncherHealthTestServer(t, 4242, "LTTH - Pup Cids little TikTok Helper")
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
	if len(terminated) != 1 || terminated[0] != 4242 {
		t.Fatalf("expected PID 4242 to be terminated, got %#v", terminated)
	}
}

func TestLauncherStatusPayloadIncludesExternallyDetectedServer(t *testing.T) {
	port, closeServer := startLauncherHealthTestServer(t, 4343, "LTTH - Pup Cids little TikTok Helper")
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
