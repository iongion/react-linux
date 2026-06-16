import type { ReactLinuxProps, StyleClassValue } from "../adapter";
import {
  DEFAULT_BASE_STYLE_CLASS,
  isPopupType,
  isQuickSettingsType,
  nativeStyleClassFor,
  styleNameFor,
  widgetNameFor,
} from "./intrinsics";
import type { CreateStAdapterOptions } from "./types";

const RESERVED_PROP_NAMES = new Set([
  "active",
  "alignItems",
  "arrowAlignment",
  "arrowSide",
  "aspectRatio",
  "checked",
  "children",
  "className",
  "constructorArgs",
  "editable",
  "flexBasis",
  "flexDirection",
  "flexGrow",
  "flexShrink",
  "gap",
  "height",
  "hidden",
  "hintText",
  "icon",
  "iconLabel",
  "iconSize",
  "justifyContent",
  "key",
  "layout",
  "margin",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "marginTop",
  "max",
  "maxHeight",
  "maxWidth",
  "minHeight",
  "minWidth",
  "object",
  "onActivate",
  "onClick",
  "onLayout",
  "onToggled",
  "open",
  "ornament",
  "padding",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "placeholder",
  "params",
  "position",
  "ref",
  "signals",
  "sourceActor",
  "statusText",
  "subtitle",
  "styleClass",
  "selectable",
  "singleLineMode",
  "submenuHeight",
  "title",
  "toggleMode",
  "value",
  "vertical",
  "widget",
  "wantsIcon",
  "width",
]);

export function isTextContent(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

export function normalizeClasses(value: StyleClassValue): string[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeClasses(item));
  }
  return value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function classNameFor(type: string, props: ReactLinuxProps, options: CreateStAdapterOptions): string {
  const base = options.baseStyleClass ?? DEFAULT_BASE_STYLE_CLASS;
  const classes = [
    nativeStyleClassFor(type),
    base ? `${base}-${styleNameFor(type)}` : null,
    ...normalizeClasses(props.styleClass),
    ...normalizeClasses(props.className),
  ].filter((item): item is string => typeof item === "string" && item.length > 0);
  return [...new Set(classes)].join(" ");
}

function camelToSnake(name: string): string {
  return name.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function shellPropName(name: string): string {
  switch (name) {
    case "canFocus":
      return "can_focus";
    case "iconName":
      return "icon_name";
    case "iconSize":
      return "icon_size";
    case "styleClass":
      return "style_class";
    case "xAlign":
      return "x_align";
    case "xExpand":
      return "x_expand";
    case "yAlign":
      return "y_align";
    case "yExpand":
      return "y_expand";
    default:
      return camelToSnake(name);
  }
}

function passthroughProps(props: ReactLinuxProps): Record<string, unknown> {
  const nextProps: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(props)) {
    if (RESERVED_PROP_NAMES.has(name) || typeof value === "function" || value === undefined) {
      continue;
    }
    nextProps[shellPropName(name)] = value;
  }
  return nextProps;
}

export function passthroughPropsFor(type: string, props: ReactLinuxProps): Record<string, unknown> {
  const nextProps = passthroughProps(props);
  if (isPopupType(type) || isQuickSettingsType(type)) {
    delete nextProps.icon_name;
    delete nextProps.iconName;
    delete nextProps.icon_label;
    delete nextProps.iconLabel;
    delete nextProps.icon_size;
    delete nextProps.iconSize;
    delete nextProps.label;
    delete nextProps.subtitle;
    delete nextProps.text;
    delete nextProps.title;
    delete nextProps.toggle_mode;
    delete nextProps.toggleMode;
  }
  return nextProps;
}

export function textValueFor(type: string, props: ReactLinuxProps): string {
  const widgetName = widgetNameFor(type);
  if (isTextContent(props.text)) {
    return String(props.text);
  }
  if (widgetName === "Button" && isTextContent(props.label)) {
    return String(props.label);
  }
  if (isTextContent(props.children)) {
    return String(props.children);
  }
  return "";
}

export function numericProp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function popupParamsFor(props: ReactLinuxProps, options: CreateStAdapterOptions): Record<string, unknown> {
  return {
    ...passthroughPropsFor("popupBaseMenuItem", props),
    ...(props.params ?? {}),
    style_class: classNameFor("popupBaseMenuItem", props, options),
  };
}

export function quickSettingsParamsFor(
  type: string,
  props: ReactLinuxProps,
  options: CreateStAdapterOptions,
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    ...passthroughPropsFor(type, props),
    ...(props.params ?? {}),
    style_class: classNameFor(type, props, options),
  };
  const checked = props.checked ?? props.active;
  const title = props.title ?? (isTextContent(props.children) ? String(props.children) : undefined);

  if (checked !== undefined) {
    params.checked = checked;
  }
  if (props.iconLabel !== undefined) {
    params.iconLabel = props.iconLabel;
  }
  if (props.iconName !== undefined) {
    params.iconName = props.iconName;
  }
  if (props.subtitle !== undefined) {
    params.subtitle = props.subtitle;
  }
  if (title !== undefined) {
    params.title = title;
  }
  if (props.toggleMode !== undefined) {
    params.toggleMode = props.toggleMode;
  }

  return params;
}
