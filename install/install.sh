#!/usr/bin/env bash
# ==============================================================================
#  LTTH One-Line Installer (Linux / macOS)
#  PupCid's Little TikTool Helper - https://ltth.app
#
#  Verwendung:
#    curl -fsSL https://ltth.app/install/install.sh | bash
#
#  Optionale Flags (ueber Umgebungsvariablen):
#    LTTH_VERSION      - zu installierende Version (Default: latest)
#    LTTH_DIR          - Installationsverzeichnis (Default: ~/.local/share/ltth)
#    LTTH_PORT         - HTTP-Port fuer das Dashboard (Default: 3000)
#    LTTH_NO_BROWSER   - Browser nach Start nicht automatisch oeffnen
#    LTTH_QUIET        - Reduzierte Ausgabe
#    LTTH_REPO_BRANCH  - Git-Branch fuer die Installation (Default: main)
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
LTTH_REPO_BRANCH="${LTTH_REPO_BRANCH:-main}"
LTTH_BRANCH_REFSPEC="+refs/heads/${LTTH_REPO_BRANCH}:refs/remotes/origin/${LTTH_REPO_BRANCH}"
LTTH_DIR="${LTTH_DIR:-$HOME/.local/share/ltth}"
LTTH_PORT="${LTTH_PORT:-3000}"
LTTH_NO_BROWSER="${LTTH_NO_BROWSER:-0}"
LTTH_QUIET="${LTTH_QUIET:-0}"
export GIT_HTTP_VERSION="${GIT_HTTP_VERSION:-HTTP/1.1}"

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

is_root() {
    [ "$(id -u)" -eq 0 ]
}

run_privileged() {
    if is_root; then
        "$@"
        return
    fi

    if command -v sudo >/dev/null 2>&1; then
        sudo "$@"
        return
    fi

    err "sudo ist nicht verfuegbar und der aktuelle Benutzer ist kein Administrator."
    return 1
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

ensure_homebrew() {
    if command -v brew >/dev/null 2>&1; then
        return 0
    fi

    local platform
    platform="$(detect_platform | cut -d- -f1)"
    if [ "$platform" != "macos" ]; then
        return 1
    fi

    log "Homebrew fehlt - installiere es automatisch..."
    if ! /bin/bash -lc 'NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'; then
        err "Homebrew konnte nicht installiert werden."
        return 1
    fi

    if [ -x /opt/homebrew/bin/brew ]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -x /usr/local/bin/brew ]; then
        eval "$(/usr/local/bin/brew shellenv)"
    fi

    command -v brew >/dev/null 2>&1
}

latest_node_lts_major() {
    local version_json major
    if ! version_json="$(curl -fsSL https://nodejs.org/dist/index.json)"; then
        printf '24'
        return 0
    fi
    major="$(printf '%s' "$version_json" | grep -m1 '"lts":' | sed -E 's/.*"version":\s*"v([0-9]+)\..*/\1/')"

    if [ -n "$major" ]; then
        printf '%s' "$major"
        return 0
    fi

    printf '24'
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

    local platform node_major
    platform="$(detect_platform | cut -d- -f1)"
    node_major="$(latest_node_lts_major)"

    log "Installiere Node.js LTS ${node_major}.x automatisch..."
    if [ "$platform" = "macos" ]; then
        if ! ensure_homebrew; then
            err "Homebrew konnte nicht installiert werden."
            return 1
        fi

        if ! brew install "node@${node_major}"; then
            warn "node@${node_major} ist bei Homebrew nicht verfuegbar, nutze das Standardformular als Fallback."
            if ! brew install node; then
                err "Node.js konnte via Homebrew nicht installiert werden."
                return 1
            fi
        else
            brew link --force --overwrite "node@${node_major}" || true
        fi
    else
        if is_root; then
            curl -fsSL "https://deb.nodesource.com/setup_${node_major}.x" | bash -
            apt-get install -y nodejs
        else
            curl -fsSL "https://deb.nodesource.com/setup_${node_major}.x" | sudo -E bash -
            sudo apt-get install -y nodejs
        fi
    fi

    if command -v node >/dev/null 2>&1; then
        ok "Node.js $(node --version | sed 's/^v//') gefunden"
        return 0
    fi

    err "Node.js konnte nicht automatisch installiert werden."
    return 1
}

# ---------- Git pruefen ----------
ensure_git() {
    if command -v git >/dev/null 2>&1; then
        return 0
    fi

    local platform
    platform="$(detect_platform | cut -d- -f1)"

    log "Git fehlt - installiere es automatisch..."
    if [ "$platform" = "macos" ]; then
        if ! ensure_homebrew; then
            err "Homebrew konnte nicht installiert werden."
            return 1
        fi
        brew install git
    elif [ "$platform" = "linux" ]; then
        if command -v apt-get >/dev/null 2>&1; then
            run_privileged apt-get update
            run_privileged apt-get install -y git
        elif command -v dnf >/dev/null 2>&1; then
            run_privileged dnf install -y git
        elif command -v yum >/dev/null 2>&1; then
            run_privileged yum install -y git
        elif command -v pacman >/dev/null 2>&1; then
            run_privileged pacman -Sy --noconfirm git
        elif command -v zypper >/dev/null 2>&1; then
            run_privileged zypper install -y git
        elif command -v apk >/dev/null 2>&1; then
            run_privileged apk add git
        else
            err "Kein unterstuetzter Paketmanager fuer Git gefunden."
            return 1
        fi
    else
        err "Nicht unterstuetzte Plattform fuer die Git-Installation: $platform"
        return 1
    fi

    if command -v git >/dev/null 2>&1; then
        ok "Git $(git --version | sed 's/^git version //') gefunden"
        return 0
    fi

    err "Git konnte nicht automatisch installiert werden."
    return 1
}

