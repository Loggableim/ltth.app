package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCloudLauncherServeSplashRendersTemplate(t *testing.T) {
	launcher := NewCloudLauncher()
	launcher.logger = log.New(io.Discard, "", 0)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()

	launcher.serveSplash(rr, req)

	if got := rr.Header().Get("Content-Type"); got != "text/html; charset=utf-8" {
		t.Fatalf("unexpected content type: %q", got)
	}

	body := rr.Body.String()
	for _, unexpected := range []string{"{{.Title}}", "{{.Version}}"} {
		if strings.Contains(body, unexpected) {
			t.Fatalf("splash output still contains template placeholder %q", unexpected)
		}
	}
	for _, expected := range []string{
		cloudLauncherTitle,
		cloudLauncherVersion,
		cloudLauncherFooter,
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("splash output missing %q: %s", expected, body)
		}
	}
}

func TestCloudLauncherProgressAndErrorPayloadsAreValidJSON(t *testing.T) {
	launcher := NewCloudLauncher()
	launcher.logger = log.New(io.Discard, "", 0)

	progressClient := make(chan string, 1)
	launcher.addClient(progressClient)
	launcher.updateProgress(42, `needs escaping "quote" and \ slash`)

	progressMsg := <-progressClient
	var progressPayload map[string]interface{}
	if err := json.Unmarshal([]byte(progressMsg), &progressPayload); err != nil {
		t.Fatalf("progress payload should be valid JSON: %v", err)
	}
	if progressPayload["progress"] != float64(42) {
		t.Fatalf("unexpected progress value: %#v", progressPayload["progress"])
	}
	if got := progressPayload["status"]; got != `needs escaping "quote" and \ slash` {
		t.Fatalf("unexpected status payload: %#v", got)
	}

	errorClient := make(chan string, 1)
	launcher.addClient(errorClient)
	launcher.sendError(`failed to parse "payload"`)

	errorMsg := <-errorClient
	var errorPayload map[string]interface{}
	if err := json.Unmarshal([]byte(errorMsg), &errorPayload); err != nil {
		t.Fatalf("error payload should be valid JSON: %v", err)
	}
	if got := errorPayload["error"]; got != `failed to parse "payload"` {
		t.Fatalf("unexpected error payload: %#v", got)
	}
}
