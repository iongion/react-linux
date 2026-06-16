import type { ReactLinuxProps } from "../adapter";
import type { NativeLayoutPlan } from "../layout/nativeCapabilities";
import type { LayoutNodeResult, LayoutStyle } from "../layout/types";

export interface GnomeShellActor {
  [key: string]: unknown;
  add_actor?(child: GnomeShellActor): void;
  add_child?(child: GnomeShellActor): void;
  connect?(signal: string, callback: (...args: unknown[]) => unknown): number;
  destroy?(): void;
  disconnect?(id: number): void;
  get_children?(): GnomeShellActor[];
  get_clutter_text?(): GnomeShellActor;
  get_parent?(): GnomeShellActor | null;
  hide?(): void;
  insert_child_at_index?(child: GnomeShellActor, index: number): void;
  queue_relayout?(): void;
  remove_child?(child: GnomeShellActor): void;
  set_child?(child: GnomeShellActor | null): void;
  set_style_class_name?(styleClass: string): void;
  show?(): void;
}

export interface GnomeShellObject {
  [key: string]: unknown;
  actor?: GnomeShellActor;
  addMenuItem?(item: GnomeShellObject, position?: number): void;
  connect?(signal: string, callback: (...args: unknown[]) => unknown): number;
  destroy?(): void;
  disconnect?(id: number): void;
  menu?: GnomeShellObject;
  moveMenuItem?(item: GnomeShellObject, position: number): void;
  quickSettingsItems?: GnomeShellObject[];
  removeAll?(): void;
  removeMenuItem?(item: GnomeShellObject): void;
  setIcon?(icon: unknown): void;
  setOrnament?(ornament: unknown): void;
  setStatusText?(text: string | null): void;
  setSubmenuShown?(open: boolean): void;
  setToggleState?(state: boolean): void;
}

export type GnomeShellContainer = GnomeShellActor | GnomeShellObject;

export type ActorConstructor = new (props?: Record<string, unknown>) => GnomeShellActor;
export type ShellObjectConstructor = new (...args: any[]) => GnomeShellObject;

export interface GnomeShellToolkit {
  Clutter?: {
    Orientation?: {
      HORIZONTAL?: unknown;
      VERTICAL?: unknown;
    };
    ActorAlign?: {
      CENTER?: unknown;
      END?: unknown;
      FILL?: unknown;
      START?: unknown;
    };
  };
  PopupMenu?: Record<string, ShellObjectConstructor | unknown> & {
    PopupMenuItem?: ShellObjectConstructor;
    PopupMenuSection?: ShellObjectConstructor;
  };
  QuickSettings?: Record<string, ShellObjectConstructor | unknown>;
  St: Record<string, ActorConstructor | undefined> & {
    BoxLayout: ActorConstructor;
    Label: ActorConstructor;
    Widget: ActorConstructor;
  };
}

export interface CreateStAdapterOptions {
  baseStyleClass?: string;
  eventStopValue?: unknown;
  alignValues?: {
    center: unknown;
    end: unknown;
    fill: unknown;
    start: unknown;
  };
}

export interface GnomeShellElement {
  kind: "element";
  actor: GnomeShellActor;
  actorSignalIds: number[];
  children: GnomeShellNode[];
  object: GnomeShellObject;
  parent: GnomeShellElement | GnomeShellContainer | null;
  layoutDirty: boolean;
  layoutPlan?: NativeLayoutPlan;
  layoutResult?: LayoutNodeResult;
  layoutStyle: LayoutStyle;
  needsLayoutSolver: boolean;
  progressFill?: GnomeShellActor;
  props: ReactLinuxProps;
  signalIds: number[];
  type: string;
}

export interface GnomeShellText {
  kind: "text";
  actor: GnomeShellActor;
  parent: GnomeShellElement | GnomeShellContainer | null;
  signalIds: number[];
  text: string;
}

export type GnomeShellNode = GnomeShellElement | GnomeShellText;
