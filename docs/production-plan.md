# react-linux Production Roadmap

## 0. Architecture Target

```
┌──────────────────────────────────────────────────────────────────┐
│  React JSX (user code)                                           │
├──────────────────────────────────────────────────────────────────┤
│  primitives.ts       ← typed components (View, Text, Button…)    │
│  componentRegistry.ts ← per-component descriptors (props + events)│
├──────────────────────────────────────────────────────────────────┤
│  hostConfig.ts        ← react-reconciler bridge (barely changes) │
├──────────────────────────────────────────────────────────────────┤
│  adapter.ts           ← unchanged adapter contract               │
├──────────────────┬──────────────────┬────────────────────────────┤
│  stAdapter.ts     │                  │  layout/                  │
│  gnome-shell/     │  layout/         │  ├── solver.ts (pure TS)  │
│  ├── objects.ts   │  ├── solver.ts   │  ├── measureHost.ts       │
│  ├── applyProps   │  ├── measureHost │  ├── events.ts            │
│  ├── props.ts     │  │   .ts          │  └── solver.test.ts       │
│  ├── signals.ts   │  └── events.ts   │                           │
│  └── tree.ts      │                  │  events/                  │
│                   │                  │  ├── syntheticEvents.ts   │
│                   │                  │  ├── responder.ts         │
│                   │                  │  └── keyboard.ts          │
│                   │                  │                           │
│                   │                  │  devtools/                │
│                   │                  │  ├── backend.ts           │
│                   │                  │  └── inspect.ts           │
│                   │                  │                           │
│                   │                  │  modules/                 │
│                   │                  │  ├── NativeModule.ts      │
│                   │                  │  └── NativeEventEmitter.ts│
│                   │                  │                           │
│                   │                  │  animation/               │
│                   │                  │  ├── Animated.ts          │
│                   │                  │  └── LayoutAnimation.ts   │
└──────────────────┴──────────────────┴────────────────────────────┘
```

Target API surface (React Native parity, Shell-native names):

```tsx
import { View, Text, Image, ScrollView, TextInput, Pressable, Button, createRoot } from "react-linux";
import { useWindowDimensions } from "react-linux/hooks";

function App() {
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 18 }}>React Linux</Text>
      <Pressable onPress={() => openApp()} style={pressableStyle}>
        <Text>Open</Text>
      </Pressable>
    </View>
  );
}
```

Current primitives (`Box`, `Label`, `Button`, `Icon`, etc.) remain available as `react-linux/legacy` for migration.

---

## Phase 1: Component Descriptor Registry

**Goal:** Eliminate the string-type switch blocks scattered across 5+ files. Every
component type owns its construction, prop application, child policy, and signal
behavior in one descriptor. This is the structural prerequisite for all later phases.

**Current state:** Adding a new component touches `intrinsics.ts` (name map),
`objects.ts` (constructor dispatch with 3-way if/else), `applyProps.ts` (update
dispatch with 3-way if/else), `props.ts` (passthrough filtering rules), and
`tree.ts` (child attachment routing). The dispatch shape is repeated ad-hoc
everywhere via `isPopupType()`, `isQuickSettingsType()`, and `widgetNameFor()`.

**Target state:** A `ComponentDescriptor` interface, a registry map, and a
single dispatch site. Each component family (St, PopupMenu, QuickSettings) gets
a descriptor subtype, but the registry presents a uniform interface.

### 1.1 Descriptor interface

```typescript
// ./componentRegistry.ts

export interface ComponentDescriptor {
  /** Canonical host type (e.g. "st:Button", "popup:PopupMenuItem"). */
  readonly type: string;

  /** Human-readable display name for DevTools. */
  readonly displayName: string;

  /** CSS class generated for this component (e.g. "react-linux-button"). */
  readonly styleName: string;

  /** Native Shell class if one is expected (e.g. "quick-toggle", "popup-menu-item"). */
  readonly nativeStyleClass: string | null;

  /** How children attach to this component's native object. */
  readonly childPolicy: ChildPolicy;

  /** Construct the native object + actor */
  construct(
    toolkit: GnomeShellToolkit,
    props: ReactLinuxProps,
    options: CreateStAdapterOptions,
  ): ConstructResult;

  /** Apply updated props after construction. Returns diff of changed signal props. */
  applyProps(
    element: GnomeShellElement,
    nextProps: ReactLinuxProps,
    options: CreateStAdapterOptions,
  ): SignalDiffs;
}

export type ChildPolicy =
  | "actor"            // add_child / insert_child_at_index
  | "menuItems"        // addMenuItem / removeMenuItem / moveMenuItem
  | "quickSettingsItems" // splice on object.quickSettingsItems
  | "submenu"          // object.menu.addMenuItem (PopupSubMenuMenuItem, QuickMenuToggle)
  | "none";            // leaf, no children expected

interface ConstructResult {
  actor: GnomeShellActor;
  object: GnomeShellObject;
  initialSignals: Array<{ signal: string; handler: (...args: unknown[]) => unknown }>;
}

interface SignalDiffs {
  added: Array<{ signal: string; handler: (...args: unknown[]) => unknown }>;
  removed: string[]; // signal names to disconnect
  unchanged: Set<string>; // signal names that stayed the same (don't touch)
}
```

### 1.2 Descriptor implementations

```
./descriptors/
├── types.ts                  # ComponentDescriptor, ChildPolicy, etc.
├── registry.ts               # Map<string, ComponentDescriptor>, register(), resolve()
├── st/
│   ├── boxLayout.ts          # BoxLayout / Box descriptor
│   ├── button.ts
│   ├── label.ts
│   ├── icon.ts
│   ├── entry.ts
│   ├── widget.ts
│   ├── progress.ts           # non-St special case, still gets a descriptor
│   └── separator.ts
├── popup/
│   ├── popupMenuItem.ts
│   ├── popupImageMenuItem.ts
│   ├── popupSwitchMenuItem.ts
│   ├── popupSubMenuMenuItem.ts
│   ├── popupMenuSection.ts
│   ├── popupSeparatorMenuItem.ts
│   └── popupMenu.ts
├── quick/
│   ├── quickToggle.ts
│   ├── quickMenuToggle.ts
│   ├── quickSlider.ts
│   └── systemIndicator.ts
└── registry.test.ts
```

Each descriptor is a file exporting a single `ComponentDescriptor`. Example:

```typescript
// descriptors/popup/popupSwitchMenuItem.ts
import type { ComponentDescriptor } from "../types";

export const PopupSwitchMenuItemDescriptor: ComponentDescriptor = {
  type: "popup:PopupSwitchMenuItem",
  displayName: "PopupSwitchMenuItem",
  styleName: "popup-switch-menu-item",
  nativeStyleClass: "popup-menu-item",
  childPolicy: "none",

  construct(toolkit, props, _options) {
    const text = typeof props.children === "string" ? props.children : "";
    const active = Boolean(props.active ?? props.checked ?? false);
    const Constructor = toolkit.PopupMenu!.PopupSwitchMenuItem!;
    const object = new Constructor(text, active, {});
    return {
      actor: object.actor,
      object,
      initialSignals: props.onToggled
        ? [{ signal: "toggled", handler: wrapToggleHandler(props.onToggled) }]
        : [],
    };
  },

  applyProps(element, nextProps, _options) {
    const object = element.object;
    const prevProps = element.props;
    // ... per-property diff, return SignalDiffs
  },
};
```

### 1.3 Registry wiring

Replace the dispatch in `objects.ts`, `applyProps.ts`, `props.ts`, `tree.ts`:

```typescript
// objects.ts — BEFORE: 3-way if/else with ~80 lines of switch
// objects.ts — AFTER:
export function createShellObject(type, props, toolkit, options) {
  const descriptor = registry.resolve(type);
  return descriptor.construct(toolkit, props, options);
}

// applyProps.ts — BEFORE: applyCommonProps + applyTypeProps with 3 branches
// applyProps.ts — AFTER:
export function applyProps(element, props, options) {
  const descriptor = registry.resolve(element.type);
  applyCommonProps(element, props, options); // unchanged
  const diffs = descriptor.applyProps(element, props, options);
  patchSignalProps(element, diffs, options); // diffed, not full-reconnect
  element.props = propsWithoutChildren(props);
}

// tree.ts — BEFORE: hasQuickSettingsPath, hasPopupPath, hasSubmenuPath scattered
// tree.ts — AFTER: read childPolicy from descriptor
function addShellObject(parent, child, position) {
  const descriptor = registry.resolve(child.type);
  switch (descriptor.childPolicy) {
    case "actor": return addActor(...);
    case "menuItems": return addMenuItem(...);
    case "quickSettingsItems": return spliceQuickSettings(...);
    case "submenu": return child.object.menu.addMenuItem(...);
    case "none": return; // leaf
  }
}
```

