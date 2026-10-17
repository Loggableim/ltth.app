package main

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func integrityManifest() runtimeReleaseManifest {
	return runtimeReleaseManifest{Schema: 1, Component: "ltth_latest.zip", Version: "1.4.5", Tag: "v1.4.5", CommitSHA: strings.Repeat("a", 40), Bytes: 3, SHA256: fmt.Sprintf("%x", sha256.Sum256([]byte("zip")))}
}

func TestRuntimeManifestIntegrity(t *testing.T) {
	for _, tc := range []string{"valid", "hash", "bytes", "tag", "version", "commit", "component", "schema", "trailing", "unknown"} {
		t.Run(tc, func(t *testing.T) {
			m := integrityManifest()
			switch tc {
			case "hash":
				m.SHA256 = "x"
			case "bytes":
				m.Bytes = maxRuntimeReleaseBytes + 1
			case "tag":
				m.Tag = "v1.4.4"
			case "version":
				m.Version = "1.4.4"
			case "commit":
				m.CommitSHA = "main"
			case "component":
				m.Component = "source.zip"
			case "schema":
				m.Schema = 2
			}
			raw, _ := json.Marshal(m)
			if tc == "trailing" {
				raw = append(raw, []byte(" {}")...)
			}
			if tc == "unknown" {
				raw = []byte(strings.TrimSuffix(string(raw), "}") + `,"extra":true}`)
			}
			_, err := decodeRuntimeManifest(raw, "v1.4.5")
			if (err == nil) != (tc == "valid") {
				t.Fatalf("unexpected result %v", err)
			}
		})
	}
}

func TestRuntimeDownloadIntegrityFixtures(t *testing.T) {
	for _, tc := range []string{"valid", "hash", "bytes", "oversize", "status"} {
		t.Run(tc, func(t *testing.T) {
			body := "zip"
			m := integrityManifest()
			if tc == "hash" {
				body = "bad"
			}
			if tc == "bytes" {
				m.Bytes = 4
			}
			if tc == "oversize" {
				body = "zip-extra"
			}
			srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if tc == "status" {
					w.WriteHeader(500)
					return
				}
				w.(http.Flusher).Flush()
				fmt.Fprint(w, body)
			}))
			defer srv.Close()
			err := downloadVerifiedRuntime(srv.Client(), srv.URL, filepath.Join(t.TempDir(), "release.zip"), m)
			if (err == nil) != (tc == "valid") {
				t.Fatalf("unexpected result %v", err)
			}
		})
	}
}

func integrityArchive(t *testing.T, changes map[string]string) string {
	t.Helper()
	file := filepath.Join(t.TempDir(), "release.zip")
	out, err := os.Create(file)
	if err != nil {
		t.Fatal(err)
	}
	w := zip.NewWriter(out)
	entries := map[string]string{"ltth_1.4.5/app/package.json": `{"version":"1.4.5"}`, "ltth_1.4.5/app/package-lock.json": "{}", "ltth_1.4.5/app/server.js": "server", "ltth_1.4.5/app/launch.js": "launch", "ltth_1.4.5/app/config/distribution-mode.json": `{"channel":"public"}`, "ltth_1.4.5/app/config/plugin-release-policy.json": `{"schemaVersion":1,"closedBeta":["music-bot"],"aliases":{},"publicAssetPathOwners":{}}`}
	for k, v := range changes {
		if v == "DELETE" {
			delete(entries, k)
		} else {
			entries[k] = v
		}
	}
	for name, data := range entries {
		f, e := w.Create(name)
		if e != nil {
			t.Fatal(e)
		}
		if _, e = f.Write([]byte(data)); e != nil {
			t.Fatal(e)
		}
	}
	if err = w.Close(); err != nil {
		t.Fatal(err)
	}
	if err = out.Close(); err != nil {
		t.Fatal(err)
	}
	return file
}

