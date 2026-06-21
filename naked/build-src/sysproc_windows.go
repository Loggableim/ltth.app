//go:build windows

package main

import (
	"fmt"
	"os/exec"
	"strings"
	"syscall"
)

// setSysProcAttr konfiguriert den Child-Prozess für Windows.
// CREATE_NEW_PROCESS_GROUP verhindert, dass Strg+C direkt an Node weitergeleitet wird.
// Der Launcher behandelt das Signal selbst und ruft dann killNodeProcess() auf.
func setSysProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP | createNoWindow,
	}
}

// killNodeProcessOS beendet den Node-Prozess auf Windows via taskkill /T,
// um auch alle Child-Prozesse von Node zu beenden.
func killNodeProcessOS(cmd *exec.Cmd, pid int) {
	_ = terminateProcessTreeByPIDOS(pid)
}

func terminateProcessTreeByPIDOS(pid int) error {
	killCmd := exec.Command("taskkill", "/PID", fmt.Sprintf("%d", pid), "/F", "/T")
	killCmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: createNoWindow}
	output, err := killCmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("taskkill failed for PID %d: %v: %s", pid, err, strings.TrimSpace(string(output)))
	}
	return nil
}
