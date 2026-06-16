import type { ReactNode } from "react";

import type { AlignItems, FlexDirection, JustifyContent, LayoutStyle } from "./layout/types";

export interface ReactLinuxEvent {
  actor: unknown;
  event?: unknown;
  signal: string;
}

export interface ReactLinuxLayoutEvent {
  actor: unknown;
  layout: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
  signal: "layout";
}

export type ReactLinuxEventHandler = (event: ReactLinuxEvent) => void;
export type ReactLinuxLayoutEventHandler = (event: ReactLinuxLayoutEvent) => void;
export type ReactLinuxSignalHandler = (...args: unknown[]) => unknown;

export type StyleClassValue = string | string[] | false | null | undefined;

export type ReactLinuxProps = Record<string, unknown> & {
  active?: boolean;
  alignItems?: AlignItems;
  arrowAlignment?: number;
  arrowSide?: unknown;
  aspectRatio?: number;
  checked?: boolean;
  children?: ReactNode;
  className?: StyleClassValue;
  constructorArgs?: unknown[];
  editable?: boolean;
  flexDirection?: FlexDirection;
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: LayoutStyle["flexBasis"];
  gap?: number;
  height?: LayoutStyle["height"];
  hidden?: boolean;
  hintText?: string;
  icon?: unknown;
  iconLabel?: string;
  iconName?: string;
  iconSize?: number;
  justifyContent?: JustifyContent;
  label?: string | number;
  layout?: LayoutStyle;
  margin?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  marginTop?: number;
  max?: number;
  maxHeight?: number;
  maxWidth?: number;
  minHeight?: number;
  minWidth?: number;
  onActivate?: ReactLinuxEventHandler;
  onClick?: ReactLinuxEventHandler;
  onLayout?: ReactLinuxLayoutEventHandler;
  onToggled?: ReactLinuxEventHandler;
  open?: boolean;
  ornament?: unknown;
  padding?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  placeholder?: string;
  params?: Record<string, unknown>;
  position?: number;
  signals?: Record<string, ReactLinuxSignalHandler>;
  sourceActor?: unknown;
  statusText?: string | null;
  style?: string;
  styleClass?: StyleClassValue;
  selectable?: boolean;
  singleLineMode?: boolean;
  submenuHeight?: number;
  text?: string | number;
  title?: string;
  toggleMode?: boolean;
  value?: number;
  vertical?: boolean;
  wantsIcon?: boolean;
  width?: LayoutStyle["width"];
};

export interface ReactLinuxAdapter<Node = unknown, Text = unknown, Container = Node> {
  createInstance(type: string, props: ReactLinuxProps): Node;
  createText(text: string): Text;
  appendChild(parent: Node | Container, child: Node | Text): void;
  insertBefore(parent: Node | Container, child: Node | Text, before: Node | Text): void;
  removeChild(parent: Node | Container, child: Node | Text): void;
  clearContainer(container: Container): void;
  commitUpdate(node: Node, type: string, prevProps: ReactLinuxProps, nextProps: ReactLinuxProps): void;
  resetTextContent(node: Node): void;
  setText(textNode: Text, text: string): void;
  setVisible(node: Node | Text, visible: boolean): void;
  getPublicInstance(node: Node): unknown;
}

export function propsWithoutChildren(props: ReactLinuxProps): ReactLinuxProps {
  const { children: _children, ...rest } = props;
  return rest;
}