func TestRuntimeArchiveIntegrity(t *testing.T) {
	cases := map[string]map[string]string{
		"valid": {}, "root": {"wrong/app/file": "bad"}, "version": {"ltth_1.4.5/app/package.json": `{"version":"1.4.4"}`},
		"marker": {"ltth_1.4.5/app/config/distribution-mode.json": `{"channel":"developer"}`}, "missing-marker": {"ltth_1.4.5/app/config/distribution-mode.json": "DELETE"},
		"policy": {"ltth_1.4.5/app/config/plugin-release-policy.json": `{"schemaVersion":2}`}, "missing-launch": {"ltth_1.4.5/app/launch.js": "DELETE"},
		"bootstrap-pointer":      {"ltth_1.4.5/app/.config_path": "C:\\custom\\profile\r\n"},
		"bootstrap-pointer-case": {"ltth_1.4.5/APP/.CONFIG_PATH": "C:\\custom\\profile\r\n"},
		"private-env":            {"ltth_1.4.5/app/.env": "SECRET=value"},
		"beta":                   {"ltth_1.4.5/app/plugins/music-bot/main.js": "private"}, "renamed-beta": {"ltth_1.4.5/app/plugins/vendor/plugin.json": `{"id":"music-bot"}`},
		"chatango": {"ltth_1.4.5/app/public/js/chatango-theme-adapter.js": "private"}, "traversal": {"ltth_1.4.5/app/../escape": "bad"},
		"owned-asset": {"ltth_1.4.5/app/config/plugin-release-policy.json": `{"schemaVersion":1,"closedBeta":["music-bot"],"aliases":{},"publicAssetPathOwners":{"/js/beta.js":"music-bot"}}`, "ltth_1.4.5/app/public/js/beta.js": "private"},
	}
	for name, changes := range cases {
		t.Run(name, func(t *testing.T) {
			dest := filepath.Join(t.TempDir(), "staged")
			err := stageRuntimeArchive(integrityArchive(t, changes), dest, "1.4.5")
			if (err == nil) != (name == "valid") {
				t.Fatalf("unexpected result %v", err)
			}
			if err != nil {
				if _, e := os.Stat(dest); !os.IsNotExist(e) {
					t.Fatal("invalid payload wrote staging files")
				}
			}
		})
	}
}

func TestRuntimeManualSameOlderRejected(t *testing.T) {
	dir := t.TempDir()
	version := filepath.Join(dir, versionFile)
	os.MkdirAll(filepath.Dir(version), 0755)
	os.WriteFile(version, []byte("v1.4.5"), 0600)
	l := &Launcher{exeDir: dir}
	for _, tag := range []string{"v1.4.5", "v1.4.4"} {
		if err := l.downloadAndApplyUpdate(&GitHubRelease{TagName: tag}); err == nil || !strings.Contains(err.Error(), "not newer") {
			t.Fatalf("manual update %s: %v", tag, err)
		}
	}
	data, _ := os.ReadFile(version)
	if string(data) != "v1.4.5" {
		t.Fatal("version changed")
	}
}

