#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
UUID="${REACT_LINUX_GALLERY_UUID:-react-linux-gallery@react-linux.local}"
MODE="${1:-gnome}"
DEV_XDG_DATA_HOME="${REACT_LINUX_GALLERY_XDG_DATA_HOME:-/tmp/react-linux-gallery-xdg}"
DEV_LOG="${REACT_LINUX_GALLERY_LOG:-/tmp/react-linux-gallery-gnome.log}"
DEV_MONITOR="${REACT_LINUX_GALLERY_MONITOR:-}"
DEV_DEBUG_CONTROL="${REACT_LINUX_GALLERY_DEBUG_CONTROL:-1}"
SHELL_PID=""
WATCH_PID=""

usage() {
  cat <<EOF
Usage:
  $0 gnome
  $0 gnome-smoke
  $0 gnome-ui-smoke
  $0 gnome-build
  $0 session

Modes:
  gnome        Native RAD host: visible GNOME Shell devkit, rebuilds and restarts on changes.
  gnome-smoke  Real GNOME Shell integration smoke in a private headless Shell.
  gnome-ui-smoke  Drive the visible devkit gallery and assert native actor geometry/interactivity.
  gnome-build  Build the extension once.
  session      Install into the current user's extension dir and try to enable in the current Shell.

Environment:
  REACT_LINUX_GALLERY_UUID=$UUID
  REACT_LINUX_GALLERY_XDG_DATA_HOME=$DEV_XDG_DATA_HOME
  REACT_LINUX_GALLERY_LOG=$DEV_LOG
  REACT_LINUX_GALLERY_MONITOR=${DEV_MONITOR:-}
  REACT_LINUX_GALLERY_DEBUG_CONTROL=$DEV_DEBUG_CONTROL
EOF
}

extension_dir() {
  local data_home="${1:-${XDG_DATA_HOME:-$HOME/.local/share}}"
  printf "%s/gnome-shell/extensions/%s\n" "$data_home" "$UUID"
}

write_extension_static_files() {
  local ext_dir="$1"
  mkdir -p "$ext_dir"
  rm -f "$ext_dir/extension.js" "$ext_dir/extension.js.map" "$ext_dir/favicon.ico" "$ext_dir/favicon.png" "$ext_dir/manifest.json"
  cp "$SCRIPT_DIR/gnome/stylesheet.css" "$ext_dir/stylesheet.css"
  cat >"$ext_dir/metadata.json" <<EOF
{
  "uuid": "$UUID",
  "name": "react-linux Gallery",
  "description": "Development gallery for the react-linux renderer.",
  "shell-version": ["45", "46", "47", "48", "49", "50"],
  "url": "https://github.com/iongion/react-linux",
  "version": 1
}
EOF
}

build_gnome_once() {
  local ext_dir="${1:-$(extension_dir)}"
  write_extension_static_files "$ext_dir"
  cd "$ROOT_DIR"
  REACT_LINUX_GALLERY_OUT_DIR="$ext_dir" yarn vite build --config "$SCRIPT_DIR/vite.gnome.config.mjs"
}

file_mtime() {
  stat -c %Y "$1" 2>/dev/null || stat -f %m "$1"
}

wait_for_extension_js() {
  local ext_dir="$1"
  for _ in $(seq 1 80); do
    if [[ -s "$ext_dir/extension.js" ]]; then
      return
    fi
    sleep 0.25
  done
  echo "Timed out waiting for $ext_dir/extension.js" >&2
  exit 1
}

write_shell_session_script() {
  local script_path="$1"
  local shell_mode="$2"
  cat >"$script_path" <<EOF
#!/usr/bin/env bash
set -euo pipefail
gsettings set org.gnome.shell disable-user-extensions false
gsettings set org.gnome.shell enabled-extensions "['$UUID']"
case "$shell_mode" in
  devkit)
    if [ "$DEV_DEBUG_CONTROL" != "0" ]; then
      if [ -n "$DEV_MONITOR" ]; then
        exec gnome-shell --devkit --debug-control --virtual-monitor "$DEV_MONITOR" --wayland-display=react-linux-gallery
      fi
      exec gnome-shell --devkit --debug-control --wayland-display=react-linux-gallery
    fi
    if [ -n "$DEV_MONITOR" ]; then
      exec gnome-shell --devkit --virtual-monitor "$DEV_MONITOR" --wayland-display=react-linux-gallery
    fi
    exec gnome-shell --devkit --wayland-display=react-linux-gallery
    ;;
  headless)
    exec gnome-shell --headless --virtual-monitor 1024x768 --wayland --no-x11 --wayland-display=react-linux-smoke
    ;;
