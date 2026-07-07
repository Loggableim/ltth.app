#!/usr/bin/env bash
# ==============================================================================
#  LTTH One-Line Installer (Linux / macOS)
#  PupCid's Little TikTool Helper - https://ltth.app
#
#  Verwendung:
#    curl -fsSL https://raw.githubusercontent.com/Loggableim/ltth.app/ltth.app/install/install.sh | bash
#
#  Optionale Flags (ueber Umgebungsvariablen):
#    LTTH_VERSION      - zu installierende Version (Default: latest)
#    LTTH_DIR          - Installationsverzeichnis (Default: ~/.local/share/ltth)
#    LTTH_PORT         - HTTP-Port fuer das Dashboard (Default: 3000)
#    LTTH_NO_BROWSER   - Browser nach Start nicht automatisch oeffnen
#    LTTH_QUIET        - Reduzierte Ausgabe
#    LTTH_REPO_BRANCH  - Git-Branch fuer die Installation (Default: ltth.app)
# ==============================================================================

set -euo pipefail

# ---------- Konfiguration ----------
LTTH_REPO_OWNER="${LTTH_REPO_OWNER:-Loggableim}"
LTTH_REPO_NAME="${LTTH_REPO_NAME:-ltth.app}"
LTTH_VERSION="${LTTH_VERSION:-latest}"
LTTH_INSTALL_MODE="pinned"
if [ "$LTTH_VERSION" = "latest" ]; then
    LTTH_INSTALL_MODE="latest"
fi
LTTH_REPO_BRANCH="${LTTH_REPO_BRANCH:-ltth.app}"
LTTH_DIR="${LTTH_DIR:-$HOME/.local/share/ltth}"
LTTH_PORT="${LTTH_PORT:-3000}"
LTTH_NO_BROWSER="${LTTH_NO_BROWSER:-0}"
LTTH_QUIET="${LTTH_QUIET:-0}"

# ---------- Hilfsfunktionen ----------
log()  { [ "$LTTH_QUIET" = "1" ] || echo -e "\033[1;36m[ltth]\033[0m $*"; }
ok()   { [ "$LTTH_QUIET" = "1" ] || echo -e "\033[1;32m[OK]\033[0m $*"; }
warn() { echo -e "\033[1;33m[!]\033[0m $*" >&2; }
err()  { echo -e "\033[1;31m[X]\033[0m $*" >&2; }

need_cmd() {
    command -v "$1" >/dev/null 2>&1 || {
        err "Benoetigtes Kommando fehlt: $1"
        return 1
    }
}

# ---------- Plattform-Erkennung ----------
detect_platform() {
    local os arch
    os="$(uname -s | tr '[:upper:]' '[:lower:]')"
    arch="$(uname -m)"

    case "$os" in
        linux*) os="linux" ;;
        darwin*) os="macos" ;;
        msys*|cygwin*|mingw*) os="windows" ;;
        *) err "Nicht unterstuetztes Betriebssystem: $os"; return 1 ;;
    esac

    case "$arch" in
        x86_64|amd64) arch="amd64" ;;
        arm64|aarch64) arch="arm64" ;;
        *) err "Nicht unterstuetzte Architektur: $arch"; return 1 ;;
    esac

    echo "$os-$arch"
}