func TestRuntimeSwapRollback(t *testing.T) {
	for _, tc := range []string{"success", "stage-rename", "version-backup", "version-install", "restore-failure"} {
		t.Run(tc, func(t *testing.T) {
			dir := t.TempDir()
			app := filepath.Join(dir, "app")
			workspace := filepath.Join(dir, "work")
			stage := filepath.Join(workspace, "app")
			backup := filepath.Join(dir, "backup", "app")
			version := filepath.Join(dir, "version.txt")
			pointer := []byte("C:\\custom\\profile\r\n")
			os.MkdirAll(app, 0755)
			os.MkdirAll(stage, 0755)
			os.WriteFile(filepath.Join(app, "old"), []byte("old"), 0600)
			os.WriteFile(filepath.Join(app, ".config_path"), pointer, 0600)
			os.WriteFile(filepath.Join(stage, "new"), []byte("new"), 0600)
			os.WriteFile(filepath.Join(stage, "old"), []byte("replacement"), 0600)
			os.WriteFile(version, []byte("v1.4.4"), 0600)
			rename := func(a, b string) error {
				if (tc == "stage-rename" || tc == "restore-failure") && a == stage {
					return errors.New("stage rename failed")
				}
				if tc == "restore-failure" && a == backup {
					return errors.New("restore failed")
				}
				if tc == "version-backup" && a == version {
					return errors.New("version backup failed")
				}
				if tc == "version-install" && a == filepath.Join(workspace, "version.new") {
					return errors.New("version install failed")
				}
				return os.Rename(a, b)
			}
			err := swapRuntimeStage(app, stage, version, "v1.4.5", backup, rename)
			if tc == "success" {
				if err != nil {
					t.Fatal(err)
				}
				data, _ := os.ReadFile(version)
				if string(data) != "v1.4.5" {
					t.Fatal("version not committed")
				}
				return
			}
			if err == nil {
				t.Fatal("fault ignored")
			}
			data, _ := os.ReadFile(version)
			if string(data) != "v1.4.4" {
				t.Fatalf("old version lost %q", data)
			}
			if tc == "restore-failure" {
				if !strings.Contains(err.Error(), "restore app") {
					t.Fatal("restore error swallowed")
				}
				if _, e := os.Stat(filepath.Join(backup, "old")); e != nil {
					t.Fatal("recovery backup lost")
				}
				data, e := os.ReadFile(filepath.Join(backup, ".config_path"))
				if e != nil || string(data) != string(pointer) {
					t.Fatal("recovery bootstrap pointer bytes lost")
				}
			} else {
				if _, e := os.Stat(filepath.Join(app, "old")); e != nil {
					t.Fatal("old app not restored")
				}
				data, e := os.ReadFile(filepath.Join(app, ".config_path"))
				if e != nil || string(data) != string(pointer) {
					t.Fatal("rollback bootstrap pointer bytes changed")
				}
			}
		})
	}
}

func TestRuntimeManifestHTTPFixtures(t *testing.T) {
	for _, tc := range []string{"valid", "oversized", "mismatched-tag", "status"} {
		t.Run(tc, func(t *testing.T) {
			raw, _ := json.Marshal(integrityManifest())
			if tc == "oversized" {
				raw = []byte(strings.Repeat("x", 65537))
			}
			if tc == "mismatched-tag" {
				m := integrityManifest()
				m.Tag = "v1.4.4"
				raw, _ = json.Marshal(m)
			}
			srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if tc == "status" {
					w.WriteHeader(404)
					return
				}
				w.Write(raw)
			}))
			defer srv.Close()
			_, err := fetchRuntimeManifest(srv.Client(), srv.URL, "v1.4.5")
			if (err == nil) != (tc == "valid") {
				t.Fatal(err)
			}
		})
	}
}

func TestRuntimeReleaseAssetContract(t *testing.T) {
	release := &GitHubRelease{TagName: "v1.4.5", ZipballURL: "https://example.invalid/source.zip"}
	if _, _, err := runtimeAssetURLs(release); err == nil {
		t.Fatal("source zipball fallback accepted")
	}
	// Construct the API response using JSON to avoid duplicating its anonymous asset type.
	raw := `{"tag_name":"v1.4.5","assets":[{"name":"ltth_latest.json","browser_download_url":"https://example.invalid/manifest"},{"name":"ltth_latest.zip","browser_download_url":"https://example.invalid/archive"}]}`
	if err := json.Unmarshal([]byte(raw), release); err != nil {
		t.Fatal(err)
	}
	if _, _, err := runtimeAssetURLs(release); err != nil {
		t.Fatal(err)
	}
	if _, err := selectReleaseForChannel([]GitHubRelease{*release}, updateChannelStable); err != nil {
		t.Fatal("verified assets require obsolete zipball", err)
	}
	release.Assets[0].BrowserDownloadURL = "http://example.invalid/manifest"
	if _, _, err := runtimeAssetURLs(release); err == nil {
		t.Fatal("non-HTTPS accepted")
	}
	release.Assets[0].BrowserDownloadURL = "https://example.invalid/manifest"
	release.Assets = append(release.Assets, release.Assets[0])
	if _, _, err := runtimeAssetURLs(release); err == nil {
		t.Fatal("duplicate manifest accepted")
	}
	if err := runtimeHTTPClient().CheckRedirect(&http.Request{URL: mustIntegrityURL(t, "http://example.invalid")}, nil); err == nil {
		t.Fatal("HTTPS downgrade redirect accepted")
	}
}

