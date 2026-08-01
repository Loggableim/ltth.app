//go:build windows

package main

import (
	"errors"
	"io"
	"log"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestProductionDependencyRepairRefusesRecognizedNativeModuleProcessBeforeNpmCI(t *testing.T) {
	launcher := NewLauncher()
	launcher.appDir = t.TempDir()
	launcher.nodePath = filepath.Join(t.TempDir(), "node.exe")

	previousScanner := productionNativeModuleProcessIDs
	productionNativeModuleProcessIDs = func(_ string) ([]int, error) {
		return []int{4242}, nil
	}
	defer func() { productionNativeModuleProcessIDs = previousScanner }()

	launcher.dependencyCommandRunner = func(_ string, _ []string, _ string, _ []string) ([]byte, error) {
		return []byte("production dependency integrity check failed"), errors.New("exit status 1")
	}
	installCalls := 0
	launcher.dependencyInstaller = func() error {
		installCalls++
		return nil
	}

	_, err := launcher.ensureProductionDependencies()
	if err == nil {
		t.Fatal("locked native module should refuse production dependency repair")
	}
	if !strings.Contains(err.Error(), "locked by another process") || !strings.Contains(err.Error(), "better_sqlite3.node") {
		t.Fatalf("locked native module error should be actionable, got %v", err)
	}
	if installCalls != 0 {
		t.Fatalf("npm ci must not run while native module is locked, got %d install calls", installCalls)
	}
}

func TestManualDependencyRepairRefusesRecognizedNativeModuleProcessBeforeNpmCI(t *testing.T) {
	launcher := NewLauncher()
	launcher.appDir = t.TempDir()
	nodeDir := t.TempDir()
	launcher.nodePath = filepath.Join(nodeDir, "node.exe")
	launcher.logger = log.New(io.Discard, "", 0)
	npmMarkerPath := filepath.Join(t.TempDir(), "npm-invoked.txt")
	npmCmdPath := filepath.Join(nodeDir, "npm.cmd")
	if err := os.WriteFile(npmCmdPath, []byte("@echo npm-invoked> \""+npmMarkerPath+"\"\r\n@exit /b 0\r\n"), 0644); err != nil {
		t.Fatalf("write fake npm command: %v", err)
	}

	previousScanner := productionNativeModuleProcessIDs
	productionNativeModuleProcessIDs = func(_ string) ([]int, error) {
		return []int{4242}, nil
	}
	defer func() { productionNativeModuleProcessIDs = previousScanner }()

	result, err := launcher.applyFixAction("dependencies-install")
	if err == nil || result != nil {
		t.Fatalf("manual dependency repair should refuse a recognized native module process, result=%#v err=%v", result, err)
	}
	if !strings.Contains(err.Error(), "locked by another process") || !strings.Contains(err.Error(), "PID 4242") {
		t.Fatalf("manual dependency repair error should identify the lock, got %v", err)
	}
	if _, err := os.Stat(npmMarkerPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("manual dependency repair must not invoke npm while native module is locked, marker error=%v", err)
	}
}

func TestProductionDependencyInstallFailureExplainsLockedNativeModule(t *testing.T) {
	appDir := filepath.Join(`C:\LTTH`, "app")
	nativeModulePath := filepath.Join(appDir, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node")
	cause := errors.New("exit status 0xfffff030")
	stderrOutput := strings.Join([]string{
		"npm error code EPERM",
		"npm error syscall unlink",
		"npm error path " + nativeModulePath,
	}, "\n")

	err := productionDependencyInstallFailure(cause, stderrOutput, appDir)
	if !strings.Contains(err.Error(), "locked by another process") || !strings.Contains(err.Error(), "better_sqlite3.node") {
		t.Fatalf("native module lock failure should be actionable, got %v", err)
	}
	if !errors.Is(err, cause) {
		t.Fatalf("native module lock failure should retain npm cause, got %v", err)
	}
}

func TestParseProductionNativeModuleProcessIDsAcceptsOnlyMarkedPositiveIDs(t *testing.T) {
	processIDs := parseProductionNativeModuleProcessIDs("PID:42\n42\nwarning 77\nPID:-2\nPID:003\nPID:not-a-number\nPID:42\n")

	want := []int{3, 42}
	if !reflect.DeepEqual(processIDs, want) {
		t.Fatalf("process IDs = %#v, want %#v", processIDs, want)
	}
}

func TestWaitForCommandOutputReadersWaitsForStderr(t *testing.T) {
	stdoutDone := make(chan struct{})
	stderrDone := make(chan struct{})
	returned := make(chan struct{})
	go func() {
		waitForCommandOutputReaders(stdoutDone, stderrDone)
		close(returned)
	}()

	close(stdoutDone)
	select {
	case <-returned:
		t.Fatal("output reader wait must not return before stderr is drained")
	case <-time.After(50 * time.Millisecond):
	}

	close(stderrDone)
	select {
	case <-returned:
	case <-time.After(time.Second):
		t.Fatal("output reader wait did not return after both streams drained")
	}
}
