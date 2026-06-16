import { createElement, type ReactElement, type Ref } from "react";

import type { ReactLinuxProps } from "./adapter";

export interface ReactLinuxHostProps extends ReactLinuxProps {
  ref?: Ref<unknown>;
}

export interface GenericStWidgetProps extends ReactLinuxHostProps {
  widget: string;
}

export interface GenericPopupMenuObjectProps extends ReactLinuxHostProps {
  object: string;
}

export interface GenericQuickSettingsObjectProps extends ReactLinuxHostProps {
  object: string;
}

type ReactLinuxPrimitive = (props: ReactLinuxHostProps) => ReactElement;

export function createHostComponent(type: string): ReactLinuxPrimitive {
  function ReactLinuxPrimitive(props: ReactLinuxHostProps) {
    return createElement(type, props);
  }

  ReactLinuxPrimitive.displayName = type;
  return ReactLinuxPrimitive;
}

export function createStComponent(widget: string): ReactLinuxPrimitive {
  return createHostComponent(`st:${widget}`);
}

export function createPopupMenuComponent(object: string): ReactLinuxPrimitive {
  return createHostComponent(`popup:${object}`);
}

export function createQuickSettingsComponent(object: string): ReactLinuxPrimitive {
  return createHostComponent(`quick:${object}`);
}

export function StWidget({ widget, ...props }: GenericStWidgetProps) {
  return createElement(`st:${widget}`, props);
}

export function PopupMenuObject({ object, ...props }: GenericPopupMenuObjectProps) {
  return createElement(`popup:${object}`, props);
}

export function QuickSettingsObject({ object, ...props }: GenericQuickSettingsObjectProps) {
  return createElement(`quick:${object}`, props);
}

export const Bin = createStComponent("Bin");
export const BoxLayout = createStComponent("BoxLayout");
export const Button = createStComponent("Button");
export const DrawingArea = createStComponent("DrawingArea");
export const Entry = createStComponent("Entry");
export const Icon = createStComponent("Icon");
export const Label = createStComponent("Label");
export const ScrollBar = createStComponent("ScrollBar");
export const ScrollView = createStComponent("ScrollView");
export const Widget = createStComponent("Widget");

export const Box = BoxLayout;
export const Progress = createHostComponent("progress");
export const Scroll = ScrollView;
export const Separator = createHostComponent("separator");

export const PopupBaseMenuItem = createPopupMenuComponent("PopupBaseMenuItem");
export const PopupImageMenuItem = createPopupMenuComponent("PopupImageMenuItem");
export const PopupMenu = createPopupMenuComponent("PopupMenu");
export const PopupMenuItem = createPopupMenuComponent("PopupMenuItem");
export const PopupMenuSection = createPopupMenuComponent("PopupMenuSection");
export const PopupSeparatorMenuItem = createPopupMenuComponent("PopupSeparatorMenuItem");
export const PopupSubMenuMenuItem = createPopupMenuComponent("PopupSubMenuMenuItem");
export const PopupSwitchMenuItem = createPopupMenuComponent("PopupSwitchMenuItem");

export const QuickMenuToggle = createQuickSettingsComponent("QuickMenuToggle");
export const QuickSettingsItem = createQuickSettingsComponent("QuickSettingsItem");
export const QuickSlider = createQuickSettingsComponent("QuickSlider");
export const QuickToggle = createQuickSettingsComponent("QuickToggle");
export const SystemIndicator = createQuickSettingsComponent("SystemIndicator");