func mustIntegrityURL(t *testing.T, value string) *url.URL {
	t.Helper()
	u, e := url.Parse(value)
	if e != nil {
		t.Fatal(e)
	}
	return u
}

func TestRuntimeSwapRollbackVersionRestoreFailure(t *testing.T) {
	dir := t.TempDir()
	app := filepath.Join(dir, "app")
	work := filepath.Join(dir, "work")
	stage := filepath.Join(work, "app")
	version := filepath.Join(dir, "version.txt")
	backup := filepath.Join(dir, "backup", "app")
	os.MkdirAll(app, 0755)
	os.MkdirAll(stage, 0755)
	os.WriteFile(filepath.Join(app, "old"), []byte("old"), 0600)
	os.WriteFile(filepath.Join(stage, "old"), []byte("replacement"), 0600)
	os.WriteFile(version, []byte("v1.4.4"), 0600)
	rename := func(a, b string) error {
		if a == filepath.Join(work, "version.new") {
			return errors.New("install version failed")
		}
		if a == filepath.Join(work, "version.old") {
			return errors.New("restore version failed")
		}
		return os.Rename(a, b)
	}
	err := swapRuntimeStage(app, stage, version, "v1.4.5", backup, rename)
	if err == nil || !strings.Contains(err.Error(), "restore version") {
		t.Fatal("restore error hidden", err)
	}
	data, e := os.ReadFile(filepath.Join(work, "version.old"))
	if e != nil || string(data) != "v1.4.4" {
		t.Fatal("old version recovery bytes lost")
	}
	if _, e = os.Stat(filepath.Join(app, "old")); e != nil {
		t.Fatal("old app lost")
	}
}

func TestRuntimeSuccessfulSwapHasRestorableVersion(t *testing.T) {
	dir := t.TempDir()
	app := filepath.Join(dir, "app")
	stage := filepath.Join(dir, "work", "app")
	version := filepath.Join(dir, "version.txt")
	backup := filepath.Join(dir, "backup", "app")
	pointer := []byte("D:\\LTTH profile\r\n")
	env := []byte("PORT=3000\r\nNODE_ENV=production\r\n")
	os.MkdirAll(app, 0755)
	os.MkdirAll(stage, 0755)
	os.WriteFile(filepath.Join(app, "old"), []byte("old"), 0600)
	os.WriteFile(filepath.Join(stage, "old"), []byte("replacement"), 0600)
	os.WriteFile(filepath.Join(app, ".config_path"), pointer, 0600)
	os.WriteFile(filepath.Join(app, ".env"), env, 0600)
	os.WriteFile(filepath.Join(app, ".env.example"), []byte("PORT=\nNODE_ENV=\n"), 0600)
	os.WriteFile(filepath.Join(stage, "new"), []byte("new"), 0600)
	os.WriteFile(filepath.Join(stage, ".env.example"), []byte("PORT=\nNODE_ENV=\n"), 0600)
	os.WriteFile(version, []byte("v1.4.4"), 0600)
	if e := swapRuntimeStage(app, stage, version, "v1.4.5", backup, os.Rename); e != nil {
		t.Fatal(e)
	}
	data, e := os.ReadFile(filepath.Join(app, ".config_path"))
	if e != nil || string(data) != string(pointer) {
		t.Fatal("successful update did not preserve bootstrap pointer bytes")
	}
	data, e = os.ReadFile(filepath.Join(app, ".env"))
	if e != nil || string(data) != string(env) {
		t.Fatal("compatible .env was not preserved byte-for-byte")
	}
	data, e = os.ReadFile(filepath.Join(backup, ".config_path"))
	if e != nil || string(data) != string(pointer) {
		t.Fatal("old backup lost bootstrap pointer bytes")
	}
	data, e = os.ReadFile(filepath.Join(backup, ".env"))
	if e != nil || string(data) != string(env) {
		t.Fatal("old backup lost .env bytes")
	}
	if e := os.WriteFile(filepath.Join(backup, "new"), []byte("rollback replacement"), 0600); e != nil {
		t.Fatal(e)
	}
	data, e = os.ReadFile(filepath.Join(filepath.Dir(backup), "version.txt"))
	if e != nil || string(data) != "v1.4.4" {
		t.Fatal("backup version missing")
	}
	if e := swapRuntimeStage(app, backup, version, string(data), filepath.Join(dir, "failed", "app"), os.Rename); e != nil {
		t.Fatal(e)
	}
	data, _ = os.ReadFile(version)
	if string(data) != "v1.4.4" {
		t.Fatal("rollback version incorrect")
	}
	if _, e = os.Stat(filepath.Join(app, "new")); e != nil {
		t.Fatal("rollback app incorrect")
	}
}

