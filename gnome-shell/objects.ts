import type { ReactLinuxProps } from "../adapter";
import { componentFamilyFor } from "../descriptors/registry";
import { actorForObject } from "./actors";
import { popupObjectNameFor, quickSettingsObjectNameFor, widgetNameFor } from "./intrinsics";
import { classNameFor, popupParamsFor, quickSettingsParamsFor, textValueFor } from "./props";
import type {
  CreateStAdapterOptions,
  GnomeShellActor,
  GnomeShellObject,
  GnomeShellToolkit,
  ShellObjectConstructor,
} from "./types";

function initialStProps(type: string, props: ReactLinuxProps, options: CreateStAdapterOptions) {
  const actorProps: Record<string, unknown> = {
    style_class: classNameFor(type, props, options),
    visible: props.hidden !== true,
  };

  if (typeof props.style === "string") {
    actorProps.style = props.style;
  }

  switch (widgetNameFor(type)) {
    case "BoxLayout":
      actorProps.vertical =
        props.flexDirection === "column" || (props.flexDirection === undefined && props.vertical === true);
      break;
    case "Button":
      actorProps.can_focus = props.canFocus ?? true;
      actorProps.label = textValueFor(type, props);
      actorProps.reactive = true;
      break;
    case "Entry":
      actorProps.text = textValueFor(type, props);
      actorProps.can_focus = props.canFocus ?? true;
      actorProps.reactive = props.reactive ?? true;
      actorProps.hint_text = props.hintText ?? props.placeholder ?? "";
      break;
    case "Icon":
      actorProps.icon_name = props.iconName ?? props.icon_name;
      break;
    case "Label":
      actorProps.text = textValueFor(type, props);
      break;
  }

  return actorProps;
}

function createActor(
  type: string,
  props: ReactLinuxProps,
  toolkit: GnomeShellToolkit,
  options: CreateStAdapterOptions,
) {
  const widgetName = widgetNameFor(type);
  const Constructor = toolkit.St[widgetName];
  if (!Constructor) {
    throw new Error(`Unsupported or unavailable GNOME Shell St widget: ${widgetName}`);
  }
  return new Constructor(initialStProps(type, props, options));
}

function createPopupObject(
  type: string,
  props: ReactLinuxProps,
  toolkit: GnomeShellToolkit,
  options: CreateStAdapterOptions,
): GnomeShellObject {
  const PopupMenu = toolkit.PopupMenu;
  if (!PopupMenu) {
    throw new Error("PopupMenu toolkit was not provided to react-linux");
  }

  const objectName = popupObjectNameFor(type);
  const Constructor = PopupMenu[objectName] as ShellObjectConstructor | undefined;
  if (!Constructor) {
    throw new Error(`Unsupported or unavailable GNOME Shell PopupMenu object: ${objectName}`);
  }

  if (Array.isArray(props.constructorArgs)) {
    return new Constructor(...props.constructorArgs);
  }

  const text = textValueFor(type, props);
  const params = popupParamsFor(props, options);

  switch (objectName) {
    case "PopupBaseMenuItem":
      return new Constructor(params);
    case "PopupImageMenuItem":
      return new Constructor(text, props.icon ?? props.iconName ?? "", params);
    case "PopupMenu":
      return new Constructor(props.sourceActor, props.arrowAlignment ?? 0, props.arrowSide);
    case "PopupMenuItem":
      return new Constructor(text, params);
    case "PopupMenuSection":
      return new Constructor();
    case "PopupSeparatorMenuItem":
      return new Constructor(text);
    case "PopupSubMenuMenuItem":
      return new Constructor(text, props.wantsIcon === true);
    case "PopupSwitchMenuItem":
      return new Constructor(text, props.active ?? props.checked ?? false, params);
    default:
      return new Constructor(params);
  }
}

function createQuickSettingsObject(
  type: string,
  props: ReactLinuxProps,
  toolkit: GnomeShellToolkit,
  options: CreateStAdapterOptions,
): GnomeShellObject {
  const QuickSettings = toolkit.QuickSettings;
  if (!QuickSettings) {
    throw new Error("QuickSettings toolkit was not provided to react-linux");
  }

  const objectName = quickSettingsObjectNameFor(type);
  const Constructor = QuickSettings[objectName] as ShellObjectConstructor | undefined;
  if (!Constructor) {
    throw new Error(`Unsupported or unavailable GNOME Shell QuickSettings object: ${objectName}`);
  }

  if (Array.isArray(props.constructorArgs)) {
    return new Constructor(...props.constructorArgs);
  }

  if (objectName === "SystemIndicator") {
    return new Constructor();
  }

  return new Constructor(quickSettingsParamsFor(type, props, options));
}

export function createShellObject(
  type: string,
  props: ReactLinuxProps,
  toolkit: GnomeShellToolkit,
  options: CreateStAdapterOptions,
): { actor: GnomeShellActor; object: GnomeShellObject } {
  const family = componentFamilyFor(type);
  if (family === "popup") {
    const object = createPopupObject(type, props, toolkit, options);
    return { actor: actorForObject(object), object };
  }
  if (family === "quick") {
    const object = createQuickSettingsObject(type, props, toolkit, options);
    return { actor: actorForObject(object), object };
  }

  const actor = createActor(type, props, toolkit, options);
  return { actor, object: actor as GnomeShellObject };
}
