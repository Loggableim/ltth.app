package main

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/pkg/browser"
)

//go:embed assets/bootstrapper.html
var bootstrapperAssets embed.FS

const (
	bootstrapperVersion      = "0.1.0"
	channelStable            = "stable"
	channelBeta              = "beta"
	archiveFormatZip         = "zip"
	archiveFormatTarGz       = "tar.gz"
	defaultManifestBaseURL   = "https://ltth.app/downloads/manifests"
	installedReleaseFileName = "installed-release.json"
)

var (
	createPlatformShortcutsFunc   = createPlatformShortcuts
	startInstalledAppFunc         = startInstalledApp
	verifyExecutableSignatureFunc = verifyExecutableSignature
)

type ReleaseManifest struct {
	Version   string              `json:"version"`
	Channel   string              `json:"channel"`
	Notes     string              `json:"notes,omitempty"`
	Payloads  []PayloadDescriptor `json:"payloads"`
	Published string              `json:"published,omitempty"`
}

type PayloadDescriptor struct {
	Platform            string `json:"platform"`
	Arch                string `json:"arch"`
	PayloadURL          string `json:"payloadUrl"`
	PayloadSHA256       string `json:"payloadSha256"`
	PayloadSize         int64  `json:"payloadSize"`
	MinBootstrapVersion string `json:"minBootstrapVersion"`
	ArchiveFormat       string `json:"archiveFormat"`
	SignatureURL        string `json:"signatureUrl,omitempty"`
	Signed              bool   `json:"signed,omitempty"`
}

type InstalledReleaseState struct {
	Version       string    `json:"version"`
	Channel       string    `json:"channel"`
	Platform      string    `json:"platform"`
	Arch          string    `json:"arch"`
	InstallDir    string    `json:"installDir"`
	CurrentPath   string    `json:"currentPath"`
	PayloadURL    string    `json:"payloadUrl,omitempty"`
	PayloadSHA256 string    `json:"payloadSha256,omitempty"`
	InstalledAt   time.Time `json:"installedAt"`
}

type BootstrapperConfig struct {
	InstallDir  string `json:"installDir"`
	Channel     string `json:"channel"`
	ManifestURL string `json:"manifestUrl"`
}

type BootstrapperStatus struct {
	Progress      int    `json:"progress"`
	Status        string `json:"status"`
	Error         string `json:"error,omitempty"`
	Installed     bool   `json:"installed"`
	CurrentPath   string `json:"currentPath,omitempty"`
	Version       string `json:"version,omitempty"`
	InstallDir    string `json:"installDir"`
	ManifestURL   string `json:"manifestUrl"`
	Channel       string `json:"channel"`
	Bootstrapper  string `json:"bootstrapperVersion"`
	LastUpdatedAt string `json:"lastUpdatedAt"`
}

type Bootstrapper struct {
	mu         sync.Mutex
	status     BootstrapperStatus
	config     BootstrapperConfig
	clients    map[chan string]bool
	logger     *log.Logger
	serverPort int
}

func defaultInstallDir(goos string, home string, env map[string]string) string {
	switch strings.ToLower(goos) {
	case "windows":
		if localAppData := strings.TrimSpace(env["LOCALAPPDATA"]); localAppData != "" {
			return filepath.Join(localAppData, "LTTH")
		}
		return filepath.Join(home, "AppData", "Local", "LTTH")
	case "darwin":
		return filepath.Join(home, "Library", "Application Support", "LTTH")
	default:
		return filepath.Join(home, ".local", "share", "LTTH")
	}
}

func installedReleaseStatePath(installRoot string) string {
	return filepath.Join(installRoot, "runtime", installedReleaseFileName)
}