func TestRuntimeSwapRejectsIncompatibleEnvWithoutChangingOldApp(t *testing.T) {
	dir := t.TempDir()
	app := filepath.Join(dir, "app")
	stage := filepath.Join(dir, "work", "app")
	version := filepath.Join(dir, "version.txt")
	backup := filepath.Join(dir, "backup", "app")
	pointer := []byte("E:\\Custom profile\r\n")
	env := []byte("LEGACY_PRIVATE=value\r\n")
	os.MkdirAll(app, 0755)
	os.MkdirAll(stage, 0755)
	os.WriteFile(filepath.Join(app, "old"), []byte("old"), 0600)
	os.WriteFile(filepath.Join(stage, "old"), []byte("replacement"), 0600)
	os.WriteFile(filepath.Join(app, ".config_path"), pointer, 0600)
	os.WriteFile(filepath.Join(app, ".env"), env, 0600)
	os.WriteFile(filepath.Join(stage, ".env.example"), []byte("PORT=\n"), 0600)
	os.WriteFile(version, []byte("v1.4.4"), 0600)
	if err := swapRuntimeStage(app, stage, version, "v1.4.5", backup, os.Rename); err == nil {
		t.Fatal("incompatible .env accepted")
	}
	for name, expected := range map[string][]byte{"old": []byte("old"), ".config_path": pointer, ".env": env} {
		actual, err := os.ReadFile(filepath.Join(app, name))
		if err != nil || string(actual) != string(expected) {
			t.Fatalf("old app file %s changed: %v", name, err)
		}
	}
	data, err := os.ReadFile(version)
	if err != nil || string(data) != "v1.4.4" {
		t.Fatal("version changed after incompatible .env")
	}
	if _, err := os.Stat(backup); !os.IsNotExist(err) {
		t.Fatal("backup transaction started before compatibility check")
	}
}

