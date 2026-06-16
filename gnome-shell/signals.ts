import type { ReactLinuxEventHandler, ReactLinuxProps } from "../adapter";
import { isPopupType, isQuickSettingsType, popupObjectNameFor, widgetNameFor } from "./intrinsics";
import { disconnectSignals, signalTargetOf } from "./tree";
import type { CreateStAdapterOptions, GnomeShellElement, GnomeShellObject } from "./types";

function connectSignal(
  target: ReturnType<typeof signalTargetOf>,
  signal: string,
  callback: (...args: unknown[]) => unknown,
): number | null {
  if (!target.connect) {
    return null;
  }

  try {
    return target.connect(signal, callback);
  } catch {
    return null;
  }
}

function pushActorSignalId(element: GnomeShellElement, signalId: number | null): void {
  if (signalId !== null) {
    element.actorSignalIds.push(signalId);
  }
}

function pushObjectSignalId(element: GnomeShellElement, signalId: number | null): void {
  if (signalId !== null) {
    element.signalIds.push(signalId);
  }
}

function eventStop(options: CreateStAdapterOptions): unknown {
  return options.eventStopValue ?? true;
}

function popupSwitchState(object: GnomeShellObject, props: ReactLinuxProps): boolean {
  const checked = props.checked ?? props.active ?? object.checked ?? object.state;
  return checked === true;
}

function isActorClickablePopup(type: string): boolean {
  if (!isPopupType(type)) {
    return false;
  }
  const objectName = popupObjectNameFor(type);
  return objectName !== "PopupMenu" && objectName !== "PopupMenuSection" && objectName !== "PopupSeparatorMenuItem";
}

export function applySignalProps(
  element: GnomeShellElement,
  props: ReactLinuxProps,
  options: CreateStAdapterOptions,
): void {
  disconnectSignals(element);
  const signalTarget = signalTargetOf(element);

  if (props.signals && typeof props.signals === "object") {
    for (const [signal, handler] of Object.entries(props.signals)) {
      if (typeof handler !== "function") {
        continue;
      }
      const signalId = connectSignal(signalTarget, signal, (...args: unknown[]) => handler(...args));
      pushObjectSignalId(element, signalId);
    }
  }

  if (typeof props.onActivate === "function") {
    const signal = "activate";
    let lastActivateAt = 0;
    const dispatchActivate = (actor: unknown, event: unknown, signal: string) => {
      const now = Date.now();
      if (now - lastActivateAt < 20) {
        return eventStop(options);
      }
      lastActivateAt = now;
      props.onActivate?.({ actor, event, signal });
      return eventStop(options);
    };

    const signalId = connectSignal(signalTarget, signal, (item = element.object, event?: unknown) => {
      return dispatchActivate(item, event, signal);
    });
    pushObjectSignalId(element, signalId);

    if (isActorClickablePopup(element.type) && popupObjectNameFor(element.type) !== "PopupSwitchMenuItem") {
      pushActorSignalId(
        element,
        connectSignal(element.actor, "button-press-event", (_actor = element.actor, event?: unknown) =>
          dispatchActivate(element.object, event, "button-press-event"),
        ),
      );
    }
  }

  if (typeof props.onToggled === "function") {
    const signal = isQuickSettingsType(element.type) ? "notify::checked" : "toggled";
    let lastToggleAt = 0;
    const dispatchToggle = (actor: unknown, event: unknown, signalName: string) => {
      const now = Date.now();
      if (now - lastToggleAt < 20) {
        return eventStop(options);
      }
      lastToggleAt = now;
      props.onToggled?.({ actor, event, signal: signalName });
      return eventStop(options);
    };

    const signalId = connectSignal(signalTarget, signal, (item = element.object, state?: unknown) => {
      const event = signal === "notify::checked" ? element.object.checked : state;
      return dispatchToggle(item, event, signal);
    });
    pushObjectSignalId(element, signalId);

    if (popupObjectNameFor(element.type) === "PopupSwitchMenuItem") {
      pushActorSignalId(
        element,
        connectSignal(element.actor, "button-press-event", (_actor = element.actor, event?: unknown) => {
          const nextState = !popupSwitchState(element.object, props);
          element.object.setToggleState?.(nextState);
          return dispatchToggle(element.object, nextState, "button-press-event");
        }),
      );
    }
  }

  const onClick = props.onClick;
  if (typeof onClick !== "function") {
    return;
  }

  const signal = isPopupType(element.type)
    ? "activate"
    : widgetNameFor(element.type) === "Button"
      ? "clicked"
      : "button-press-event";
  const signalId = connectSignal(signalTarget, signal, (actor = signalTarget, event?: unknown) => {
    (onClick as ReactLinuxEventHandler)({ actor, event, signal });
    return eventStop(options);
  });
  pushObjectSignalId(element, signalId);

  if (isActorClickablePopup(element.type)) {
    pushActorSignalId(
      element,
      connectSignal(element.actor, "button-press-event", (_actor = element.actor, event?: unknown) => {
        (onClick as ReactLinuxEventHandler)({ actor: element.object, event, signal: "button-press-event" });
        return eventStop(options);
      }),
    );
  }
}
