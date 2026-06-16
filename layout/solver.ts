import type {
  AlignItems,
  FlexDirection,
  LayoutConstraints,
  LayoutLength,
  LayoutNodeInput,
  LayoutNodeResult,
  LayoutRectangle,
  LayoutStyle,
  MeasuredSize,
} from "./types";

interface ResolvedBox {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

interface ChildLayoutInfo {
  basis: number;
  canStretchCross: boolean;
  crossSize: number;
  flexGrow: number;
  flexShrink: number;
  input: LayoutNodeInput;
  margin: ResolvedBox;
}

function isPercent(value: LayoutLength | undefined): value is `${number}%` {
  return typeof value === "string" && value.endsWith("%");
}

function percentValue(value: `${number}%`): number {
  return Number(value.slice(0, -1)) / 100;
}

function resolveLength(value: LayoutLength | undefined, parentSize: number): number | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (isPercent(value)) {
    return parentSize * percentValue(value);
  }
  return undefined;
}

function clamp(value: number, min = 0, max = Number.POSITIVE_INFINITY): number {
  return Math.max(min, Math.min(max, value));
}

function edgeInsets(style: LayoutStyle, prefix: "margin" | "padding"): ResolvedBox {
  if (prefix === "margin") {
    const all = style.margin ?? 0;
    return {
      bottom: style.marginBottom ?? all,
      left: style.marginLeft ?? all,
      right: style.marginRight ?? all,
      top: style.marginTop ?? all,
    };
  }

  const all = style.padding ?? 0;
  return {
    bottom: style.paddingBottom ?? all,
    left: style.paddingLeft ?? all,
    right: style.paddingRight ?? all,
    top: style.paddingTop ?? all,
  };
}

function mainSize(rect: Pick<LayoutRectangle, "height" | "width">, direction: FlexDirection): number {
  return direction === "row" ? rect.width : rect.height;
}

function crossSize(rect: Pick<LayoutRectangle, "height" | "width">, direction: FlexDirection): number {
  return direction === "row" ? rect.height : rect.width;
}

function mainMargins(margin: ResolvedBox, direction: FlexDirection): number {
  return direction === "row" ? margin.left + margin.right : margin.top + margin.bottom;
}

function measuredSize(input: LayoutNodeInput, constraints: { height?: number; width?: number }): MeasuredSize {
  return input.measure?.(constraints) ?? { height: 0, width: 0 };
}

function resolveNodeSize(
  input: LayoutNodeInput,
  parentWidth: number,
  parentHeight: number,
  direction: FlexDirection,
): MeasuredSize {
  const style = input.style ?? {};
  const measured = measuredSize(input, { height: parentHeight, width: parentWidth });
  let width = resolveLength(style.width, parentWidth) ?? measured.width;
  let height = resolveLength(style.height, parentHeight) ?? measured.height;

  if (style.aspectRatio !== undefined && style.aspectRatio > 0) {
    if (style.width !== undefined && (style.height === undefined || direction === "row")) {
      height = width / style.aspectRatio;
    } else if (style.height !== undefined && (style.width === undefined || direction === "column")) {
      width = height * style.aspectRatio;
    }
  }

  return {
    height: clamp(height, style.minHeight, style.maxHeight),
    width: clamp(width, style.minWidth, style.maxWidth),
  };
}

function childBasis(
  input: LayoutNodeInput,
  direction: FlexDirection,
  parentWidth: number,
  parentHeight: number,
): ChildLayoutInfo {
  const style = input.style ?? {};
  const margin = edgeInsets(style, "margin");
  const measured = measuredSize(input, { height: parentHeight, width: parentWidth });
  const size = resolveNodeSize(input, parentWidth, parentHeight, direction);
  const explicitBasis = resolveLength(
    style.flexBasis,
    mainSize({ height: parentHeight, width: parentWidth }, direction),
  );
  const resolvedMainSize = mainSize(size, direction) || mainSize(measured, direction);
  const basis = explicitBasis ?? resolvedMainSize;
  const childCrossSize = crossSize(size, direction) || crossSize(measured, direction);
  const crossLength = direction === "row" ? style.height : style.width;
  const canStretchCross = crossLength === undefined && style.aspectRatio === undefined;

  return {
    basis,
    canStretchCross,
    crossSize: childCrossSize,
    flexGrow: style.flexGrow ?? 0,
    flexShrink: style.flexShrink ?? 1,
    input,
    margin,
  };
}

function distributeMainSizes(
  children: ChildLayoutInfo[],
  availableMain: number,
  gap: number,
  direction: FlexDirection,
): number[] {
  const totalGap = gap * Math.max(0, children.length - 1);
  const naturalTotal = children.reduce((sum, child) => sum + child.basis + mainMargins(child.margin, direction), 0);
  const freeSpace = availableMain - totalGap - naturalTotal;
  const sizes = children.map((child) => child.basis);

  if (freeSpace > 0) {
    const totalGrow = children.reduce((sum, child) => sum + child.flexGrow, 0);
    if (totalGrow > 0) {
      return children.map((child) => child.basis + (freeSpace * child.flexGrow) / totalGrow);
    }
  }

  if (freeSpace < 0) {
    const shrinkFactors = children.map((child) => child.flexShrink * child.basis);
    const totalShrink = shrinkFactors.reduce((sum, factor) => sum + factor, 0);
    if (totalShrink > 0) {
      return children.map((child, index) =>
        Math.max(0, child.basis + (freeSpace * shrinkFactors[index]) / totalShrink),
      );
    }
  }

  return sizes;
}

