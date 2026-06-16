# react-linux

Experimental React renderer package for Linux-native UI runtimes.

The implemented backend today is GNOME Shell. The package name leaves room for
future backends such as QML, but those are not implemented now.

Package docs live in [`docs/`](docs/). Start with
[`docs/architecture.md`](docs/architecture.md) for the renderer architecture.
Use [`docs/development.md`](docs/development.md) for the current native GNOME
Shell development workflow.

This package owns a backend-agnostic React renderer core plus the current GNOME
Shell backend. It does not know about application state, Electron app shells,
Docker, Podman, Zustand, TanStack Query, or app IPC.

Keep this package sample-only until the GNOME Shell backend is proven in real
Shell.

## Development Workflow

Use the visible GNOME Shell devkit loop as the source of truth:

```sh
support/react-linux-gallery/run.sh gnome
```

This builds a local gallery extension, starts a visible Mutter/GNOME Shell
development host, watches the extension bundle, copies Shell CSS changes, and
restarts the host on rebuild. The normal visible path does not default to
`--virtual-monitor`; the wrapper launches:

```text
gnome-shell --devkit --wayland-display=react-linux-gallery
```

The native smoke loop runs a real private headless Shell:

```sh
support/react-linux-gallery/run.sh gnome-smoke
```

Use smoke for automated load/runtime checks, and use the visible devkit for
layout, sizing, icon, theme, and interaction review.

One-shot native build:

```sh
support/react-linux-gallery/run.sh gnome-build
```

## Package usage

The package exports host primitives from the package root:

```tsx
import { Box, Button, createGnomeShellRoot, Label, QuickToggle } from "react-linux";
```

The Shell extension provides actual GNOME imports to the adapter:

```tsx
import Clutter from "gi://Clutter";
import St from "gi://St";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as QuickSettings from "resource:///org/gnome/shell/ui/quickSettings.js";

const root = createGnomeShellRoot(
  hostActor,
  { Clutter, PopupMenu, QuickSettings, St },
  { eventStopValue: Clutter.EVENT_STOP },
);
```

## Current Backend Scope

The current backend is GNOME Shell only. Future QML support should be a separate
backend adapter and entry point, not a branch inside the GNOME Shell adapter.

## Shell-only scope

Allowed in the Shell process:

- `St` widgets from `gi://St`
- `Clutter`, `Gio`, `GLib`, `GObject`, `Shell`, `Meta` when an extension needs them
- GNOME Shell JavaScript modules such as `PanelMenu`, `PopupMenu`, `QuickSettings`,
  `Dialog`, and `Main`
- Shell CSS in extension stylesheets

Not allowed in the Shell process:

- `Gtk`
- `Gdk`
- `Adw`
- browser runtime APIs
- WebView or Electron APIs
- Node APIs
- application stores or engine clients

## Widget API

Typed `St` exports:

- `Bin`
- `BoxLayout` / `Box`
- `Button`
- `DrawingArea`
- `Entry`
- `Icon`
- `Label`
- `ScrollBar`
- `ScrollView` / `Scroll`
- `Widget`
- `Progress`
- `Separator`

Typed `PopupMenu` exports:

- `PopupMenu`
- `PopupMenuSection`
- `PopupBaseMenuItem`
- `PopupMenuItem`
- `PopupImageMenuItem`
- `PopupSeparatorMenuItem`
- `PopupSubMenuMenuItem`
- `PopupSwitchMenuItem`

Typed `QuickSettings` exports:

- `SystemIndicator`
- `QuickToggle`
- `QuickMenuToggle`
- `QuickSlider`
- `QuickSettingsItem`

Generic `St` escape hatches:

```tsx
import { createStComponent, StWidget } from "react-linux";

const PasswordEntry = createStComponent("PasswordEntry");

<PasswordEntry text="" hintText="Password" />;
<StWidget widget="DrawingArea" reactive width={120} height={32} />;
```

Generic `PopupMenu` escape hatch:

```tsx
import { PopupMenuObject } from "react-linux";

<PopupMenuObject object="PopupMenuItem">Open</PopupMenuObject>;
```

Generic `QuickSettings` escape hatch:

```tsx
import { QuickSettingsObject } from "react-linux";

<QuickSettingsObject object="QuickToggle" title="VPN" iconName="network-vpn-symbolic" />;
```

Arbitrary GObject/Shell signals can be bound without adding a new React prop:

```tsx
<StWidget
  widget="DrawingArea"
  reactive
  signals={{
    repaint: (area) => {
      // draw with Cairo from the Shell-side signal callback
    },
  }}
/>;
```

## Unix Socket HTTP

GNOME Shell does not provide Node's `http`, `net`, or Axios Node adapter
runtime. For HTTP over a Unix socket inside Shell, use the Gio-backed adapter:

```ts
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import axios from "axios";
import { createGioUnixSocketAxiosAdapter } from "react-linux/gnome-shell/unix-socket-http";

const api = axios.create({
  adapter: createGioUnixSocketAxiosAdapter({ Gio, GLib }, { socketPath: "/run/user/1000/app.sock" }),
});

const response = await api.get("/v1/state");
```

The same module also exports `requestGioUnixHttp` for Shell code that should not
pull Axios into the extension bundle.

## Internal layout

The public renderer files stay at the package root. GNOME Shell-specific
implementation details live under `gnome-shell/`:

- `gnome-shell/types.ts` - toolkit, actor, object, node contracts
- `gnome-shell/intrinsics.ts` - intrinsic name mapping
- `gnome-shell/objects.ts` - `St`, `PopupMenu`, and `QuickSettings` object construction
- `gnome-shell/props.ts` - prop normalization and constructor parameter mapping
- `gnome-shell/applyProps.ts` - prop application to existing Shell objects
- `gnome-shell/signals.ts` - signal connection policy
- `gnome-shell/tree.ts` - actor/menu/quick-settings child lifecycle

Future GNOME Shell modules should follow the same boundary. Future non-Shell
backends should get their own adapter, backend internals, primitives, tests, and
sample harness.
