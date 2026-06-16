import type { ReactLinuxLayoutEventHandler, ReactLinuxProps } from "../adapter";
import { componentFamilyFor } from "../descriptors/registry";
import { createNativeLayoutPlan } from "../layout/nativeCapabilities";
import { solveYogaLayout } from "../layout/solver";
import type { LayoutLength, LayoutNodeInput, LayoutNodeResult, LayoutStyle } from "../layout/types";
import { widgetNameFor } from "./intrinsics";
import type { CreateStAdapterOptions, GnomeShellActor, GnomeShellElement, GnomeShellNode } from "./types";

const LAYOUT_PROP_NAMES = [
  "alignItems",
  "aspectRatio",
  "flexBasis",
  "flexDirection",
  "flexGrow",
  "flexShrink",
  "gap",
  "height",
  "justifyContent",
  "margin",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "marginTop",
  "maxHeight",
  "maxWidth",
  "minHeight",
  "minWidth",
  "padding",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "width",
] as const satisfies readonly (keyof LayoutStyle)[];

function isLayoutObject(value: unknown): value is LayoutStyle {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGnomeShellElement(value: unknown): value is GnomeShellElement {
  return typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "element";
}

function isPercent(value: unknown): value is `${number}%` {
  return typeof value === "string" && /^-?\d+(\.\d+)?%$/.test(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function resolveNumericLength(value: LayoutLength | undefined): number | undefined {
  return finiteNumber(value);
}

function setActorNumber(actor: GnomeShellActor, key: string, value: number | undefined): void {
  if (value === undefined) {
    return;
  }
  actor[key] = value;
}

function actorNumber(actor: GnomeShellActor, key: string): number | undefined {
  return finiteNumber(actor[key]);
}

function setBoxLayoutGap(actor: GnomeShellActor, gap: number | undefined): void {
  if (gap === undefined) {
    return;
  }

  const spacing = Math.max(0, gap);
  actor.spacing = spacing;

  const layoutManager = actor.layout_manager;
  if (layoutManager && typeof layoutManager === "object") {
    const manager = layoutManager as { set_spacing?: (value: number) => void; spacing?: number };
    if (typeof manager.set_spacing === "function") {
      manager.set_spacing(spacing);
      return;
    }
    manager.spacing = spacing;
  }
}

function styleWithLayoutGap(style: unknown, gap: number | undefined): string | null {
  const baseStyle = typeof style === "string" ? style.trim() : "";
  if (gap === undefined) {
    return baseStyle.length > 0 ? baseStyle : null;
  }

  const prefix = baseStyle.length > 0 ? `${baseStyle}${baseStyle.endsWith(";") ? "" : ";"} ` : "";
  return `${prefix}spacing: ${Math.max(0, gap)}px;`;
}

function setBoxLayoutDirection(
  actor: GnomeShellActor,
  direction: LayoutStyle["flexDirection"] | undefined,
  props: ReactLinuxProps,
  options: CreateStAdapterOptions,
): void {
  const vertical = direction === "column" || (direction === undefined && props.vertical === true);
  if (options.orientationValues) {
    actor.orientation = vertical ? options.orientationValues.vertical : options.orientationValues.horizontal;
    return;
  }
  actor.vertical = vertical;
}

function isNativeBoxLayout(element: GnomeShellElement): boolean {
  return componentFamilyFor(element.type) === "st" && widgetNameFor(element.type) === "BoxLayout";
}

function syncNativeBoxLayoutProps(
  element: GnomeShellElement,
  props: ReactLinuxProps,
  options: CreateStAdapterOptions,
): void {
  if (!isNativeBoxLayout(element)) {
    return;
  }

  setBoxLayoutDirection(element.actor, element.layoutStyle.flexDirection, props, options);
  setBoxLayoutGap(element.actor, element.layoutStyle.gap);
  element.actor.style = styleWithLayoutGap(props.style, element.layoutStyle.gap);
}

function alignValue(align: LayoutStyle["alignItems"], options: CreateStAdapterOptions): unknown {
  switch (align) {
    case "center":
      return options.alignValues?.center;
    case "flex-end":
      return options.alignValues?.end;
    case "flex-start":
      return options.alignValues?.start;
    case "stretch":
      return options.alignValues?.fill;
    default:
      return undefined;
  }
}

function explicitLayoutLength(style: LayoutStyle, key: "height" | "width"): boolean {
  return style[key] !== undefined;
}

function maybeFireLayout(element: GnomeShellElement, result: LayoutNodeResult): void {
  if (
    element.layoutResult &&
    element.layoutResult.x === result.x &&
    element.layoutResult.y === result.y &&
    element.layoutResult.width === result.width &&
    element.layoutResult.height === result.height
  ) {
    return;
  }

  element.layoutResult = result;
  const handler = element.props.onLayout as ReactLinuxLayoutEventHandler | undefined;
  handler?.({
    actor: element.actor,
    layout: {
      height: result.height,
      width: result.width,
      x: result.x,
      y: result.y,
    },
    signal: "layout",
  });
}

export function extractLayoutStyle(props: ReactLinuxProps): LayoutStyle {
  const style: LayoutStyle = isLayoutObject(props.layout) ? { ...props.layout } : {};

  for (const propName of LAYOUT_PROP_NAMES) {
    const value = props[propName];
    if (value !== undefined) {
      (style as Record<string, unknown>)[propName] = value;
    }
  }

  return style;
}

export function applyLayoutProps(
  element: GnomeShellElement,
  props: ReactLinuxProps,
  options: CreateStAdapterOptions,
): void {
  const style = extractLayoutStyle(props);
  const plan = createNativeLayoutPlan(style);

  element.layoutStyle = style;
  element.layoutPlan = plan;
  element.needsLayoutSolver = plan.requiresSolver;
  element.layoutDirty = true;

  setActorNumber(element.actor, "width", resolveNumericLength(style.width));
  setActorNumber(element.actor, "height", resolveNumericLength(style.height));
  setActorNumber(element.actor, "min_width", style.minWidth);
  setActorNumber(element.actor, "min_height", style.minHeight);
  setActorNumber(element.actor, "max_width", style.maxWidth);
  setActorNumber(element.actor, "max_height", style.maxHeight);
  setActorNumber(element.actor, "margin", style.margin);
  setActorNumber(element.actor, "margin_left", style.marginLeft);
  setActorNumber(element.actor, "margin_right", style.marginRight);
  setActorNumber(element.actor, "margin_top", style.marginTop);
  setActorNumber(element.actor, "margin_bottom", style.marginBottom);

  syncNativeBoxLayoutProps(element, props, options);

  element.actor.queue_relayout?.();
}

function parentDirection(parent: GnomeShellElement): "row" | "column" {
  return parent.layoutStyle.flexDirection ?? (parent.props.vertical === true ? "column" : "row");
}

function applyChildNativeLayout(
  parent: GnomeShellElement,
  child: GnomeShellNode,
  options: CreateStAdapterOptions,
): void {
  const direction = parentDirection(parent);
  const align = alignValue(parent.layoutStyle.alignItems, options);
  const childStyle = child.kind === "element" ? child.layoutStyle : {};
  const childProps = child.kind === "element" ? child.props : {};
  const flexGrow = finiteNumber(childStyle.flexGrow) ?? 0;
  const explicitXExpand = childProps.xExpand ?? childProps.x_expand ?? false;
  const explicitYExpand = childProps.yExpand ?? childProps.y_expand ?? false;

  if (direction === "row") {
    child.actor.x_expand = Boolean(explicitXExpand || flexGrow > 0);
    child.actor.y_expand = Boolean(
      explicitYExpand || (parent.layoutStyle.alignItems === "stretch" && !explicitLayoutLength(childStyle, "height")),
    );
    if (align !== undefined) {
      child.actor.y_align = align;
    }
    if (child.actor.x_align !== undefined && options.alignValues?.start !== undefined) {
      child.actor.x_align = options.alignValues.start;
    }
  } else {
    child.actor.y_expand = Boolean(explicitYExpand || flexGrow > 0);
    child.actor.x_expand = Boolean(
      explicitXExpand || (parent.layoutStyle.alignItems === "stretch" && !explicitLayoutLength(childStyle, "width")),
    );
    if (align !== undefined) {
      child.actor.x_align = align;
    }
    if (child.actor.y_align !== undefined && options.alignValues?.start !== undefined) {
      child.actor.y_align = options.alignValues.start;
    }
  }
}

function childForLayout(child: GnomeShellNode): LayoutNodeInput {
  if (child.kind === "text") {
    return {
      id: "text",
      measure: () => ({
        height: actorNumber(child.actor, "height") ?? 0,
        width: actorNumber(child.actor, "width") ?? 0,
      }),
    };
  }

  return {
    children: child.children.map(childForLayout),
    id: child.type,
    measure: () => ({
      height: actorNumber(child.actor, "height") ?? 0,
      width: actorNumber(child.actor, "width") ?? 0,
    }),
    style: child.layoutStyle,
  };
}

function solverConstraints(element: GnomeShellElement): { height: number; width: number } | null {
  const width = resolveNumericLength(element.layoutStyle.width);
  const height = resolveNumericLength(element.layoutStyle.height);

  if (width === undefined || height === undefined) {
    return null;
  }

  return { height, width };
}

function childNeedsSolver(child: GnomeShellNode): boolean {
  if (child.kind === "text") {
    return false;
  }

  const style = child.layoutStyle;
  return (
    child.needsLayoutSolver ||
    child.layoutPlan?.requiresSolver === true ||
    isPercent(style.width) ||
    isPercent(style.height) ||
    isPercent(style.flexBasis) ||
    (finiteNumber(style.flexGrow) ?? 0) > 1 ||
    (finiteNumber(style.flexShrink) ?? 1) > 1 ||
    style.flexBasis !== undefined ||
    style.aspectRatio !== undefined ||
    child.children.some(childNeedsSolver)
  );
}

function elementNeedsSolver(element: GnomeShellElement): boolean {
  return element.layoutPlan?.requiresSolver === true || element.children.some(childNeedsSolver);
}

function topmostLayoutElement(element: GnomeShellElement): GnomeShellElement {
  let current = element;
  while (isGnomeShellElement(current.parent)) {
    current = current.parent;
  }
  return current;
}

function applySolvedResult(node: GnomeShellNode, result: LayoutNodeResult): void {
  node.actor.x = result.x;
  node.actor.y = result.y;
  node.actor.width = result.width;
  node.actor.height = result.height;
  node.actor.queue_relayout?.();

  if (node.kind !== "element") {
    return;
  }

  maybeFireLayout(node, result);
  node.children.forEach((child, index) => {
    const childResult = result.children[index];
    if (childResult) {
      applySolvedResult(child, childResult);
    }
  });
}

export function syncLayoutSubtree(element: GnomeShellElement, options: CreateStAdapterOptions): void {
  syncNativeBoxLayoutProps(element, element.props, options);

  if (componentFamilyFor(element.type) === "st") {
    for (const child of element.children) {
      applyChildNativeLayout(element, child, options);
    }
  }

  for (const child of element.children) {
    if (child.kind === "element") {
      syncLayoutSubtree(child, options);
    }
  }

  const constraints = solverConstraints(element);
  const shouldSolve = constraints !== null && elementNeedsSolver(element);
  element.needsLayoutSolver = shouldSolve;
  if (!shouldSolve || constraints === null) {
    element.layoutDirty = false;
    return;
  }

  const result = solveYogaLayout(
    {
      children: element.children.map(childForLayout),
      id: element.type,
      style: element.layoutStyle,
    },
    constraints,
  );
  applySolvedResult(element, result);
  element.layoutDirty = false;
}

export function syncLayoutAround(element: GnomeShellElement, options: CreateStAdapterOptions): void {
  syncLayoutSubtree(topmostLayoutElement(element), options);
}