esac
EOF
  chmod +x "$script_path"
}

start_private_shell() {
  local xdg_data_home="$1"
  local shell_mode="$2"
  local log_file="$3"
  local script_path
  script_path="$(mktemp)"
  write_shell_session_script "$script_path" "$shell_mode"
  : >"$log_file"
  setsid env XDG_DATA_HOME="$xdg_data_home" dbus-run-session -- "$script_path" >>"$log_file" 2>&1 &
  echo "$!"
}

stop_process() {
  local pid="${1:-}"
  if [[ -n "$pid" ]]; then
    kill -- "-$pid" >/dev/null 2>&1 || true
    kill "$pid" >/dev/null 2>&1 || true
    wait "$pid" >/dev/null 2>&1 || true
  fi
}

stop_native_shell_host() {
  stop_process "$SHELL_PID"
  SHELL_PID=""
  pkill -f "gnome-shell .*--devkit .*--wayland-display=react-linux-gallery" >/dev/null 2>&1 || true
  pkill -f "/usr/libexec/mutter-devkit" >/dev/null 2>&1 || true
}

scan_shell_log_for_errors() {
  local log_file="$1"
  if grep -Ei "Extension $UUID:|ReferenceError|TypeError|No property|No signal|Invalid value|GNOME Shell-CRITICAL|Gjs-CRITICAL" "$log_file"; then
    return 1
  fi
}

require_headless_shell_dependencies() {
  if ! command -v gnome-shell >/dev/null 2>&1; then
    echo "gnome-shell was not found; install GNOME Shell before running headless smoke." >&2
    exit 1
  fi
  if ! gsettings list-schemas | grep -qx "org\\.gnome\\.shell"; then
    echo "GNOME Shell gsettings schema org.gnome.shell was not found." >&2
    echo "Install the distro package that provides GNOME Shell schemas before running headless smoke." >&2
    exit 1
  fi
}

wait_for_headless_extension() {
  local log_file="$1"
  for _ in $(seq 1 80); do
    if gdbus call --session --dest org.gnome.Shell.Extensions --object-path /org/gnome/Shell/Extensions --method org.gnome.Shell.Extensions.GetExtensionInfo "$UUID" >/tmp/react-linux-gallery-info.txt 2>/tmp/react-linux-gallery-info.err; then
      if grep -Fq "'enabled': <true>" /tmp/react-linux-gallery-info.txt; then
        sleep 1.5
        cat /tmp/react-linux-gallery-info.txt
        gdbus call --session --dest org.gnome.Shell.Extensions --object-path /org/gnome/Shell/Extensions --method org.gnome.Shell.Extensions.GetExtensionErrors "$UUID"
        scan_shell_log_for_errors "$log_file"
        return
      fi
    fi
    sleep 0.25
  done
  echo "Timed out waiting for GNOME Shell extension $UUID" >&2
  cat "$log_file" >&2 || true
  exit 1
}

run_gnome_smoke() {
  require_headless_shell_dependencies

  local xdg_data_home
  local log_file
  xdg_data_home="$(mktemp -d)"
  log_file="/tmp/react-linux-gallery-headless.log"
  build_gnome_once "$(extension_dir "$xdg_data_home")" >/tmp/react-linux-gallery-headless-build.log 2>&1

  local script_path
  script_path="$(mktemp)"
  write_shell_session_script "$script_path" headless

  XDG_DATA_HOME="$xdg_data_home" timeout 35s dbus-run-session -- bash -c "
    set -euo pipefail
    : >'$log_file'
    '$script_path' >'$log_file' 2>&1 &
    shell_pid=\$!
    cleanup() {
      kill \"\$shell_pid\" >/dev/null 2>&1 || true
      wait \"\$shell_pid\" >/dev/null 2>&1 || true
    }
    trap cleanup EXIT
    $(declare -f scan_shell_log_for_errors)
    $(declare -f wait_for_headless_extension)
    UUID='$UUID'
    wait_for_headless_extension '$log_file'
  "

  rm -rf "$xdg_data_home"
}

