#!/usr/bin/env bash
set -euo pipefail

SUDO=""
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  SUDO="sudo"
fi

APT_CACHE_ARGS=()
if [ -n "${REACT_LINUX_APT_CACHE_DIR:-}" ]; then
  mkdir -p "$REACT_LINUX_APT_CACHE_DIR/partial"
  APT_CACHE_ARGS=(-o "Dir::Cache::archives=$REACT_LINUX_APT_CACHE_DIR")
fi

APT_INSTALL_ARGS=()
if [ "${REACT_LINUX_APT_NO_INSTALL_RECOMMENDS:-0}" = "1" ]; then
  APT_INSTALL_ARGS=(--no-install-recommends)
fi

warn() {
  printf "\033[1;33mwarning:\033[0m %s\n" "$*" >&2
}

apt_get() {
  $SUDO apt-get "${APT_CACHE_ARGS[@]}" "$@"
}

apt_install() {
  apt_get install -y "${APT_INSTALL_ARGS[@]}" "$@"
}

pm() {
  if command -v apt-get >/dev/null 2>&1; then
    echo apt
  elif command -v dnf >/dev/null 2>&1; then
    echo dnf
  elif command -v yum >/dev/null 2>&1; then
    echo yum
  elif command -v pacman >/dev/null 2>&1; then
    echo pacman
  else
    echo ""
  fi
}

apt_libmutter_dev_package() {
  if apt-cache show libmutter-18-dev >/dev/null 2>&1; then
    echo "libmutter-18-dev"
    return
  fi

  apt-cache search --names-only '^libmutter-[0-9]+-dev$' \
    | awk '{ print $1 }' \
    | sort -V \
    | tail -n 1
}

apt_package_exists() {
  apt-cache show "$1" >/dev/null 2>&1
}

install_best_effort_packages() {
  local package_manager="$1"
  local note="$2"
  shift 2

  local package
  for package in "$@"; do
    case "$package_manager" in
      apt)
        apt_install "$package" || warn "Could not install $package. $note"
        ;;
      dnf|yum)
        $SUDO "$package_manager" install -y "$package" || warn "Could not install $package. $note"
        ;;
      pacman)
        $SUDO pacman -S --needed --noconfirm "$package" || warn "Could not install $package. $note"
        ;;
      *)
        warn "Unsupported package manager. Install $package manually."
        ;;
    esac
  done
}

install_gnome_shell_dev_tools() {
  local package_manager="$1"
  local note="GNOME Shell devkit tools failed to install (the native gallery host may not launch visibly)."

  case "$package_manager" in
    apt)
      local libmutter_dev
      apt_get update
      libmutter_dev="$(apt_libmutter_dev_package)"
      apt_install gnome-shell || warn "GNOME Shell failed to install (headless smoke will not run)."
      if apt_package_exists mutter-dev-bin; then
        apt_install mutter-dev-bin || warn "$note"
      else
        warn "mutter-dev-bin is unavailable on this apt distribution; visible devkit support may be missing."
      fi
      if [ -n "$libmutter_dev" ]; then
        apt_install "$libmutter_dev" || warn "$note"
      else
        warn "No libmutter-*-dev package found; development typelibs may be missing."
      fi
      ;;
    dnf|yum)
      $SUDO "$package_manager" install -y mutter-devel gnome-shell || warn "$note"
      ;;
    pacman)
      $SUDO pacman -S --needed --noconfirm mutter gnome-shell || warn "$note"
      ;;
    *)
      warn "Unsupported package manager. Install GNOME Shell and mutter devkit packages manually."
      ;;
  esac
}

install_visual_dev_tools() {
  local package_manager="$1"
  local note="Native UI visual/debug tooling may be incomplete."

  case "$package_manager" in
    apt)
      install_best_effort_packages "$package_manager" "$note" \
        libglib2.0-bin \
        jq \
        procps \
        psmisc \
        imagemagick \
        pngquant \
        gnome-screenshot \
        wl-clipboard \
        gjs \
        gobject-introspection \
        libgtk-4-dev \
        libadwaita-1-dev \
        gir1.2-gtk-4.0 \
        gir1.2-adw-1
      ;;
    dnf|yum)
      install_best_effort_packages "$package_manager" "$note" \
        glib2 \
        jq \
        procps-ng \
        psmisc \
        ImageMagick \
        pngquant \
        gnome-screenshot \
        wl-clipboard \
        gjs \
        gobject-introspection-devel \
        gtk4-devel \
        libadwaita-devel
      ;;
    pacman)
      install_best_effort_packages "$package_manager" "$note" \
        glib2 \
        jq \
        procps-ng \
        psmisc \
        imagemagick \
        pngquant \
        gnome-screenshot \
        wl-clipboard \
        gjs \
        gobject-introspection \
        gtk4 \
        libadwaita
      ;;
    *)
      warn "Unsupported package manager. Install DBus, ImageMagick, screenshot, GJS, GTK4, and libadwaita tools manually."
      ;;
  esac
}

main() {
  if [ "$(uname -s)" != "Linux" ]; then
    echo "GNOME Shell devkit provisioning is only supported on Linux."
    return
  fi

  local package_manager
  package_manager="$(pm)"
  install_gnome_shell_dev_tools "$package_manager"
  install_visual_dev_tools "$package_manager"

  if [ -x /usr/libexec/mutter-devkit ]; then
    echo "ok: /usr/libexec/mutter-devkit"
  else
    warn "/usr/libexec/mutter-devkit was not found after provisioning."
  fi
}

main "$@"
