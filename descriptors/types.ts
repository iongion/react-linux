import type { ReactLinuxProps } from "../adapter";
import type {
  CreateStAdapterOptions,
  GnomeShellActor,
  GnomeShellElement,
  GnomeShellObject,
  GnomeShellToolkit,
} from "../gnome-shell/types";

export type ComponentFamily = "st" | "popup" | "quick";

export type ChildPolicy = "actor" | "menuItems" | "quickSettingsItems" | "submenu" | "none";

export interface ConstructResult {
  actor: GnomeShellActor;
  object: GnomeShellObject;
}

export interface SignalDiffs {
  added: Array<{ handler: (...args: unknown[]) => unknown; signal: string }>;
  removed: string[];
  unchanged: Set<string>;
}

export interface ComponentDescriptor {
  readonly aliases: readonly string[];
  readonly childContainer: "object" | "menu";
  readonly childPolicy: ChildPolicy;
  readonly displayName: string;
  readonly family: ComponentFamily;
  readonly nativeObjectName: string;
  readonly nativeStyleClass: string | null;
  readonly styleName: string;
  readonly type: string;

  construct?(toolkit: GnomeShellToolkit, props: ReactLinuxProps, options: CreateStAdapterOptions): ConstructResult;

  applyProps?(element: GnomeShellElement, nextProps: ReactLinuxProps, options: CreateStAdapterOptions): SignalDiffs;
}
