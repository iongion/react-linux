import { describe, expect, it, vi } from "vitest";

import {
  Box,
  Button,
  createGnomeShellRoot,
  Entry,
  Icon,
  Label,
  PopupImageMenuItem,
  PopupMenuItem,
  PopupMenuSection,
  PopupSeparatorMenuItem,
  PopupSubMenuMenuItem,
  PopupSwitchMenuItem,
  Progress,
  QuickMenuToggle,
  QuickSlider,
  QuickToggle,
  SampleTrayApp,
  StWidget,
  SystemIndicator,
} from ".";
import type { GnomeShellToolkit } from "./stAdapter";

type SignalCallback = (...args: unknown[]) => unknown;

let nextSignalId = 1;

class FakeActor {
  actorType: string;
  children: FakeActor[] = [];
  destroyed = false;
  parent: FakeActor | null = null;
  relayouts = 0;
  signals = new Map<number, { callback: SignalCallback; signal: string }>();
  style = "";
  style_class = "";
  visible = true;
  [key: string]: unknown;

  constructor(actorType: string, props: Record<string, unknown> = {}) {
    this.actorType = actorType;
    Object.assign(this, props);
  }

  add_child(child: FakeActor) {
    this.insert_child_at_index(child, this.children.length);
  }

  add_actor(child: FakeActor) {
    this.add_child(child);
  }

  set_child(child: FakeActor | null) {
    for (const existingChild of [...this.children]) {
      this.remove_child(existingChild);
    }
    if (child) {
      this.add_child(child);
    }
  }

  insert_child_at_index(child: FakeActor, index: number) {
    child.parent?.remove_child(child);
    const safeIndex = Math.max(0, Math.min(index, this.children.length));
    this.children.splice(safeIndex, 0, child);
    child.parent = this;
  }

  queue_relayout() {
    this.relayouts += 1;
  }

  remove_child(child: FakeActor) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
    }
    child.parent = null;
  }

  get_children() {
    return [...this.children];
  }

  get_parent() {
    return this.parent;
  }

  connect(signal: string, callback: SignalCallback) {
    const id = nextSignalId++;
    this.signals.set(id, { callback, signal });
    return id;
  }

  disconnect(id: number) {
    this.signals.delete(id);
  }

  emit(signal: string, event?: unknown) {
    return [...this.signals.values()]
      .filter((entry) => entry.signal === signal)
      .map((entry) => entry.callback(this, event));
  }

  hide() {
    this.visible = false;
  }

  show() {
    this.visible = true;
  }

  set_style_class_name(styleClass: string) {
    this.style_class = styleClass;
  }

  destroy() {
    this.destroyed = true;
    this.signals.clear();
    for (const child of [...this.children]) {
      child.destroy();
    }
    this.children = [];
    this.parent = null;
  }
}

class FakeClutterText extends FakeActor {
  activatable = false;
  editable = false;
  selectable = false;
  single_line_mode = false;

  constructor(text = "") {
    super("ClutterText", { text });
  }

  get_text() {
    return String(this.text ?? "");
  }

  set_activatable(value: boolean) {
    this.activatable = value;
  }

  set_editable(value: boolean) {
    this.editable = value;
  }

  set_selectable(value: boolean) {
    this.selectable = value;
  }

  set_single_line_mode(value: boolean) {
    this.single_line_mode = value;
  }

  set_text(value: string) {
    this.text = value;
  }
}

class FakeEntry extends FakeActor {
  clutterText: FakeClutterText;

  constructor(props: Record<string, unknown> = {}) {
    super("Entry", props);
    this.clutterText = new FakeClutterText(String(props.text ?? ""));
  }

  get_clutter_text() {
    return this.clutterText;
  }
}

class FakePopupObject {
  actor: FakeActor;
  destroyed = false;
  items: FakePopupObject[] = [];
  label = { text: "" };
  menuParent: FakePopupObject | null = null;
  objectType: string;
  signals = new Map<number, { callback: SignalCallback; signal: string }>();
  [key: string]: unknown;

