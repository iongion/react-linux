# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## Added

- Node-based `yarn bump` / `yarn release` version automation for package metadata, renderer version sync, changelog promotion, and git commit/tag handoff.

## Changed

- CI now caches Yarn packages and the GNOME apt archive downloads used by the headless Shell smoke job.

## Fixed

- Raw `St` actor containers are now detected before Shell object `.actor` wrappers, avoiding GNOME Shell 46 deprecation warning floods during render.
- Headless GNOME smoke now waits on the gallery's own DBus control object and only prints bounded log tails on failure, avoiding repeated no-display `org.gnome.Shell.Extensions` helper warnings in CI logs.
- `St.BoxLayout` direction now uses the stable `vertical` property instead of passing `orientation`, fixing extension startup on GNOME Shell 46.
- Linux provisioning now installs required `gnome-shell` separately from optional `mutter-dev-bin`, so Ubuntu 24.04 CI runners can run headless GNOME Shell smoke even when visible Mutter devkit packages are unavailable.
- GNOME Shell gallery runner no longer depends on `rg`, so headless smoke can run on fresh CI images without extra search tools.

## [1.0.0] - 2026-06-16

Initial extracted package version.

## Added

- Extracted `react-linux` from Container Desktop into its own dedicated package and repository.
- Package manifest for publishing `react-linux` as version `1.0.0` with React 19 peer dependency, TypeScript exports, scripts, and package file boundaries.
- Backend-agnostic React renderer core: `createRoot`, host config, adapter contract, JSX primitives, and mock adapter tests.
- GNOME Shell backend for native `St`, `PopupMenu`, and `QuickSettings` components.
- GNOME Shell layout support with a pure TypeScript solver and adapter-side synchronization for stable actor sizing and positioning.
- Native gallery/devkit harness for visible GNOME Shell development, headless Shell smoke tests, DBus-driven UI interactions, and extension-side PNG screenshots.
- Package documentation covering architecture, package boundaries, development workflow, native screenshot capture, and the production-readiness plan.
- Linux provisioning script for GNOME Shell devkit dependencies plus visual debugging and screenshot/diff tooling.