### 1.4 Changes to `intrinsics.ts`

`intrinsics.ts` becomes just the registry bootstrap — it calls `register()` for
each built-in descriptor. The `isPopupType()`, `isQuickSettingsType()` helpers
become queries against the registry (but may be kept as convenience for
non-descriptor code during migration).

### 1.5 Deliverables

| File | Action |
|------|--------|
| `descriptors/types.ts` | New — ComponentDescriptor, ChildPolicy, SignalDiffs |
| `descriptors/registry.ts` | New — Map-based registry |
| `descriptors/st/*.ts` | New — 9 descriptor files |
| `descriptors/popup/*.ts` | New — 7 descriptor files |
| `descriptors/quick/*.ts` | New — 4 descriptor files |
| `descriptors/registry.test.ts` | New — tests for each descriptor |
| `gnome-shell/objects.ts` | Rewrite — thin dispatch via registry |
| `gnome-shell/applyProps.ts` | Rewrite — thin dispatch + signal diffing |
| `gnome-shell/tree.ts` | Refactor — childPolicy-driven attachment |
| `gnome-shell/intrinsics.ts` | Rewrite — registry bootstrap |
| `gnome-shell/props.ts` | Shrink — passthrough rules move into descriptors |

### 1.6 No user-facing API changes

This phase is purely internal refactoring. No existing component API changes.
All existing tests (`stAdapter.test.tsx`, `react-linux.test.tsx`) must pass
unchanged.

### 1.7 Success criteria

- [ ] `yarn test:run` passes with zero test changes
- [ ] Gallery (`run.sh gnome`) renders identically
- [ ] Adding a new component type touches exactly 2 files (descriptor + register call)
      instead of the current 5
- [ ] `isPopupType` / `isQuickSettingsType` eliminated from tree/objects/applyProps

---

## Phase 2: Typed Props & Events per Component

**Goal:** Replace `Record<string, unknown>` props and `(...args: unknown[]) =>
unknown` event handlers with concrete, per-component TypeScript types. Catch
prop typos and wrong event shapes at compile time.

**Current state:** All primitives accept `ReactLinuxHostProps` which extends
`ReactLinuxProps = Record<string, unknown> & { ...few well-known optional fields... }`.
Events are `(event: ReactLinuxEvent) => void` with `event` typed as `unknown`.
Signal handlers are `(...args: unknown[]) => unknown`.

**Target state:** Each component has its own props interface with typed event
payloads. The `hostConfig.createInstance` type parameter is the union of all
component prop types, but user code only sees the specific type for the
component they're using.

### 2.1 Typed props structure

```typescript
// descriptors/types.ts (additions)

export interface StWidgetBaseProps {
  styleClass?: StyleClassValue;
  className?: StyleClassValue;
  style?: string;
  hidden?: boolean;
  reactive?: boolean;
  xExpand?: boolean;
  yExpand?: boolean;
}

export interface BoxLayoutProps extends StWidgetBaseProps {
  vertical?: boolean;
  // Clutter layout props (Phase 3):
  flexDirection?: "row" | "column";
  justifyContent?: "flex-start" | "center" | "flex-end" | "space-between" | "space-around";
  alignItems?: "flex-start" | "center" | "flex-end" | "stretch";
  gap?: number;
  padding?: number;
  // ...
}

export interface ButtonProps extends StWidgetBaseProps {
  label?: string;
  canFocus?: boolean;
  onClick?: (event: PressEvent) => void;
  children?: string | number; // text content
}

export interface PressEvent {
  type: "press";
  actor: GnomeShellActor;
  nativeEvent?: unknown;
  timestamp: number;
}

export interface QuickToggleProps extends StWidgetBaseProps {
  checked?: boolean;
  title?: string;
  subtitle?: string;
  iconName?: string;
  iconSize?: number;
  toggleMode?: boolean;
  onToggled?: (event: ToggleEvent) => void;
}

export interface ToggleEvent {
  type: "toggle";
  actor: GnomeShellObject;
  value: boolean;
  timestamp: number;
}
```

### 2.2 Typed component primitives

```typescript
// primitives.ts — AFTER (Phase 2)

import type { ComponentProps } from "./descriptors/types";

// Each primitive now carries its own props type
export function Box(props: ComponentProps<"st:BoxLayout">): ReactElement { ... }
export function Button(props: ComponentProps<"st:Button">): ReactElement { ... }
export function QuickToggle(props: ComponentProps<"quick:QuickToggle">): ReactElement { ... }
```

The `ComponentProps<T>` type is derived from the descriptor registry:

```typescript
// descriptors/types.ts
export interface DescriptorToProps {
  "st:BoxLayout": BoxLayoutProps;
  "st:Button": ButtonProps;
  "st:Label": LabelProps;
  "st:Icon": IconProps;
  "st:Entry": EntryProps;
  "st:DrawingArea": DrawingAreaProps;
  "st:ScrollView": ScrollViewProps;
  "popup:PopupMenuItem": PopupMenuItemProps;
  "popup:PopupImageMenuItem": PopupImageMenuItemProps;
  "popup:PopupSwitchMenuItem": PopupSwitchMenuItemProps;
  // ... etc
}

export type ComponentProps<T extends keyof DescriptorToProps> = DescriptorToProps[T];
```

### 2.3 Event system upgrade

Current events (`onActivate`, `onClick`, `onToggled`) are generic `ReactLinuxEventHandler` with `{ actor, event, signal }`. Target is typed per event:

```typescript
// events/types.ts (new file)

export interface SyntheticEvent<Target = unknown, TPayload = unknown> {
  type: string;
  target: Target;
  nativeEvent?: unknown;
  payload: TPayload;
  timestamp: number;
  preventDefault(): void;
  isDefaultPrevented(): boolean;
}

export interface PressEvent extends SyntheticEvent<GnomeShellActor, unknown> {
  type: "press";
}

export interface ToggleEvent extends SyntheticEvent<GnomeShellObject, boolean> {
  type: "toggle";
  value: boolean;  // alias for payload
}

export interface ChangeEvent extends SyntheticEvent<GnomeShellObject, string> {
  type: "change";
  text: string;
}

export interface LayoutEvent extends SyntheticEvent<GnomeShellActor, LayoutRectangle> {
  type: "layout";
}

export interface LayoutRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

The synthetic event wrapper is constructed in the signal callback before
dispatching to user handlers. This normalizes the differences between Shell
signal payloads (Clutter events vs raw booleans vs GObject notify values).

### 2.4 Deliverables

| File | Action |
|------|--------|
| `descriptors/types.ts` | Add `DescriptorToProps` map, per-component props interfaces |
| `events/types.ts` | New — SyntheticEvent hierarchy |
| `events/SyntheticEvent.ts` | New — SyntheticEvent factory |
| `descriptors/st/*.ts` | Add typed `ComponentDescriptor.propsType` |
| `descriptors/popup/*.ts` | Add typed `ComponentDescriptor.propsType` |
| `descriptors/quick/*.ts` | Add typed `ComponentDescriptor.propsType` |
| `primitives.ts` | Update to use `ComponentProps<T>` |
| `gnome-shell/signals.ts` | Wrap native signals into SyntheticEvent before dispatch |

### 2.5 Success criteria

- [ ] TypeScript compiler catches prop typos (`<Button labell="x">` → error)
- [ ] Event payloads are typed (`event.value` on ToggleEvent is `boolean`, not `unknown`)
- [ ] `unknown` count in library code drops by 80%+ (from ~200 occurrences to ~40)
- [ ] All existing tests pass without type assertion changes

---

## Phase 3: Clutter-Based Layout Engine

**Goal:** Add CSS Flexbox-style layout using only Clutter's built-in layout
managers plus a pure-TypeScript constraint solver for the features Clutter can't
handle natively. Zero binary dependencies. Zero WASM. Zero browser APIs. Pure
GJS.

**Current state:** Layout is handled by `St.BoxLayout` with a single
`vertical` prop. No measurement, no percentage sizing, no flex-grow ratios,
no `onLayout` callbacks. Children are opaque to the renderer after insertion.

**Target state:** Clutter's native layout managers handle the common case
(GPU-accelerated, Shell theme-compatible). A pure-TS "layout constraint solver"
runs post-allocation to handle what Clutter can't: percentage sizes, flex-grow
ratios, aspect-ratio constraints, and `onLayout` measurements.

### 3.1 What Clutter gives us natively

Clutter's layout infrastructure (already inside every GNOME Shell process):

| Clutter primitive | Flexbox equivalent | Quality |
|---|---|---|
| `Clutter.BoxLayout` orientation + spacing | `flex-direction: row/column` + `gap` | Native, GPU |
| `BoxLayout` child `x_expand` / `y_expand` | `flex-grow: 1` (boolean only) | Native, GPU |
| `BoxLayout` child `x_align` / `y_align` | `align-items` / `align-self` | Native, GPU |
| `BoxLayout` `homogeneous` | Equal-size children | Native, GPU |
| `BoxLayout` `pack_start` | `justify-content: start/end` | Native, GPU |
| `Clutter.FlowLayout` | `flex-wrap: wrap` | Native, GPU |
| `Clutter.BinLayout` alignment | Single-child alignment | Native, GPU |
| `Clutter.FixedLayout` | `position: absolute` | Native, GPU |
| `actor.natural_width` / `natural_height` | Intrinsic size | Native |
| `actor.min_width` / `max_width` / `min_height` / `max_height` | min/max constraints | Native |
| `actor.margin_left` / `margin_top` / etc. | margin | Native |
| `get_preferred_width(forHeight)` / `get_preferred_height(forWidth)` | Content measurement | Native GObject |

**What Clutter CANNOT do natively** (these need the TS solver):

| Missing capability | TS solver implementation |
|---|---|
| `width: "50%"` (percentage of parent) | Read parent's allocated width, compute child width, set explicitly |
| `flex-grow: 2` (ratio, not boolean) | Read total available space, distribute proportionally among expanded children |
| `flex-shrink: 2` (ratio shrink) | Read overflow, shrink proportionally below natural size |
| `flex-basis: 200` (explicit basis) | Set natural_width, then apply grow/shrink above |
| `aspect-ratio: 16/9` | Read one dimension, compute the other, set explicitly |
| `justify-content: space-between / space-around / space-evenly` | Read total extra space, compute per-child offsets, set x/y manually |
| `align-self: stretch` (cross-axis fill) | Read parent's cross-axis size, set child to fill |
| `onLayout` callback | Read final allocated position/size, fire synthetic event |

### 3.2 Architecture: Two-pass layout

```
┌─────────────────────────────────────────────────────────────┐
│  React commit phase                                         │
│  1. Props applied to Clutter actors                         │
│  2. Clutter.BoxLayout properties set (orientation, spacing, │
│     expand, align)                                          │
│  3. Children attached                                       │
├─────────────────────────────────────────────────────────────┤
│  Clutter allocation pass (native, GPU)                      │
│  4. Clutter layout manager allocates children               │
│  5. Each actor gets x, y, width, height from Clutter        │
├─────────────────────────────────────────────────────────────┤
│  TS constraint solver (post-allocation hook)                │
│  6. Walk the element tree                                   │
│  7. For each element with TS-only constraints:             │
│     a. Read Clutter-allocated position/size                 │
│     b. Compute percentage/ratio overrides                   │
│     c. Apply explicit x, y, width, height to actors         │
│  8. Fire onLayout callbacks with final dimensions           │
│  9. Re-queue relayout if overrides cascaded                 │
└─────────────────────────────────────────────────────────────┘
```

**Key insight:** Clutter always runs first and does the real work. The TS solver
only adjusts dimensions for features Clutter doesn't support. For most boxes
(simple vertical/horizontal with spacing), the TS solver does nothing — zero overhead.

### 3.3 Layout constraint solver (pure TypeScript)

```typescript
// layout/solver.ts
// Zero dependencies. Runs on GJS, Node (for mock adapter), anywhere.

export interface LayoutBox {
  /** Reference to the GnomeShellElement for reading Clutter-allocated sizes. */
  readonly element: GnomeShellElement;

  /** Style properties set by React. Only the layout-relevant subset. */
  readonly style: LayoutStyle;

  /** Children in order. */
  readonly children: LayoutBox[];
}

export interface LayoutStyle {
  width?: number;            // px, already resolved
  height?: number;
  widthPercent?: number;     // e.g. 50 means 50% of parent
  heightPercent?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  flexGrow?: number;         // 0 = don't grow, >0 = grow proportionally
  flexShrink?: number;       // 0 = don't shrink, >0 = shrink proportionally
  flexBasis?: number;        // initial size before grow/shrink
  aspectRatio?: number;      // width / height
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  position?: "relative" | "absolute";
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
}

export interface LayoutResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Run the constraint solver on a layout tree.
 * Called AFTER Clutter has done its allocation pass.
 * Returns a map of element → final LayoutResult.
 */
export function solveLayout(
  root: LayoutBox,
  containerWidth: number,
  containerHeight: number,
): Map<GnomeShellElement, LayoutResult> {
  const results = new Map<GnomeShellElement, LayoutResult>();

  function solve(
    box: LayoutBox,
    parentWidth: number,
    parentHeight: number,
  ): LayoutResult {
    const actor = box.element.actor;
    const style = box.style;

    // Start from Clutter's allocated size, then override with TS constraints
    let width = readActorWidth(actor);
    let height = readActorHeight(actor);
    let x = readActorX(actor);
    let y = readActorY(actor);

    // 1. Resolve percentage dimensions
    if (style.widthPercent !== undefined) {
      width = (parentWidth * style.widthPercent) / 100;
    }
    if (style.heightPercent !== undefined) {
      height = (parentHeight * style.heightPercent) / 100;
    }

    // 2. Apply explicit dimensions
    if (style.width !== undefined) width = style.width;
    if (style.height !== undefined) height = style.height;

    // 3. Clamp to min/max
    width = clamp(width, style.minWidth ?? 0, style.maxWidth ?? Infinity);
    height = clamp(height, style.minHeight ?? 0, style.maxHeight ?? Infinity);

    // 4. Resolve aspect-ratio
    if (style.aspectRatio !== undefined && style.aspectRatio > 0) {
      if (style.height === undefined && width > 0) {
        height = width / style.aspectRatio;
      } else if (style.width === undefined && height > 0) {
        width = height * style.aspectRatio;
      }
    }

    // 5. Solve children (flex distribution if parent is a flex container)
    const childResults = solveFlexChildren(box, width, height, style);

    // 6. Store result
    const result: LayoutResult = { x, y, width, height };
    results.set(box.element, result);

    return result;
  }

  solve(root, containerWidth, containerHeight);
  return results;
}

/**
 * Distribute space among children according to flex-grow/shrink.
 * This is the core Flexbox algorithm, implemented in ~120 lines of TS.
 */
