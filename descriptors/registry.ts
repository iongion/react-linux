import type { ChildPolicy, ComponentDescriptor, ComponentFamily } from "./types";

function styleNameForNativeName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .toLowerCase();
}

function descriptor(
  family: ComponentFamily,
  nativeObjectName: string,
  options: {
    aliases?: readonly string[];
    childContainer?: ComponentDescriptor["childContainer"];
    childPolicy?: ChildPolicy;
    nativeStyleClass?: string | null;
    styleName?: string;
    type?: string;
  } = {},
): ComponentDescriptor {
  const prefix = family === "st" ? "st" : family;
  const type = options.type ?? `${prefix}:${nativeObjectName}`;

  return {
    aliases: options.aliases ?? [],
    childContainer: options.childContainer ?? "object",
    childPolicy:
      options.childPolicy ?? (family === "popup" ? "menuItems" : family === "quick" ? "quickSettingsItems" : "actor"),
    displayName: nativeObjectName,
    family,
    nativeObjectName,
    nativeStyleClass: options.nativeStyleClass ?? null,
    styleName: options.styleName ?? styleNameForNativeName(nativeObjectName),
    type,
  };
}

const BUILTIN_DESCRIPTORS = [
  descriptor("st", "Bin", { aliases: ["bin"] }),
  descriptor("st", "BoxLayout", { aliases: ["box", "boxLayout"] }),
  descriptor("st", "Button", { aliases: ["button"] }),
  descriptor("st", "DrawingArea", { aliases: ["drawingArea"] }),
  descriptor("st", "Entry", { aliases: ["entry"] }),
  descriptor("st", "Icon", { aliases: ["icon"] }),
  descriptor("st", "Label", { aliases: ["label"] }),
  descriptor("st", "ScrollBar", { aliases: ["scrollBar"] }),
  descriptor("st", "ScrollView", { aliases: ["scroll", "scrollView"] }),
  descriptor("st", "Widget", { aliases: ["widget"] }),
  descriptor("st", "Widget", { aliases: ["progress"], styleName: "progress", type: "progress" }),
  descriptor("st", "Widget", { aliases: ["separator"], styleName: "separator", type: "separator" }),

  descriptor("popup", "PopupBaseMenuItem", { aliases: ["popupBaseMenuItem"] }),
  descriptor("popup", "PopupImageMenuItem", {
    aliases: ["popupImageMenuItem"],
    nativeStyleClass: "popup-menu-item",
  }),
  descriptor("popup", "PopupMenu", { aliases: ["popupMenu"] }),
  descriptor("popup", "PopupMenuItem", { aliases: ["popupMenuItem"], nativeStyleClass: "popup-menu-item" }),
  descriptor("popup", "PopupMenuSection", { aliases: ["popupMenuSection"] }),
  descriptor("popup", "PopupSeparatorMenuItem", {
    aliases: ["popupSeparatorMenuItem"],
    nativeStyleClass: "popup-separator-menu-item",
  }),
  descriptor("popup", "PopupSubMenuMenuItem", {
    aliases: ["popupSubMenuMenuItem"],
    childContainer: "menu",
    nativeStyleClass: "popup-submenu-menu-item",
  }),
  descriptor("popup", "PopupSwitchMenuItem", {
    aliases: ["popupSwitchMenuItem"],
    nativeStyleClass: "popup-menu-item",
  }),

  descriptor("quick", "QuickMenuToggle", {
    aliases: ["quickMenuToggle"],
    childContainer: "menu",
    nativeStyleClass: "quick-toggle-has-menu",
  }),
  descriptor("quick", "QuickSettingsItem", { aliases: ["quickSettingsItem"] }),
  descriptor("quick", "QuickSlider", { aliases: ["quickSlider"], nativeStyleClass: "quick-slider" }),
  descriptor("quick", "QuickToggle", { aliases: ["quickToggle"], nativeStyleClass: "quick-toggle" }),
  descriptor("quick", "SystemIndicator", { aliases: ["systemIndicator"] }),
] as const;

const descriptorsByType = new Map<string, ComponentDescriptor>();
const aliases = new Map<string, string>();

export function registerComponentDescriptor(descriptor: ComponentDescriptor): void {
  descriptorsByType.set(descriptor.type, descriptor);
  aliases.set(descriptor.type, descriptor.type);
  for (const alias of descriptor.aliases) {
    aliases.set(alias, descriptor.type);
  }
}

for (const item of BUILTIN_DESCRIPTORS) {
  registerComponentDescriptor(item);
}

function fallbackDescriptor(type: string): ComponentDescriptor {
  if (type.startsWith("st:")) {
    const nativeObjectName = type.slice(3);
    return descriptor("st", nativeObjectName, { type });
  }
  if (type.startsWith("popup:")) {
    const nativeObjectName = type.slice(6);
    return descriptor("popup", nativeObjectName, { type });
  }
  if (type.startsWith("quick:")) {
    const nativeObjectName = type.slice(6);
    return descriptor("quick", nativeObjectName, { type });
  }
  return descriptor("st", type, { type });
}

export function resolveComponentDescriptor(type: string): ComponentDescriptor {
  const canonicalType = aliases.get(type) ?? type;
  return descriptorsByType.get(canonicalType) ?? fallbackDescriptor(canonicalType);
}

export function componentFamilyFor(type: string): ComponentFamily {
  return resolveComponentDescriptor(type).family;
}

export function componentChildPolicyFor(type: string): ChildPolicy {
  return resolveComponentDescriptor(type).childPolicy;
}

export function componentChildContainerFor(type: string): ComponentDescriptor["childContainer"] {
  return resolveComponentDescriptor(type).childContainer;
}

export function allComponentDescriptors(): ComponentDescriptor[] {
  return [...descriptorsByType.values()];
}
