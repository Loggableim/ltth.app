#!/usr/bin/env bash
# ==============================================================================
#  LTTH One-Line Installer (Linux / macOS)
#  PupCid's Little TikTool Helper — https://ltth.app
#
#  Verwendung:
#    curl -fsSL https://ltth.app/install/install.sh | bash
#
#  Optionale Flags (über Umgebungsvariablen):
#    LTTH_VERSION     - zu installierende Version (Default: latest)
#    LTTH_DIR         - Installationsverzeichnis (Default: ~/.local/share/ltth)
#    LTTH_PORT        - HTTP-Port fürs Dashboard (Default: 3000)
#    LTTH_NO_BROWSER  - Browser nach Start nicht automatisch öffnen
#    LTTH_QUIET       - Reduzierte Ausgabe
# ==============================================================================

set -euo pipefail

# ---------- Konfiguration ----------
LTTH_REPO_OWNER="${LTTH_REPO_OWNER:-Loggableim}"
LTTH_REPO_NAME="${LTTH_REPO_NAME:-ltth.app}"
LTTH_VERSION="${LTTH_VERSION:-latest}"
LTTH_DIR="${LTTH_DIR:-$HOME/.local/share/ltth}"
LTTH_PORT="${LTTH_PORT:-3000}"
LTTH_NO_BROWSER="${LTTH_NO_BROWSER:-0}"
LTTH_QUIET="${LTTH_QUIET:-0}"

# ---------- Hilfsfunktionen ----------
log()  { [ "$LTTH_QUIET" = "1" ] || echo -e "\033[1;36m[ltth]\033[0m $*"; }
ok()   { [ "$LTTH_QUIET" = "1" ] || echo -e "\033[1;32m[✓]\033[0m $*"; }
warn() { echo -e "\033[1;33m[!]\033[0m $*" >&2; }
err()  { echo -e "\033[1;31m[✗]\033[0m $*" >&2; }

need_cmd() {
    command -v "$1" >/dev/null 2>&1 || {
        err "Benötigtes Kommando fehlt: $1"
        return 1
    }
}

# ---------- Plattform-Erkennung ----------
detect_platform() {
    local os arch
    os="$(uname -s | tr '[:upper:]' '[:lower:]')"
    arch="$(uname -m)"

    case "$os" in
        linux*)   os="linux" ;;
        darwin*)  os="macos" ;;
        msys*|cygwin*|mingw*) os="windows" ;;
        *) err "Nicht unterstütztes Betriebssystem: $os"; return 1 ;;
    esac

    case "$arch" in
        x86_64|amd64)   arch="amd64" ;;
        arm64|aarch64)  arch="arm64" ;;
        *) err "Nicht unterstützte Architektur: $arch"; return 1 ;;
    esac

    echo "$os-$arch"
}

# ---------- Version ermitteln ----------
resolve_version() {
    if [ "$LTTH_VERSION" = "latest" ]; then
        log "Ermittle neueste Version von GitHub..."
        local release_json
        release_json="$(curl -fsSL "https://api.github.com/repos/${LTTH_REPO_OWNER}/${LTTH_REPO_NAME}/releases/latest")"
        if echo "$release_json" | grep -q '"message"\s*:\s*"Not Found"'; then
            warn "Kein GitHub Release gefunden; verwende neuesten Tag..."
            LTTH_VERSION="$(curl -fsSL "https://api.github.com/repos/${LTTH_REPO_OWNER}/${LTTH_REPO_NAME}/tags?per_page=1" \
                | grep -m1 '"name"' \
                | sed -E 's/.*"name":\s*"v?([^"]+)".*/\1/')"
        else
            LTTH_VERSION="$(echo "$release_json" \
                | grep -m1 '"tag_name"' \
                | sed -E 's/.*"tag_name":\s*"v?([^"]+)".*/\1/')"
        fi
        if [ -z "$LTTH_VERSION" ]; then
            err "Konnte neueste Version nicht ermitteln."
            return 1
        fi
        ok "Neueste Version: v${LTTH_VERSION}"
    else
        ok "Verwende angegebene Version: v${LTTH_VERSION}"
    fi
}

# ---------- Node.js prüfen / installieren ----------
ensure_node() {
    if command -v node >/dev/null 2>&1; then
        local v
        v="$(node --version | sed 's/^v//')"
        local major="${v%%.*}"
        if [ "$major" -ge 18 ] && [ "$major" -lt 25 ]; then
            ok "Node.js ${v} gefunden"
            return 0
        fi
        warn "Node.js ${v} ausserhalb des unterstützten Bereichs (>=18 <25)"
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

# ---------- Git prüfen ----------
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
        log "Bestehende Installation gefunden — aktualisiere..."
        git -C "$LTTH_DIR" fetch --tags --prune
        git -C "$LTTH_DIR" checkout "v${LTTH_VERSION}" 2>/dev/null \
            || git -C "$LTTH_DIR" checkout "${LTTH_VERSION}"
    else
        if [ -d "$LTTH_DIR" ]; then
            warn "Bestehendes Zielverzeichnis gefunden, aber keine Git-Installation. Bereinige..."
            rm -rf "$LTTH_DIR"
        fi
        mkdir -p "$(dirname "$LTTH_DIR")"
        git clone --branch "v${LTTH_VERSION}" --depth 1 \
            "https://github.com/${LTTH_REPO_OWNER}/${LTTH_REPO_NAME}.git" \
            "$LTTH_DIR" 2>/dev/null \
            || git clone --branch "${LTTH_VERSION}" --depth 1 \
                "https://github.com/${LTTH_REPO_OWNER}/${LTTH_REPO_NAME}.git" \
                "$LTTH_DIR"
    fi
    ok "Quellcode bereit in ${LTTH_DIR}"
}

# ---------- Dependencies installieren ----------
install_deps() {
    log "Installiere npm-Abhängigkeiten..."
    (cd "$LTTH_DIR/app" && npm install --no-audit --no-fund --loglevel=error)
    ok "Abhängigkeiten installiert"
}

# ---------- Starten ----------
start_app() {
    log "Starte LTTH im Hintergrund..."
    cd "$LTTH_DIR/app"

    nohup env PORT="$LTTH_PORT" node launch.js > "$LTTH_DIR/ltth.log" 2>&1 &
    echo $! > "$LTTH_DIR/ltth.pid"

    sleep 2
    if kill -0 "$(cat "$LTTH_DIR/ltth.pid")" 2>/dev/null; then
        ok "LTTH läuft (PID $(cat "$LTTH_DIR/ltth.pid")) auf Port ${LTTH_PORT}"
    else
        err "LTTH konnte nicht gestartet werden. Siehe ${LTTH_DIR}/ltth.log"
        return 1
    fi
}

open_browser() {
    if [ "$LTTH_NO_BROWSER" = "1" ]; then return 0; fi
    local url="http://localhost:${LTTH_PORT}/dashboard.html"
    log "Öffne ${url} ..."
    (command -v xdg-open >/dev/null 2>&1 && xdg-open "$url" >/dev/null 2>&1) \
        || (command -v open    >/dev/null 2>&1 && open    "$url" >/dev/null 2>&1) \
        || true
}

# ---------- Hauptprogramm ----------
main() {
    echo ""
    echo "  ╔══════════════════════════════════════════════════════╗"
    echo "  ║   PupCid's Little TikTool Helper — One-Line Installer║"
    echo "  ╚══════════════════════════════════════════════════════╝"
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
