import type { LayoutStyle } from "./types";

export type NativeLayoutReason =
  | "aspectRatio"
  | "flexBasis"
  | "flexGrowRatio"
  | "flexShrinkRatio"
  | "percentageHeight"
  | "percentageWidth"
  | "spaceDistribution";

export interface NativeLayoutPlan {
  native: {
    flexDirection: "row" | "column";
    gap: number;
    useClutterBoxLayout: true;
  };
  requiresSolver: boolean;
  solverReasons: NativeLayoutReason[];
}

function isPercent(value: unknown): value is `${number}%` {
  return typeof value === "string" && /^\d+(\.\d+)?%$/.test(value);
}

function hasRatio(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 1;
}

export function createNativeLayoutPlan(style: LayoutStyle = {}): NativeLayoutPlan {
  const solverReasons: NativeLayoutReason[] = [];

  if (isPercent(style.width)) {
    solverReasons.push("percentageWidth");
  }
  if (isPercent(style.height)) {
    solverReasons.push("percentageHeight");
  }
  if (style.flexBasis !== undefined) {
    solverReasons.push("flexBasis");
  }
  if (hasRatio(style.flexGrow)) {
    solverReasons.push("flexGrowRatio");
  }
  if (hasRatio(style.flexShrink)) {
    solverReasons.push("flexShrinkRatio");
  }
  if (style.aspectRatio !== undefined) {
    solverReasons.push("aspectRatio");
  }
  if (
    style.justifyContent === "space-around" ||
    style.justifyContent === "space-between" ||
    style.justifyContent === "space-evenly"
  ) {
    solverReasons.push("spaceDistribution");
  }

  return {
    native: {
      flexDirection: style.flexDirection ?? "column",
      gap: style.gap ?? 0,
      useClutterBoxLayout: true,
    },
    requiresSolver: solverReasons.length > 0,
    solverReasons,
  };
}
