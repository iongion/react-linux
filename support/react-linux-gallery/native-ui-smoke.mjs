#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const DEST = "org.gnome.Shell";
const IFACE = "org.react_linux.ReactLinuxGallery";
const OBJECT_PATH = "/org/react_linux/ReactLinuxGallery";
const SHELL_PATTERN = "[g]nome-shell --devkit.*wayland-display=react-linux-gallery";

function fail(message) {
  throw new Error(message);
}

function shell(command, options = {}) {
  return execFileSync("bash", ["-lc", command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function privateBusAddress() {
  const pid = shell(`pgrep -f "${SHELL_PATTERN}" | head -1`);
  if (!pid) {
    fail("No visible react-linux GNOME Shell devkit process is running.");
  }

  const env = readFileSync(`/proc/${pid}/environ`, "utf8").split("\0");
  const bus = env.find((entry) => entry.startsWith("DBUS_SESSION_BUS_ADDRESS="));
  if (!bus) {
    fail(`GNOME Shell devkit process ${pid} has no private DBus session address.`);
  }

  return bus.slice("DBUS_SESSION_BUS_ADDRESS=".length);
}

function callMethod(bus, method, args = []) {
  return execFileSync(
    "gdbus",
    [
      "call",
      "--session",
      "--dest",
      DEST,
      "--object-path",
      OBJECT_PATH,
      "--method",
      `${IFACE}.${method}`,
      ...args.map(String),
    ],
    {
      encoding: "utf8",
      env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: bus },
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
}

function parseDump(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("('") || !trimmed.endsWith("',)")) {
    fail(`Unexpected gdbus Dump response: ${trimmed.slice(0, 120)}`);
  }

  return JSON.parse(trimmed.slice(2, -3).replaceAll("\\'", "'").replaceAll("\\\\", "\\"));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function visit(node, visitor, path = "root") {
  if (!node) {
    return;
  }
  visitor(node, path);
  for (const [index, child] of (node.children ?? []).entries()) {
    visit(child, visitor, `${path}.${index}`);
  }
}

function allNodes(tree, predicate) {
  const nodes = [];
  visit(tree, (node, path) => {
    if (predicate(node)) {
      nodes.push({ ...node, path });
    }
  });
  return nodes;
}

function classList(node) {
  return String(node.styleClass ?? "")
    .split(/\s+/)
    .filter(Boolean);
}

function hasClass(node, name) {
  return classList(node).includes(name);
}

function requireOne(tree, predicate, description) {
  const matches = allNodes(tree, predicate);
  if (matches.length !== 1) {
    fail(`Expected exactly one ${description}, found ${matches.length}.`);
  }
  return matches[0];
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function assertInside(child, parent, description) {
  assert(child.x >= 0, `${description} has negative x (${child.x}).`);
  assert(child.y >= 0, `${description} has negative y (${child.y}).`);
  assert(child.x + child.width <= parent.width + 2, `${description} overflows parent width.`);
  assert(child.y + child.height <= parent.height + 2, `${description} overflows parent height.`);
}

function assertPopupRows(tree) {
  const popupList = requireOne(tree, (node) => hasClass(node, "popup-list"), "popup list");
  const menuRows = allNodes(tree, (node) => {
    const classes = classList(node);
    return (
      classes.includes("react-linux-popup-menu-item") ||
      classes.includes("react-linux-popup-image-menu-item") ||
      classes.includes("react-linux-popup-switch-menu-item") ||
      classes.includes("react-linux-popup-sub-menu-menu-item")
    );
  }).sort((a, b) => a.y - b.y);

  assert(menuRows.length >= 5, `Expected at least five popup rows, found ${menuRows.length}.`);
  for (const row of menuRows) {
    assert(row.width >= 290, `${row.styleClass} row width collapsed to ${row.width}.`);
    assert(row.height >= 48, `${row.styleClass} row height collapsed to ${row.height}.`);
    assert(row.reactive === true, `${row.styleClass} row is not reactive.`);
    assert(row.width <= popupList.width + 2, `${row.styleClass} row overflows popup list width.`);
  }

  const submenu = requireOne(tree, (node) => hasClass(node, "react-linux-popup-sub-menu-menu-item"), "submenu row");
  assert(submenu.height >= 48, `Submenu row collapsed to ${submenu.height}px.`);
}

function assertPerformanceMonitor(dump) {
  const performance = dump.performance;
  assert(Boolean(performance), "Performance monitor metrics are missing from the native dump.");
  assert(performance.measuring === true, "Performance monitor is not marked as measuring.");
  assert(performance.samples >= 1, `Performance monitor has not sampled yet: ${JSON.stringify(performance)}.`);
  assert(Number.isFinite(performance.uiFps), `UI FPS is not finite: ${JSON.stringify(performance)}.`);
  assert(Number.isFinite(performance.jsFps), `JS FPS is not finite: ${JSON.stringify(performance)}.`);
  assert(performance.uiFps >= 0, `UI FPS is negative: ${JSON.stringify(performance)}.`);
  assert(performance.jsFps >= 0, `JS FPS is negative: ${JSON.stringify(performance)}.`);
  assert(performance.uiFrames >= 0, `UI frame count is negative: ${JSON.stringify(performance)}.`);
  assert(performance.jsFrames >= 0, `JS frame count is negative: ${JSON.stringify(performance)}.`);
  assert(performance.sampleMs >= 500, `Performance sample was too short: ${JSON.stringify(performance)}.`);
  assert(
    typeof performance.label === "string" && performance.label.includes("UI") && performance.label.includes("JS"),
    `Performance label is not usable: ${JSON.stringify(performance)}.`,
  );
  assert(
    dump.performanceText === performance.label,
    `Rendered performance text ${JSON.stringify(dump.performanceText)} does not match metrics label ${JSON.stringify(
      performance.label,
    )}.`,
  );
  assert(
    allNodes(dump.indicator, (node) => node.text === performance.label).length > 0,
    `Performance label ${JSON.stringify(performance.label)} is missing from the indicator actor tree.`,
  );
}

function assertStepButtons(tree) {
  const buttons = allNodes(tree, (node) => hasClass(node, "progress-step-button")).sort((a, b) => a.x - b.x);
  assert(buttons.length === 2, `Expected two progress step buttons, found ${buttons.length}.`);
  const buttonRow = requireOne(
    tree,
    (node) =>
      hasClass(node, "react-linux-box-layout") &&
      (node.children ?? []).filter((child) => hasClass(child, "progress-step-button")).length === 2,
    "progress step button row",
  );
  assert(buttonRow.width >= 116, `Progress step button row width collapsed to ${buttonRow.width}.`);
  assert(
    buttonRow.style === "spacing: 8px;",
    `Progress step button row spacing changed to ${JSON.stringify(buttonRow.style)}.`,
  );
  assert(
    buttons.every((button) => button.width === 54),
    "Progress step button width changed.",
  );
  assert(
    buttons.every((button) => button.height === 54),
    "Progress step button height changed.",
  );
  return {
    buttonHeights: buttons.map((button) => button.height),
    buttonWidths: buttons.map((button) => button.width),
    rowStyle: buttonRow.style,
    rowWidth: buttonRow.width,
  };
}

function assertSubmenuContent(tree) {
  const submenuScroll = requireOne(tree, (node) => hasClass(node, "popup-sub-menu"), "open submenu content");
  assert(submenuScroll.visible === true, "Submenu content is not visible.");
  assert(submenuScroll.height >= 48, `Submenu content collapsed to ${submenuScroll.height}px.`);
  assert(
    allNodes(submenuScroll, (node) => node.text === "Nested item").length > 0,
    "Submenu content does not include Nested item.",
  );
}

function assertQuickMenu(tree) {
  const quickList = requireOne(tree, (node) => hasClass(node, "quick-list"), "quick list");
  const quickMenu = requireOne(tree, (node) => hasClass(node, "react-linux-quick-menu-toggle"), "quick menu toggle");
  assert(quickMenu.height >= 52, `Quick menu toggle collapsed to ${quickMenu.height}px.`);
  assertInside(quickMenu, quickList, "quick menu toggle");

  const children = allNodes(
    quickMenu,
    (node) => hasClass(node, "quick-toggle") || hasClass(node, "quick-toggle-menu-button"),
  );
  const toggle = children.find((node) => hasClass(node, "quick-toggle"));
  const menuButton = children.find((node) => hasClass(node, "quick-toggle-menu-button"));
  assert(toggle, "Quick menu missing main toggle child.");
  assert(menuButton, "Quick menu missing menu button child.");
  assert(toggle.width + menuButton.width <= quickMenu.width + 2, "Quick menu children overflow root width.");
}

function assertEntry(tree) {
  const entry = requireOne(tree, (node) => hasClass(node, "react-linux-entry"), "entry");
  assert(
    entry.text === "Editable from UI smoke",
    `Entry text did not update through native control; got ${JSON.stringify(entry.text)}.`,
  );
  assert(entry.height >= 40, `Entry height collapsed to ${entry.height}px.`);
}

function assertEventLog(tree) {
  const labels = allNodes(tree, (node) => hasClass(node, "react-linux-label"));
  assert(
    labels.some((node) => typeof node.text === "string" && node.text.startsWith("Submenu ")),
    "Event log did not record submenu activation.",
  );
}

function dumpLayout(bus) {
  return parseDump(callMethod(bus, "Dump"));
}

function assertBaseLayout(dump) {
  assert(dump.menuOpen === true, "Gallery menu is not open.");
  assertPerformanceMonitor(dump);
  assert(
    dump.tree.height <= dump.stage.height,
    `Gallery height ${dump.tree.height}px exceeds stage height ${dump.stage.height}px.`,
  );
  assert(
    dump.tree.width <= dump.stage.width,
    `Gallery width ${dump.tree.width}px exceeds stage width ${dump.stage.width}px.`,
  );

  assertEntry(dump.tree);
  const stepButtons = assertStepButtons(dump.tree);
  assertPopupRows(dump.tree);
  assertQuickMenu(dump.tree);
  return stepButtons;
}

async function waitForLayout(bus, assertion, description) {
  let lastError = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const dump = dumpLayout(bus);
      return { dump, value: assertion(dump) };
    } catch (error) {
      lastError = error;
      await sleep(150);
    }
  }
  throw new Error(`${description}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function assertSameGeometry(before, after, description) {
  assert(JSON.stringify(before) === JSON.stringify(after), `${description} changed progress step button geometry.`);
}

async function main() {
  const bus = privateBusAddress();
  const steps = [
    ["Open"],
    ["SetProgress", [35]],
    ["SetSlider", [0.35]],
    ["SetEntryText", ["Editable from UI smoke"]],
    ["SetSubmenuOpen", [false]],
  ];

  for (const [method, args = []] of steps) {
    callMethod(bus, method, args);
    await sleep(180);
  }

  const initial = await waitForLayout(bus, assertBaseLayout, "Initial native layout did not settle");

  callMethod(bus, "ProgressUp");
  await sleep(180);
  const afterProgress = await waitForLayout(bus, assertBaseLayout, "Native layout after ProgressUp did not settle");
  assertSameGeometry(initial.value, afterProgress.value, "ProgressUp");

  callMethod(bus, "SetSlider", [0.71]);
  await sleep(180);
  const afterSlider = await waitForLayout(bus, assertBaseLayout, "Native layout after SetSlider did not settle");
  assertSameGeometry(initial.value, afterSlider.value, "SetSlider");

  for (const method of ["ActivatePopupOpen", "TogglePopupSwitch", "ToggleSubmenu"]) {
    callMethod(bus, method);
    await sleep(180);
  }

  await waitForLayout(
    bus,
    (dump) => {
      const stepButtons = assertBaseLayout(dump);
      assertEventLog(dump.tree);
      assertSubmenuContent(dump.tree);
      return stepButtons;
    },
    "Interactive native layout did not settle",
  );

  console.log("Native GNOME UI smoke passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
