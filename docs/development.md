# Development workflow

The current development workflow is for the GNOME Shell backend. It uses the
sample gallery to exercise `react-linux` in real Shell. The gallery is a sample,
not the package architecture. There is no DOM or browser mirror.

Use the visible GNOME Shell devkit loop as the source of truth:

```sh
support/react-linux-gallery/run.sh gnome
```

This builds the gallery extension, starts a visible Mutter/GNOME Shell
development host, watches the extension bundle, copies Shell CSS changes, and
restarts the host on rebuild. The visible path must not default to
`--virtual-monitor`; that broke the devkit panel and menu bar. The normal launch
shape is:

```text
gnome-shell --devkit --wayland-display=react-linux-gallery
```

## Automation hook

The visible development host enables GNOME `--debug-control` by default, and the
gallery extension exposes a dev-only DBus control object on the private Shell
bus:

```sh
gdbus call --session \
  --dest org.gnome.Shell \
  --object-path /org/react_linux/ReactLinuxGallery \
  --method org.react_linux.ReactLinuxGallery.Open
```

Methods:

- `Open`
- `Close`
- `Toggle`
- `IsOpen`
- `Dump`
- `ProgressDown`
- `ProgressUp`
- `SetProgress`
- `SetSlider`
- `SetEntryText`
- `ActivatePopupOpen`
- `ActivatePopupImage`
- `TogglePopupSwitch`
- `ToggleSubmenu`
- `Capture`
- `SetStepButtonsActive`

Use this hook to open the sample before taking native screenshots or injecting
pointer interactions. Do not rely on the user to click the tray while developing
the gallery.

## Native screenshots

Use the extension-side `Capture` method for screenshots. It runs inside the
nested GNOME Shell devkit process, uses Shell's screenshot API against the native
stage, and writes a PNG. This is the fast path for visual debugging.

Start the visible devkit:

```sh
support/react-linux-gallery/run.sh gnome
```

Find the private DBus session bus used by that nested Shell, then open and
capture the gallery:

```sh
shell_pid="$(pgrep -f '[g]nome-shell --devkit.*wayland-display=react-linux-gallery' | head -n 1)"
bus_address="$(tr '\0' '\n' <"/proc/${shell_pid}/environ" | sed -n 's/^DBUS_SESSION_BUS_ADDRESS=//p' | head -n 1)"
export DBUS_SESSION_BUS_ADDRESS="${bus_address}"

object_path=/org/react_linux/ReactLinuxGallery
iface=org.react_linux.ReactLinuxGallery

gdbus call --session --dest org.gnome.Shell --object-path "${object_path}" --method "${iface}.Open"
gdbus call --session --dest org.gnome.Shell --object-path "${object_path}" --method "${iface}.Capture" /tmp/react-linux-gallery.png
file /tmp/react-linux-gallery.png
```

Inspect `/tmp/react-linux-gallery.png` with `view_image` or an image viewer. In
zsh, do not name the object path variable `path`; `path` is tied to `PATH`.

To capture a stateful interaction, drive the DBus control first and then capture
again:

```sh
gdbus call --session --dest org.gnome.Shell --object-path "${object_path}" --method "${iface}.ToggleSubmenu"
gdbus call --session --dest org.gnome.Shell --object-path "${object_path}" --method "${iface}.Capture" /tmp/react-linux-gallery-submenu.png
```

Avoid these dead ends:

- host `org.gnome.Shell.Screenshot` DBus calls can return `AccessDenied`;
- the nested Shell screenshot DBus service can also return `AccessDenied`;
- `ffmpeg -f x11grab` under GNOME Wayland can produce black frames;
- browser or Playwright screenshots do not validate this native Shell UI;
- do not fall back to mp4/webm when one PNG is enough.

## Visual review

Check the native devkit window, not just build logs.

Review at least:

- panel button and popup placement;
- overflow against the visible devkit window;
- quick toggle, quick slider, and quick menu icon sizing;
- text truncation inside native Shell widgets;
- pointer interaction against the actual Shell actor tree;
- event log updates after a real click.

## Smoke test

Real headless Shell smoke is separate:

```sh
support/react-linux-gallery/run.sh gnome-smoke
```

Use smoke for automated extension load/runtime checks. It runs a private
headless GNOME Shell with a virtual monitor and fails on extension/runtime
errors.

## Other loops

One-shot native build:

```sh
support/react-linux-gallery/run.sh gnome-build
```