  constructor(objectType: string, props: Record<string, unknown> = {}) {
    this.objectType = objectType;
    this.actor = new FakeActor(`${objectType}.actor`);
    this.actor.shellObject = this;
    Object.assign(this, props);
  }

  addMenuItem(item: FakePopupObject, position = this.items.length) {
    item.menuParent?.removeMenuItem(item);
    const safeIndex = Math.max(0, Math.min(position, this.items.length));
    this.items.splice(safeIndex, 0, item);
    item.menuParent = this;
  }

  moveMenuItem(item: FakePopupObject, position: number) {
    const index = this.items.indexOf(item);
    if (index >= 0) {
      this.items.splice(index, 1);
    }
    this.addMenuItem(item, position);
  }

  removeMenuItem(item: FakePopupObject) {
    const index = this.items.indexOf(item);
    if (index >= 0) {
      this.items.splice(index, 1);
    }
    item.menuParent = null;
  }

  connect(signal: string, callback: SignalCallback) {
    const id = nextSignalId++;
    this.signals.set(id, { callback, signal });
    return id;
  }

  disconnect(id: number) {
    this.signals.delete(id);
  }

  emit(signal: string, payload?: unknown) {
    return [...this.signals.values()]
      .filter((entry) => entry.signal === signal)
      .map((entry) => entry.callback(this, payload));
  }

  destroy() {
    this.destroyed = true;
    this.signals.clear();
    this.menuParent?.removeMenuItem(this);
    for (const item of [...this.items]) {
      item.destroy();
    }
    this.items = [];
    this.actor.destroy();
  }
}

class FakePopupMenuSection extends FakePopupObject {
  constructor() {
    super("PopupMenuSection");
  }
}

class FakePopupMenuItem extends FakePopupObject {
  constructor(text: string, props: Record<string, unknown> = {}) {
    super("PopupMenuItem", props);
    this.label.text = text;
  }
}

class FakePopupImageMenuItem extends FakePopupObject {
  icon: { icon_name?: string } = {};

  constructor(text: string, icon: unknown, props: Record<string, unknown> = {}) {
    super("PopupImageMenuItem", props);
    this.label.text = text;
    this.setIcon(icon);
  }

  setIcon(icon: unknown) {
    this.icon.icon_name = String(icon);
  }
}

class FakePopupSeparatorMenuItem extends FakePopupObject {
  constructor(text = "") {
    super("PopupSeparatorMenuItem");
    this.label.text = text;
  }
}

class FakePopupSwitchMenuItem extends FakePopupObject {
  state = false;
  statusText: string | null = null;

  constructor(text: string, active: boolean, props: Record<string, unknown> = {}) {
    super("PopupSwitchMenuItem", props);
    this.label.text = text;
    this.state = active;
  }

  setStatusText(text: string | null) {
    this.statusText = text;
  }

  setToggleState(state: boolean) {
    this.state = state;
  }
}

class FakePopupSubMenuMenuItem extends FakePopupObject {
  icon = { icon_name: "" };
  menu = new FakePopupObject("PopupSubMenu");
  open = false;
  wantsIcon: boolean;

  constructor(text: string, wantsIcon: boolean) {
    super("PopupSubMenuMenuItem");
    this.label.text = text;
    this.wantsIcon = wantsIcon;
  }

  setSubmenuShown(open: boolean) {
    this.open = open;
  }
}

class FakeQuickSettingsObject extends FakePopupObject {
  checked = false;
  iconName?: string;
  iconSize?: number;
  subtitle?: string;
  title?: string;
  toggleMode?: boolean;

  constructor(objectType: string, props: Record<string, unknown> = {}) {
    super(objectType, props);
    Object.assign(this, props);
  }
}

class FakeSystemIndicator extends FakeQuickSettingsObject {
  quickSettingsItems: FakePopupObject[] = [];

  constructor() {
    super("SystemIndicator");
  }
}