func writeInstalledReleaseState(installRoot string, state InstalledReleaseState) error {
	if err := os.MkdirAll(filepath.Dir(installedReleaseStatePath(installRoot)), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(installedReleaseStatePath(installRoot), data, 0644)
}

func loadInstalledReleaseState(installRoot string) (InstalledReleaseState, error) {
	var state InstalledReleaseState
	data, err := os.ReadFile(installedReleaseStatePath(installRoot))
	if err != nil {
		return state, err
	}
	err = json.Unmarshal(data, &state)
	return state, err
}

func validatePayloadDescriptor(payload PayloadDescriptor) error {
	if strings.TrimSpace(payload.Platform) == "" ||
		strings.TrimSpace(payload.Arch) == "" ||
		strings.TrimSpace(payload.PayloadURL) == "" ||
		strings.TrimSpace(payload.PayloadSHA256) == "" ||
		payload.PayloadSize <= 0 ||
		strings.TrimSpace(payload.MinBootstrapVersion) == "" ||
		strings.TrimSpace(payload.ArchiveFormat) == "" {
		return fmt.Errorf("payload descriptor is incomplete: %#v", payload)
	}
	if len(strings.TrimSpace(payload.PayloadSHA256)) != 64 {
		return fmt.Errorf("payload checksum must be a sha256 hex string")
	}
	switch payload.ArchiveFormat {
	case archiveFormatZip, archiveFormatTarGz:
		return nil
	default:
		return fmt.Errorf("unsupported archive format %q", payload.ArchiveFormat)
	}
}

func selectPayload(manifest ReleaseManifest, platform string, arch string) (PayloadDescriptor, error) {
	normalizedPlatform := strings.ToLower(strings.TrimSpace(platform))
	normalizedArch := normalizeArch(arch)
	for _, payload := range manifest.Payloads {
		if err := validatePayloadDescriptor(payload); err != nil {
			return PayloadDescriptor{}, err
		}
		if strings.EqualFold(payload.Platform, normalizedPlatform) && normalizeArch(payload.Arch) == normalizedArch {
			if compareSemver(payload.MinBootstrapVersion, bootstrapperVersion) > 0 {
				return PayloadDescriptor{}, fmt.Errorf("payload requires bootstrapper %s, current version is %s", payload.MinBootstrapVersion, bootstrapperVersion)
			}
			return payload, nil
		}
	}
	return PayloadDescriptor{}, fmt.Errorf("no payload found for %s/%s", normalizedPlatform, normalizedArch)
}

func normalizeArch(arch string) string {
	switch strings.ToLower(strings.TrimSpace(arch)) {
	case "x86_64", "x64":
		return "amd64"
	case "aarch64":
		return "arm64"
	default:
		return strings.ToLower(strings.TrimSpace(arch))
	}
}

func compareSemver(left string, right string) int {
	parse := func(value string) []int {
		cleaned := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(value, "v"), "V"))
		if idx := strings.Index(cleaned, "-"); idx >= 0 {
			cleaned = cleaned[:idx]
		}
		parts := strings.Split(cleaned, ".")
		result := []int{0, 0, 0}
		for i := 0; i < len(parts) && i < 3; i++ {
			fmt.Sscanf(parts[i], "%d", &result[i])
		}
		return result
	}

	l := parse(left)
	r := parse(right)
	for i := 0; i < 3; i++ {
		if l[i] < r[i] {
			return -1
		}
		if l[i] > r[i] {
			return 1
		}
	}
	return 0
}