function solveFlexChildren(
  parent: LayoutBox,
  parentWidth: number,
  parentHeight: number,
  parentStyle: LayoutStyle,
): LayoutResult[] {
  const isRow = isHorizontalLayout(parent);
  const mainSize = isRow ? parentWidth : parentHeight;
  const crossSize = isRow ? parentHeight : parentWidth;

  // Compute padding
  const padStart = isRow ? (parentStyle.paddingLeft ?? 0) : (parentStyle.paddingTop ?? 0);
  const padEnd = isRow ? (parentStyle.paddingRight ?? 0) : (parentStyle.paddingBottom ?? 0);
  const padCrossStart = isRow ? (parentStyle.paddingTop ?? 0) : (parentStyle.paddingLeft ?? 0);
  const padCrossEnd = isRow ? (parentStyle.paddingBottom ?? 0) : (parentStyle.paddingRight ?? 0);

  // Available space for children
  const gap = isRow ? (parentStyle.gap ?? 0) : (parentStyle.gap ?? 0);
  const totalGap = gap * Math.max(0, parent.children.length - 1);
  let availableMain = mainSize - padStart - padEnd - totalGap;

  // Collect children with their natural sizes
  interface ChildInfo {
    box: LayoutBox;
    naturalMain: number;
    naturalCross: number;
    flexGrow: number;
    flexShrink: number;
    flexBasis: number | undefined;
    marginStart: number;
    marginEnd: number;
    result: LayoutResult;
  }

  const children: ChildInfo[] = parent.children.map((child) => {
    const s = child.style;
    const actor = child.element.actor;
    const basis = s.flexBasis ?? (isRow
      ? (s.width ?? readActorWidth(actor))
      : (s.height ?? readActorHeight(actor)));

    return {
      box: child,
      naturalMain: basis,
      naturalCross: isRow
        ? (s.height ?? readActorHeight(actor))
        : (s.width ?? readActorWidth(actor)),
      flexGrow: s.flexGrow ?? 0,
      flexShrink: s.flexShrink ?? (s.flexGrow !== undefined ? 1 : 0),
      flexBasis: s.flexBasis,
      marginStart: isRow ? (s.marginLeft ?? 0) : (s.marginTop ?? 0),
      marginEnd: isRow ? (s.marginRight ?? 0) : (s.marginBottom ?? 0),
      result: { x: 0, y: 0, width: 0, height: 0 },
    };
  });

  // Calculate total natural size
  const totalNatural = children.reduce((sum, c) =>
    sum + c.naturalMain + c.marginStart + c.marginEnd, 0);

  if (totalNatural < availableMain) {
    // GROW phase: distribute extra space
    const totalGrow = children.reduce((sum, c) => sum + c.flexGrow, 0);
    if (totalGrow > 0) {
      const extraSpace = availableMain - totalNatural;
      for (const child of children) {
        const add = child.flexGrow > 0
          ? (extraSpace * child.flexGrow) / totalGrow
          : 0;
        child.naturalMain += add;
      }
    }
  } else if (totalNatural > availableMain) {
    // SHRINK phase: remove overflow proportionally
    const totalShrink = children.reduce((sum, c) => sum + c.flexShrink, 0);
    if (totalShrink > 0) {
      const overflow = totalNatural - availableMain;
      for (const child of children) {
        const remove = child.flexShrink > 0
          ? (overflow * child.flexShrink) / totalShrink
          : 0;
        child.naturalMain = Math.max(0, child.naturalMain - remove);
      }
    }
  }

  // Position children along main axis
  const justifyContent = parentStyle.justifyContent ?? "flex-start";
  const finalTotal = children.reduce((sum, c) =>
    sum + c.naturalMain + c.marginStart + c.marginEnd, 0);

  let mainOffset = padStart;
  switch (justifyContent) {
    case "center":
      mainOffset += (availableMain - finalTotal) / 2;
      break;
    case "flex-end":
      mainOffset += availableMain - finalTotal;
      break;
    case "space-between":
      // gap handles spacing; children are at edges
      break;
    case "space-around":
      // distribute evenly with half-gap at edges
      break;
    case "space-evenly":
      // distribute evenly
      break;
    default: // flex-start
      break;
  }

  for (const child of children) {
    mainOffset += child.marginStart;

    // Cross-axis alignment
    const alignItems = parentStyle.alignItems ?? "stretch";
    let crossSize: number;
    let crossOffset: number;

    switch (alignItems) {
      case "stretch":
        crossSize = crossSize - padCrossStart - padCrossEnd;
        crossOffset = padCrossStart;
        break;
      case "center":
        crossSize = child.naturalCross;
        crossOffset = padCrossStart + (crossSize - padCrossStart - padCrossEnd - crossSize) / 2;
        break;
      case "flex-end":
        crossSize = child.naturalCross;
        crossOffset = crossSize - padCrossEnd - crossSize;
        break;
      default: // flex-start
        crossSize = child.naturalCross;
        crossOffset = padCrossStart;
    }

    child.result = {
      x: isRow ? mainOffset : crossOffset,
      y: isRow ? crossOffset : mainOffset,
      width: isRow ? child.naturalMain : crossSize,
      height: isRow ? crossSize : child.naturalMain,
    };

    mainOffset += child.naturalMain + child.marginEnd + gap;
  }

  return children.map((c) => c.result);
}

// ─── Clutter integration helpers ───

function readActorWidth(actor: GnomeShellActor): number {
  return (actor.width as number) ?? (actor.natural_width as number) ?? 0;
}

function readActorHeight(actor: GnomeShellActor): number {
  return (actor.height as number) ?? (actor.natural_height as number) ?? 0;
}

function readActorX(actor: GnomeShellActor): number {
  return (actor.x as number) ?? 0;
}

function readActorY(actor: GnomeShellActor): number {
  return (actor.y as number) ?? 0;
}

