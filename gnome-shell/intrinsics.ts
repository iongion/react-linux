import { componentFamilyFor, resolveComponentDescriptor } from "../descriptors/registry";

export const DEFAULT_BASE_STYLE_CLASS = "react-linux";

export function isPopupType(type: string): boolean {
  return componentFamilyFor(type) === "popup";
}

export function isQuickSettingsType(type: string): boolean {
  return componentFamilyFor(type) === "quick";
}

export function widgetNameFor(type: string): string {
  const descriptor = resolveComponentDescriptor(type);
  return descriptor.family === "st" ? descriptor.nativeObjectName : type;
}

export function popupObjectNameFor(type: string): string {
  const descriptor = resolveComponentDescriptor(type);
  return descriptor.family === "popup" ? descriptor.nativeObjectName : type;
}

export function quickSettingsObjectNameFor(type: string): string {
  const descriptor = resolveComponentDescriptor(type);
  return descriptor.family === "quick" ? descriptor.nativeObjectName : type;
}

export function styleNameFor(type: string): string {
  return resolveComponentDescriptor(type).styleName;
}

export function nativeStyleClassFor(type: string): string | null {
  return resolveComponentDescriptor(type).nativeStyleClass;
}
