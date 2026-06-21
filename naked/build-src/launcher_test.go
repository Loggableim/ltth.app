package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Test shouldCheckForUpdates rate limiting
func TestShouldCheckForUpdates(t *testing.T) {
	// Get the test executable directory
	exePath, err := os.Executable()
	if err != nil {
		t.Fatalf("Failed to get executable path: %v", err)
	}
	exeDir := filepath.Dir(exePath)
	
	// Create runtime directory
	runtimeDir := filepath.Join(exeDir, "runtime")
	os.MkdirAll(runtimeDir, 0755)
	defer os.RemoveAll(runtimeDir) // Clean up
	
	// First check should return true (no previous check)
	if !shouldCheckForUpdates() {
		t.Error("First check should return true")
	}
	
	// Write recent check time
	checkFile := filepath.Join(exeDir, updateCheckFile)
	recentTime := time.Now().Add(-1 * time.Hour).Format(time.RFC3339)
	os.WriteFile(checkFile, []byte(recentTime), 0644)
	defer os.Remove(checkFile) // Clean up
	
	// Should return false (recent check)
	if shouldCheckForUpdates() {
		t.Error("Should return false for recent check (< 24h)")
	}
	
	// Write old check time (25 hours ago)
	oldTime := time.Now().Add(-25 * time.Hour).Format(time.RFC3339)
	os.WriteFile(checkFile, []byte(oldTime), 0644)
	
	// Should return true (old check)
	if !shouldCheckForUpdates() {
		t.Error("Should return true for old check (> 24h)")
	}
}

// Test getLocalCommitSHA and writeLocalCommitSHA
func TestCommitSHAReadWrite(t *testing.T) {
	// Get the test executable directory
	exePath, err := os.Executable()
	if err != nil {
		t.Fatalf("Failed to get executable path: %v", err)
	}
	exeDir := filepath.Dir(exePath)
	
	// Create runtime directory
	runtimeDir := filepath.Join(exeDir, "runtime")
	os.MkdirAll(runtimeDir, 0755)
	defer os.RemoveAll(runtimeDir) // Clean up
	
	testSHA := "abc123def456"
	
	// Write SHA
	err = writeLocalCommitSHA(testSHA)
	if err != nil {
		t.Fatalf("Failed to write SHA: %v", err)
	}
	defer os.Remove(filepath.Join(exeDir, versionSHAFile)) // Clean up
	
	// Read SHA
	readSHA, err := getLocalCommitSHA()
	if err != nil {
		t.Fatalf("Failed to read SHA: %v", err)
	}
	
	// Compare
	if readSHA != testSHA {
		t.Errorf("Expected SHA %s, got %s", testSHA, readSHA)
	}
}

// Test filterRelevantFiles whitelist/blacklist logic
func TestFilterRelevantFiles(t *testing.T) {
	testFiles := []GitHubTreeItem{
		{Path: "app/server.js", Type: "blob"},
		{Path: "plugins/plugin1/main.js", Type: "blob"},
		{Path: "game-engine/engine.js", Type: "blob"},
		{Path: "package.json", Type: "blob"},
		{Path: "package-lock.json", Type: "blob"},
		{Path: "launcher.exe", Type: "blob"}, // Should be filtered
		{Path: "runtime/node/node.exe", Type: "blob"}, // Should be filtered
		{Path: "logs/app.log", Type: "blob"}, // Should be filtered
		{Path: "data/settings.db", Type: "blob"}, // Should be filtered
		{Path: "node_modules/express/index.js", Type: "blob"}, // Should be filtered
		{Path: ".git/config", Type: "blob"}, // Should be filtered
		{Path: "build-src/launcher.go", Type: "blob"}, // Should be filtered
		{Path: ".github/workflows/test.yml", Type: "blob"}, // Should be filtered
		{Path: "README.md", Type: "blob"}, // Should be filtered
		{Path: "LICENSE", Type: "blob"}, // Should be filtered
	}
	
	filtered := filterRelevantFiles(testFiles)
	
	// Should have exactly 5 files (app, plugins, game-engine, package.json, package-lock.json)
	if len(filtered) != 5 {
		t.Errorf("Expected 5 files, got %d", len(filtered))
		for _, f := range filtered {
			t.Logf("  - %s", f.Path)
		}
	}
	
	// Verify expected files are present
	expectedPaths := map[string]bool{
		"app/server.js": true,
		"plugins/plugin1/main.js": true,
		"game-engine/engine.js": true,
		"package.json": true,
		"package-lock.json": true,
	}
	
	for _, file := range filtered {
		if !expectedPaths[file.Path] {
			t.Errorf("Unexpected file in filtered list: %s", file.Path)
		}
	}
	
	// Verify blacklisted files are not present
	for _, file := range filtered {
		if file.Path == "launcher.exe" || 
		   file.Path == "runtime/node/node.exe" ||
		   file.Path == "logs/app.log" ||
		   file.Path == "README.md" {
			t.Errorf("Blacklisted file should not be in filtered list: %s", file.Path)
		}
	}
}