function isHorizontalLayout(parent: LayoutBox): boolean {
  // Read from Clutter.BoxLayout orientation
  const lm = parent.element.actor.layout_manager;
  if (lm && typeof lm === "object" && "orientation" in lm) {
    return (lm as any).orientation !== 1; // 1 = VERTICAL in Clutter
  }
  // Fallback: read from style
  return parent.style.flexDirection !== "column";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
```

### 3.4 Integration with hostConfig

The solver runs in `resetAfterCommit` — after React commits children and
Clutter has done its allocation:

```typescript
// stAdapter.ts — additions

function createLayoutSolverAdapter(
  baseAdapter: ReactLinuxAdapter<GnomeShellElement, GnomeShellText, GnomeShellContainer>,
): ReactLinuxAdapter<...> {
  const layoutTree = new LayoutTree(); // tracks element → LayoutBox

  return {
    ...baseAdapter,

    createInstance(type, props) {
      const element = baseAdapter.createInstance(type, props);
      const style = extractLayoutStyle(type, props);
      layoutTree.register(element);
      return element;
    },

    appendChild(parent, child) {
      baseAdapter.appendChild(parent, child);
      layoutTree.insertChild(parent, child);
    },

    removeChild(parent, child) {
      layoutTree.removeChild(parent, child);
      baseAdapter.removeChild(parent, child);
    },
  };
}

// hostConfig.ts — resetAfterCommit override:
resetAfterCommit(containerInfo: { elements: GnomeShellElement[] }) {
  // Clutter has already allocated children by now.
  // Run the TS constraint solver for elements that need it.
  const elementsNeedingSolve = containerInfo.elements.filter(
    (el) => layoutTree.hasConstraints(el),
  );
  if (elementsNeedingSolve.length === 0) return;

  // queue_relayout to let Clutter settle, then apply overrides
  for (const el of elementsNeedingSolve) {
    const result = layoutTree.solve(el);
    applyLayoutResult(el, result);
    // Fire onLayout synthetic event
    fireOnLayout(el, result);
  }
}

function applyLayoutResult(el: GnomeShellElement, result: LayoutResult): void {
  el.actor.x = result.x;
  el.actor.y = result.y;
  el.actor.width = result.width;
  el.actor.height = result.height;
}
```

**Post-solve relayout:** When the solver overrides sizes, we call
`actor.queue_relayout()` on the parent so Clutter re-flows siblings.
To avoid infinite loops, the solver tracks which elements it already
adjusted and skips them on subsequent passes.

### 3.5 Measurement: St.get_preferred_width/height

St actors support GObject's size negotiation:

```typescript
// layout/measureHost.ts
export interface SizeRequest {
  minimum: number;
  natural: number;
}

export function measureActor(
  actor: GnomeShellActor,
  forOppositeSize: number = -1, // -1 = unconstrained
): { width: SizeRequest; height: SizeRequest } {
  // St.Widget (and subclasses) implement get_preferred_width/height
  const [minW, natW] = safeCall(() =>
    (actor as any).get_preferred_width(forOppositeSize),
  ) ?? [0, 0];

  const [minH, natH] = safeCall(() =>
    (actor as any).get_preferred_height(forOppositeSize),
  ) ?? [0, 0];

  return {
    width: { minimum: minW, natural: natW },
    height: { minimum: minH, natural: natH },
  };
}

function safeCall<T>(fn: () => T): T | null {
  try { return fn(); } catch { return null; }
}
```

Used by the solver's `naturalMain`/`naturalCross` when no explicit size is set.

### 3.6 Component descriptor changes

New layout-aware descriptor for View (replaces Box for advanced layouts):

```typescript
// descriptors/st/boxLayout.ts — UPDATED to support both simple and flex modes

export const BoxLayoutDescriptor: ComponentDescriptor = {
  type: "st:BoxLayout",
  displayName: "Box",
  styleName: "box-layout",
  nativeStyleClass: null,
  childPolicy: "actor",
  layoutMode: "clutter-native", // default: Clutter handles it

  construct(toolkit, props, options) {
    const actorProps: Record<string, unknown> = {
      style_class: classNameFor("st:BoxLayout", props, options),
    };

    // Map React flex props → Clutter.BoxLayout properties
    if (options.orientationValues) {
      const isColumn = props.flexDirection === "column" || props.vertical === true;
      actorProps.orientation = isColumn
        ? options.orientationValues.vertical
        : options.orientationValues.horizontal;
    }

    if (props.gap !== undefined) {
      actorProps.spacing = props.gap;
    }

    const actor = new toolkit.St.BoxLayout(actorProps);

    // If props require TS solver (percentage sizes, flex ratios >1, etc.),
    // mark this element for post-allocation solving
    const needsSolver = hasAdvancedLayoutProps(props);

    return { actor, object: actor, needsLayoutSolver: needsSolver };
  },

  applyProps(element, nextProps, options) {
    // Clutter-native props — applied to layout manager directly
    if (nextProps.gap !== undefined) {
      element.actor.spacing = nextProps.gap;
    }
    if (nextProps.flexDirection !== undefined || nextProps.vertical !== undefined) {
      const isColumn = nextProps.flexDirection === "column" || nextProps.vertical === true;
      if (options.orientationValues) {
        element.actor.orientation = isColumn
          ? options.orientationValues.vertical
          : options.orientationValues.horizontal;
      }
    }

    // TS solver props — collected for post-allocation solver
    element._layoutStyle = {
      flexGrow: nextProps.flexGrow,
      flexShrink: nextProps.flexShrink,
      width: nextProps.width,
      height: nextProps.height,
      widthPercent: parsePercent(nextProps.widthPercent),
      heightPercent: parsePercent(nextProps.heightPercent),
      minWidth: nextProps.minWidth,
      maxWidth: nextProps.maxWidth,
      minHeight: nextProps.minHeight,
      maxHeight: nextProps.maxHeight,
      aspectRatio: nextProps.aspectRatio,
      alignItems: nextProps.alignItems,
    };

    // Apply x_expand/y_expand to children for simple flex-grow
    // (done during child commit, not here)

    return { added: [], removed: [], unchanged: new Set() };
  },
};

/** Returns true if this component's props need the TS constraint solver. */
function hasAdvancedLayoutProps(props: Record<string, unknown>): boolean {
  return (
    props.widthPercent !== undefined ||
    props.heightPercent !== undefined ||
    typeof props.flexGrow === "number" ||
    typeof props.flexShrink === "number" ||
    props.aspectRatio !== undefined ||
    props.minWidth !== undefined ||
    props.maxWidth !== undefined
  );
}
```

### 3.7 onLayout event

```typescript
// layout/events.ts
export interface LayoutEvent {
  type: "layout";
  target: GnomeShellElement;
  layout: { x: number; y: number; width: number; height: number };
  timestamp: number;
}

export function fireOnLayout(
  element: GnomeShellElement,
  result: LayoutResult,
): void {
  const handler = element.props.onLayout as ((event: LayoutEvent) => void) | undefined;
  if (!handler) return;

  handler({
    type: "layout",
    target: element,
    layout: { x: result.x, y: result.y, width: result.width, height: result.height },
    timestamp: Date.now(),
  });
}
```

### 3.8 Deliverables

| File | Action |
|------|--------|
| `layout/solver.ts` | New — pure-TS Flexbox constraint solver (~300 lines) |
| `layout/measureHost.ts` | New — St.get_preferred_width/height wrappers |
| `layout/events.ts` | New — onLayout event factory |
| `layout/solver.test.ts` | New — solver unit tests (no Clutter needed) |
| `descriptors/st/boxLayout.ts` | Update — map React flex props → Clutter + TS solver |
| `descriptors/st/widget.ts` | Update — support percentage width/height |
| `hostConfig.ts` | Hook solver into resetAfterCommit |
| `stAdapter.ts` | Wire LayoutTree through adapter lifecycle |
| `primitives.ts` | Add `flexDirection`, `flexGrow`, `widthPercent`, `onLayout` to props type |

### 3.9 Success criteria

- [ ] `<Box flexDirection="row" gap={8}><Box flexGrow={1} /><Box flexGrow={2} /></Box>` allocates
      1:2 ratio in devkit Shell — using Clutter.BoxLayout for the row + TS solver for the ratios
- [ ] `<Box widthPercent={50}>` renders at exactly half of parent width
- [ ] `<Box onLayout={(e) => setDims(e.layout)}>` fires with correct `{x, y, width, height}`
- [ ] `<Box style={{ aspectRatio: 16/9, width: 320 }}>` automatically sets height to 180
- [ ] Simple `<Box vertical>` with no advanced props — zero solver overhead, pure Clutter path
- [ ] Solver unit tests pass in Node (no GJS dependency — mock adapter+fake actors)
- [ ] Existing `Box`/`Label`/`Button` components render identically
- [ ] `run.sh gnome-smoke` passes
- [ ] Solver is ~300 lines of TS with zero external dependencies

---

## Phase 4: Signal Diffing & Event System

**Goal:** Stop disconnecting/reconnecting ALL signals on every render pass. Only
patch what changed. Add synthetic event wrapping for normalized event shapes.
Add responder-style gesture negotiation.

**Current state:** `applySignalProps` calls `disconnectSignals(element)` which
iterates and disconnects all `signalIds`, then reconnects everything. This is
O(signals) work per render, every render — even if no signal props changed.

### 4.1 Signal diffing

The `SignalDiffs` type (introduced in Phase 1) replaces full-reconnect:

```typescript
// gnome-shell/signals.ts — AFTER

export function patchSignalProps(
  element: GnomeShellElement,
  prevProps: ReactLinuxProps,
  nextProps: ReactLinuxProps,
  options: CreateStAdapterOptions,
): void {
  const signalTarget = signalTargetOf(element);
  if (!signalTarget.connect) return;

  const prevSignals = collectSignalHandlers(prevProps);
  const nextSignals = collectSignalHandlers(nextProps);

  // Remove signals that no longer exist or changed handler identity
  for (const [signal, handlerId] of element._signalMap.entries()) {
    const nextHandler = nextSignals.get(signal);
    if (!nextHandler || nextHandler !== prevSignals.get(signal)) {
      signalTarget.disconnect!(handlerId);
      element._signalMap.delete(signal);
    }
  }

  // Add new signals
  for (const [signal, handler] of nextSignals.entries()) {
    if (!element._signalMap.has(signal)) {
      const id = signalTarget.connect!(signal, (...args: unknown[]) => {
        const event = wrapSyntheticEvent(signal, args, element, options);
        return handler(event);
      });
      element._signalMap.set(signal, id);
    }
  }
}
```

Stored per element: `_signalMap: Map<string, number>` (signal name → connection ID).

### 4.2 Synthetic event system

```typescript
// events/syntheticEvents.ts

export function createSyntheticEvent<TPayload>(
  type: string,
  target: unknown,
  nativeArgs: unknown[],
  timestamp: number = Date.now(),
): SyntheticEvent<unknown, TPayload> {
  let defaultPrevented = false;
  return {
    type,
    target,
    nativeEvent: nativeArgs[1], // Shell signals pass payload as second arg typically
    timestamp,
    preventDefault() { defaultPrevented = true; },
    isDefaultPrevented() { return defaultPrevented; },
    payload: nativeArgs[1] as TPayload,
  };
}

// Per-signal-type wrappers
export function wrapPressEvent(
  actor: GnomeShellActor,
  nativeEvent: unknown,
): PressEvent {
  return createSyntheticEvent("press", actor, [null, nativeEvent]) as PressEvent;
}

export function wrapToggleEvent(
  object: GnomeShellObject,
  value: boolean,
): ToggleEvent {
  return {
    ...createSyntheticEvent("toggle", object, [null, value]),
    value,
  };
}
```

### 4.3 Deliverables

| File | Action |
|------|--------|
| `gnome-shell/signals.ts` | Rewrite — diff-based patching, _signalMap storage |
| `events/syntheticEvents.ts` | New — factory functions per event type |
| `events/types.ts` | New — full event type hierarchy |
| `events/responder.ts` | New — basic press responder (canDeactivate in Phase 9) |
| `descriptors/st/button.ts` | Wire wrapPressEvent |
| `descriptors/quick/quickToggle.ts` | Wire wrapToggleEvent |
| `stAdapter.test.tsx` | Add tests: re-render without signal change doesn't reconnect |
| `events/syntheticEvents.test.ts` | New — event wrapping unit tests |

### 4.4 Success criteria

- [ ] Re-rendering a Button with the same `onClick` handler does NOT call
      `disconnect` or `connect` again (verified via mock adapter signal tracking)
- [ ] `event.preventDefault()` is callable and `event.isDefaultPrevented()` works
- [ ] `event.nativeEvent` preserves the original Shell event/Clutter event
- [ ] Re-rendering with a DIFFERENT `onClick` handler replaces the signal once
      (one disconnect + one connect, not full reconnect of all signals)

---

## Phase 5: React DevTools Integration

**Goal:** Enable full React DevTools inspection in the devkit Shell process.
Component tree browsing, props inspection, source location, and highlight-rectangle
in the Shell compositor.

**Current state:** `getPublicInstance` returns `node.object`. No other DevTools
hooks are implemented. No `react-devtools-core` wiring. DevTools connect via a
WebSocket in browser — GNOME Shell has no WebSocket server.

**Target state:** React Dev Tools standalone app connects to the running Shell
process. Component tree is browsable. Props are inspectable. Selecting a
component in DevTools highlights it in the Shell compositor with a colored
overlay rectangle.

### 5.1 Architecture

```
React DevTools (Electron app)
         │
         │ WebSocket (ws://localhost:8097)
         ▼
┌─ devtools/backend.ts ──────────────────┐
│  Gio.SocketService (UNIX socket)       │
│  or TCP listener on localhost:8097     │
│  └─ JSON message protocol              │
│     └─ react-devtools-core backend     │
│        └─ hook into React reconciler   │
│           └─ getInspectorData* calls   │
└────────────────────────────────────────┘
```

**Transport choice:** TCP listener on localhost is simpler for standalone DevTools.
UNIX socket is more secure but requires the DevTools app to support it (the
standalone React DevTools Electron app supports TCP via `--host`/`--port`).

### 5.2 Implement `getInspectorDataForInstance`

```typescript
// hostConfig.ts additions
getInspectorDataForInstance: hostConfig.getInspectorDataForInstance ?? function(instance: any) {
  // React DevTools calls this with the fiber's stateNode
  // Our stateNode is the GnomeShellElement

  const element = instance as GnomeShellElement;
  if (!element || element.kind !== "element") return null;

  const descriptor = registry.resolve(element.type);

  return {
    hierarchy: [], // parent chain (filled by DevTools)
    selectedIndex: null,
    props: element.props,
    source: null, // TODO: capture source location at createElement time
    componentStack: [],
    hostInstance: instance,
    // highlight rectangle — wrap in DevTools overlay
    hostRect: {
      x: element.actor.x as number ?? 0,
      y: element.actor.y as number ?? 0,
      width: element.actor.width as number ?? 0,
      height: element.actor.height as number ?? 0,
    },
  };
},
```

### 5.3 DevTools backend server

```typescript
// devtools/backend.ts
import { connectToDevTools } from "react-devtools-core";
import Gio from "gi://Gio";

export function startDevToolsServer(port = 8097): void {
  // Start a TCP server using Gio.SocketService
  const service = new Gio.SocketService();
  service.add_inet_port(port, null);

  service.connect("incoming", (_service, connection, _sourceObject) => {
    // Wrap Gio.SocketConnection as a WebSocket-like stream
    const stream = new GioSocketStream(connection);

    connectToDevTools({
      host: "0.0.0.0",
      port,
      // react-devtools-core expects a WebSocket server, but we can
      // implement the protocol over raw TCP since it's just JSON frames
      resolveRNStyle: null as any,
      isAppActive: () => true,
      websocket: new GjsWebSocketAdapter(stream),
    });
  });
}
```

Note: `react-devtools-core` uses WebSocket protocol (JSON over TCP with WebSocket
framing). GJS has no built-in WebSocket. Options:
- Implement WebSocket framing manually (~200 lines, RFC 6455 subset)
- Use `libsoup` (GNOME HTTP library) if available in Shell
- Use GLib's `GSocket` directly and implement the minimal WebSocket upgrade + framing

The WebSocket protocol for DevTools is trivial: text frames with JSON payloads,
ping/pong keepalive. A 150-line implementation is sufficient.

### 5.4 Deliverables

| File | Action |
|------|--------|
| `hostConfig.ts` | Add `getInspectorDataForInstance` implementation |
| `devtools/backend.ts` | New — TCP server + react-devtools-core wiring |
| `devtools/websocket.ts` | New — Minimal WebSocket server over Gio.Socket |
| `devtools/overlay.ts` | New — DevTools highlight overlay (colored St.Widget) |
| `devtools/README.md` | New — How to connect DevTools to the running Shell |
| `vite.gnome.config.mjs` | Conditionally bundle devtools (only in dev mode) |

### 5.5 Success criteria

- [ ] `run.sh gnome` starts a DevTools server on localhost:8097
- [ ] `npx react-devtools` (standalone) connects and shows the Gallery component tree
- [ ] Selecting a component in DevTools draws a blue rectangle overlay in the Shell
- [ ] Props panel shows the correct props for each selected component
- [ ] Works without crashing the Shell or leaking Gio resources

---

## Phase 6: Text System

**Goal:** Proper text handling — controlled `TextInput`, rich text with mixed
styles, text measurement, and text events (`onChangeText`, `onSubmitEditing`).

**Current state:** `Entry` has a `text` prop that sets `actor.text`. No change
callback. Text content for labels/buttons is sugar over `children`/`text`/`label`.
No text measurement before layout.

### 6.1 Controlled TextInput

```typescript
export interface TextInputProps extends StWidgetBaseProps {
  value: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  editable?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  maxLength?: number;
  keyboardType?: "default" | "numeric" | "password";
  autoFocus?: boolean;
  onSubmitEditing?: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  selectTextOnFocus?: boolean;
  caretHidden?: boolean;
}
```

Implementation:
- Maps to `St.Entry` for single-line (Shell has St.Entry, which wraps Clutter.Text)
- For multiline, uses `St.ScrollView` containing a `St.Entry` with `clutter_text_set_activatable(false)` + `clutter_text_set_single_line_mode(false)`
- `onChangeText` connects to Shell's `"changed"` signal on St.Entry
- `onSubmitEditing` connects to `"activate"` signal
- `placeholder` maps to `clutter_text_set_placeholder_text()`

### 6.2 Rich Text (nested `<Text>`)

React Native supports nested `<Text>` with style inheritance:

```tsx
<Text>
  Normal <Text style={{ fontWeight: "bold" }}>Bold</Text> and{" "}
  <Text style={{ color: "blue" }}>blue</Text>
</Text>
```

This requires:
- Detecting `Text` children of `Text` → merging their text into a single
  `St.Label` with Pango markup
- Pango markup: `<span weight="bold">Bold</span> and <span foreground="blue">blue</span>`

Strategy:
1. During commit, walk the `Text` subtree
2. Collect text runs with their inherited styles
3. Generate Pango markup string
4. Set `St.Label.clutter_text.set_markup(pangoMarkup)`

Pango markup is the GNOME Shell native approach and avoids needing multiple
actors for styled text runs.

### 6.3 Text measurement

`St.Label.get_preferred_width(forHeight)` + `get_preferred_height(forWidth)`.
Returns `[minimum, natural]` pairs per GObject convention. Wrap as:

```typescript
// layout/measureHost.ts (additions)
export function measureText(actor: GnomeShellActor, maxWidth?: number): { width: number; height: number } {
  const [minW, natW] = actor.get_preferred_width(-1);
  const forHeight = maxWidth !== undefined ? maxWidth : -1;
  const [minH, natH] = actor.get_preferred_height(forHeight);

  return {
    width: Math.min(natW, maxWidth ?? natW),
    height: natH,
  };
}
```

### 6.4 Deliverables

| File | Action |
|------|--------|
| `descriptors/st/textInput.ts` | New — TextInput descriptor (controlled) |
| `descriptors/st/text.ts` | Update — nested Text with Pango markup |
| `layout/measureHost.ts` | Add measureText using St preferred size API |
| `primitives.ts` | Add TextInput export |
| `events/types.ts` | Add TextChangeEvent, SubmitEditingEvent |
| `stAdapter.test.tsx` | Add controlled TextInput tests |
| `layout/measureHost.test.ts` | Add measurement unit tests |

### 6.5 Success criteria

- [ ] `<TextInput value="hello" onChangeText={setText} />` fires onChangeText on
      each keystroke
- [ ] Controlled pattern works (value always stays in sync)
- [ ] Nested `<Text>` with bold/color children renders Pango markup correctly
- [ ] Text measurement returns correct pixel dimensions
- [ ] `maxLength` truncates input

---

## Phase 7: Animation System

**Goal:** A declarative animation API modeled on React Native's `Animated`.
Native driver support (Clutter transitions bypass React reconciliation).
Layout animations for enter/exit transitions.

**Current state:** Zero animation support. No `Animated.Value`, no Clutter
tween integration, no layout animation callbacks.

### 7.1 Animated API (JS driver)

```typescript
// animation/Animated.ts

export class AnimatedValue {
  private _value: number;
  private _listeners: Array<({ value: number }) => void> = [];

  constructor(value: number) {
    this._value = value;
  }

  getValue(): number {
    return this._value;
  }

  setValue(value: number): void {
    this._value = value;
    this._notify();
  }

  addListener(cb: ({ value: number }) => void): string {
    this._listeners.push(cb);
    return String(this._listeners.length - 1);
  }

  removeListener(id: string): void {
    delete this._listeners[Number(id)];
  }

  // Animated API methods
  // spring, timing, decay, etc. implemented via requestAnimationFrame polyfill

  private _notify(): void {
    for (const cb of this._listeners) {
      if (cb) cb({ value: this._value });
    }
  }
}

// Driver tick function — GLib.timeout_add for 60fps in GJS
function startAnimationDriver(callback: (dt: number) => void): () => void {
  let lastTime = Date.now();
  const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
    const now = Date.now();
    callback(now - lastTime);
    lastTime = now;
    return true; // continue
  });
  return () => GLib.source_remove(id);
}
```

### 7.2 Native driver (Clutter transitions)

For properties that Clutter can animate natively (opacity, position, size, scale,
rotation), we bypass React and use `actor.ease()` or `actor.animate()`:

```typescript
// animation/nativeDriver.ts

