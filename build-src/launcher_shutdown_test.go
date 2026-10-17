package main

import (
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestNewLauncherShutdownTokenIsRandomEphemeralHex(t *testing.T) {
	first, err := newLauncherShutdownToken()
	if err != nil {
		t.Fatal(err)
	}
	second, err := newLauncherShutdownToken()
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := hex.DecodeString(first)
	if err != nil || len(decoded) != 32 || first == second {
		t.Fatalf("expected unique 256-bit hex tokens, got first=%q second=%q err=%v", first, second, err)
	}
}

func TestGoManagedLauncherEnvironmentCarriesOnlyCurrentShutdownToken(t *testing.T) {
	token := testLauncherShutdownToken
	env := goManagedLauncherEnvironment([]string{
		"LTTH_LAUNCHER_TOKEN=" + token,
		"LTTH_GO_LAUNCHER_MANAGED=false",
	})
	if got := envValue(env, "LTTH_LAUNCHER_TOKEN"); got != token {
		t.Fatalf("launcher shutdown token was not inherited: %q", got)
	}
	if got := envValue(env, "LTTH_GO_LAUNCHER_MANAGED"); got != "true" {
		t.Fatalf("expected managed launcher marker true, got %q", got)
	}
}

func envValue(env []string, key string) string {
	for _, entry := range env {
		name, value, ok := strings.Cut(entry, "=")
		if ok && strings.EqualFold(name, key) {
			return value
		}
	}
	return ""
}

func TestLauncherShutdownRequestIsLoopbackTokenAndProcessBound(t *testing.T) {
	var requests atomic.Int32
	const supervisorPID = 43210
	const serverPID = 43211
	const port = 54978
	client := launcherShutdownHTTPClient(time.Second)
	client.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		requests.Add(1)
		if r.URL.Scheme != "http" || r.URL.Hostname() != "127.0.0.1" {
			t.Errorf("request did not target strict loopback: %s", r.URL.String())
		}
		if r.Method != http.MethodPost || r.URL.Path != "/api/launcher/shutdown" {
			t.Errorf("unexpected shutdown request: %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("x-ltth-launcher-token") != testLauncherShutdownToken {
			t.Errorf("shutdown token header missing or incorrect")
		}
		body := fmt.Sprintf(`{"success":true,"status":"shutdown_scheduled","pid":%d,"port":%d,"supervisorPid":%d}`, serverPID, port, supervisorPID)
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(body)),
			Request:    r,
		}, nil
	})
	receipt, err := requestLauncherShutdownState(client, http.MethodPost, port, supervisorPID, testLauncherShutdownToken)
	client.CloseIdleConnections()
	if err != nil {
		t.Fatal(err)
	}
	if receipt.PID != serverPID || receipt.Port != port || receipt.SupervisorPID != supervisorPID {
		t.Fatalf("unexpected managed-server receipt: %+v", receipt)
	}
	if requests.Load() != 1 {
		t.Fatalf("expected one loopback request, got %d", requests.Load())
	}
}

