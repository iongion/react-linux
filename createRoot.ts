import type { ReactNode } from "react";

import type { ReactLinuxAdapter } from "./adapter";
import { createRenderer } from "./hostConfig";

export interface ReactLinuxRoot {
  render(element: ReactNode): void;
  unmount(): void;
}

export function createRoot<Node, Text, Container>(
  container: Container,
  adapter: ReactLinuxAdapter<Node, Text, Container>,
): ReactLinuxRoot {
  const { reconciler, createContainer } = createRenderer(adapter);
  const root = createContainer(container);

  return {
    render(element: ReactNode) {
      reconciler.updateContainerSync(element, root, null, null);
      reconciler.flushSyncWork();
    },
    unmount() {
      reconciler.updateContainerSync(null, root, null, null);
      reconciler.flushSyncWork();
    },
  };
}
