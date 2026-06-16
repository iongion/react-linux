# react-linux docs

`react-linux` is an experimental React renderer package for Linux-native UI
runtimes.

The implemented backend today is GNOME Shell. Future backends such as QML should
be added beside it through separate adapters and primitives; QML is not
implemented now.

## Docs

- [Architecture](architecture.md) - package layers, backend boundaries, and the
  current GNOME Shell backend.
- [Package boundaries](package-boundaries.md) - what belongs inside the renderer
  package and what must stay outside it.
- [Development workflow](development.md) - visible GNOME devkit, smoke tests,
  and sample-gallery workflow for exercising the renderer in real Shell.
- [Unix Socket HTTP](unix-socket-http.md) - Gio-backed HTTP transport and
  Axios-compatible adapter for GNOME Shell extensions.

## Current status

The renderer and gallery are proof-gated. Keep the GNOME Shell backend in this
shape until native layout, interaction, and smoke testing are proven:

```text
./
support/react-linux-gallery/
```

The gallery is a sample and harness, not the architecture. The library
architecture is the core renderer contract plus backend adapters described in
[Architecture](architecture.md).