// Test updateLastCheckTime
func TestUpdateLastCheckTime(t *testing.T) {
	// Get the test executable directory
	exePath, err := os.Executable()
	if err != nil {
		t.Fatalf("Failed to get executable path: %v", err)
	}
	exeDir := filepath.Dir(exePath)
	
	// Create runtime directory
	runtimeDir := filepath.Join(exeDir, "runtime")
	os.MkdirAll(runtimeDir, 0755)
	defer os.RemoveAll(runtimeDir) // Clean up
	
	// Update check time
	updateLastCheckTime()
	
	// Verify file was created
	checkFile := filepath.Join(exeDir, updateCheckFile)
	defer os.Remove(checkFile) // Clean up
	
	if _, err := os.Stat(checkFile); os.IsNotExist(err) {
		t.Error("Check file was not created")
		return
	}
	
	// Verify content is a valid timestamp
	data, err := os.ReadFile(checkFile)
	if err != nil {
		t.Fatalf("Failed to read check file: %v", err)
	}
	
	_, err = time.Parse(time.RFC3339, string(data))
	if err != nil {
		t.Errorf("Check file content is not a valid RFC3339 timestamp: %v", err)
	}
}

// ============================================
// Tests for GitHub Releases functionality
// ============================================

// Test compareVersions semantic version comparison
func TestCompareVersions(t *testing.T) {
	tests := []struct {
		v1       string
		v2       string
		expected int
	}{
		{"1.0.0", "1.0.0", 0},
		{"1.0.0", "1.0.1", -1},
		{"1.0.1", "1.0.0", 1},
		{"1.1.0", "1.0.9", 1},
		{"2.0.0", "1.9.9", 1},
		{"v1.0.0", "v1.0.0", 0},
		{"v1.2.3", "1.2.3", 0},
		{"1.0.0", "v1.0.0", 0},
		{"1.0.0-beta", "1.0.0", 0}, // Pre-release tags are ignored
		{"1.0", "1.0.0", 0},
		{"1", "1.0.0", 0},
	}

	for _, test := range tests {
		result := compareVersions(test.v1, test.v2)
		if result != test.expected {
			t.Errorf("compareVersions(%q, %q) = %d, expected %d", 
				test.v1, test.v2, result, test.expected)
		}
	}
}

// Test getLocalVersion and writeLocalVersion
func TestVersionReadWrite(t *testing.T) {
	// Get the test executable directory
	exePath, err := os.Executable()
	if err != nil {
		t.Fatalf("Failed to get executable path: %v", err)
	}
	exeDir := filepath.Dir(exePath)
	
	// Create runtime directory
	runtimeDir := filepath.Join(exeDir, "runtime")
	os.MkdirAll(runtimeDir, 0755)
	defer os.RemoveAll(runtimeDir) // Clean up
	
	testVersion := "v1.2.3"
	
	// Write version
	err = writeLocalVersion(testVersion)
	if err != nil {
		t.Fatalf("Failed to write version: %v", err)
	}
	defer os.Remove(getVersionFilePath()) // Clean up
	
	// Read version
	readVersion, err := getLocalVersion()
	if err != nil {
		t.Fatalf("Failed to read version: %v", err)
	}
	
	// Compare
	if readVersion != testVersion {
		t.Errorf("Expected version %s, got %s", testVersion, readVersion)
	}
}

// Test detectUpdateMode auto-detection
func TestDetectUpdateMode(t *testing.T) {
	// Get the test executable directory
	exePath, err := os.Executable()
	if err != nil {
		t.Fatalf("Failed to get executable path: %v", err)
	}
	exeDir := filepath.Dir(exePath)
	
	// Create runtime directory
	runtimeDir := filepath.Join(exeDir, "runtime")
	os.MkdirAll(runtimeDir, 0755)
	defer os.RemoveAll(runtimeDir) // Clean up
	
	// Test 1: No files exist - should default to release mode
	mode := detectUpdateMode()
	if mode != updateModeRelease {
		t.Errorf("Expected %s mode when no files exist, got %s", updateModeRelease, mode)
	}
	
	// Test 2: version.txt exists - should use release mode
	writeLocalVersion("v1.0.0")
	defer os.Remove(getVersionFilePath())
	
	mode = detectUpdateMode()
	if mode != updateModeRelease {
		t.Errorf("Expected %s mode when version.txt exists, got %s", updateModeRelease, mode)
	}
	
	// Test 3: Remove version.txt, add version_sha.txt - should use commit mode
	os.Remove(getVersionFilePath())
	writeLocalCommitSHA("abc123")
	defer os.Remove(filepath.Join(exeDir, versionSHAFile))
	
	mode = detectUpdateMode()
	if mode != updateModeCommit {
		t.Errorf("Expected %s mode when version_sha.txt exists, got %s", updateModeCommit, mode)
	}
	
	// Test 4: Environment variable override
	os.Setenv("LTTH_UPDATE_MODE", "commit")
	defer os.Unsetenv("LTTH_UPDATE_MODE")
	
	mode = detectUpdateMode()
	if mode != updateModeCommit {
		t.Errorf("Expected %s mode from env var, got %s", updateModeCommit, mode)
	}
}