run_gnome_devkit() {
  if ! command -v gnome-shell >/dev/null 2>&1; then
    echo "gnome-shell was not found." >&2
    exit 1
  fi

  local ext_dir
  ext_dir="$(extension_dir "$DEV_XDG_DATA_HOME")"
  rm -rf "$DEV_XDG_DATA_HOME"
  build_gnome_once "$ext_dir"
  wait_for_extension_js "$ext_dir"

  cd "$ROOT_DIR"
  REACT_LINUX_GALLERY_OUT_DIR="$ext_dir" yarn vite build --watch --config "$SCRIPT_DIR/vite.gnome.config.mjs" &
  WATCH_PID=$!
  local last_mtime
  local last_stylesheet_mtime

  cleanup() {
    stop_native_shell_host
    stop_process "$WATCH_PID"
    WATCH_PID=""
  }
  trap cleanup EXIT INT TERM

  # Vite --watch performs an immediate rebuild. Let that settle before starting
  # the Shell process so we do not restart into a second compositor during boot.
  sleep 1
  last_mtime="$(file_mtime "$ext_dir/extension.js")"
  last_stylesheet_mtime="$(file_mtime "$SCRIPT_DIR/gnome/stylesheet.css")"
  SHELL_PID="$(start_private_shell "$DEV_XDG_DATA_HOME" devkit "$DEV_LOG")"
  sleep 2
  if grep -q "Failed to launch devkit" "$DEV_LOG"; then
    echo "GNOME Shell started, but visible devkit support is missing on this system." >&2
    echo "Missing /usr/libexec/mutter-devkit; install the distro package that provides GNOME Shell devkit for a visible RAD window." >&2
    echo "The real headless Shell smoke still works: $0 gnome-smoke" >&2
  fi

  echo "Native GNOME Shell gallery host running."
  echo "Extension dir: $ext_dir"
  echo "Log: $DEV_LOG"
  echo "Rebuilds restart the Shell host. Stop with Ctrl+C."

  while kill -0 "$WATCH_PID" >/dev/null 2>&1; do
    sleep "${REACT_LINUX_GALLERY_RELOAD_INTERVAL:-0.7}"
    if [[ ! -f "$ext_dir/extension.js" ]]; then
      continue
    fi
    local next_mtime
    next_mtime="$(file_mtime "$ext_dir/extension.js")"
    local next_stylesheet_mtime
    next_stylesheet_mtime="$(file_mtime "$SCRIPT_DIR/gnome/stylesheet.css")"
    if [[ "$next_mtime" != "$last_mtime" ]]; then
      last_mtime="$next_mtime"
      cp "$SCRIPT_DIR/gnome/stylesheet.css" "$ext_dir/stylesheet.css"
      stop_native_shell_host
      SHELL_PID="$(start_private_shell "$DEV_XDG_DATA_HOME" devkit "$DEV_LOG")"
      continue
    fi
    if [[ "$next_stylesheet_mtime" != "$last_stylesheet_mtime" ]]; then
      last_stylesheet_mtime="$next_stylesheet_mtime"
      cp "$SCRIPT_DIR/gnome/stylesheet.css" "$ext_dir/stylesheet.css"
      stop_native_shell_host
      SHELL_PID="$(start_private_shell "$DEV_XDG_DATA_HOME" devkit "$DEV_LOG")"
    fi
  done

  wait "$WATCH_PID"
}

extension_info_exists() {
  gnome-extensions info "$UUID" >/dev/null 2>&1
}

run_session_install() {
  if ! command -v gnome-extensions >/dev/null 2>&1; then
    echo "gnome-extensions was not found." >&2
    exit 1
  fi

  local ext_dir
  ext_dir="$(extension_dir)"
  build_gnome_once "$ext_dir"
  if ! extension_info_exists; then
    echo "Built $ext_dir, but this GNOME Shell process does not know the new UUID yet." >&2
    echo "Use $0 gnome for the native RAD host, or restart GNOME Shell/session before enabling this UUID in the current desktop." >&2
    exit 1
  fi
  gnome-extensions enable "$UUID"
}

case "$MODE" in
  gnome|native)
    run_gnome_devkit
    ;;
  gnome-smoke|smoke)
    run_gnome_smoke
    ;;
  gnome-ui-smoke|ui-smoke)
    node "$SCRIPT_DIR/native-ui-smoke.mjs"
    ;;
  gnome-build|build)
    build_gnome_once "$(extension_dir)"
    ;;
  session)
    run_session_install
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