class FakeQuickToggle extends FakeQuickSettingsObject {
  constructor(props: Record<string, unknown> = {}) {
    super("QuickToggle", props);
  }
}

class FakeQuickMenuToggle extends FakeQuickSettingsObject {
  menu = new FakePopupObject("QuickMenuToggle.menu");

  constructor(props: Record<string, unknown> = {}) {
    super("QuickMenuToggle", props);
  }
}

class FakeQuickSlider extends FakeQuickSettingsObject {
  slider = { value: 0 };

  constructor(props: Record<string, unknown> = {}) {
    super("QuickSlider", props);
  }
}

function actorClass(name: string) {
  return class extends FakeActor {
    constructor(props: Record<string, unknown> = {}) {
      super(name, props);
    }
  };
}

function createToolkit(): GnomeShellToolkit {
  return {
    Clutter: {
      ActorAlign: {
        CENTER: "CENTER",
        END: "END",
        FILL: "FILL",
        START: "START",
      },
      Orientation: {
        HORIZONTAL: "HORIZONTAL",
        VERTICAL: "VERTICAL",
      },
    },
    PopupMenu: {
      PopupImageMenuItem: FakePopupImageMenuItem,
      PopupMenuItem: FakePopupMenuItem,
      PopupMenuSection: FakePopupMenuSection,
      PopupSeparatorMenuItem: FakePopupSeparatorMenuItem,
      PopupSubMenuMenuItem: FakePopupSubMenuMenuItem,
      PopupSwitchMenuItem: FakePopupSwitchMenuItem,
    },
    QuickSettings: {
      QuickMenuToggle: FakeQuickMenuToggle,
      QuickSlider: FakeQuickSlider,
      QuickToggle: FakeQuickToggle,
      SystemIndicator: FakeSystemIndicator,
    },
    St: {
      Bin: actorClass("Bin"),
      BoxLayout: actorClass("BoxLayout"),
      Button: actorClass("Button"),
      DrawingArea: actorClass("DrawingArea"),
      Entry: FakeEntry,
      Icon: actorClass("Icon"),
      Label: actorClass("Label"),
      ScrollBar: actorClass("ScrollBar"),
      ScrollView: actorClass("ScrollView"),
      Widget: actorClass("Widget"),
    },
  };
}

