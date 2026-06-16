import { describe, expect, it } from "vitest";

import { createNativeLayoutPlan } from "./nativeCapabilities";
import { solveYogaLayout } from "./solver";

describe("pure TypeScript Yoga-like layout solver", () => {
  it("delegates simple column layout to native Clutter capabilities", () => {
    expect(createNativeLayoutPlan({ flexDirection: "column", gap: 8 })).toEqual({
      native: { flexDirection: "column", gap: 8, useClutterBoxLayout: true },
      requiresSolver: false,
      solverReasons: [],
    });
  });

  it("marks Yoga-only constraints for the TypeScript solver", () => {
    expect(
      createNativeLayoutPlan({
        aspectRatio: 16 / 9,
        flexDirection: "row",
        flexGrow: 2,
        justifyContent: "space-between",
        width: "50%",
      }).solverReasons,
    ).toEqual(["percentageWidth", "flexGrowRatio", "aspectRatio", "spaceDistribution"]);
  });

  it("distributes flexGrow ratios without native bindings", () => {
    const layout = solveYogaLayout(
      {
        children: [
          { id: "a", style: { flexGrow: 1 } },
          { id: "b", style: { flexGrow: 2 } },
        ],
        style: { flexDirection: "row" },
      },
      { height: 40, width: 300 },
    );

    expect(layout.children[0]).toMatchObject({ height: 40, width: 100, x: 0, y: 0 });
    expect(layout.children[1]).toMatchObject({ height: 40, width: 200, x: 100, y: 0 });
  });

  it("matches Yoga flex-basis plus flex-grow distribution", () => {
    const layout = solveYogaLayout(
      {
        children: [
          { id: "a", style: { flexBasis: 50, flexGrow: 1 } },
          { id: "b", style: { flexGrow: 1 } },
        ],
        style: { flexDirection: "row" },
      },
      { height: 100, width: 100 },
    );

    expect(layout.children[0]).toMatchObject({ height: 100, width: 75, x: 0, y: 0 });
    expect(layout.children[1]).toMatchObject({ height: 100, width: 25, x: 75, y: 0 });
  });

  it("matches Yoga weighted flex-shrink distribution", () => {
    const layout = solveYogaLayout(
      {
        children: [
          { id: "a", style: { flexShrink: 1, height: 100, width: 500 } },
          { id: "b", style: { flexShrink: 1, height: 100, width: 500 } },
        ],
        style: { flexDirection: "row" },
      },
      { height: 500, width: 500 },
    );

    expect(layout.children[0]).toMatchObject({ height: 100, width: 250, x: 0, y: 0 });
    expect(layout.children[1]).toMatchObject({ height: 100, width: 250, x: 250, y: 0 });
  });

  it("resolves percentage dimensions against the parent", () => {
    const layout = solveYogaLayout(
      {
        children: [{ id: "half", style: { height: "25%", width: "50%" } }],
        style: { flexDirection: "row" },
      },
      { height: 200, width: 400 },
    );

    expect(layout.children[0]).toMatchObject({ height: 50, width: 200 });
  });

  it("matches Yoga percentage flex-basis distribution", () => {
    const layout = solveYogaLayout(
      {
        children: [
          { id: "a", style: { flexBasis: "50%", flexGrow: 1 } },
          { id: "b", style: { flexBasis: "25%", flexGrow: 1 } },
        ],
        style: { flexDirection: "row" },
      },
      { height: 200, width: 200 },
    );

    expect(layout.children[0]).toMatchObject({ height: 200, width: 125, x: 0, y: 0 });
    expect(layout.children[1]).toMatchObject({ height: 200, width: 75, x: 125, y: 0 });
  });

  it("resolves aspect ratio from explicit width", () => {
    const layout = solveYogaLayout(
      {
        children: [{ id: "video", style: { aspectRatio: 16 / 9, width: 320 } }],
        style: { flexDirection: "row" },
      },
      { height: 400, width: 500 },
    );

    expect(layout.children[0]).toMatchObject({ height: 180, width: 320 });
  });

  it("matches Yoga aspect-ratio axis priority when both dimensions are defined", () => {
    const rowLayout = solveYogaLayout(
      {
        children: [{ id: "child", style: { aspectRatio: 1, height: 50, width: 100 } }],
        style: { alignItems: "flex-start", flexDirection: "row" },
      },
      { height: 100, width: 100 },
    );
    const columnLayout = solveYogaLayout(
      {
        children: [{ id: "child", style: { aspectRatio: 1, height: 50, width: 100 } }],
        style: { alignItems: "flex-start" },
      },
      { height: 100, width: 100 },
    );

    expect(rowLayout.children[0]).toMatchObject({ height: 100, width: 100 });
    expect(columnLayout.children[0]).toMatchObject({ height: 50, width: 50 });
  });

  it("matches Yoga aspect ratio after flex growth", () => {
    const layout = solveYogaLayout(
      {
        children: [{ id: "square", style: { aspectRatio: 1, flexGrow: 1, height: 50 } }],
        style: { alignItems: "flex-start" },
      },
      { height: 100, width: 100 },
    );

    expect(layout.children[0]).toMatchObject({ height: 100, width: 100, x: 0, y: 0 });
  });

  it("supports native gap plus space distribution in TypeScript", () => {
    const layout = solveYogaLayout(
      {
        children: [
          { id: "a", style: { width: 50 } },
          { id: "b", style: { width: 50 } },
          { id: "c", style: { width: 50 } },
        ],
        style: { flexDirection: "row", justifyContent: "space-between" },
      },
      { height: 20, width: 300 },
    );

    expect(layout.children.map((child) => child.x)).toEqual([0, 125, 250]);
  });

  it("matches Yoga negative gap clamping", () => {
    const layout = solveYogaLayout(
      {
        children: [
          { id: "a", style: { width: 20 } },
          { id: "b", style: { width: 20 } },
          { id: "c", style: { width: 20 } },
          { id: "d", style: { width: 20 } },
        ],
        style: { flexDirection: "row", gap: -20 },
      },
      { height: 200, width: 80 },
    );

    expect(layout.children.map((child) => child.x)).toEqual([0, 20, 40, 60]);
    expect(layout.children.map((child) => child.width)).toEqual([20, 20, 20, 20]);
  });
});
