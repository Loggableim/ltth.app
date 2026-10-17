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

	testVersion := "v1.3.21"

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