describe("react-linux St adapter", () => {
  it("mounts common St widgets and text content", () => {
    const container = new FakeActor("Root");
    const root = createGnomeShellRoot(container, createToolkit(), { eventStopValue: "STOP" });
    const onClick = vi.fn();

    root.render(
      <Box vertical styleClass="sample-root">
        <Label>Containers</Label>
        <Button onClick={onClick}>Refresh</Button>
        <Icon iconName="application-x-executable-symbolic" iconSize={16} />
        <Entry text="filter" hintText="Search" />
      </Box>,
    );

    const box = container.children[0];
    expect(box.actorType).toBe("BoxLayout");
    expect(box.orientation).toBe("VERTICAL");
    expect(box.style_class).toContain("react-linux-box-layout");
    expect(box.style_class).toContain("sample-root");

    expect(box.children[0].actorType).toBe("Label");
    expect(box.children[0].text).toBe("Containers");
    expect(box.children[1].actorType).toBe("Button");
    expect(box.children[1].label).toBe("Refresh");
    expect(box.children[1].emit("clicked")).toEqual(["STOP"]);
    expect(onClick).toHaveBeenCalledWith({ actor: box.children[1], event: undefined, signal: "clicked" });
    expect(box.children[2].icon_name).toBe("application-x-executable-symbolic");
    expect(box.children[2].icon_size).toBe(16);
    expect(box.children[3].actorType).toBe("Entry");
    expect(box.children[3].hint_text).toBe("Search");
    expect(box.children[3].reactive).toBe(true);
    expect(box.children[3].can_focus).toBe(true);
    expect((box.children[3] as FakeEntry).clutterText.editable).toBe(true);
    expect((box.children[3] as FakeEntry).clutterText.selectable).toBe(true);
    expect((box.children[3] as FakeEntry).clutterText.single_line_mode).toBe(true);
    expect((box.children[3] as FakeEntry).clutterText.text).toBe("filter");
  });

  it("can construct arbitrary available St widgets through StWidget", () => {
    const container = new FakeActor("Root");
    const root = createGnomeShellRoot(container, createToolkit());
    const onRepaint = vi.fn(() => "PAINTED");

    root.render(<StWidget widget="DrawingArea" reactive signals={{ repaint: onRepaint }} width={120} height={32} />);

    const drawingArea = container.children[0];
    expect(drawingArea.actorType).toBe("DrawingArea");
    expect(drawingArea.reactive).toBe(true);
    expect(drawingArea.width).toBe(120);
    expect(drawingArea.height).toBe(32);
    expect(drawingArea.style_class).toContain("react-linux-drawing-area");
    expect(drawingArea.emit("repaint", { area: true })).toEqual(["PAINTED"]);
    expect(onRepaint).toHaveBeenCalledWith(drawingArea, { area: true });
  });

  it("maps simple flex layout props to native Shell actor properties", () => {
    const container = new FakeActor("Root");
    const root = createGnomeShellRoot(container, createToolkit());

    root.render(
      <Box alignItems="center" flexDirection="column" gap={10} height={100} width={200}>
        <Label flexGrow={1}>A</Label>
      </Box>,
    );

    const box = container.children[0];
    const label = box.children[0];

    expect(box.actorType).toBe("BoxLayout");
    expect(box.orientation).toBe("VERTICAL");
    expect(box.spacing).toBe(10);
    expect(box.width).toBe(200);
    expect(box.height).toBe(100);
    expect(label.y_expand).toBe(true);
    expect(label.x_align).toBe("CENTER");
    expect(box.relayouts).toBeGreaterThan(0);
  });

  it("reasserts BoxLayout gap after native theme spacing is applied", () => {
    const container = new FakeActor("Root");
    const root = createGnomeShellRoot(container, createToolkit());

    root.render(
      <Box>
        <Box>
          <Label>Progress: 35%</Label>
          <Box flexDirection="row" gap={8}>
            <Button width={54}>-10</Button>
            <Button width={54}>+10</Button>
          </Box>
        </Box>
        <Box>
          <Label>Slider: 35%</Label>
        </Box>
      </Box>,
    );

    const parent = container.children[0];
    const stPanel = parent.children[0];
    const row = stPanel.children[1];
    expect(row.spacing).toBe(8);
    expect(row.style).toBe("spacing: 8px;");

    row.spacing = 10;
    row.style = "spacing: 10px;";
    root.render(
      <Box>
        <Box>
          <Label>Progress: 35%</Label>
          <Box flexDirection="row" gap={8}>
            <Button width={54}>-10</Button>
            <Button width={54}>+10</Button>
          </Box>
        </Box>
        <Box>
          <Label>Slider: 45%</Label>
        </Box>
      </Box>,
    );

    expect(row.spacing).toBe(8);
    expect(row.style).toBe("spacing: 8px;");
  });

  it("solves advanced flex ratios in TypeScript when native Shell layout is not enough", () => {
    const container = new FakeActor("Root");
    const root = createGnomeShellRoot(container, createToolkit());
    const onLayout = vi.fn();

    root.render(
      <Box flexDirection="row" height={40} onLayout={onLayout} width={300}>
        <Label flexGrow={1}>One</Label>
        <Label flexGrow={2}>Two</Label>
      </Box>,
    );

    const box = container.children[0];
    const first = box.children[0];
    const second = box.children[1];

    expect(first).toMatchObject({ height: 40, width: 100, x: 0, y: 0 });
    expect(second).toMatchObject({ height: 40, width: 200, x: 100, y: 0 });
    expect(onLayout).toHaveBeenLastCalledWith({
      actor: box,
      layout: { height: 40, width: 300, x: 0, y: 0 },
      signal: "layout",
    });
  });

  it("updates props, visibility, progress, and event handlers", () => {
    const container = new FakeActor("Root");
    const root = createGnomeShellRoot(container, createToolkit());
    const firstClick = vi.fn();
    const secondClick = vi.fn();

    root.render(
      <Box>
        <Button onClick={firstClick}>Start</Button>
        <Progress value={1} max={4} />
      </Box>,
    );

    const box = container.children[0];
    const button = box.children[0];
    const progress = box.children[1];

    expect(button.label).toBe("Start");
    expect(progress.width).toBe(100);
    expect(progress.children[0].width).toBe(25);
    expect(progress.children[0].style).toBe("width: 25px;");

    root.render(
      <Box>
        <Button hidden onClick={secondClick} styleClass="quiet">
          Stop
        </Button>
        <Progress value={3} max={4} />
      </Box>,
    );

    expect(button.label).toBe("Stop");
    expect(button.visible).toBe(false);
    expect(button.style_class).toContain("quiet");
    button.emit("clicked");
    expect(firstClick).not.toHaveBeenCalled();
    expect(secondClick).toHaveBeenCalledTimes(1);
    expect(progress.children[0].width).toBe(75);
    expect(progress.children[0].style).toBe("width: 75px;");
  });

  it("reorders without destroying and destroys removed subtrees with signals", () => {
    const container = new FakeActor("Root");
    const root = createGnomeShellRoot(container, createToolkit());
    const removedClick = vi.fn();

    root.render(
      <Box>
        <Label key="a">A</Label>
        <Button key="b" onClick={removedClick}>
          B
        </Button>
        <Label key="c">C</Label>
      </Box>,
    );

    const box = container.children[0];
    const [a, b, c] = box.children;

    root.render(
      <Box>
        <Label key="c">C</Label>
        <Label key="a">A</Label>
      </Box>,
    );

    expect(box.children).toEqual([c, a]);
    expect(a.destroyed).toBe(false);
    expect(c.destroyed).toBe(false);
    expect(b.destroyed).toBe(true);
    expect(b.signals.size).toBe(0);
  });

  it("mounts the sample app on top of the generic renderer", () => {
    const container = new FakeActor("Root");
    const root = createGnomeShellRoot(container, createToolkit());
    const onRefresh = vi.fn();

    root.render(<SampleTrayApp onRefresh={onRefresh} />);

    const sampleRoot = container.children[0];
    expect(sampleRoot.style_class).toContain("react-linux-shell-sample");
    expect(sampleRoot.children.some((child) => child.actorType === "Widget")).toBe(true);
  });

  it("renders PopupMenu sections and menu items into a menu container", () => {
    const menu = new FakePopupObject("PopupMenu");
    const root = createGnomeShellRoot(menu, createToolkit(), { eventStopValue: "STOP" });
    const onActivate = vi.fn();
    const onSwitchActivate = vi.fn();
    const onToggled = vi.fn();

    root.render(
      <PopupMenuSection>
        <PopupMenuItem onActivate={onActivate}>Open</PopupMenuItem>
        <PopupImageMenuItem iconName="info-symbolic">Info</PopupImageMenuItem>
        <PopupSwitchMenuItem active onActivate={onSwitchActivate} statusText="Enabled" onToggled={onToggled}>
          Show all
        </PopupSwitchMenuItem>
        <PopupSeparatorMenuItem>More</PopupSeparatorMenuItem>
        <PopupSubMenuMenuItem open submenuHeight={58} wantsIcon>
          Machines
          <PopupMenuItem>Start VM</PopupMenuItem>
        </PopupSubMenuMenuItem>
      </PopupMenuSection>,
    );

    const section = menu.items[0];
    expect(section.objectType).toBe("PopupMenuSection");
    expect(section.items.map((item) => item.objectType)).toEqual([
      "PopupMenuItem",
      "PopupImageMenuItem",
      "PopupSwitchMenuItem",
      "PopupSeparatorMenuItem",
      "PopupSubMenuMenuItem",
    ]);
    expect(section.items[0].label.text).toBe("Open");
    expect(section.items[0].actor.reactive).toBe(true);
    expect(section.items[0].emit("activate", { type: "pointer" })).toEqual(["STOP"]);
    expect(onActivate).toHaveBeenCalledWith({ actor: section.items[0], event: { type: "pointer" }, signal: "activate" });

    const imageItem = section.items[1] as FakePopupImageMenuItem;
    expect(imageItem.icon.icon_name).toBe("info-symbolic");

    const switchItem = section.items[2] as FakePopupSwitchMenuItem;
    expect(switchItem.actor.reactive).toBe(true);
    expect(switchItem.state).toBe(true);
    expect(switchItem.statusText).toBe("Enabled");
    expect(switchItem.emit("toggled", false)).toEqual(["STOP"]);
    expect(onToggled).toHaveBeenCalledWith({ actor: switchItem, event: false, signal: "toggled" });
    expect(switchItem.emit("activate", { type: "pointer" })).toEqual(["STOP"]);
    expect(onSwitchActivate).toHaveBeenCalledWith({
      actor: switchItem,
      event: { type: "pointer" },
      signal: "activate",
    });

    const submenu = section.items[4] as FakePopupSubMenuMenuItem;
    expect(submenu.open).toBe(true);
    expect(submenu.wantsIcon).toBe(true);
    expect(submenu.menu.actor.height).toBe(58);
    expect(submenu.menu.actor.min_height).toBe(58);
    expect(submenu.menu.items[0].label.text).toBe("Start VM");
  });

  it("wires actor pointer fallbacks for embedded PopupMenu rows", () => {
    const container = new FakeActor("Root");
    const root = createGnomeShellRoot(container, createToolkit(), { eventStopValue: "STOP" });
    const onActivate = vi.fn();
    const onToggled = vi.fn();

    root.render(
      <Box>
        <PopupMenuSection>
          <PopupMenuItem onActivate={onActivate}>Open</PopupMenuItem>
          <PopupSwitchMenuItem active onToggled={onToggled}>
            Toggle
          </PopupSwitchMenuItem>
        </PopupMenuSection>
      </Box>,
    );

    const section = container.children[0].children[0].shellObject as FakePopupMenuSection;
    const item = section.items[0];
    const switchItem = section.items[1] as FakePopupSwitchMenuItem;

    expect(typeof section._setOpenedSubMenu).toBe("function");
    expect(item.actor.reactive).toBe(true);
    expect(item.actor.emit("button-press-event", { type: "pointer" })).toEqual(["STOP"]);
    expect(onActivate).toHaveBeenCalledWith({
      actor: item,
      event: { type: "pointer" },
      signal: "button-press-event",
    });

    expect(switchItem.actor.reactive).toBe(true);
    expect(switchItem.actor.emit("button-press-event", { type: "pointer" })).toEqual(["STOP"]);
    expect(switchItem.state).toBe(false);
    expect(onToggled).toHaveBeenCalledWith({
      actor: switchItem,
      event: false,
      signal: "button-press-event",
    });
  });

  it("updates and reorders PopupMenu items without destroying stable keyed items", () => {
    const menu = new FakePopupObject("PopupMenu");
    const root = createGnomeShellRoot(menu, createToolkit());

    root.render(
      <PopupMenuSection>
        <PopupMenuItem key="a">A</PopupMenuItem>
        <PopupMenuItem key="b">B</PopupMenuItem>
        <PopupSwitchMenuItem key="c" active>
          C
        </PopupSwitchMenuItem>
      </PopupMenuSection>,
    );

    const section = menu.items[0];
    const [a, b, c] = section.items;

    root.render(
      <PopupMenuSection>
        <PopupSwitchMenuItem key="c" active={false}>
          C2
        </PopupSwitchMenuItem>
        <PopupMenuItem key="a">A2</PopupMenuItem>
      </PopupMenuSection>,
    );

    expect(section.items).toEqual([c, a]);
    expect(a.destroyed).toBe(false);
    expect(c.destroyed).toBe(false);
    expect(b.destroyed).toBe(true);
    expect(a.label.text).toBe("A2");
    expect((c as FakePopupSwitchMenuItem).state).toBe(false);
    expect(c.label.text).toBe("C2");
  });

  it("renders QuickSettings indicators, toggles, sliders, and menu toggles", () => {
    const container = new FakeActor("Root");
    const root = createGnomeShellRoot(container, createToolkit(), { eventStopValue: "STOP" });
    const onToggle = vi.fn();
    const onSliderChanged = vi.fn();

    root.render(
      <SystemIndicator>
        <QuickToggle
          checked
          iconName="selection-mode-symbolic"
          iconSize={16}
          onToggled={onToggle}
          subtitle="Running"
          title="Containers"
          toggleMode
        />
        <QuickSlider iconLabel="Load" iconName="speedometer-symbolic" signals={{ "notify::value": onSliderChanged }} value={0.4} />
        <QuickMenuToggle iconName="view-list-symbolic" open title="Actions" toggleMode>
          <PopupMenuItem>Open Dashboard</PopupMenuItem>
        </QuickMenuToggle>
      </SystemIndicator>,
    );

    const indicator = container.children[0].shellObject as FakeSystemIndicator;
    expect(indicator.objectType).toBe("SystemIndicator");
    expect(indicator.quickSettingsItems.map((item) => item.objectType)).toEqual([
      "QuickToggle",
      "QuickSlider",
      "QuickMenuToggle",
    ]);

    const toggle = indicator.quickSettingsItems[0] as FakeQuickToggle;
    expect(toggle.title).toBe("Containers");
    expect(toggle.subtitle).toBe("Running");
    expect(toggle.checked).toBe(true);
    expect(toggle.iconName).toBe("selection-mode-symbolic");
    expect(toggle.iconSize).toBe(16);
    expect(toggle.style_class).toBe("quick-toggle react-linux-quick-toggle");
    toggle.checked = false;
    expect(toggle.emit("notify::checked")).toEqual(["STOP"]);
    expect(onToggle).toHaveBeenCalledWith({ actor: toggle, event: false, signal: "notify::checked" });

    const slider = indicator.quickSettingsItems[1] as FakeQuickSlider;
    expect(slider.slider.value).toBe(0.4);
    slider.emit("notify::value", 0.5);
    expect(onSliderChanged).toHaveBeenCalledWith(slider, 0.5);

    const menuToggle = indicator.quickSettingsItems[2] as FakeQuickMenuToggle;
    expect(menuToggle.title).toBe("Actions");
    expect(menuToggle.menu.items[0].label.text).toBe("Open Dashboard");
  });

  it("updates and reorders QuickSettings items without linking to the app", () => {
    const container = new FakeActor("Root");
    const root = createGnomeShellRoot(container, createToolkit());

    root.render(
      <SystemIndicator>
        <QuickToggle key="a" title="A" />
        <QuickSlider key="b" value={0.2} />
        <QuickToggle key="c" checked title="C" />
      </SystemIndicator>,
    );

    const indicator = container.children[0].shellObject as FakeSystemIndicator;
    const [a, b, c] = indicator.quickSettingsItems;

    root.render(
      <SystemIndicator>
        <QuickToggle key="c" checked={false} title="C2" />
        <QuickToggle key="a" title="A2" />
      </SystemIndicator>,
    );

    expect(indicator.quickSettingsItems).toEqual([c, a]);
    expect(a.destroyed).toBe(false);
    expect(c.destroyed).toBe(false);
    expect(b.destroyed).toBe(true);
    expect((a as FakeQuickToggle).title).toBe("A2");
    expect((c as FakeQuickToggle).checked).toBe(false);
  });
});