# ---------- Version ermitteln ----------
resolve_version() {
    if [ "$LTTH_INSTALL_MODE" = "latest" ]; then
        log "Ermittle neueste Version vom Branch ${LTTH_REPO_BRANCH}..."
        local version_json resolved_version
        version_json="$(curl -fsSL "https://raw.githubusercontent.com/${LTTH_REPO_OWNER}/${LTTH_REPO_NAME}/${LTTH_REPO_BRANCH}/version.json")"
        resolved_version="$(printf '%s' "$version_json" | grep -m1 '"downloadVersion"' | sed -E 's/.*"downloadVersion":\s*"([^"]+)".*/\1/')"
        if [ -z "$resolved_version" ]; then
            resolved_version="$(printf '%s' "$version_json" | grep -m1 '"version"' | sed -E 's/.*"version":\s*"([^"]+)".*/\1/')"
        fi
        if [ -z "$resolved_version" ]; then
            err "Konnte Version aus version.json nicht ermitteln."
            return 1
        fi
        LTTH_VERSION="$resolved_version"
        ok "Neueste Version aus Branch ${LTTH_REPO_BRANCH}: v${LTTH_VERSION}"
    else
        ok "Verwende angegebene Version: v${LTTH_VERSION}"
    fi
}

# ---------- Node.js pruefen / installieren ----------
ensure_node() {
    if command -v node >/dev/null 2>&1; then
        local v major
        v="$(node --version | sed 's/^v//')"
        major="${v%%.*}"
        if [ "$major" -ge 18 ] && [ $((major % 2)) -eq 0 ]; then
            ok "Node.js ${v} gefunden"
            return 0
        fi
        warn "Node.js ${v} ausserhalb des unterstuetzten LTS-Bereichs (18/20/22/24)"
    fi

    log "Installiere Node.js LTS via NodeSource..."
    if [ "$(detect_platform | cut -d- -f1)" = "macos" ]; then
        if ! command -v brew >/dev/null 2>&1; then
            err "Bitte installiere Homebrew (https://brew.sh) oder Node.js manuell."
            return 1
        fi
        brew install node@22
        brew link --force --overwrite node@22
    else
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
}

# ---------- Git pruefen ----------
ensure_git() {
    if command -v git >/dev/null 2>&1; then
        return 0
    fi
    err "Git fehlt. Bitte installiere git (z.B. 'sudo apt install git' oder 'brew install git')."
    return 1
}

# ---------- Download ----------
download_source() {
    log "Klone Repository nach ${LTTH_DIR}..."
    if [ -d "$LTTH_DIR/.git" ]; then
        log "Bestehende Installation gefunden - aktualisiere..."
        if ! git -C "$LTTH_DIR" fetch --tags --prune origin "$LTTH_REPO_BRANCH"; then
            warn "Git Fetch fehlgeschlagen, verwende vorhandene lokale Branch-Struktur..."
        fi
        if [ "$LTTH_INSTALL_MODE" = "latest" ]; then
            if ! git -C "$LTTH_DIR" checkout "$LTTH_REPO_BRANCH" >/dev/null 2>&1; then
                git -C "$LTTH_DIR" checkout -B "$LTTH_REPO_BRANCH" "origin/$LTTH_REPO_BRANCH"
            fi
        elif ! git -C "$LTTH_DIR" checkout "v${LTTH_VERSION}" >/dev/null 2>&1; then
            if ! git -C "$LTTH_DIR" checkout "${LTTH_VERSION}" >/dev/null 2>&1; then
                warn "Gewuenschte Version nicht gefunden, nutze Standard-Branch ${LTTH_REPO_BRANCH}..."
                git -C "$LTTH_DIR" checkout "$LTTH_REPO_BRANCH"
            fi
        fi
    else
        if [ -d "$LTTH_DIR" ]; then
            warn "Bestehendes Zielverzeichnis gefunden, aber keine Git-Installation. Bereinige..."
            rm -rf "$LTTH_DIR"
        fi
        mkdir -p "$(dirname "$LTTH_DIR")"
        if git clone --depth 1 --branch "$LTTH_REPO_BRANCH" --single-branch "https://github.com/${LTTH_REPO_OWNER}/${LTTH_REPO_NAME}.git" "$LTTH_DIR" 2>/dev/null; then
            if [ "$LTTH_INSTALL_MODE" != "latest" ]; then
                git -C "$LTTH_DIR" fetch --depth 1 origin "refs/tags/v${LTTH_VERSION}:refs/tags/v${LTTH_VERSION}" >/dev/null 2>&1 || true
                if ! git -C "$LTTH_DIR" checkout "v${LTTH_VERSION}" >/dev/null 2>&1; then
                    if ! git -C "$LTTH_DIR" checkout "${LTTH_VERSION}" >/dev/null 2>&1; then
                        warn "Tag nicht verfuegbar, nutze Branch ${LTTH_REPO_BRANCH}..."
                    fi
                fi
            fi
        else
            err "Repository konnte nicht vom Branch ${LTTH_REPO_BRANCH} geklont werden."
            return 1
        fi
    fi
    ok "Quellcode bereit in ${LTTH_DIR}"
}

# ---------- Dependencies installieren ----------
install_deps() {
    log "Installiere npm-Abhaengigkeiten..."
    (cd "$LTTH_DIR/app" && npm install --no-audit --no-fund --loglevel=error)
    ok "Abhaengigkeiten installiert"
}

# ---------- Starten ----------
start_app() {
    log "Starte LTTH im Hintergrund..."
    cd "$LTTH_DIR/app"

    nohup env PORT="$LTTH_PORT" node launch.js > "$LTTH_DIR/ltth.log" 2>&1 &
    echo $! > "$LTTH_DIR/ltth.pid"

    sleep 2
    if kill -0 "$(cat "$LTTH_DIR/ltth.pid")" 2>/dev/null; then
        ok "LTTH laeuft (PID $(cat "$LTTH_DIR/ltth.pid")) auf Port ${LTTH_PORT}"
    else
        err "LTTH konnte nicht gestartet werden. Siehe ${LTTH_DIR}/ltth.log"
        return 1
    fi
}

open_browser() {
    if [ "$LTTH_NO_BROWSER" = "1" ]; then return 0; fi
    local url="http://localhost:${LTTH_PORT}/dashboard.html"
    log "Oeffne ${url} ..."
    (command -v xdg-open >/dev/null 2>&1 && xdg-open "$url" >/dev/null 2>&1) \
        || (command -v open >/dev/null 2>&1 && open "$url" >/dev/null 2>&1) \
        || true
}

# ---------- Hauptprogramm ----------
main() {
    echo ""
    echo "  ╔══════════════════════════════════════════════════════════════════════╗"
    echo "  ║   PupCid's Little TikTool Helper - One-Line Installer               ║"
    echo "  ╚══════════════════════════════════════════════════════════════════════╝"
    echo ""

    local platform
    platform="$(detect_platform)"
    log "Erkannte Plattform: ${platform}"

    need_cmd curl
    ensure_git
    ensure_node
    resolve_version
    download_source
    install_deps
    start_app
    open_browser

    echo ""
    ok "Installation abgeschlossen!"
    echo ""
    echo "  Dashboard:   http://localhost:${LTTH_PORT}/dashboard.html"
    echo "  Log-Datei:   ${LTTH_DIR}/ltth.log"
    echo "  Stoppen:     kill \$(cat ${LTTH_DIR}/ltth.pid)"
    echo "  Updates:     git -C ${LTTH_DIR} pull && cd ${LTTH_DIR}/app && npm install"
    echo ""
}

main "$@"
