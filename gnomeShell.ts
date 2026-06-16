import type { ReactLinuxRoot } from "./createRoot";
import { createRoot } from "./createRoot";
import {
  type CreateStAdapterOptions,
  createStAdapter,
  type GnomeShellContainer,
  type GnomeShellToolkit,
} from "./stAdapter";

export function createGnomeShellRoot(
  container: GnomeShellContainer,
  toolkit: GnomeShellToolkit,
  options?: CreateStAdapterOptions,
): ReactLinuxRoot {
  return createRoot(container, createStAdapter(toolkit, options));
}