func installPayloadArchive(archivePath string, installRoot string, platform string, payload PayloadDescriptor) (err error) {
	runtimeDir := filepath.Join(installRoot, "runtime")
	stagingDir := filepath.Join(runtimeDir, fmt.Sprintf("staging-%d", time.Now().UnixNano()))
	backupDir := filepath.Join(runtimeDir, "current-backup")
	currentDir := filepath.Join(installRoot, "current")

	if err := os.MkdirAll(runtimeDir, 0755); err != nil {
		return err
	}
	if err := os.RemoveAll(stagingDir); err != nil {
		return err
	}
	if err := os.MkdirAll(stagingDir, 0755); err != nil {
		return err
	}
	defer os.RemoveAll(stagingDir)

	format := detectArchiveFormat(archivePath)
	if err := extractArchive(archivePath, stagingDir, format); err != nil {
		return err
	}

	payloadRoot, err := resolvePayloadRoot(stagingDir)
	if err != nil {
		return err
	}
	if err := validateInstalledPayload(payloadRoot, platform); err != nil {
		return err
	}
	if err := verifyPayloadTrust(payloadRoot, platform, payload); err != nil {
		return err
	}

	_ = os.RemoveAll(backupDir)
	currentExists := pathExists(currentDir)
	if currentExists {
		if err := os.Rename(currentDir, backupDir); err != nil {
			return fmt.Errorf("failed to move previous payload out of the way: %w", err)
		}
	}

	rollback := func(cause error) error {
		_ = os.RemoveAll(currentDir)
		if currentExists && pathExists(backupDir) {
			_ = os.Rename(backupDir, currentDir)
		}
		return cause
	}

	if err := os.MkdirAll(filepath.Dir(currentDir), 0755); err != nil {
		return rollback(err)
	}
	if err := os.Rename(payloadRoot, currentDir); err != nil {
		return rollback(fmt.Errorf("failed to activate payload: %w", err))
	}

	_ = os.RemoveAll(backupDir)
	return nil
}

func pathExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func detectArchiveFormat(archivePath string) string {
	lower := strings.ToLower(archivePath)
	switch {
	case strings.HasSuffix(lower, ".tar.gz"), strings.HasSuffix(lower, ".tgz"):
		return archiveFormatTarGz
	default:
		return archiveFormatZip
	}
}

func extractArchive(archivePath string, destDir string, format string) error {
	switch format {
	case archiveFormatTarGz:
		return extractTarGz(archivePath, destDir)
	case archiveFormatZip:
		return extractZipArchive(archivePath, destDir)
	default:
		return fmt.Errorf("unsupported archive format %q", format)
	}
}

func extractZipArchive(archivePath string, destDir string) error {
	reader, err := zip.OpenReader(archivePath)
	if err != nil {
		return err
	}
	defer reader.Close()

	for _, file := range reader.File {
		targetPath, err := safeJoin(destDir, file.Name)
		if err != nil {
			return err
		}
		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(targetPath, 0755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			return err
		}
		src, err := file.Open()
		if err != nil {
			return err
		}
		dst, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, file.Mode())
		if err != nil {
			src.Close()
			return err
		}
		if _, err := io.Copy(dst, src); err != nil {
			dst.Close()
			src.Close()
			return err
		}
		dst.Close()
		src.Close()
	}
	return nil
}

func extractTarGz(archivePath string, destDir string) error {
	file, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer file.Close()

	gzReader, err := gzip.NewReader(file)
	if err != nil {
		return err
	}
	defer gzReader.Close()

	tarReader := tar.NewReader(gzReader)
	for {
		header, err := tarReader.Next()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}

		targetPath, err := safeJoin(destDir, header.Name)
		if err != nil {
			return err
		}
		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(targetPath, 0755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
				return err
			}
			dst, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, os.FileMode(header.Mode))
			if err != nil {
				return err
			}
			if _, err := io.Copy(dst, tarReader); err != nil {
				dst.Close()
				return err
			}
			dst.Close()
		default:
			return fmt.Errorf("unsupported tar entry type %d in %s", header.Typeflag, header.Name)
		}
	}
}

func safeJoin(baseDir string, relativePath string) (string, error) {
	cleaned := filepath.Clean(relativePath)
	targetPath := filepath.Join(baseDir, cleaned)
	baseAbs, err := filepath.Abs(baseDir)
	if err != nil {
		return "", err
	}
	targetAbs, err := filepath.Abs(targetPath)
	if err != nil {
		return "", err
	}
	if targetAbs != baseAbs && !strings.HasPrefix(targetAbs, baseAbs+string(os.PathSeparator)) {
		return "", fmt.Errorf("illegal path in archive: %s", relativePath)
	}
	return targetPath, nil
}

