import { propsWithoutChildren, type ReactLinuxProps } from "../adapter";
import { componentFamilyFor } from "../descriptors/registry";
import { isPopupType, popupObjectNameFor, widgetNameFor } from "./intrinsics";
import { applyLayoutProps } from "./layout";
import { classNameFor, numericProp, passthroughPropsFor, quickSettingsParamsFor, textValueFor } from "./props";
import { applySignalProps } from "./signals";
import { setActorVisible } from "./tree";
import type { CreateStAdapterOptions, GnomeShellActor, GnomeShellElement, GnomeShellObject } from "./types";

function setStyleClass(actor: GnomeShellActor, styleClass: string): void {
  if (actor.set_style_class_name) {
    actor.set_style_class_name(styleClass);
    return;
  }
  actor.style_class = styleClass;
}

export function setObjectLabelText(object: GnomeShellObject, text: string): void {
  const label = object.label;
  if (label && typeof label === "object") {
    (label as { text?: string }).text = text;
  }
}

type EditableTextActor = GnomeShellActor & {
  set_activatable?: (value: boolean) => void;
  set_editable?: (value: boolean) => void;
  set_selectable?: (value: boolean) => void;
  set_single_line_mode?: (value: boolean) => void;
  set_text?: (value: string) => void;
};

function setBooleanProp(
  target: EditableTextActor,
  prop: string,
  setter: keyof EditableTextActor,
  value: boolean,
): void {
  const method = target[setter];
  if (typeof method === "function") {
    method.call(target, value);
    return;
  }
  target[prop] = value;
}

function applyEntryTextProps(actor: GnomeShellActor, props: ReactLinuxProps): void {
  const text = textValueFor("st:Entry", props);
  const hintText = props.hintText ?? props.placeholder ?? "";
  const clutterText = actor.get_clutter_text?.() as EditableTextActor | undefined;

  actor.text = text;
  actor.can_focus = props.canFocus ?? true;
  actor.reactive = props.reactive ?? true;
  actor.hint_text = hintText;

  if (!clutterText) {
    return;
  }

  if (typeof clutterText.set_text === "function") {
    clutterText.set_text(text);
  } else {
    clutterText.text = text;
  }
  setBooleanProp(clutterText, "editable", "set_editable", props.editable ?? true);
  setBooleanProp(clutterText, "selectable", "set_selectable", props.selectable ?? true);
  setBooleanProp(clutterText, "single_line_mode", "set_single_line_mode", props.singleLineMode ?? true);
  setBooleanProp(clutterText, "activatable", "set_activatable", true);
}

function applyCommonProps(element: GnomeShellElement, props: ReactLinuxProps, options: CreateStAdapterOptions): void {
  Object.assign(element.object, passthroughPropsFor(element.type, props));
  setActorVisible(element.actor, props.hidden !== true);
  setStyleClass(element.actor, classNameFor(element.type, props, options));

  if (typeof props.style === "string") {
    element.actor.style = props.style;
  } else {
    element.actor.style = null;
  }

  element.actor.x_expand = props.xExpand ?? props.x_expand ?? false;
  element.actor.y_expand = props.yExpand ?? props.y_expand ?? false;
  const widgetName = widgetNameFor(element.type);
  const hasInteractiveHandler =
    typeof props.onActivate === "function" ||
    typeof props.onClick === "function" ||
    typeof props.onToggled === "function";
  element.actor.reactive =
    props.reactive ??
    (widgetName === "Button" || widgetName === "Entry" || (isPopupType(element.type) && hasInteractiveHandler));
}

