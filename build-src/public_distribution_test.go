package main

import (
	"archive/zip"
	"os"
	"path/filepath"
	"testing"
)

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
