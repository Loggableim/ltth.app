package main

import (
	"archive/zip"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type publicDistributionPolicy struct {
	ClosedBeta            []string          `json:"closedBeta"`
	PublicRuntimeExcluded []string          `json:"publicRuntimeExcluded"`
	Aliases               map[string]string `json:"aliases"`
}

func TestSourceZipballStagesOnlyPublicRuntimePlugins(t *testing.T) {
	policyPath := filepath.Join("..", "app", "config", "plugin-release-policy.json")
	policyBytes, err := os.ReadFile(policyPath)
	if err != nil {
		t.Fatal(err)
	}
	var policy publicDistributionPolicy
	if err := json.Unmarshal(policyBytes, &policy); err != nil {
		t.Fatal(err)
	}
	if len(policy.ClosedBeta) != 11 || len(policy.PublicRuntimeExcluded) != 1 || policy.PublicRuntimeExcluded[0] != "gift-catalog" {
		t.Fatalf("unexpected runtime release policy: %+v", policy)
	}

	zipPath := filepath.Join(t.TempDir(), "source.zip")
	file, err := os.Create(zipPath)
	if err != nil {
		t.Fatal(err)
	}
	writer := zip.NewWriter(file)
	entries := map[string]string{
		"Loggableim-ltth.app-source/app/package.json":                        `{"version":"1.4.5"}`,
		"Loggableim-ltth.app-source/app/config/plugin-release-policy.json":   string(policyBytes),
		"Loggableim-ltth.app-source/app/server.js":                           "server",
		"Loggableim-ltth.app-source/app/public/js/chatango-theme-adapter.js": "retired",
		"Loggableim-ltth.app-source/app/public/js/osc-bridge-ui.js":          "closed beta",
		"Loggableim-ltth.app-source/app/public/js/webgpu-emoji-rain-ui.js":   "closed beta",
	}
	for _, id := range append(append([]string{}, policy.ClosedBeta...), "chatango", "streamalchemy", "gift-catalog", "minecraft-connect", "webgpu-fireworks", "fireworks") {
		manifestID := id
		if id == "streamalchemy" {
			manifestID = "stream-monsters"
		}
		entries["Loggableim-ltth.app-source/app/plugins/"+id+"/plugin.json"] = `{"id":"` + manifestID + `"}`
		entries["Loggableim-ltth.app-source/app/plugins/"+id+"/main.js"] = "plugin source"
	}
	for name, body := range entries {
		entry, err := writer.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = entry.Write([]byte(body)); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}

	dest := filepath.Join(t.TempDir(), "app")
	if err := extractAppSubdirFromGitHubZip(zipPath, dest); err != nil {
		t.Fatal(err)
	}
	for _, id := range append(append([]string{}, policy.ClosedBeta...), "chatango", "streamalchemy", "gift-catalog") {
		if _, err := os.Stat(filepath.Join(dest, "plugins", id)); !os.IsNotExist(err) {
			t.Errorf("private plugin extracted from source zipball: %s", id)
		}
	}
	for _, id := range []string{"minecraft-connect", "webgpu-fireworks", "fireworks"} {
		if _, err := os.Stat(filepath.Join(dest, "plugins", id, "plugin.json")); err != nil {
			t.Errorf("runtime-only plugin was incorrectly excluded: %s: %v", id, err)
		}
	}
	for _, asset := range []string{"js/chatango-theme-adapter.js", "js/osc-bridge-ui.js", "js/webgpu-emoji-rain-ui.js"} {
		if _, err := os.Stat(filepath.Join(dest, "public", filepath.FromSlash(asset))); !os.IsNotExist(err) {
			t.Errorf("retired or Beta asset extracted: %s", asset)
		}
	}
	marker, err := os.ReadFile(filepath.Join(dest, "config", "distribution-mode.json"))
	if err != nil || string(marker) != "{\"channel\":\"public\"}\n" {
		t.Fatalf("source zipball missing public mode marker: %s %v", marker, err)
	}
}

func TestPublicAppArchivePolicy(t *testing.T) {
	policy := `{"schemaVersion":1,"closedBeta":["music-bot","stream-monsters"],"aliases":{"streamalchemy":"stream-monsters"}}`
	for _, tc := range []struct {
		name, policy, extra string
		denied              bool
	}{
		{"valid", policy, "", false},
		{"valid-underscore", `{"schemaVersion":1,"closedBeta":["music-bot","stream-monsters","valid_id"],"aliases":{"streamalchemy":"stream-monsters"}}`, "", false},
		{"leading-hyphen", `{"schemaVersion":1,"closedBeta":["-invalid"]}`, "", true},
		{"overlong-id", `{"schemaVersion":1,"closedBeta":["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]}`, "", true},
		{"missing", "", "", true},
		{"bad-alias", `{"schemaVersion":1,"closedBeta":["music-bot"],"aliases":{"../escape":"music-bot"}}`, "", true},
		{"unknown-policy-key", `{"schemaVersion":1,"closedBeta":["music-bot"],"extra":true}`, "", true},
		{"self-alias", `{"schemaVersion":1,"closedBeta":["music-bot"],"aliases":{"music-bot":"music-bot"}}`, "", true},
		{"closed-id-alias", `{"schemaVersion":1,"closedBeta":["music-bot","stream-monsters"],"aliases":{"music-bot":"stream-monsters"}}`, "", true},
		{"retired-ascii-case-path", policy, "repo/app/plugins/CHATANGO/main.js", false},
		{"retired-nfkc-path", policy, "repo/app/plugins/Ｃｈａｔａｎｇｏ/main.js", false},
		{"retired-percent-path", policy, "repo/app/plugins/%63hatango/main.js", false},
		{"retired-double-percent-path", policy, "repo/app/plugins/%2563hatango/main.js", false},
		{"traversal", policy, "repo/app/plugins/../escape.txt", true},
		{"case-duplicate", policy, "repo/app/CONFIG/plugin-release-policy.json", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			temp := t.TempDir()
			archive := filepath.Join(temp, "app.zip")
			f, err := os.Create(archive)
			if err != nil {
				t.Fatal(err)
			}
			w := zip.NewWriter(f)
			entries := map[string]string{"repo/app/package.json": "{}", "repo/app/plugins/music-bot/main.js": "private", "repo/app/plugins/streamalchemy/main.js": "private", "repo/app/plugins/stream-monsters/main.js": "private", "repo/app/plugins/music-bot-extra/main.js": "public", "repo/app/config/distribution-mode.json": `{"channel":"developer"}`}
			for dir, manifest := range map[string]string{
				"renamed-beta":     `{"id":"music-bot"}`,
				"alias-beta":       `{"id":"vendor","aliases":["streamalchemy"]}`,
				"replacement-beta": `{"id":"vendor-other","replaces":["music-bot"]}`,
				"open-vendor":      `{"id":"open-vendor"}`,
			} {
				entries["repo/app/plugins/"+dir+"/plugin.json"] = manifest
				entries["repo/app/plugins/"+dir+"/main.js"] = "source"
				entries["repo/app/plugins/"+dir+"/assets/display.svg"] = "asset"
			}
			entries["repo/app/plugins/nested-owner/plugin.json"] = `{"id":"nested-owner"}`
			entries["repo/app/plugins/nested-owner/vendor/private/plugin.json"] = `{"id":"music-bot"}`
			entries["repo/app/plugins/nested-owner/main.js"] = "owner-source"
			entries["repo/app/plugins/nested-owner/assets/display.svg"] = "owner-asset"
			entries["repo/app/plugins/nested-directory/vendor/MUSIC-BOT/plugin.json"] = `{"id":"public-wrapper"}`
			entries["repo/app/plugins/nested-directory/main.js"] = "owner-source"
			entries["repo/app/plugins/open-vendor/vendor/music-bot-extra/plugin.json"] = `{"id":"public-wrapper"}`
			entries["repo/app/plugins/open-vendor/vendor/music-bot"] = "filename-not-directory"
			if tc.policy != "" {
				entries["repo/app/config/plugin-release-policy.json"] = tc.policy
			}
			if tc.extra != "" {
				entries[tc.extra] = "{}"
			}
			for name, data := range entries {
				entry, e := w.Create(name)
				if e != nil {
					t.Fatal(e)
				}
				if _, e = entry.Write([]byte(data)); e != nil {
					t.Fatal(e)
				}
			}
			w.Close()
			f.Close()
			dest := filepath.Join(temp, "dest")
			err = extractAppSubdirFromGitHubZip(archive, dest)
			if strings.HasPrefix(tc.name, "retired-") && err == nil {
				pluginDir := strings.Split(tc.extra, "/")[3]
				if _, e := os.Stat(filepath.Join(dest, "plugins", pluginDir)); !os.IsNotExist(e) {
					t.Fatalf("normalized retired path was extracted: %s", pluginDir)
				}
			}
			if tc.denied {
				if err == nil {
					t.Fatal("expected rejection")
				}
				if _, e := os.Stat(dest); !os.IsNotExist(e) {
					t.Fatal("invalid archive wrote destination")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			for _, id := range []string{"music-bot", "streamalchemy", "stream-monsters", "renamed-beta", "alias-beta", "replacement-beta", "nested-owner", "nested-directory"} {
				if _, e := os.Stat(filepath.Join(dest, "plugins", id)); !os.IsNotExist(e) {
					t.Fatalf("closed plugin extracted: %s", id)
				}
			}
			if _, e := os.Stat(filepath.Join(dest, "plugins", "music-bot-extra", "main.js")); e != nil {
				t.Fatal(e)
			}
			if _, e := os.Stat(filepath.Join(dest, "plugins", "open-vendor", "assets", "display.svg")); e != nil {
				t.Fatal(e)
			}
			for _, relative := range []string{"vendor/music-bot", "vendor/music-bot-extra/plugin.json"} {
				if _, e := os.Stat(filepath.Join(dest, "plugins", "open-vendor", filepath.FromSlash(relative))); e != nil {
					t.Fatal(e)
				}
			}
			b, e := os.ReadFile(filepath.Join(dest, "config", "distribution-mode.json"))
			if e != nil || string(b) != "{\"channel\":\"public\"}\n" {
				t.Fatalf("incorrect marker: %s %v", b, e)
			}
		})
	}
}

func TestPublicMarkerExistingAppWithoutUpdate(t *testing.T) {
	versionPath := getVersionFilePath()
	if err := os.MkdirAll(filepath.Dir(versionPath), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(versionPath, []byte("1.4.4"), 0644); err != nil {
		t.Fatal(err)
	}
	defer os.Remove(versionPath)
	appDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(appDir, "package.json"), []byte("{}"), 0644); err != nil {
		t.Fatal(err)
	}
	preserved := filepath.Join(appDir, "user-data.txt")
	os.WriteFile(preserved, []byte("preserved"), 0644)
	launcher := &Launcher{appDir: appDir, settings: LauncherSettings{UpdateChannel: updateChannelLocal}}
	if err := launcher.ensureAppReadyOnStartup(); err != nil {
		t.Fatal(err)
	}
	marker, err := os.ReadFile(filepath.Join(appDir, "config", "distribution-mode.json"))
	if err != nil || string(marker) != "{\"channel\":\"public\"}\n" {
		t.Fatalf("missing public marker: %s %v", marker, err)
	}
	data, err := os.ReadFile(preserved)
	if err != nil || string(data) != "preserved" {
		t.Fatal("existing data changed")
	}
}