func TestLauncherShutdownRejectsWrongPortSupervisorAndRedirect(t *testing.T) {
	const supervisorPID = 43210
	const port = 45678
	client := launcherShutdownHTTPClient(time.Second)
	client.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		body := fmt.Sprintf(`{"success":true,"status":"shutdown_scheduled","pid":43211,"port":%d,"supervisorPid":%d}`, port+1, supervisorPID+1)
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(body)),
			Request:    r,
		}, nil
	})
	if _, err := requestLauncherShutdownState(client, http.MethodPost, port, supervisorPID, testLauncherShutdownToken); err == nil {
		t.Fatal("expected mismatched port/supervisor receipt to be rejected")
	}
	client.CloseIdleConnections()

	redirectHits := atomic.Int32{}
	redirectClient := launcherShutdownHTTPClient(time.Second)
	redirectClient.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		redirectHits.Add(1)
		return &http.Response{
			StatusCode: http.StatusFound,
			Header:     http.Header{"Location": []string{"http://127.0.0.1/foreign"}},
			Body:       io.NopCloser(strings.NewReader("")),
			Request:    r,
		}, nil
	})
	if _, err := requestLauncherShutdownState(redirectClient, http.MethodPost, port, supervisorPID, testLauncherShutdownToken); err == nil {
		t.Fatal("expected endpoint redirect to be rejected")
	}
	redirectClient.CloseIdleConnections()
	if redirectHits.Load() != 1 {
		t.Fatalf("redirect was followed unexpectedly: %d requests", redirectHits.Load())
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (roundTrip roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return roundTrip(request)
}

const testLauncherShutdownToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

func TestWaitForManagedShutdownRequiresAuthenticatedCompleteStatus(t *testing.T) {
	exited := make(chan struct{})
	pollCount := atomic.Int32{}
	result := make(chan error, 1)
	go func() {
		result <- waitForManagedShutdown(exited, func() (launcherShutdownReceipt, error) {
			pollCount.Add(1)
			return launcherShutdownReceipt{Status: "complete"}, nil
		}, time.Millisecond)
	}()
	select {
	case err := <-result:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("wait did not return after authenticated complete status")
	}
	select {
	case <-exited:
		t.Fatal("status polling unexpectedly closed the child exit channel")
	default:
	}
	if pollCount.Load() == 0 {
		t.Fatal("expected shutdown state to be checked")
	}
}

func TestWaitForManagedShutdownRejectsExitBeforeAuthenticatedComplete(t *testing.T) {
	exited := make(chan struct{})
	close(exited)
	err := waitForManagedShutdown(exited, func() (launcherShutdownReceipt, error) {
		return launcherShutdownReceipt{}, fmt.Errorf("connection refused")
	}, time.Millisecond)
	if err == nil || !strings.Contains(err.Error(), "before authenticated shutdown completion") {
		t.Fatalf("expected unconfirmed child exit to fail, got %v", err)
	}
}

func TestWaitForManagedProcessExitRejectsNonzeroExitCode(t *testing.T) {
	exited := make(chan struct{})
	close(exited)
	err := waitForManagedProcessExit(exited, func() error {
		return fmt.Errorf("exit status 1")
	}, time.Second)
	if err == nil || !strings.Contains(err.Error(), "exited unsuccessfully") {
		t.Fatalf("expected nonzero child exit to fail, got %v", err)
	}

	if err := waitForManagedProcessExit(exited, func() error { return nil }, time.Second); err != nil {
		t.Fatalf("expected zero child exit to succeed after completion, got %v", err)
	}

	stillRunning := make(chan struct{})
	if err := waitForManagedProcessExit(stillRunning, func() error { return nil }, time.Millisecond); err == nil || !strings.Contains(err.Error(), "still open; retry shutdown") {
		t.Fatalf("expected running child exit wait to remain retryable, got %v", err)
	}
}

func TestWaitForManagedShutdownPendingOrUnknownDoesNotForceExit(t *testing.T) {
	tests := []struct {
		name string
		poll func() (launcherShutdownReceipt, error)
		want string
	}{
		{
			name: "pending cleanup",
			poll: func() (launcherShutdownReceipt, error) {
				return launcherShutdownReceipt{Status: "pending", Message: "queue restore blocked"}, nil
			},
			want: "queue restore blocked",
		},
		{
			name: "unknown endpoint state",
			poll: func() (launcherShutdownReceipt, error) {
				return launcherShutdownReceipt{}, fmt.Errorf("connection refused")
			},
			want: "remains available for retry",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			exited := make(chan struct{})
			err := waitForManagedShutdown(exited, test.poll, time.Millisecond)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("expected retryable error containing %q, got %v", test.want, err)
			}
			select {
			case <-exited:
				t.Fatal("pending cleanup unexpectedly closed the child exit channel")
			default:
			}
		})
	}
}
