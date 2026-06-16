import { componentChildContainerFor, componentChildPolicyFor } from "../descriptors/registry";
import type {
  GnomeShellActor,
  GnomeShellContainer,
  GnomeShellElement,
  GnomeShellNode,
  GnomeShellObject,
} from "./types";

export function isShellNode(value: unknown): value is GnomeShellNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    ((value as GnomeShellNode).kind === "element" || (value as GnomeShellNode).kind === "text")
  );
}

function isObjectWithActor(value: unknown): value is GnomeShellObject {
  return typeof value === "object" && value !== null && "actor" in value;
}

export function actorOf(value: GnomeShellNode | GnomeShellContainer): GnomeShellActor {
  if (isShellNode(value)) {
    return value.actor;
  }
  if (isObjectWithActor(value) && value.actor) {
    return value.actor;
  }
  return value as GnomeShellActor;
}

export function objectOf(value: GnomeShellNode | GnomeShellContainer): GnomeShellObject {
  if (isShellNode(value)) {
    return value.kind === "element" ? value.object : (value.actor as GnomeShellObject);
  }
  return value as GnomeShellObject;
}

function childContainerOf(value: GnomeShellElement | GnomeShellContainer): GnomeShellContainer {
  if (isShellNode(value)) {
    if (componentChildContainerFor(value.type) === "menu" && value.object.menu) {
      return value.object.menu;
    }
    return value.object;
  }
  return value;
}

export function actorChildren(actor: GnomeShellActor): GnomeShellActor[] {
  return actor.get_children?.() ?? [];
}

export function setActorVisible(actor: GnomeShellActor, visible: boolean): void {
  actor.visible = visible;
  if (visible) {
    actor.show?.();
    return;
  }
  actor.hide?.();
}

function addActor(parent: GnomeShellActor, child: GnomeShellActor): void {
  if (parent.add_child) {
    parent.add_child(child);
    return;
  }
  if (parent.add_actor) {
    parent.add_actor(child);
    return;
  }
  parent.set_child?.(child);
}

function insertActorBefore(parent: GnomeShellActor, child: GnomeShellActor, before: GnomeShellActor): void {
  const index = actorChildren(parent).indexOf(before);
  if (index < 0 || !parent.insert_child_at_index) {
    addActor(parent, child);
    return;
  }
  parent.insert_child_at_index(child, index);
}

function removeActor(parent: GnomeShellActor, child: GnomeShellActor): void {
  if (parent.remove_child) {
    parent.remove_child(child);
    return;
  }
  if (parent.set_child && actorChildren(parent).includes(child)) {
    parent.set_child(null);
  }
}

function childListOf(
  parent: GnomeShellElement | GnomeShellContainer,
  rootChildren?: WeakMap<GnomeShellContainer, GnomeShellNode[]>,
): GnomeShellNode[] {
  if (isShellNode(parent)) {
    return parent.children;
  }
  return rootChildren?.get(parent) ?? [];
}

function ensureStandaloneSubmenuHost(object: GnomeShellObject): void {
  const host = object as GnomeShellObject & {
    _openedSubMenu?: { close?: (animate?: boolean) => void; isOpen?: boolean } | null;
    _setOpenedSubMenu?: (submenu: unknown) => void;
  };

  if (typeof object.addMenuItem !== "function" || typeof host._setOpenedSubMenu === "function") {
    return;
  }

  host._setOpenedSubMenu = (submenu: unknown) => {
    if (!submenu) {
      host._openedSubMenu = null;
      return;
    }

    const nextSubmenu = submenu as { close?: (animate?: boolean) => void; isOpen?: boolean };
    if (host._openedSubMenu && host._openedSubMenu !== nextSubmenu && host._openedSubMenu.isOpen) {
      host._openedSubMenu.close?.(true);
    }
    host._openedSubMenu = nextSubmenu;
  };
}

function addShellObject(parent: GnomeShellContainer, child: GnomeShellNode, position?: number): void {
  const parentObject = objectOf(parent);
  const childPolicy = child.kind === "element" ? componentChildPolicyFor(child.type) : "actor";
  if (parentObject.quickSettingsItems && child.kind === "element" && childPolicy === "quickSettingsItems") {
    const safePosition = Math.max(
      0,
      Math.min(position ?? parentObject.quickSettingsItems.length, parentObject.quickSettingsItems.length),
    );
    parentObject.quickSettingsItems.splice(safePosition, 0, child.object);
    return;
  }
  if (parentObject.addMenuItem && child.kind === "element" && childPolicy === "menuItems") {
    ensureStandaloneSubmenuHost(parentObject);
    parentObject.addMenuItem(child.object, position);
    return;
  }
  addActor(actorOf(parent), child.actor);
}

function insertShellObjectBefore(
  parent: GnomeShellContainer,
  child: GnomeShellNode,
  before: GnomeShellNode,
  siblings: GnomeShellNode[],
): void {
  const parentObject = objectOf(parent);
  const beforeIndex = siblings.indexOf(before);
  const childPolicy = child.kind === "element" ? componentChildPolicyFor(child.type) : "actor";
  if (parentObject.quickSettingsItems && child.kind === "element" && childPolicy === "quickSettingsItems") {
    const safePosition = beforeIndex >= 0 ? beforeIndex : parentObject.quickSettingsItems.length;
    parentObject.quickSettingsItems.splice(safePosition, 0, child.object);
    return;
  }
  if (parentObject.addMenuItem && child.kind === "element" && childPolicy === "menuItems") {
    ensureStandaloneSubmenuHost(parentObject);
    parentObject.addMenuItem(child.object, beforeIndex >= 0 ? beforeIndex : undefined);
    return;
  }
  insertActorBefore(actorOf(parent), child.actor, before.actor);
}