func TestRuntimeSwapMigratesConfigButKeepsReleaseOwnedFiles(t *testing.T) {
	dir := t.TempDir()
	app := filepath.Join(dir, "app")
	stage := filepath.Join(dir, "work", "app")
	version := filepath.Join(dir, "version.txt")
	backup := filepath.Join(dir, "backup", "app")
	oldConfig := []byte("user setting bytes\r\n")
	if err := os.MkdirAll(filepath.Join(app, "config"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(app, "config", "custom"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(stage, "config"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(stage, "config", "custom"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(app, "config", "user-settings.json"), oldConfig, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(app, "config", "distribution-mode.json"), []byte(`{"channel":"old"}`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(app, "config", "plugin-release-policy.json"), []byte(`{"schemaVersion":0}`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(app, "config", "custom", "distribution-mode.json"), []byte("custom marker bytes"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(app, "config", "custom", "plugin-release-policy.json"), []byte("custom policy bytes"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(stage, "config", "distribution-mode.json"), []byte(`{"channel":"public"}`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(stage, "config", "plugin-release-policy.json"), []byte(`{"schemaVersion":1}`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(version, []byte("v1.4.4"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := swapRuntimeStage(app, stage, version, "v1.4.5", backup, os.Rename); err != nil {
		t.Fatal(err)
	}
	actual, err := os.ReadFile(filepath.Join(app, "config", "user-settings.json"))
	if err != nil || !bytes.Equal(actual, oldConfig) {
		t.Fatalf("existing user config was not migrated byte-for-byte: %v", err)
	}
	for name, expected := range map[string]string{"distribution-mode.json": `{"channel":"public"}`, "plugin-release-policy.json": `{"schemaVersion":1}`} {
		actual, err := os.ReadFile(filepath.Join(app, "config", name))
		if err != nil || string(actual) != expected {
			t.Fatalf("release-owned %s was overwritten: %v", name, err)
		}
	}
	for name, expected := range map[string]string{"distribution-mode.json": "custom marker bytes", "plugin-release-policy.json": "custom policy bytes"} {
		actual, err := os.ReadFile(filepath.Join(app, "config", "custom", name))
		if err != nil || string(actual) != expected {
			t.Fatalf("nested user config %s was not migrated: %v", name, err)
		}
	}
}

func TestRuntimeSwapAllowsBundledNestedPluginDataPresentInStage(t *testing.T) {
	dir := t.TempDir()
	app := filepath.Join(dir, "app")
	stage := filepath.Join(dir, "work", "app")
	version := filepath.Join(dir, "version.txt")
	backup := filepath.Join(dir, "backup", "app")
	relative := filepath.Join("plugins", "quiz-show", "data", "allgemeinwissen-40.json")
	contents := []byte(`{"questions":["synthetic"]}`)
	for _, root := range []string{app, stage} {
		if err := os.MkdirAll(filepath.Join(root, filepath.Dir(relative)), 0755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(app, relative), contents, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(stage, relative), contents, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(version, []byte("v1.4.4"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := swapRuntimeStage(app, stage, version, "v1.4.5", backup, os.Rename); err != nil {
		t.Fatalf("bundled nested plugin data blocked update: %v", err)
	}
	actual, err := os.ReadFile(filepath.Join(app, relative))
	if err != nil || !bytes.Equal(actual, contents) {
		t.Fatalf("staged plugin data did not remain byte-identical: %v", err)
	}
}

func TestRuntimeSwapNestedPluginDataRequiresByteIdenticalStage(t *testing.T) {
	for _, tc := range []struct {
		name       string
		stageBytes []byte
		wantErr    bool
	}{
		{name: "identical", stageBytes: []byte("user modified quiz")},
		{name: "changed", stageBytes: []byte("new release"), wantErr: true},
		{name: "missing", wantErr: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			app := filepath.Join(dir, "app")
			stage := filepath.Join(dir, "work", "app")
			version := filepath.Join(dir, "version.txt")
			backup := filepath.Join(dir, "backup", "app")
			relative := filepath.Join("plugins", "quiz-show", "data", "allgemeinwissen-40.json")
			activeBytes := []byte("user modified quiz")
			if err := os.MkdirAll(filepath.Join(app, filepath.Dir(relative)), 0755); err != nil {
				t.Fatal(err)
			}
			if err := os.MkdirAll(filepath.Join(stage, filepath.Dir(relative)), 0755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(app, relative), activeBytes, 0600); err != nil {
				t.Fatal(err)
			}
			if tc.stageBytes != nil {
				if err := os.WriteFile(filepath.Join(stage, relative), tc.stageBytes, 0600); err != nil {
					t.Fatal(err)
				}
			}
			if err := os.WriteFile(filepath.Join(stage, "new-runtime.js"), []byte("new runtime"), 0600); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(version, []byte("v1.4.4"), 0600); err != nil {
				t.Fatal(err)
			}
			renameCalled := false
			rename := func(from, to string) error {
				renameCalled = true
				return os.Rename(from, to)
			}
			err := swapRuntimeStage(app, stage, version, "v1.4.5", backup, rename)
			if (err != nil) != tc.wantErr {
				t.Fatalf("unexpected swap result: %v", err)
			}
			if tc.wantErr {
				if renameCalled {
					t.Fatal("rename began despite changed or missing data")
				}
				actual, readErr := os.ReadFile(filepath.Join(app, relative))
				if readErr != nil || !bytes.Equal(actual, activeBytes) {
					t.Fatalf("active data changed: %v", readErr)
				}
				if _, statErr := os.Stat(backup); !os.IsNotExist(statErr) {
					t.Fatal("backup created despite continuity failure")
				}
				actual, readErr = os.ReadFile(filepath.Join(stage, "new-runtime.js"))
				if readErr != nil || string(actual) != "new runtime" {
					t.Fatalf("stage changed: %v", readErr)
				}
				if tc.stageBytes == nil {
					if _, statErr := os.Stat(filepath.Join(stage, relative)); !os.IsNotExist(statErr) {
						t.Fatal("missing stage file unexpectedly appeared")
					}
				} else {
					actual, readErr = os.ReadFile(filepath.Join(stage, relative))
					if readErr != nil || !bytes.Equal(actual, tc.stageBytes) {
						t.Fatalf("stage data changed: %v", readErr)
					}
				}
				actual, readErr = os.ReadFile(version)
				if readErr != nil || string(actual) != "v1.4.4" {
					t.Fatalf("version changed: %v", readErr)
				}
				return
			}
			actual, readErr := os.ReadFile(filepath.Join(app, relative))
			if readErr != nil || !bytes.Equal(actual, activeBytes) {
				t.Fatalf("identical staged data changed bytes: %v", readErr)
			}
		})
	}
}

func TestRuntimeSwapRejectsConfigPointerInsideAppBeforeStageMutation(t *testing.T) {
	dir := t.TempDir()
	app := filepath.Join(dir, "app")
	stage := filepath.Join(dir, "work", "app")
	version := filepath.Join(dir, "version.txt")
	backup := filepath.Join(dir, "backup", "app")
	if err := os.MkdirAll(app, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(stage, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(app, ".config_path"), []byte(filepath.Join(app, "user_configs")), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(stage, "new"), []byte("new runtime"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(version, []byte("v1.4.4"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := swapRuntimeStage(app, stage, version, "v1.4.5", backup, os.Rename); err == nil {
		t.Fatal("in-app profile pointer accepted")
	}
	if _, err := os.Stat(filepath.Join(stage, ".config_path")); !os.IsNotExist(err) {
		t.Fatal("stage was modified before rejecting in-app pointer")
	}
	if _, err := os.Stat(backup); !os.IsNotExist(err) {
		t.Fatal("backup transaction started despite invalid pointer")
	}
}

func TestRuntimeSwapFailsClosedOnUnmigratedDataBeforeAnyRename(t *testing.T) {
	cases := map[string]string{
		"sqlite-wal":        filepath.Join("user_configs", "private.db-wal"),
		"sqlite-shm":        filepath.Join("user_configs", "private.db-shm"),
		"profile-directory": filepath.Join("user_configs", "profile.json"),
		"plugin-data":       filepath.Join("plugins", "example", "data", "state.json"),
		"uploads":           filepath.Join("uploads", "capture.bin"),
		"unknown-user-file": filepath.Join("custom-state.json"),
	}
	for name, relative := range cases {
		t.Run(name, func(t *testing.T) {
			dir := t.TempDir()
			app := filepath.Join(dir, "app")
			stage := filepath.Join(dir, "work", "app")
			version := filepath.Join(dir, "version.txt")
			backup := filepath.Join(dir, "backup", "app")
			dataPath := filepath.Join(app, relative)
			payload := []byte("sensitive synthetic user state")
			if err := os.MkdirAll(filepath.Dir(dataPath), 0755); err != nil {
				t.Fatal(err)
			}
			if err := os.MkdirAll(stage, 0755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(dataPath, payload, 0600); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(app, ".config_path"), []byte("D:\\Synthetic profile\\r\\n"), 0600); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(stage, "new-runtime.js"), []byte("new runtime"), 0600); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(version, []byte("v1.4.4"), 0600); err != nil {
				t.Fatal(err)
			}
			renameCalled := false
			rename := func(from, to string) error {
				renameCalled = true
				return os.Rename(from, to)
			}
			if err := swapRuntimeStage(app, stage, version, "v1.4.5", backup, rename); err == nil {
				t.Fatal("unsafe existing data was accepted")
			}
			if renameCalled {
				t.Fatal("rename began before continuity preflight completed")
			}
			actual, err := os.ReadFile(dataPath)
			if err != nil || !bytes.Equal(actual, payload) {
				t.Fatalf("active data changed: %v", err)
			}
			if _, err := os.Stat(backup); !os.IsNotExist(err) {
				t.Fatal("backup was created despite failed preflight")
			}
			actual, err = os.ReadFile(filepath.Join(stage, "new-runtime.js"))
			if err != nil || string(actual) != "new runtime" {
				t.Fatal("stage was changed before failed preflight")
			}
			actual, err = os.ReadFile(version)
			if err != nil || string(actual) != "v1.4.4" {
				t.Fatal("version changed despite failed preflight")
			}
			if _, err := os.Stat(filepath.Join(stage, ".config_path")); !os.IsNotExist(err) {
				t.Fatal("config migration ran before failed preflight")
			}
		})
	}
}

func TestPruneUpdateBackupsPreservesUnclassifiedUserData(t *testing.T) {
	root := t.TempDir()
	paths := map[string][]byte{
		filepath.Join("oldest", "app", ".config_path"):                  []byte("F:\\Profile\r\n"),
		filepath.Join("oldest", "app", "user_configs", "profile.db"):    []byte("profile-bytes"),
		filepath.Join("middle", "app", ".env"):                          []byte("TOKEN=private\r\n"),
		filepath.Join("newest", "app", "plugins", "local", "data.json"): []byte("plugin-state"),
	}
	for relative, contents := range paths {
		file := filepath.Join(root, relative)
		if err := os.MkdirAll(filepath.Dir(file), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(file, contents, 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := pruneUpdateBackups(root, 1); err == nil || !strings.Contains(err.Error(), "no backups removed") {
		t.Fatalf("unsafe pruning was not reported: %v", err)
	}
	for relative, expected := range paths {
		actual, err := os.ReadFile(filepath.Join(root, relative))
		if err != nil || string(actual) != string(expected) {
			t.Fatalf("backup data %s lost or changed: %v", relative, err)
		}
	}
}

func TestRuntimeSemverOrdering(t *testing.T) {
	for _, version := range []string{"01.4.5", "1.4.5-beta.01", "1.4.5-.", "1.4"} {
		if validRuntimeVersion(version) {
			t.Fatalf("accepted invalid semver %s", version)
		}
	}
	for _, pair := range [][2]string{{"1.4.5", "1.4.5-beta.2"}, {"1.4.5-beta.10", "1.4.5-beta.2"}, {"1.4.6-beta.1", "1.4.5"}, {"1.4.5-z", "1.4.5-2"}} {
		if compareRuntimeVersions(pair[0], pair[1]) <= 0 {
			t.Fatalf("bad ordering %v", pair)
		}
	}
}

func TestRuntimeAllWithdrawnPluginFixtures(t *testing.T) {
	ids := []string{"animazingpal", "interactive-story", "music-bot", "osc-bridge", "schnorrbecher", "sidekick", "stream-monsters", "talking-heads", "visual-fx-frame-webgpu", "webgpu-emoji-rain", "webgpu-weather-control"}
	policy, _ := json.Marshal(map[string]interface{}{"schemaVersion": 1, "closedBeta": ids, "aliases": map[string]string{"streamalchemy": "stream-monsters"}, "publicAssetPathOwners": map[string]string{}})
	for _, id := range append(ids, "chatango", "streamalchemy", "Chatango", "Ｃｈａｔａｎｇｏ", "%63hatango", "%2563hatango") {
		t.Run(id, func(t *testing.T) {
			archive := integrityArchive(t, map[string]string{"ltth_1.4.5/app/config/plugin-release-policy.json": string(policy), "ltth_1.4.5/app/plugins/" + id + "/main.js": "withdrawn"})
			if err := stageRuntimeArchive(archive, filepath.Join(t.TempDir(), "stage"), "1.4.5"); err == nil {
				t.Fatal("withdrawn plugin accepted")
			}
		})
	}
}