export function applyNativeAnimation(
  actor: GnomeShellActor,
  property: string,
  toValue: number,
  config: AnimationConfig,
): void {
  // Clutter's implicit animation: actor.ease(props)
  actor.ease({
    [property]: toValue,
    duration: config.duration ?? 300,
    mode: CLUTTER_EASE_MODES[config.easing ?? "easeInOut"],
    onComplete: () => config.onComplete?.(),
  });
}

const CLUTTER_EASE_MODES: Record<string, number> = {
  linear: 0,
  easeInQuad: 1,
  easeOutQuad: 2,
  easeInOutQuad: 3,
  // ... full Clutter.AnimationMode enum
};
```

**Clutter animation note:** GJS exposes `Clutter.AnimationMode` enum. `actor.ease()`
is a convenience around `actor.animate()` with `Clutter.Animation`. It's well-tested
and performant in GNOME Shell.

### 7.3 LayoutAnimation

```typescript
// animation/LayoutAnimation.ts

export function configureNext(config: LayoutAnimationConfig): void {
  // Set global layout animation config for the next render
  // During commit, if a LayoutAnimation is pending:
  // 1. Before removing old children: capture their positions
  // 2. After layout: animate new children from old positions
  // 3. Animate opacity for appearing/disappearing items
  LayoutAnimationStore.pending = config;
}
```

The commit phase in `hostConfig` checks `LayoutAnimationStore.pending`, and if
set, records pre-update positions, applies the update, then eases actors from
old to new positions.

### 7.4 Deliverables

| File | Action |
|------|--------|
| `animation/Animated.ts` | New — Animated.Value, Animated.spring, Animated.timing |
| `animation/AnimatedInterpolation.ts` | New — Animated.interpolate() |
| `animation/nativeDriver.ts` | New — Clutter ease() wrapper |
| `animation/LayoutAnimation.ts` | New — LayoutAnimation.configureNext() |
| `animation/AnimationDriver.ts` | New — GLib-based 60fps tick |
| `hostConfig.ts` | Hook LayoutAnimation into commit phase |
| `descriptors/st/boxLayout.ts` | Support `style={{ opacity: animatedValue }}` |
| `animation/Animated.test.ts` | New — unit tests for timing/spring |

### 7.5 Success criteria

- [ ] `Animated.timing(value, { toValue: 1, duration: 300 }).start()` animates
      smoothly in the Shell
- [ ] Opacity animation uses native Clutter driver (no React re-renders)
- [ ] `LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)` animates
      list insertions/removals
- [ ] Interpolation works: `value.interpolate({ inputRange: [0,1], outputRange: [0, 100] })`
- [ ] Timer runs at 60fps via GLib.timeout_add, no frame drops visible in devkit

---

## Phase 8: Native Module System

**Goal:** Typed, synchronous native function calls from React to GNOME Shell.
Zero-bridge overhead (same JS context). State subscriptions for reactive data.

**Current state:** Native functionality is wired ad-hoc via D-Bus in the
gallery's `gnomeExtension.tsx`. No library support for native modules. Each
consumer rolls their own integration.

### 8.1 Module registration

```typescript
// modules/NativeModule.ts

