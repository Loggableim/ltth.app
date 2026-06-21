//go:build !windows

package main

import (
	"fmt"
	"os/exec"
	"syscall"
	"time"
)

// setSysProcAttr erstellt eine neue Prozessgruppe für den Node-Prozess.
// Damit kann beim Beenden die gesamte Gruppe via kill(-pid, SIGTERM) terminiert werden.
func setSysProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid: true,
	}
}

// killNodeProcessOS beendet den Node-Prozess auf Unix via SIGTERM an die Prozessgruppe,
// mit SIGKILL-Fallback nach 3 Sekunden falls der Prozess nicht reagiert.
func killNodeProcessOS(cmd *exec.Cmd, pid int) {
	syscall.Kill(-pid, syscall.SIGTERM) //nolint:errcheck
	// 3s Fallback: falls SIGTERM nicht reicht, SIGKILL senden (nur wenn Prozess noch läuft)
	time.AfterFunc(3*time.Second, func() {
		if syscall.Kill(-pid, 0) == nil {
			syscall.Kill(-pid, syscall.SIGKILL) //nolint:errcheck
		}
	})
}

func terminateProcessTreeByPIDOS(pid int) error {
	if pid <= 0 {
		return fmt.Errorf("invalid PID %d", pid)
	}
	if err := syscall.Kill(pid, syscall.SIGTERM); err != nil {
		return fmt.Errorf("failed to send SIGTERM to PID %d: %w", pid, err)
	}
	time.AfterFunc(3*time.Second, func() {
		if syscall.Kill(pid, 0) == nil {
			syscall.Kill(pid, syscall.SIGKILL) //nolint:errcheck
		}
	})
	return nil
}