function applyQuickSettingsProps(
  element: GnomeShellElement,
  props: ReactLinuxProps,
  options: CreateStAdapterOptions,
): void {
  Object.assign(element.object, quickSettingsParamsFor(element.type, props, options));

  if ("checked" in props || "active" in props) {
    element.object.checked = props.checked ?? props.active;
  }
  if ("value" in props) {
    if (element.object.slider && typeof element.object.slider === "object") {
      (element.object.slider as { value?: number }).value = props.value;
    } else {
      element.object.value = props.value;
    }
  }
  if ("title" in props) {
    element.object.title = props.title;
  } else if (typeof props.children === "string" || typeof props.children === "number") {
    element.object.title = String(props.children);
  }
  if ("subtitle" in props) {
    element.object.subtitle = props.subtitle;
  }
  if ("iconName" in props || "iconSize" in props) {
    const icon = element.object.icon;
    if (icon && typeof icon === "object") {
      if ("iconName" in props) {
        (icon as { icon_name?: unknown }).icon_name = props.iconName;
      }
      if (typeof props.iconSize === "number") {
        const iconObject = icon as { icon_size?: unknown; set_icon_size?: (size: number) => void };
        if (typeof iconObject.set_icon_size === "function") {
          iconObject.set_icon_size(props.iconSize);
        } else {
          iconObject.icon_size = props.iconSize;
        }
      }
    } else if ("iconName" in element.object) {
      element.object.iconName = props.iconName;
    } else if ("icon_name" in element.object) {
      element.object.icon_name = props.iconName;
    }
    if (typeof props.iconSize === "number" && "iconSize" in element.object) {
      element.object.iconSize = props.iconSize;
    }
  }
  if ("iconLabel" in props) {
    const iconLabel = element.object.iconLabel;
    if (iconLabel && typeof iconLabel === "object") {
      (iconLabel as { text?: unknown }).text = props.iconLabel;
    } else if ("iconLabel" in element.object) {
      element.object.iconLabel = props.iconLabel;
    }
  }
}

function applyPopupProps(element: GnomeShellElement, props: ReactLinuxProps): void {
  setObjectLabelText(element.object, textValueFor(element.type, props));

  if (props.ornament !== undefined) {
    element.object.setOrnament?.(props.ornament);
  }
  if (popupObjectNameFor(element.type) === "PopupImageMenuItem") {
    element.object.setIcon?.(props.icon ?? props.iconName ?? "");
  }
  if (popupObjectNameFor(element.type) === "PopupSwitchMenuItem") {
    element.object.setToggleState?.(props.active ?? props.checked ?? false);
    if ("statusText" in props) {
      element.object.setStatusText?.(props.statusText ?? null);
    }
  }
  if (popupObjectNameFor(element.type) === "PopupSubMenuMenuItem" && typeof props.open === "boolean") {
    element.object.setSubmenuShown?.(props.open);
    if (props.open && typeof props.submenuHeight === "number" && element.object.menu?.actor) {
      element.object.menu.actor.height = props.submenuHeight;
      element.object.menu.actor.min_height = props.submenuHeight;
      element.object.menu.actor.style = `height: ${props.submenuHeight}px; min-height: ${props.submenuHeight}px;`;
    }
  }
}

function applyStProps(element: GnomeShellElement, props: ReactLinuxProps, options: CreateStAdapterOptions): void {
  switch (widgetNameFor(element.type)) {
    case "BoxLayout":
      element.actor.vertical =
        props.flexDirection === "column" || (props.flexDirection === undefined && props.vertical === true);
      break;
    case "Button":
      element.actor.label = textValueFor(element.type, props);
      element.actor.can_focus = props.canFocus ?? true;
      break;
    case "Entry":
      applyEntryTextProps(element.actor, props);
      break;
    case "Icon":
      element.actor.icon_name = props.iconName ?? props.icon_name ?? null;
      if (typeof props.iconSize === "number") {
        element.actor.icon_size = props.iconSize;
      }
      break;
    case "Label":
      element.actor.text = textValueFor(element.type, props);
      break;
  }

  if (element.type === "progress") {
    const max = numericProp(props.max, 1);
    const value = Math.max(0, Math.min(numericProp(props.value, 0), max));
    const percent = max <= 0 ? 0 : Math.round((value / max) * 100);
    const width = Math.max(1, Math.round(numericProp(props.width, numericProp(element.actor.width, 100))));
    const fillWidth = Math.round((width * percent) / 100);
    element.actor.width = width;
    if (element.progressFill) {
      element.progressFill.width = fillWidth;
      element.progressFill.style = `width: ${fillWidth}px;`;
    }
    element.actor.accessible_name = `${percent}%`;
  }
}

function applyTypeProps(element: GnomeShellElement, props: ReactLinuxProps, options: CreateStAdapterOptions): void {
  const family = componentFamilyFor(element.type);
  if (family === "quick") {
    applyQuickSettingsProps(element, props, options);
  } else if (family === "popup") {
    applyPopupProps(element, props);
  } else {
    applyStProps(element, props, options);
  }
}

export function applyProps(element: GnomeShellElement, props: ReactLinuxProps, options: CreateStAdapterOptions): void {
  applyCommonProps(element, props, options);
  applyTypeProps(element, props, options);
  applyLayoutProps(element, props, options);
  applySignalProps(element, props, options);
  element.props = propsWithoutChildren(props);
}