export interface NativeModule {
  readonly name: string;
}

export interface NativeModuleRegistry {
  register(name: string, module: NativeModule): void;
  get<T extends NativeModule>(name: string): T;
}

// Extension registers native modules at startup:
function enable() {
  const registry = createNativeModuleRegistry();

  registry.register("ContainerManager", {
    name: "ContainerManager",
    async listContainers(): Promise<ContainerInfo[]> { /* D-Bus call */ },
    async startContainer(id: string): Promise<void> { /* ... */ },
    async stopContainer(id: string): Promise<void> { /* ... */ },
    onContainerChanged: new NativeEventEmitter<ContainerEvent>(),
  });

  const root = createGnomeShellRoot(hostActor, toolkit, {
    nativeModules: registry,
  });
}
```

### 8.2 React Hook

```typescript
// hooks/useNativeModule.ts

export function useNativeModule<T extends NativeModule>(name: string): T {
  // Access the registry from React context or a module-level store
  // set during createGnomeShellRoot
  const modules = React.useContext(NativeModuleContext);
  return modules.get<T>(name);
}

// Usage in components:
function TrayApp() {
  const cm = useNativeModule("ContainerManager");
  const [containers, setContainers] = useState([]);

  useEffect(() => {
    cm.listContainers().then(setContainers);
    const sub = cm.onContainerChanged.addListener((event) => {
      setContainers(prev => /* ... */);
    });
    return () => sub.remove();
  }, [cm]);

  return (/* ... */);
}
```

### 8.3 NativeEventEmitter

```typescript
// modules/NativeEventEmitter.ts

export class NativeEventEmitter<T> {
  private listeners: Array<(event: T) => void> = [];

  addListener(callback: (event: T) => void): { remove(): void } {
    this.listeners.push(callback);
    return {
      remove: () => {
        const idx = this.listeners.indexOf(callback);
        if (idx >= 0) this.listeners.splice(idx, 1);
      },
    };
  }

  emit(event: T): void {
    for (const cb of this.listeners) {
      try { cb(event); } catch (e) { console.error("NativeEventEmitter:", e); }
    }
  }

  removeAllListeners(): void {
    this.listeners = [];
  }
}
```

### 8.4 Deliverables

| File | Action |
|------|--------|
| `modules/NativeModule.ts` | New — NativeModule type, registry |
| `modules/NativeEventEmitter.ts` | New — typed event emitter |
| `hooks/useNativeModule.ts` | New — React hook |
| `hooks/index.ts` | New — hooks barrel export |
| `gnomeShell.ts` | Accept nativeModules option |
| `stAdapter.ts` | Pass nativeModules in createStAdapter options |
| `createRoot.ts` | Provide nativeModules via React context |

### 8.5 Success criteria

- [ ] Extension registers a native module and component calls it via hook
- [ ] D-Bus method calls work synchronously or return Promises
- [ ] NativeEventEmitter delivers Shell events to React state
- [ ] Module type is enforced at compile time (no `any` casts)
- [ ] Unregistration cleans up listeners (no leaks)

---

## Phase 9: Accessibility

**Goal:** ATK/AT-SPI integration so GNOME's screen reader (Orca) can navigate
the React UI. Keyboard navigation, focus management, and accessible labels.

**Current state:** One `accessible_name` call in the codebase (progress bar).

### 9.1 Accessibility properties

```typescript
export interface AccessibilityProps {
  accessible?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  accessibilityHint?: string;
  // Not supported in Shell: accessibilityActions, onAccessibilityAction
}

type AccessibilityRole =
  | "none" | "button" | "link" | "search" | "image"
  | "keyboardkey" | "text" | "adjustable" | "header"
  | "summary" | "alert" | "checkbox" | "combobox"
  | "menu" | "menubar" | "menuitem" | "progressbar"
  | "radio" | "radiogroup" | "scrollbar" | "spinbutton"
  | "switch" | "tab" | "tablist" | "timer" | "toolbar";

interface AccessibilityState {
  disabled?: boolean;
  selected?: boolean;
  checked?: boolean | "mixed";
  busy?: boolean;
  expanded?: boolean;
}
```

### 9.2 St accessibility mapping

St actors inherit from Clutter.Actor which has ATK integration:

```typescript
// a11y/applyA11y.ts
export function applyAccessibility(
  actor: GnomeShellActor,
  props: AccessibilityProps,
): void {
  if (props.accessible === false) {
    actor.accessible_role = ATK.Role.UNKNOWN;
    return;
  }

  if (props.accessibilityLabel) {
    actor.accessible_name = props.accessibilityLabel;
  }

  if (props.accessibilityRole) {
    actor.accessible_role = ROLE_MAP[props.accessibilityRole];
  }

  if (props.accessibilityState) {
    // Map to ATK states
  }
}

