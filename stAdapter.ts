import { propsWithoutChildren, type ReactLinuxAdapter } from "./adapter";
import { applyProps, setObjectLabelText } from "./gnome-shell/applyProps";
import { DEFAULT_BASE_STYLE_CLASS, isPopupType, widgetNameFor } from "./gnome-shell/intrinsics";
import { syncLayoutAround, syncLayoutSubtree } from "./gnome-shell/layout";
import { createShellObject } from "./gnome-shell/objects";
import {
  attachNode,
  clearContainer,
  destroyNode,
  detachNode,
  isShellNode,
  removeNodeFromParent,
  setActorVisible,
} from "./gnome-shell/tree";
import type {
  CreateStAdapterOptions,
  GnomeShellContainer,
  GnomeShellElement,
  GnomeShellNode,
  GnomeShellText,
  GnomeShellToolkit,
} from "./gnome-shell/types";

function asElement(value: GnomeShellElement | GnomeShellContainer | null): GnomeShellElement | null {
  return isShellNode(value) && value.kind === "element" ? value : null;
}

function syncChangedParent(
  parent: GnomeShellElement | GnomeShellContainer,
  child: GnomeShellNode,
  options: CreateStAdapterOptions,
): void {
  const parentElement = asElement(parent);
  if (parentElement) {
    syncLayoutAround(parentElement, options);
    return;
  }
  if (child.kind === "element") {
    syncLayoutAround(child, options);
  }
}

export type {
  CreateStAdapterOptions,
  GnomeShellActor,
  GnomeShellContainer,
  GnomeShellElement,
  GnomeShellNode,
  GnomeShellObject,
  GnomeShellText,
  GnomeShellToolkit,
} from "./gnome-shell/types";

export function createStAdapter(
  toolkit: GnomeShellToolkit,
  options: CreateStAdapterOptions = {},
): ReactLinuxAdapter<GnomeShellElement, GnomeShellText, GnomeShellContainer> {
  const rootChildren = new WeakMap<GnomeShellContainer, GnomeShellNode[]>();
  const resolvedOptions: CreateStAdapterOptions = {
    ...options,
    alignValues:
      options.alignValues ??
      (toolkit.Clutter?.ActorAlign?.CENTER !== undefined &&
      toolkit.Clutter.ActorAlign.END !== undefined &&
      toolkit.Clutter.ActorAlign.FILL !== undefined &&
      toolkit.Clutter.ActorAlign.START !== undefined
        ? {
            center: toolkit.Clutter.ActorAlign.CENTER,
            end: toolkit.Clutter.ActorAlign.END,
            fill: toolkit.Clutter.ActorAlign.FILL,
            start: toolkit.Clutter.ActorAlign.START,
          }
        : undefined),
    orientationValues:
      options.orientationValues ??
      (toolkit.Clutter?.Orientation?.HORIZONTAL !== undefined && toolkit.Clutter.Orientation.VERTICAL !== undefined
        ? {
            horizontal: toolkit.Clutter.Orientation.HORIZONTAL,
            vertical: toolkit.Clutter.Orientation.VERTICAL,
          }
        : undefined),
  };

  return {
    createInstance(type, props) {
      const { actor, object } = createShellObject(type, props, toolkit, resolvedOptions);
      const element: GnomeShellElement = {
        actorSignalIds: [],
        kind: "element",
        actor,
        children: [],
        layoutDirty: true,
        layoutStyle: {},
        needsLayoutSolver: false,
        object,
        parent: null,
        props: propsWithoutChildren(props),
        signalIds: [],
        type,
      };

      if (type === "progress") {
        element.progressFill = new toolkit.St.Widget({
          style_class: `${resolvedOptions.baseStyleClass ?? DEFAULT_BASE_STYLE_CLASS}-progress-fill`,
        });
        element.actor.add_child?.(element.progressFill);
      }

      applyProps(element, props, resolvedOptions);
      syncLayoutSubtree(element, resolvedOptions);
      return element;
    },

    createText(text) {
      return {
        kind: "text",
        actor: new toolkit.St.Label({
          style_class: `${resolvedOptions.baseStyleClass ?? DEFAULT_BASE_STYLE_CLASS}-text`,
          text,
        }),
        parent: null,
        signalIds: [],
        text,
      };
    },

    appendChild(parent, child) {
      attachNode(parent, child, rootChildren);
      syncChangedParent(parent, child, resolvedOptions);
    },

    insertBefore(parent, child, before) {
      attachNode(parent, child, rootChildren, before);
      syncChangedParent(parent, child, resolvedOptions);
    },

    removeChild(parent, child) {
      removeNodeFromParent(parent, child, rootChildren);
      const parentElement = asElement(parent);
      if (parentElement) {
        syncLayoutAround(parentElement, resolvedOptions);
      }
    },

    clearContainer(container) {
      clearContainer(container, rootChildren);
    },

    commitUpdate(node, _type, _prevProps, nextProps) {
      applyProps(node, nextProps, resolvedOptions);
      syncLayoutAround(node, resolvedOptions);
    },

    resetTextContent(node) {
      for (const child of [...node.children]) {
        if (child.kind !== "text") {
          continue;
        }
        const index = node.children.indexOf(child);
        if (index >= 0) {
          node.children.splice(index, 1);
        }
        detachNode(child, rootChildren);
        destroyNode(child);
      }
      if (widgetNameFor(node.type) === "Label") {
        node.actor.text = "";
      }
      if (widgetNameFor(node.type) === "Button") {
        node.actor.label = "";
      }
      if (isPopupType(node.type)) {
        setObjectLabelText(node.object, "");
      }
      syncLayoutAround(node, resolvedOptions);
    },

    setText(textNode, text) {
      textNode.text = text;
      textNode.actor.text = text;
      const parentElement = asElement(textNode.parent);
      if (parentElement) {
        syncLayoutAround(parentElement, resolvedOptions);
      }
    },

    setVisible(node, visible) {
      setActorVisible(node.actor, visible);
    },

    getPublicInstance(node) {
      return node.object;
    },
  };
}