function justifyOffsetAndGap(
  justifyContent: LayoutStyle["justifyContent"],
  freeSpace: number,
  childCount: number,
  gap: number,
): { gap: number; offset: number } {
  switch (justifyContent) {
    case "center":
      return { gap, offset: freeSpace / 2 };
    case "flex-end":
      return { gap, offset: freeSpace };
    case "space-between":
      return { gap: childCount > 1 ? gap + freeSpace / (childCount - 1) : gap, offset: 0 };
    case "space-around": {
      const distributed = childCount > 0 ? freeSpace / childCount : 0;
      return { gap: gap + distributed, offset: distributed / 2 };
    }
    case "space-evenly": {
      const distributed = childCount > 0 ? freeSpace / (childCount + 1) : 0;
      return { gap: gap + distributed, offset: distributed };
    }
    default:
      return { gap, offset: 0 };
  }
}

function crossOffset(
  alignItems: AlignItems,
  availableCross: number,
  childCrossSize: number,
  canStretch: boolean,
): { offset: number; size: number } {
  switch (alignItems) {
    case "center":
      return { offset: (availableCross - childCrossSize) / 2, size: childCrossSize };
    case "flex-end":
      return { offset: availableCross - childCrossSize, size: childCrossSize };
    case "stretch":
      return { offset: 0, size: canStretch ? availableCross : childCrossSize };
    default:
      return { offset: 0, size: childCrossSize };
  }
}

function crossSizeFromAssignedMain(child: ChildLayoutInfo, direction: FlexDirection, assignedMain: number): number {
  const aspectRatio = child.input.style?.aspectRatio;
  if (aspectRatio !== undefined && aspectRatio > 0) {
    return direction === "row" ? assignedMain / aspectRatio : assignedMain * aspectRatio;
  }
  return child.crossSize;
}

function layoutNode(
  input: LayoutNodeInput,
  constraints: LayoutConstraints,
  originX: number,
  originY: number,
  isRoot: boolean,
): LayoutNodeResult {
  const style = input.style ?? {};
  const direction = style.flexDirection ?? "column";
  const padding = edgeInsets(style, "padding");
  const measuredSize = resolveNodeSize(input, constraints.width, constraints.height, direction);
  const width = isRoot ? (style.width === undefined ? constraints.width : measuredSize.width) : constraints.width;
  const height = isRoot ? (style.height === undefined ? constraints.height : measuredSize.height) : constraints.height;
  const innerWidth = Math.max(0, width - padding.left - padding.right);
  const innerHeight = Math.max(0, height - padding.top - padding.bottom);
  const childInputs = input.children ?? [];

  if (childInputs.length === 0) {
    return { children: [], height, id: input.id, width, x: originX, y: originY };
  }

  const children = childInputs.map((child) => childBasis(child, direction, innerWidth, innerHeight));
  const gap = Math.max(0, style.gap ?? 0);
  const mainAvailable = direction === "row" ? innerWidth : innerHeight;
  const crossAvailable = direction === "row" ? innerHeight : innerWidth;
  const mainSizes = distributeMainSizes(children, mainAvailable, gap, direction);
  const usedMain = mainSizes.reduce((sum, size, index) => {
    const child = children[index];
    return sum + size + mainMargins(child.margin, direction);
  }, 0);
  const totalGap = gap * Math.max(0, children.length - 1);
  const freeSpace = Math.max(0, mainAvailable - usedMain - totalGap);
  const justified = justifyOffsetAndGap(style.justifyContent, freeSpace, children.length, gap);
  let cursor = justified.offset;

  const childResults = children.map((child, index) => {
    const main = mainSizes[index];
    const assignedCrossSize = crossSizeFromAssignedMain(child, direction, main);
    const cross = crossOffset(style.alignItems ?? "stretch", crossAvailable, assignedCrossSize, child.canStretchCross);
    const marginMainStart = direction === "row" ? child.margin.left : child.margin.top;
    const marginMainEnd = direction === "row" ? child.margin.right : child.margin.bottom;
    const marginCrossStart = direction === "row" ? child.margin.top : child.margin.left;
    cursor += marginMainStart;

    const childX =
      direction === "row" ? originX + padding.left + cursor : originX + padding.left + cross.offset + marginCrossStart;
    const childY =
      direction === "row" ? originY + padding.top + cross.offset + marginCrossStart : originY + padding.top + cursor;
    const childWidth = direction === "row" ? main : cross.size;
    const childHeight = direction === "row" ? cross.size : main;
    const result = layoutNode(child.input, { height: childHeight, width: childWidth }, childX, childY, false);

    cursor += main + marginMainEnd + justified.gap;
    return result;
  });

  return { children: childResults, height, id: input.id, width, x: originX, y: originY };
}

export function solveYogaLayout(input: LayoutNodeInput, constraints: LayoutConstraints): LayoutNodeResult {
  return layoutNode(input, constraints, 0, 0, true);
}