func resolvePayloadRoot(stagingDir string) (string, error) {
	if looksLikePayloadRoot(stagingDir) {
		return stagingDir, nil
	}

	entries, err := os.ReadDir(stagingDir)
	if err != nil {
		return "", err
	}
	if len(entries) != 1 || !entries[0].IsDir() {
		return "", fmt.Errorf("payload root is invalid: %s", stagingDir)
	}

	candidate := filepath.Join(stagingDir, entries[0].Name())
	if !looksLikePayloadRoot(candidate) {
		return "", fmt.Errorf("payload archive does not contain the expected LTTH layout")
	}
	return candidate, nil
}

func looksLikePayloadRoot(dir string) bool {
	expected := []string{
		filepath.Join(dir, "app", "package.json"),
		filepath.Join(dir, "assets", "launcher.html"),
		filepath.Join(dir, "locales", "de.json"),
	}
	for _, path := range expected {
		if !pathExists(path) {
			return false
		}
	}
	return true
}

func validateInstalledPayload(payloadRoot string, platform string) error {
	required := []string{
		filepath.Join(payloadRoot, "app", "package.json"),
		filepath.Join(payloadRoot, "assets", "launcher.html"),
		filepath.Join(payloadRoot, "locales", "de.json"),
	}

	switch strings.ToLower(platform) {
	case "windows":
		required = append(required,
			filepath.Join(payloadRoot, "launcher.exe"),
			filepath.Join(payloadRoot, "runtime", "node", "node.exe"),
		)
	case "darwin":
		required = append(required, filepath.Join(payloadRoot, "runtime", "node", "bin", "node"))
	default:
		required = append(required, filepath.Join(payloadRoot, "runtime", "node", "bin", "node"))
	}

	for _, path := range required {
		if !pathExists(path) {
			return fmt.Errorf("payload is missing required file %s", path)
		}
	}
	return nil
}

func verifyPayloadTrust(payloadRoot string, platform string, payload PayloadDescriptor) error {
	if !payload.Signed {
		return nil
	}
	if strings.EqualFold(platform, "windows") {
		return verifyExecutableSignatureFunc(filepath.Join(payloadRoot, "launcher.exe"))
	}
	return nil
}

func detectLegacyInstall(goos string, env map[string]string, extraCandidates []string) string {
	candidates := append([]string{}, extraCandidates...)
	if strings.EqualFold(goos, "windows") {
		if programFiles := strings.TrimSpace(env["ProgramFiles"]); programFiles != "" {
			candidates = append(candidates, filepath.Join(programFiles, "LTTH"))
		}
		if programFilesX86 := strings.TrimSpace(env["ProgramFiles(x86)"]); programFilesX86 != "" {
			candidates = append(candidates, filepath.Join(programFilesX86, "LTTH"))
		}
	}

	seen := map[string]bool{}
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" || seen[candidate] {
			continue
		}
		seen[candidate] = true
		if isLegacyInstall(candidate) {
			return candidate
		}
	}
	return ""
}

func isLegacyInstall(root string) bool {
	required := []string{
		filepath.Join(root, "launcher.exe"),
		filepath.Join(root, "app", "package.json"),
	}
	for _, path := range required {
		if !pathExists(path) {
			return false
		}
	}
	return true
}

