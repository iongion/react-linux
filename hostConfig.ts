import Reconciler from "react-reconciler";
import { ConcurrentRoot, DefaultEventPriority } from "react-reconciler/constants";

import type { ReactLinuxAdapter, ReactLinuxProps } from "./adapter";

interface HostContext {
  readonly parentType?: string;
}

const NO_CONTEXT: HostContext = {};
const NO_TIMEOUT = -1;

function isTextContent(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

function isTextHostType(type: string): boolean {
  const normalized = type.toLowerCase();
  return (
    normalized === "button" ||
    normalized === "entry" ||
    normalized === "label" ||
    normalized.startsWith("popup:") ||
    normalized.startsWith("quick:") ||
    normalized === "st:button" ||
    normalized === "st:entry" ||
    normalized === "st:label"
  );
}

function now(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function scheduleMicrotask(callback: () => void): void {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(callback);
    return;
  }
  Promise.resolve().then(callback);
}

export function createRenderer<Node, Text, Container>(adapter: ReactLinuxAdapter<Node, Text, Container>) {
  const hostConfig = {
    rendererPackageName: "react-linux",
    rendererVersion: "1.0.0",
    supportsMutation: true,
    supportsPersistence: false,
    supportsHydration: false,
    supportsMicrotasks: true,
    supportsResources: false,
    supportsSingletons: false,
    supportsTestSelectors: false,
    isPrimaryRenderer: false,
    warnsIfNotActing: false,
    noTimeout: NO_TIMEOUT,

    getPublicInstance(instance: Node) {
      return adapter.getPublicInstance(instance);
    },

    getRootHostContext(): HostContext {
      return NO_CONTEXT;
    },

    getChildHostContext(_parentHostContext: HostContext, type: string): HostContext {
      return { parentType: type };
    },

    prepareForCommit() {
      return null;
    },

    resetAfterCommit() {},
    preparePortalMount() {},
    prepareScopeUpdate() {},
    getInstanceFromScope() {
      return null;
    },

    shouldSetTextContent(type: string, props: ReactLinuxProps) {
      return isTextHostType(type) && isTextContent(props.children);
    },

    createInstance(type: string, props: ReactLinuxProps) {
      return adapter.createInstance(type, props);
    },

    createTextInstance(text: string) {
      return adapter.createText(text);
    },

    appendInitialChild(parent: Node, child: Node | Text) {
      adapter.appendChild(parent, child);
    },

    finalizeInitialChildren() {
      return false;
    },

    commitMount() {},

    appendChild(parent: Node, child: Node | Text) {
      adapter.appendChild(parent, child);
    },

    appendChildToContainer(container: Container, child: Node | Text) {
      adapter.appendChild(container, child);
    },

    insertBefore(parent: Node, child: Node | Text, beforeChild: Node | Text) {
      adapter.insertBefore(parent, child, beforeChild);
    },

    insertInContainerBefore(container: Container, child: Node | Text, beforeChild: Node | Text) {
      adapter.insertBefore(container, child, beforeChild);
    },

    removeChild(parent: Node, child: Node | Text) {
      adapter.removeChild(parent, child);
    },

    removeChildFromContainer(container: Container, child: Node | Text) {
      adapter.removeChild(container, child);
    },

    clearContainer(container: Container) {
      adapter.clearContainer(container);
    },

    commitUpdate(instance: Node, type: string, prevProps: ReactLinuxProps, nextProps: ReactLinuxProps) {
      adapter.commitUpdate(instance, type, prevProps, nextProps);
    },

    commitTextUpdate(textInstance: Text, _oldText: string, newText: string) {
      adapter.setText(textInstance, newText);
    },

    resetTextContent(instance: Node) {
      adapter.resetTextContent(instance);
    },

    hideInstance(instance: Node) {
      adapter.setVisible(instance, false);
    },

    unhideInstance(instance: Node) {
      adapter.setVisible(instance, true);
    },

    hideTextInstance(textInstance: Text) {
      adapter.setVisible(textInstance, false);
    },

    unhideTextInstance(textInstance: Text) {
      adapter.setVisible(textInstance, true);
    },

    scheduleTimeout: setTimeout,
    cancelTimeout: clearTimeout,
    scheduleMicrotask,
    now,

    getCurrentEventPriority() {
      return DefaultEventPriority;
    },

    getCurrentUpdatePriority() {
      return DefaultEventPriority;
    },

    setCurrentUpdatePriority() {},

    trackSchedulerEvent() {},

    resolveEventType() {
      return null;
    },

    resolveEventTimeStamp() {
      return now();
    },

    resolveUpdatePriority() {
      return DefaultEventPriority;
    },

    shouldAttemptEagerTransition() {
      return false;
    },

    detachDeletedInstance() {},
    requestPostPaintCallback(callback: (time: number) => void) {
      const id = setTimeout(() => callback(now()), 0);
      return () => clearTimeout(id);
    },

    maySuspendCommit() {
      return false;
    },
    maySuspendCommitOnUpdate() {
      return false;
    },
    maySuspendCommitInSyncRender() {
      return false;
    },
    preloadInstance() {
      return false;
    },
    startSuspendingCommit() {},
    suspendInstance() {},
    waitForCommitToBeReady() {
      return null;
    },
    getSuspendedCommitReason() {
      return null;
    },
    suspendOnActiveViewTransition() {
      return false;
    },

    NotPendingTransition: null,
    HostTransitionContext: null,

    resetFormInstance() {},
    bindToConsole(methodName: string, args: unknown[]) {
      return { methodName, args };
    },

    beforeActiveInstanceBlur() {},
    afterActiveInstanceBlur() {},
    getInstanceFromNode() {
      return null;
    },

    cancelViewTransitionName() {},
    cancelRootViewTransitionName() {},
    restoreRootViewTransitionName() {},
    cloneRootViewTransitionContainer() {
      return null;
    },
    removeRootViewTransitionClone() {},
    measureClonedInstance() {
      return null;
    },
    hasInstanceChanged() {
      return true;
    },
    hasInstanceAffectedParent() {
      return true;
    },
    startViewTransition() {
      return null;
    },
    startGestureTransition() {
      return null;
    },
    stopViewTransition() {},
    getCurrentGestureOffset() {
      return null;
    },
    createViewTransitionInstance() {
      return null;
    },

    createFragmentInstance() {
      return null;
    },
    updateFragmentInstanceFiber() {},
    commitNewChildToFragmentInstance() {},
    deleteChildFromFragmentInstance() {},
  };

  const reconciler = Reconciler(hostConfig);

  function createContainer(container: Container) {
    return reconciler.createContainer(
      container,
      ConcurrentRoot,
      null,
      false,
      null,
      "",
      console.error,
      console.error,
      console.error,
      null,
    );
  }

  return { reconciler, createContainer };
}
