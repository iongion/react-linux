# Package boundaries

The repository root is a reusable renderer package, not an application-specific
tray implementation.

The package may know about:

- React and `react-reconciler`;
- a backend-agnostic adapter contract;
- backend-specific native object models in isolated backend modules;
- backend-specific props, keyed children, reordering, and signal cleanup.

The implemented backend today may know about:

- GNOME Shell `St` actors;
- GNOME Shell `PopupMenu` objects;
- GNOME Shell `QuickSettings` objects;
- small adapter escape hatches for GNOME Shell objects that are not typed yet.

It must not know about:

- application stores or resource state;
- Docker, Podman, SSH, WSL, or engine clients;
- Electron main, preload, renderer IPC, or `BrowserWindow`;
- application-specific tray snapshot/action protocols;
- TanStack Query, Zustand, or app mutation hooks;
- browser runtimes, WebView, GTK, GDK, Adwaita, QML, or other runtime APIs
  inside the GNOME Shell backend.

QML may be a future backend, but it must not be added by branching inside the
GNOME Shell backend.

## Integration rule

The current scope is a generic renderer core, the GNOME Shell backend, and a
sample gallery. Application state and application actions should arrive through
an explicit integration layer after a backend is visually and behaviorally
proven.

## Shell-only runtime

Allowed in the Shell process:

- `St` widgets from `gi://St`;
- `Clutter`, `Gio`, `GLib`, `GObject`, `Shell`, and `Meta` when an extension
  needs them;
- GNOME Shell JavaScript modules such as `PanelMenu`, `PopupMenu`,
  `QuickSettings`, `Dialog`, and `Main`;
- Shell CSS in extension stylesheets.

Not allowed in the Shell process:

- `Gtk`;
- `Gdk`;
- `Adw`;
- browser runtime APIs;
- WebView or Electron APIs;
- Node APIs;
- application stores or engine clients.

## Internal layout

The public renderer files stay at the package root. GNOME Shell-specific
implementation details live under `gnome-shell/`:

- `gnome-shell/types.ts` - toolkit, actor, object, and node contracts;
- `gnome-shell/intrinsics.ts` - intrinsic name mapping;
- `gnome-shell/objects.ts` - `St`, `PopupMenu`, and `QuickSettings` construction;
- `gnome-shell/props.ts` - prop normalization and constructor parameter mapping;
- `gnome-shell/applyProps.ts` - prop application to existing Shell objects;
- `gnome-shell/signals.ts` - signal connection policy;
- `gnome-shell/tree.ts` - actor/menu/quick-settings child lifecycle.

Future GNOME Shell modules should follow the same boundary. Future non-Shell
backends should get their own backend directory, adapter, primitives, tests, and
sample harness.