function removeShellObject(parent: GnomeShellContainer, child: GnomeShellNode): void {
  const parentObject = objectOf(parent);
  const childPolicy = child.kind === "element" ? componentChildPolicyFor(child.type) : "actor";
  if (parentObject.quickSettingsItems && child.kind === "element" && childPolicy === "quickSettingsItems") {
    const index = parentObject.quickSettingsItems.indexOf(child.object);
    if (index >= 0) {
      parentObject.quickSettingsItems.splice(index, 1);
    }
    return;
  }
  if (parentObject.removeMenuItem && child.kind === "element" && childPolicy === "menuItems") {
    parentObject.removeMenuItem(child.object);
    return;
  }
  removeActor(actorOf(parent), child.actor);
}

function moveShellObjectBefore(
  parent: GnomeShellContainer,
  child: GnomeShellNode,
  before: GnomeShellNode,
  siblings: GnomeShellNode[],
): boolean {
  const parentObject = objectOf(parent);
  const childPolicy = child.kind === "element" ? componentChildPolicyFor(child.type) : "actor";
  if (parentObject.quickSettingsItems && child.kind === "element" && childPolicy === "quickSettingsItems") {
    const currentIndex = parentObject.quickSettingsItems.indexOf(child.object);
    if (currentIndex >= 0) {
      parentObject.quickSettingsItems.splice(currentIndex, 1);
    }
    const beforeIndex = siblings.indexOf(before);
    parentObject.quickSettingsItems.splice(
      beforeIndex >= 0 ? beforeIndex : parentObject.quickSettingsItems.length,
      0,
      child.object,
    );
    return true;
  }
  if (!parentObject.moveMenuItem || child.kind !== "element" || childPolicy !== "menuItems") {
    return false;
  }
  const beforeIndex = siblings.indexOf(before);
  parentObject.moveMenuItem(child.object, beforeIndex >= 0 ? beforeIndex : siblings.length);
  return true;
}

export function signalTargetOf(node: GnomeShellNode): GnomeShellObject | GnomeShellActor {
  return node.kind === "element" ? node.object : node.actor;
}

export function disconnectSignals(node: GnomeShellNode): void {
  for (const id of node.signalIds) {
    signalTargetOf(node).disconnect?.(id);
  }
  node.signalIds = [];
  if (node.kind === "element") {
    for (const id of node.actorSignalIds) {
      node.actor.disconnect?.(id);
    }
    node.actorSignalIds = [];
  }
}

export function destroyNode(node: GnomeShellNode): void {
  disconnectSignals(node);
  if (node.kind === "element") {
    for (const child of [...node.children]) {
      destroyNode(child);
    }
    node.children = [];
    node.object.destroy?.();
    return;
  }
  node.actor.destroy?.();
}

export function detachNode(child: GnomeShellNode, rootChildren: WeakMap<GnomeShellContainer, GnomeShellNode[]>): void {
  const parent = child.parent;
  if (!parent) {
    return;
  }
  const container = childContainerOf(parent);
  const siblings = childListOf(parent, rootChildren);
  const index = siblings.indexOf(child);
  if (index >= 0) {
    siblings.splice(index, 1);
  }
  removeShellObject(container, child);
  child.parent = null;
}

export function attachNode(
  parent: GnomeShellElement | GnomeShellContainer,
  child: GnomeShellNode,
  rootChildren: WeakMap<GnomeShellContainer, GnomeShellNode[]>,
  before?: GnomeShellNode,
): void {
  const container = childContainerOf(parent);
  const siblings = childListOf(parent, rootChildren);

  if (before && child.parent === parent && moveShellObjectBefore(container, child, before, siblings)) {
    const currentIndex = siblings.indexOf(child);
    if (currentIndex >= 0) {
      siblings.splice(currentIndex, 1);
    }
    const beforeIndex = siblings.indexOf(before);
    siblings.splice(beforeIndex >= 0 ? beforeIndex : siblings.length, 0, child);
    return;
  }

  detachNode(child, rootChildren);
  const nextSiblings = childListOf(parent, rootChildren);

  if (!isShellNode(parent) && !rootChildren.has(parent)) {
    rootChildren.set(parent, nextSiblings);
  }

  if (before) {
    insertShellObjectBefore(container, child, before, nextSiblings);
    const beforeIndex = nextSiblings.indexOf(before);
    nextSiblings.splice(beforeIndex >= 0 ? beforeIndex : nextSiblings.length, 0, child);
  } else {
    addShellObject(container, child, nextSiblings.length);
    nextSiblings.push(child);
  }

  child.parent = parent;
}

export function removeNodeFromParent(
  parent: GnomeShellElement | GnomeShellContainer,
  child: GnomeShellNode,
  rootChildren: WeakMap<GnomeShellContainer, GnomeShellNode[]>,
): void {
  const container = childContainerOf(parent);
  const siblings = childListOf(parent, rootChildren);
  const index = siblings.indexOf(child);
  if (index >= 0) {
    siblings.splice(index, 1);
  }
  removeShellObject(container, child);
  child.parent = null;
  destroyNode(child);
}

export function clearContainer(
  container: GnomeShellContainer,
  rootChildren: WeakMap<GnomeShellContainer, GnomeShellNode[]>,
): void {
  const trackedChildren = rootChildren.get(container) ?? [];
  for (const child of [...trackedChildren]) {
    removeShellObject(container, child);
    child.parent = null;
    destroyNode(child);
  }
  rootChildren.set(container, []);

  for (const childActor of actorChildren(actorOf(container))) {
    childActor.destroy?.();
  }
}