# ---------- Download ----------
download_source() {
    local repo_url="https://github.com/${LTTH_REPO_OWNER}/${LTTH_REPO_NAME}.git"

    clone_repository() {
        log "Klone Repository nach ${LTTH_DIR}..."
        if ! git clone --depth 1 --branch "$LTTH_REPO_BRANCH" --single-branch "$repo_url" "$LTTH_DIR"; then
            err "Repository konnte nicht vom Branch ${LTTH_REPO_BRANCH} geklont werden."
            return 1
        fi

        if [ "$LTTH_INSTALL_MODE" != "latest" ]; then
            if git -C "$LTTH_DIR" fetch --depth 1 origin "refs/tags/v${LTTH_VERSION}:refs/tags/v${LTTH_VERSION}" >/dev/null 2>&1 && \
                git -C "$LTTH_DIR" checkout "v${LTTH_VERSION}" >/dev/null 2>&1; then
                return 0
            fi

            if git -C "$LTTH_DIR" fetch --depth 1 origin "refs/tags/${LTTH_VERSION}:refs/tags/${LTTH_VERSION}" >/dev/null 2>&1 && \
                git -C "$LTTH_DIR" checkout "${LTTH_VERSION}" >/dev/null 2>&1; then
                return 0
            fi

            warn "Tag nicht verfuegbar, nutze Branch ${LTTH_REPO_BRANCH}..."
        fi
    }

    restore_repository_from_fresh_clone() {
        local reason="${1:-}"
        local reason_text=""
        local backup_dir
        local backup_created=0

        [ -n "$reason" ] && reason_text=" (${reason})"
        backup_dir="${LTTH_DIR}.broken-$$-$(date +%s)"

        warn "Bestehende Installation ist nicht sauber aktualisierbar${reason_text}; erstelle frische Kopie..."

        if mv "$LTTH_DIR" "$backup_dir" 2>/dev/null; then
            backup_created=1
        else
            warn "Bestehende Installation konnte nicht in ein Backup verschoben werden; ueberschreibe sie direkt."
            rm -rf "$LTTH_DIR"
        fi

        if clone_repository; then
            if [ "$backup_created" -eq 1 ]; then
                rm -rf "$backup_dir"
            fi
            return 0
        fi

        if [ "$backup_created" -eq 1 ] && [ -d "$backup_dir" ]; then
            rm -rf "$LTTH_DIR"
            mv "$backup_dir" "$LTTH_DIR"
        fi

        return 1
    }

    if [ -d "$LTTH_DIR/.git" ]; then
        log "Bestehende Installation gefunden - aktualisiere..."
        local refresh_required=0
        local refresh_reason=""

        if ! git -C "$LTTH_DIR" fetch --tags --prune origin "$LTTH_BRANCH_REFSPEC"; then
            refresh_required=1
            refresh_reason="git fetch"
            warn "Git Fetch fehlgeschlagen; pruefe frische Kopie..."
        fi

        if [ "$refresh_required" -eq 0 ]; then
            if [ "$LTTH_INSTALL_MODE" = "latest" ]; then
                if ! git -C "$LTTH_DIR" checkout "$LTTH_REPO_BRANCH" >/dev/null 2>&1; then
                    if ! git -C "$LTTH_DIR" checkout -B "$LTTH_REPO_BRANCH" "origin/$LTTH_REPO_BRANCH"; then
                        refresh_required=1
                        refresh_reason="branch checkout"
                        warn "Branch-Checkout fehlgeschlagen; pruefe frische Kopie..."
                    fi
                fi
            elif ! git -C "$LTTH_DIR" checkout "v${LTTH_VERSION}" >/dev/null 2>&1; then
                if ! git -C "$LTTH_DIR" checkout "${LTTH_VERSION}" >/dev/null 2>&1; then
                    warn "Gewuenschte Version nicht gefunden, nutze Standard-Branch ${LTTH_REPO_BRANCH}..."
                    if ! git -C "$LTTH_DIR" checkout "$LTTH_REPO_BRANCH" >/dev/null 2>&1; then
                        refresh_required=1
                        refresh_reason="branch checkout"
                        warn "Branch-Checkout fehlgeschlagen; pruefe frische Kopie..."
                    fi
                fi
            fi
        fi

        if [ "$refresh_required" -eq 1 ]; then
            restore_repository_from_fresh_clone "$refresh_reason" || return 1
        fi
    else
        if ! clone_repository; then
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