func migrateLegacyInstall(legacyRoot string, installRoot string) error {
	currentDir := filepath.Join(installRoot, "current")
	if pathExists(currentDir) {
		return nil
	}

	if err := os.MkdirAll(currentDir, 0755); err != nil {
		return err
	}

	copyTargets := []string{
		"launcher.exe",
		"icon.ico",
		"CHANGELOG.md",
		"app",
		"assets",
		"locales",
		"runtime",
	}
	for _, relativePath := range copyTargets {
		sourcePath := filepath.Join(legacyRoot, relativePath)
		if !pathExists(sourcePath) {
			continue
		}
		targetPath := filepath.Join(currentDir, relativePath)
		if err := copyPath(sourcePath, targetPath); err != nil {
			return err
		}
	}

	platform := runtime.GOOS
	if strings.Contains(strings.ToLower(legacyRoot), `\`) || strings.EqualFold(filepath.Ext(filepath.Join(legacyRoot, "launcher.exe")), ".exe") {
		platform = "windows"
	}
	if err := validateInstalledPayload(currentDir, platform); err != nil {
		_ = os.RemoveAll(currentDir)
		return err
	}
	return nil
}

func copyPath(sourcePath string, targetPath string) error {
	info, err := os.Stat(sourcePath)
	if err != nil {
		return err
	}
	if info.IsDir() {
		if err := os.MkdirAll(targetPath, 0755); err != nil {
			return err
		}
		entries, err := os.ReadDir(sourcePath)
		if err != nil {
			return err
		}
		for _, entry := range entries {
			if err := copyPath(filepath.Join(sourcePath, entry.Name()), filepath.Join(targetPath, entry.Name())); err != nil {
				return err
			}
		}
		return nil
	}

	if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
		return err
	}
	src, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer src.Close()

	dst, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, info.Mode())
	if err != nil {
		return err
	}
	defer dst.Close()

	_, err = io.Copy(dst, src)
	return err
}

func verifySHA256(path string, expected string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return err
	}
	actual := hex.EncodeToString(hash.Sum(nil))
	if !strings.EqualFold(actual, strings.TrimSpace(expected)) {
		return fmt.Errorf("checksum mismatch: expected %s, got %s", expected, actual)
	}
	return nil
}

func newBootstrapper() *Bootstrapper {
	homeDir, _ := os.UserHomeDir()
	config := BootstrapperConfig{
		InstallDir:  defaultInstallDir(runtime.GOOS, homeDir, envToMap()),
		Channel:     channelStable,
		ManifestURL: manifestURLForChannel(channelStable),
	}
	return &Bootstrapper{
		config:  config,
		clients: make(map[chan string]bool),
		logger:  log.New(os.Stdout, "[LTTH Bootstrapper] ", log.LstdFlags),
		status: BootstrapperStatus{
			Progress:      0,
			Status:        "Bereit zur Installation",
			InstallDir:    config.InstallDir,
			ManifestURL:   config.ManifestURL,
			Channel:       config.Channel,
			Bootstrapper:  bootstrapperVersion,
			LastUpdatedAt: time.Now().Format(time.RFC3339),
		},
	}
}

func envToMap() map[string]string {
	result := map[string]string{}
	for _, entry := range os.Environ() {
		parts := strings.SplitN(entry, "=", 2)
		if len(parts) == 2 {
			result[parts[0]] = parts[1]
		}
	}
	return result
}

func manifestURLForChannel(channel string) string {
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("LTTH_BOOTSTRAP_MANIFEST_BASE_URL")), "/")
	if base == "" {
		base = defaultManifestBaseURL
	}
	normalized := channelStable
	if strings.EqualFold(channel, channelBeta) {
		normalized = channelBeta
	}
	return fmt.Sprintf("%s/%s.json", base, normalized)
}

func (b *Bootstrapper) setStatus(progress int, status string, installErr error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.status.Progress = progress
	b.status.Status = status
	b.status.InstallDir = b.config.InstallDir
	b.status.ManifestURL = b.config.ManifestURL
	b.status.Channel = b.config.Channel
	b.status.LastUpdatedAt = time.Now().Format(time.RFC3339)
	if installErr != nil {
		b.status.Error = installErr.Error()
	} else {
		b.status.Error = ""
	}

	payload, _ := json.Marshal(b.status)
	for client := range b.clients {
		select {
		case client <- string(payload):
		default:
		}
	}
}

func (b *Bootstrapper) serveIndex(w http.ResponseWriter, r *http.Request) {
	tmplContent, err := bootstrapperAssets.ReadFile("assets/bootstrapper.html")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	tmpl, err := template.New("bootstrapper").Parse(string(tmplContent))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	data := map[string]interface{}{
		"InstallDir":          b.config.InstallDir,
		"ManifestURL":         b.config.ManifestURL,
		"Channel":             b.config.Channel,
		"BootstrapperVersion": bootstrapperVersion,
		"Platform":            runtime.GOOS,
		"Architecture":        normalizeArch(runtime.GOARCH),
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_ = tmpl.Execute(w, data)
}

func (b *Bootstrapper) handleEvents(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	client := make(chan string, 8)
	b.mu.Lock()
	b.clients[client] = true
	statusPayload, _ := json.Marshal(b.status)
	b.mu.Unlock()
	defer func() {
		b.mu.Lock()
		delete(b.clients, client)
		b.mu.Unlock()
		close(client)
	}()

	fmt.Fprintf(w, "data: %s\n\n", statusPayload)
	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
	}

	for {
		select {
		case msg := <-client:
			fmt.Fprintf(w, "data: %s\n\n", msg)
			if flusher, ok := w.(http.Flusher); ok {
				flusher.Flush()
			}
		case <-r.Context().Done():
			return
		}
	}
}

func (b *Bootstrapper) handleConfig(w http.ResponseWriter, r *http.Request) {
	b.mu.Lock()
	defer b.mu.Unlock()
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"config":  b.config,
		"status":  b.status,
	})
}

func (b *Bootstrapper) handleInstall(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var config BootstrapperConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(config.InstallDir) == "" {
		http.Error(w, "installDir is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(config.Channel) == "" {
		config.Channel = channelStable
	}
	if strings.TrimSpace(config.ManifestURL) == "" {
		config.ManifestURL = manifestURLForChannel(config.Channel)
	}

	b.mu.Lock()
	b.config = config
	b.status.Installed = false
	b.mu.Unlock()

	go b.runInstall()

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
}

func (b *Bootstrapper) handleOpenApp(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if err := startInstalledApp(b.config.InstallDir); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
}

func (b *Bootstrapper) runInstall() {
	b.setStatus(5, "Prüfe Installationsziel...", nil)
	if err := os.MkdirAll(b.config.InstallDir, 0755); err != nil {
		b.setStatus(100, "Installationsziel konnte nicht erstellt werden", err)
		return
	}

	if !pathExists(filepath.Join(b.config.InstallDir, "current")) {
		if legacyRoot := detectLegacyInstall(runtime.GOOS, envToMap(), nil); legacyRoot != "" {
			b.setStatus(10, "Migriere bestehende LTTH-Installation...", nil)
			if err := migrateLegacyInstall(legacyRoot, b.config.InstallDir); err != nil {
				b.logger.Printf("legacy migration warning: %v\n", err)
			}
		}
	}

	b.setStatus(15, "Lade Release-Manifest...", nil)
	manifest, err := fetchManifest(b.config.ManifestURL)
	if err != nil {
		b.setStatus(100, "Manifest konnte nicht geladen werden", err)
		return
	}

	b.setStatus(25, "Wähle passende Plattform-Payload...", nil)
	payload, err := selectPayload(manifest, runtime.GOOS, normalizeArch(runtime.GOARCH))
	if err != nil {
		b.setStatus(100, "Keine passende Payload gefunden", err)
		return
	}

	runtimeDir := filepath.Join(b.config.InstallDir, "runtime")
	if err := os.MkdirAll(runtimeDir, 0755); err != nil {
		b.setStatus(100, "Runtime-Verzeichnis konnte nicht erstellt werden", err)
		return
	}
	downloadPath := filepath.Join(runtimeDir, fmt.Sprintf("payload-%d.%s", time.Now().UnixNano(), archiveExtension(payload.ArchiveFormat)))

	b.setStatus(45, "Lade Payload herunter...", nil)
	if err := downloadFile(payload.PayloadURL, downloadPath); err != nil {
		b.setStatus(100, "Payload-Download fehlgeschlagen", err)
		return
	}
	defer os.Remove(downloadPath)

	b.setStatus(60, "Prüfe Payload-Checksumme...", nil)
	if err := verifySHA256(downloadPath, payload.PayloadSHA256); err != nil {
		b.setStatus(100, "Payload-Prüfung fehlgeschlagen", err)
		return
	}

	b.setStatus(75, "Installiere Payload...", nil)
	if err := installPayloadArchive(downloadPath, b.config.InstallDir, runtime.GOOS, payload); err != nil {
		b.setStatus(100, "Payload konnte nicht aktiviert werden", err)
		return
	}

	state := InstalledReleaseState{
		Version:       manifest.Version,
		Channel:       manifest.Channel,
		Platform:      runtime.GOOS,
		Arch:          normalizeArch(runtime.GOARCH),
		InstallDir:    b.config.InstallDir,
		CurrentPath:   filepath.Join(b.config.InstallDir, "current"),
		PayloadURL:    payload.PayloadURL,
		PayloadSHA256: payload.PayloadSHA256,
		InstalledAt:   time.Now().UTC(),
	}
	if err := writeInstalledReleaseState(b.config.InstallDir, state); err != nil {
		b.setStatus(100, "Installationsstatus konnte nicht gespeichert werden", err)
		return
	}

	b.setStatus(88, "Schreibe Shortcuts...", nil)
	if err := createPlatformShortcutsFunc(b.config.InstallDir); err != nil {
		b.logger.Printf("shortcut creation warning: %v\n", err)
	}

	b.setStatus(95, "Starte LTTH...", nil)
	if err := startInstalledAppFunc(b.config.InstallDir); err != nil {
		b.logger.Printf("app launch warning: %v\n", err)
	}

	b.mu.Lock()
	b.status.Installed = true
	b.status.CurrentPath = state.CurrentPath
	b.status.Version = state.Version
	b.mu.Unlock()
	b.setStatus(100, "LTTH wurde installiert", nil)
}

func archiveExtension(format string) string {
	switch format {
	case archiveFormatTarGz:
		return "tar.gz"
	default:
		return "zip"
	}
}

func fetchManifest(manifestURL string) (ReleaseManifest, error) {
	var manifest ReleaseManifest
	client := &http.Client{Timeout: 30 * time.Second}
	response, err := client.Get(manifestURL)
	if err != nil {
		return manifest, err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return manifest, fmt.Errorf("manifest request failed with %s", response.Status)
	}
	if err := json.NewDecoder(response.Body).Decode(&manifest); err != nil {
		return manifest, err
	}
	if strings.TrimSpace(manifest.Version) == "" || strings.TrimSpace(manifest.Channel) == "" || len(manifest.Payloads) == 0 {
		return manifest, fmt.Errorf("manifest is incomplete")
	}
	for index := range manifest.Payloads {
		manifest.Payloads[index].PayloadURL = resolveManifestAssetURL(manifestURL, manifest.Payloads[index].PayloadURL)
		manifest.Payloads[index].SignatureURL = resolveManifestAssetURL(manifestURL, manifest.Payloads[index].SignatureURL)
	}
	return manifest, nil
}

func resolveManifestAssetURL(manifestURL string, assetURL string) string {
	if strings.TrimSpace(assetURL) == "" {
		return ""
	}
	baseURL, err := url.Parse(manifestURL)
	if err != nil {
		return assetURL
	}
	relativeURL, err := url.Parse(assetURL)
	if err != nil {
		return assetURL
	}
	return baseURL.ResolveReference(relativeURL).String()
}

func downloadFile(sourceURL string, destination string) error {
	client := &http.Client{Timeout: 10 * time.Minute}
	response, err := client.Get(sourceURL)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed with %s", response.Status)
	}
	if err := os.MkdirAll(filepath.Dir(destination), 0755); err != nil {
		return err
	}
	file, err := os.Create(destination)
	if err != nil {
		return err
	}
	defer file.Close()

	_, err = io.Copy(file, response.Body)
	return err
}

func verifyExecutableSignature(path string) error {
	if runtime.GOOS != "windows" {
		return nil
	}
	script := fmt.Sprintf(`$sig = Get-AuthenticodeSignature '%s'
if ($sig.Status -ne 'Valid') { throw "signature status: $($sig.Status)" }`, escapePowerShellString(path))
	cmd := exec.Command("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("signature verification failed for %s: %v (%s)", path, err, strings.TrimSpace(string(output)))
	}
	return nil
}

func startInstalledApp(installRoot string) error {
	currentDir := filepath.Join(installRoot, "current")
	switch runtime.GOOS {
	case "windows":
		launcherPath := filepath.Join(currentDir, "launcher.exe")
		if !pathExists(launcherPath) {
			return fmt.Errorf("launcher.exe not found at %s", launcherPath)
		}
		cmd := exec.Command(launcherPath)
		return cmd.Start()
	default:
		nodePath := filepath.Join(currentDir, "runtime", "node", "bin", "node")
		launchPath := filepath.Join(currentDir, "app", "launch.js")
		if !pathExists(nodePath) || !pathExists(launchPath) {
			return fmt.Errorf("payload is missing a runnable launcher")
		}
		cmd := exec.Command(nodePath, launchPath)
		cmd.Dir = filepath.Join(currentDir, "app")
		return cmd.Start()
	}
}

func createPlatformShortcuts(installRoot string) error {
	if runtime.GOOS != "windows" {
		return nil
	}

	target := filepath.Join(installRoot, "current", "launcher.exe")
	icon := filepath.Join(installRoot, "current", "icon.ico")
	homeDir, _ := os.UserHomeDir()
	desktop := filepath.Join(homeDir, "Desktop", "LTTH.lnk")
	startMenu := filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs", "LTTH.lnk")
	if err := os.MkdirAll(filepath.Dir(startMenu), 0755); err != nil {
		return err
	}
	if err := createWindowsShortcut(desktop, target, icon); err != nil {
		return err
	}
	if err := createWindowsShortcut(startMenu, target, icon); err != nil {
		return err
	}
	return nil
}

func createWindowsShortcut(linkPath string, targetPath string, iconPath string) error {
	script := fmt.Sprintf(`$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut('%s')
$shortcut.TargetPath = '%s'
$shortcut.WorkingDirectory = '%s'
$shortcut.IconLocation = '%s'
$shortcut.Save()`,
		escapePowerShellString(linkPath),
		escapePowerShellString(targetPath),
		escapePowerShellString(filepath.Dir(targetPath)),
		escapePowerShellString(iconPath),
	)
	cmd := exec.Command("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to create shortcut: %v (%s)", err, strings.TrimSpace(string(output)))
	}
	return nil
}

func escapePowerShellString(value string) string {
	return strings.ReplaceAll(value, "'", "''")
}

func (b *Bootstrapper) runServer() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/", b.serveIndex)
	mux.HandleFunc("/events", b.handleEvents)
	mux.HandleFunc("/api/config", b.handleConfig)
	mux.HandleFunc("/api/install", b.handleInstall)
	mux.HandleFunc("/api/open", b.handleOpenApp)

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	b.serverPort = listener.Addr().(*net.TCPAddr).Port

	go func() {
		if serveErr := http.Serve(listener, mux); serveErr != nil {
			b.logger.Printf("bootstrapper server stopped: %v\n", serveErr)
		}
	}()

	url := fmt.Sprintf("http://127.0.0.1:%d", b.serverPort)
	b.logger.Printf("opening bootstrapper UI at %s\n", url)
	_ = browser.OpenURL(url)
	select {}
}

func main() {
	bootstrapper := newBootstrapper()
	if err := bootstrapper.runServer(); err != nil {
		log.Fatalf("bootstrapper failed: %v", err)
	}
}