// Note: ATK.Role is available in GJS via:
// const ATK = imports.gi.Atk;
```

### 9.3 Keyboard navigation

```typescript
// a11y/keyboard.ts

export function setupKeyboardNavigation(
  rootActor: GnomeShellActor,
): void {
  // Shell already handles Tab/Shift+Tab focus navigation via Clutter
  // We need to:
  // 1. Set can_focus: true on interactive elements
  // 2. Implement focus ring via grab_key_focus() and Clutter key events
  // 3. Handle Space/Enter for activation

  rootActor.connect("key-press-event", (actor, event) => {
    const key = event.get_key_symbol();
    if (key === Clutter.KEY_Tab) {
      // Move focus to next focusable child
      return Clutter.EVENT_STOP;
    }
    return Clutter.EVENT_PROPAGATE;
  });
}
```

### 9.4 Deliverables

| File | Action |
|------|--------|
| `a11y/types.ts` | New — AccessibilityProps, roles, states |
| `a11y/applyA11y.ts` | New — ATK mapping for St actors |
| `a11y/keyboard.ts` | New — focus navigation, key handling |
| `descriptors/st/button.ts` | Apply a11y role "button" by default |
| `descriptors/st/button.ts` | Apply a11y role "button", keyboard activation |

### 9.5 Success criteria

- [ ] Orca screen reader announces button labels in the Gallery
- [ ] Tab moves focus between interactive elements
- [ ] Enter/Space activates focused buttons
- [ ] `accessibilityLabel="Close"` overrides default label for Orca

---

## Phase 10: Performance & Production Hardening

**Goal:** Production-ready performance characteristics, comprehensive error
recovery, memory leak prevention, and GNOME Shell version compatibility.

### 10.1 GLib Main Loop Integration

Replace `updateContainerSync` + `flushSyncWork` with async integration:

```typescript
// hostConfig.ts — use async scheduling instead of sync flush
export function createRenderer<Node, Text, Container>(
  adapter: ReactLinuxAdapter<Node, Text, Container>,
) {
  const reconciler = Reconciler({
    ...hostConfig,
    scheduleTimeout: (fn, delay) => {
      // Use GLib.timeout_add instead of setTimeout
      // (setTimeout works in GJS but GLib integration is more reliable)
      return GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
        try { fn(); } catch (e) { logError(e); }
        return false; // don't repeat
      });
    },
    cancelTimeout: (id) => { GLib.source_remove(id); },
  });

  return {
    reconciler,
    createContainer(container: Container) {
      return reconciler.createContainer(
        container, ConcurrentRoot, null, false, null, "",
        onRecoverableError, // ← new
        onRecoverableError,
        onRecoverableError,
        null,
      );
    },
  };

  function onRecoverableError(error: unknown, errorInfo: unknown) {
    // Log but don't crash the Shell
    log(JSON.stringify({ error: String(error), errorInfo }));
  }
}
```

### 10.2 Error boundaries at the root level

```typescript
// createRoot.ts — wrap render in error boundary
render(element: ReactNode) {
  try {
    reconciler.updateContainerSync(
      <ErrorBoundary fallback={ErrorFallback}>{element}</ErrorBoundary>,
      root, null, null,
    );
  } catch (e) {
    log(`Fatal render error: ${e}`);
    // Show error overlay in Shell
    showErrorOverlay(e);
  }
}

function ErrorFallback({ error }: { error: Error }) {
  return (
    <View style={{ padding: 16, backgroundColor: "red" }}>
      <Text style={{ color: "white" }}>Render Error: {error.message}</Text>
    </View>
  );
}
```

### 10.3 Memory management

- Ensure layout solver tree is cleaned up on unmount (Phase 3, WeakMap-based)
- Ensure `NativeEventEmitter.removeAllListeners` on extension `disable()` (Phase 8)
- Ensure DevTools server stops on `disable()` (Phase 5)
- Profile with Shell's built-in memory tools for GJS

### 10.4 GNOME Shell version compatibility matrix

Define and test against supported Shell versions:

| Shell Version | GJS Version | St API | Notes |
|---------------|-------------|--------|-------|
| GNOME 45 | 1.78.x | ✅ | Minimum supported |
| GNOME 46 | 1.80.x | ✅ | |
| GNOME 47 | 1.82.x | ✅ | |
| GNOME 48 | 1.84.x | ✅ | |
| GNOME 49 | 1.86.x | ✅ | |
| GNOME 50 | 1.88.x | ✅ | Current |

The gallery's `metadata.json` already declares `"shell-version": ["45", "46", "47", "48", "49", "50"]`.

### 10.5 Bundle optimization

- Enable minification for production builds (`minify: true` in vite config)
- Tree-shake `react-devtools-core` from production builds (Phase 5 conditional)
- Solver is pure TS (~300 lines) — no binary, no WASM. Production bundle < 150KB gzipped.

### 10.6 Deliverables

| File | Action |
|------|--------|
| `hostConfig.ts` | GLib timeout integration, onRecoverableError |
| `createRoot.ts` | Error boundary wrapping, showErrorOverlay |
| `vite.gnome.config.mjs` | Production minification, devtools conditional |
| `gnomeShell.ts` | disable() cleanup of all resources |
| `errorOverlay.ts` | New — red error banner in Shell |

### 10.7 Success criteria

- [ ] `yarn test:run` passes full suite
- [ ] Gallery smoke test passes on GNOME 45 through 50
- [ ] Extension disable leaves zero GObject references (verify with Shell's GC log)
- [ ] Unhandled React error shows error overlay, doesn't crash Shell
- [ ] Production bundle < 200KB gzipped
- [ ] 60fps rendering in devkit with Gallery component tree

---

## Migration Path for Existing Code

### Semver policy

```
react-linux 0.x → 1.0 (this roadmap):
  Phase 1-2: internal refactors, no breaking changes
  Phase 3:   new View/Text/Pressable primitives; old ones move to legacy/
  Phase 4-10: incremental additions, backward compatible

react-linux 1.0:
  First production release
  Typed props + events
  Clutter-based layout with TS constraint solver (opt-in advanced features)
  DevTools

react-linux 2.0:
  Breaking: Box/Label/Button deprecated, replaced by View/Text/Pressable
  Clutter + solver layout becomes default for all containers
  St.BoxLayout used for Shell-native containers needing theme integration
```

### Legacy compatibility

During all phases, `import { Box, Label, Button, Icon } from "react-linux"` continues
to work identically. These become thin wrappers around the new descriptors. In 2.0,
they move to `react-linux/legacy` with a deprecation notice.

### Gallery migration

The gallery (`support/react-linux-gallery`) will be updated to use the new
`View`/`Text`/`Pressable` primitives as soon as Phase 3 is stable, serving as
the canonical example for new users.

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| Clutter measurement API returns unexpected values in some Shell versions | Medium | Test across GNOME 45-50; Pango-based fallback |
| react-devtools-core WebSocket protocol too complex for GJS | Medium | Implement just enough WebSocket framing for DevTools (~150 lines) |
| Signal diffing breaks subtle Shell behavior (e.g., Clutter.EVENT_STOP return) | Medium | Comprehensive test suite; synthetic event wrapper isolates Shell event quirks |
| Performance regression from TS solver vs pure Clutter.BoxLayout | Low | Solver only runs for elements with advanced props; simple Box has zero overhead |
| GJS memory leaks from solver WeakMaps | Low | Regular GC profiling; WeakMap-based tracking auto-collects |

---

## Timeline Estimate

| Phase | Weeks | Team |
|-------|-------|------|
| Phase 1: Component Descriptors | 2 | 1 dev |
| Phase 2: Typed Props & Events | 2 | 1 dev |
| Phase 3: Clutter Layout + TS Solver | 3 | 1 dev (pure TS, no spikes) |
| Phase 4: Signal Diffing & Events | 2 | 1 dev |
| Phase 5: React DevTools | 3 | 1 dev |
| Phase 6: Text System | 2 | 1 dev |
| Phase 7: Animation | 3 | 1 dev |
| Phase 8: Native Modules | 2 | 1 dev |
| Phase 9: Accessibility | 2 | 1 dev |
| Phase 10: Hardening | 2 | 1 dev |
| **Total** | **~23 weeks** | |

Phases 1-3 can overlap partially (descriptors are prerequisite for the solver).
Phases 4-8 are mostly independent after Phase 3.
Phase 9-10 are polish that can run in parallel with any other phase.

**Minimum viable production release:** Phases 1-4 + 10 = ~8 weeks.
This gives you typed props, no signal reconnect churn, error boundaries, and
DevTools — enough to ship the tray to users.
