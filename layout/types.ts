export type LayoutLength = number | `${number}%`;

export type FlexDirection = "row" | "column";
export type JustifyContent = "center" | "flex-end" | "flex-start" | "space-around" | "space-between" | "space-evenly";
export type AlignItems = "center" | "flex-end" | "flex-start" | "stretch";

export interface EdgeInsets {
  bottom?: number;
  left?: number;
  right?: number;
  top?: number;
}

export interface LayoutStyle {
  alignItems?: AlignItems;
  aspectRatio?: number;
  flexBasis?: LayoutLength;
  flexDirection?: FlexDirection;
  flexGrow?: number;
  flexShrink?: number;
  gap?: number;
  height?: LayoutLength;
  justifyContent?: JustifyContent;
  margin?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  marginTop?: number;
  maxHeight?: number;
  maxWidth?: number;
  minHeight?: number;
  minWidth?: number;
  padding?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  width?: LayoutLength;
}

export interface MeasureConstraints {
  height?: number;
  width?: number;
}

export interface MeasuredSize {
  height: number;
  width: number;
}

export interface LayoutNodeInput {
  children?: LayoutNodeInput[];
  id?: string;
  measure?: (constraints: MeasureConstraints) => MeasuredSize;
  style?: LayoutStyle;
}

export interface LayoutRectangle {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface LayoutNodeResult extends LayoutRectangle {
  children: LayoutNodeResult[];
  id?: string;
}

export interface LayoutConstraints {
  height: number;
  width: number;
}
