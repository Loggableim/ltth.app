#!/usr/bin/env bash
# LTTH one-line uninstaller (Linux / macOS).
# Removes the install tree and can optionally remove the active LTTH config data.

set -euo pipefail

LTTH_DIR="${LTTH_DIR:-$HOME/.local/share/ltth}"
LTTH_QUIET="${LTTH_QUIET:-0}"

log()  { [ "$LTTH_QUIET" = "1" ] || echo "[ltth] $*"; }
ok()   { [ "$LTTH_QUIET" = "1" ] || echo "[OK] $*"; }
warn() { echo "[!] $*" >&2; }
err()  { echo "[X] $*" >&2; }

platform() {
  uname -s | tr '[:upper:]' '[:lower:]'
}

default_config_dir() {
  case "$(platform)" in
    darwin*) echo "$HOME/Library/Application Support/ltth.app" ;;
    linux*) echo "$HOME/.local/share/ltth.app" ;;
    msys*|cygwin*|mingw*) echo "${LOCALAPPDATA:-$HOME/AppData/Local}/ltth.app" ;;
    *) echo "$HOME/.local/share/ltth.app" ;;
  esac
}

install_custom_config_dir() {
  local settings_file="$LTTH_DIR/app/.config_path"
  if [ ! -f "$settings_file" ]; then
    return 0
  fi

  local custom_path
  custom_path="$(tr -d '\r\n' < "$settings_file" || true)"
  if [ -n "${custom_path:-}" ]; then
    printf '%s\n' "$custom_path"
  fi
}

config_targets() {
  local custom default
  default="$(default_config_dir)"
  custom="$(install_custom_config_dir || true)"

  if [ -n "${custom:-}" ]; then
    printf '%s\n' "$custom"
  fi

  if [ -z "${custom:-}" ] || [ "$custom" != "$default" ]; then
    printf '%s\n' "$default"
  fi
}

should_remove_data() {
  if [ "${LTTH_REMOVE_DATA:-0}" = "1" ]; then
    return 0
  fi

  if [ "${LTTH_KEEP_DATA:-0}" = "1" ]; then
    return 1
  fi

  if [ ! -t 0 ]; then
    return 1
  fi

  printf '\n'
  warn "Lokale LTTH-Daten und Configs koennen zusaetzlich entfernt werden."
  warn "Das betrifft die aktive LTTH-Konfiguration unterhalb von ltth.app."
  read -r -p "Alles loeschen? [j/N] " answer || true
  case "${answer:-}" in
    y|Y|yes|YES|j|J|ja|JA) return 0 ;;
    *) return 1 ;;
  esac
}

is_safe_delete_target() {
  local target="$1"

  case "$target" in
    ""|"/"|"."|".."|"$HOME"|"$HOME/"|"$HOME/." ) return 1 ;;
  esac

  case "$(platform)" in
    darwin*)
      case "$target" in
        "$HOME/Library/Application Support"|"$HOME/Library/Application Support/" ) return 1 ;;
        "$HOME/.local/share"|"$HOME/.local/share/" ) return 1 ;;
        "/Applications"|"/Applications/" ) return 1 ;;
        "/Library"|"/Library/" ) return 1 ;;
        "/System"|"/System/" ) return 1 ;;
        "/Users"|"/Users/" ) return 1 ;;
      esac
      ;;
    linux*)
      case "$target" in
        "$HOME/.local/share"|"$HOME/.local/share/" ) return 1 ;;
        "$HOME/.config"|"$HOME/.config/" ) return 1 ;;
        "/bin"|"/bin/" ) return 1 ;;
        "/etc"|"/etc/" ) return 1 ;;
        "/lib"|"/lib/" ) return 1 ;;
        "/lib64"|"/lib64/" ) return 1 ;;
        "/opt"|"/opt/" ) return 1 ;;
        "/sbin"|"/sbin/" ) return 1 ;;
        "/tmp"|"/tmp/" ) return 1 ;;
        "/usr"|"/usr/" ) return 1 ;;
        "/var"|"/var/" ) return 1 ;;
      esac
      ;;
    msys*|cygwin*|mingw*)
      case "$target" in
        "${LOCALAPPDATA:-$HOME/AppData/Local}"|"${LOCALAPPDATA:-$HOME/AppData/Local}/" ) return 1 ;;
        "${APPDATA:-$HOME/AppData/Roaming}"|"${APPDATA:-$HOME/AppData/Roaming}/" ) return 1 ;;
        "$HOME"|"${HOME}/" ) return 1 ;;
        "/c/Windows"|"/c/Windows/" ) return 1 ;;
        "/c/Program Files"|"/c/Program Files/" ) return 1 ;;
        "/c/Program Files (x86)"|"/c/Program Files (x86)/" ) return 1 ;;
        "/c/ProgramData"|"/c/ProgramData/" ) return 1 ;;
      esac
      ;;
  esac

  return 0
}

remove_path_safe() {
  local target="$1"

  [ -e "$target" ] || return 0

  if ! is_safe_delete_target "$target"; then
    warn "Ueberspringe unsicheren Pfad: $target"
    return 0
  fi

  rm -rf -- "$target"
  ok "Entfernt: $target"
}

stop_ltth_processes() {
  local pid_file="$LTTH_DIR/ltth.pid"
  if [ -f "$pid_file" ]; then
    local pid
    pid="$(tr -d '\r\n' < "$pid_file" || true)"
    if [ -n "$pid" ] && kill "$pid" 2>/dev/null; then
      ok "LTTH-Prozess beendet: $pid"
    fi
  fi

  local target
  for target in "launch.js" "launcher.exe"; do
    while IFS= read -r pid; do
      [ -n "$pid" ] || continue
      kill "$pid" 2>/dev/null || true
    done < <(ps -eo pid=,command= | grep -F "$target" | grep -v grep | awk '{print $1}' || true)
  done
}

main() {
  printf '\n'
  printf '  ============================================================\n'
  printf "   PupCid's Little TikTool Helper -- One-Line Uninstaller\n"
  printf '  ============================================================\n'
  printf '\n'

  log "Installationsverzeichnis: $LTTH_DIR"

  local remove_data
  if should_remove_data; then
    remove_data=1
    ok "Lokale Daten und Configs werden mit entfernt."
  else
    remove_data=0
    ok "Lokale Daten und Configs bleiben erhalten."
  fi

  stop_ltth_processes
  remove_path_safe "$LTTH_DIR"

  if [ "$remove_data" = "1" ]; then
    while IFS= read -r target; do
      [ -n "$target" ] || continue
      remove_path_safe "$target"
    done < <(config_targets)
  fi

  printf '\n'
  ok "Deinstallation abgeschlossen."
  printf '\n'
}

main "$@"
