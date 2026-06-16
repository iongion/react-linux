import { memo, type Ref, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Box,
  Button,
  Entry,
  Icon,
  Label,
  PopupImageMenuItem,
  PopupMenuItem,
  PopupMenuSection,
  PopupSeparatorMenuItem,
  PopupSubMenuMenuItem,
  PopupSwitchMenuItem,
  Progress,
  QuickMenuToggle,
  QuickSlider,
  QuickToggle,
} from "../../..";
import { actorForObject, isActorLike } from "../../../gnome-shell/actors";

export const galleryDevControls: {
  activatePopupImage?: () => void;
  activatePopupOpen?: () => void;
  progressDown?: () => void;
  progressUp?: () => void;
  setEntryText?: (value: string) => void;
  setProgress?: (value: number) => void;
  setSliderValue?: (value: number) => void;
  setSubmenuOpen?: (open: boolean) => void;
  togglePopupSwitch?: () => void;
  toggleSubmenu?: () => void;
} = {};

type SetLog = (message: string) => void;
type ToggleEvent = { event?: unknown };
type SignalSource = {
  get_clutter_text?: () => { get_text?: () => string; text?: unknown };
  get_text?: () => string;
  text?: unknown;
};
type NativeActivatable = {
  actor?: {
    emit?: (signal: string, ...args: unknown[]) => unknown;
  };
  activate?: (event?: unknown) => unknown;
  emit?: (signal: string, ...args: unknown[]) => unknown;
};

function refFor(ref: RefObject<NativeActivatable | null>): Ref<unknown> {
  return ref as Ref<unknown>;
}

function activateNative(ref: RefObject<NativeActivatable | null>, fallback: () => void): void {
  const object = ref.current;
  if (!object) {
    fallback();
    return;
  }

  const actor = isActorLike(object) ? object : actorForObject(object as any);
  if (typeof actor.emit === "function") {
    actor.emit("button-press-event", null);
    return;
  }
  if (typeof object.emit === "function") {
    object.emit("activate", null);
    return;
  }
  if (typeof object.activate === "function") {
    object.activate();
    return;
  }
  fallback();
}

function textFromSignalSource(source: unknown): string | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const actor = source as SignalSource;
  if (typeof actor.get_text === "function") {
    return actor.get_text();
  }
  if (typeof actor.text === "string") {
    return actor.text;
  }

  const clutterText = actor.get_clutter_text?.();
  if (typeof clutterText?.get_text === "function") {
    return clutterText.get_text();
  }
  if (typeof clutterText?.text === "string") {
    return clutterText.text;
  }

  return null;
}

function sliderProgressValue(source: unknown): number | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const candidate = source as { slider?: { value?: unknown }; value?: unknown };
  const value = typeof candidate.slider?.value === "number" ? candidate.slider.value : candidate.value;
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) : null;
}

const StWidgetsPanel = memo(function StWidgetsPanel() {
  const [progress, setProgress] = useState(35);
  const [entryText, setEntryText] = useState("St.Entry preview");

  const decrementProgress = useCallback(() => setProgress((value) => Math.max(0, value - 10)), []);
  const incrementProgress = useCallback(() => setProgress((value) => Math.min(100, value + 10)), []);
  const syncEntryText = useCallback((source: unknown) => {
    const nextText = textFromSignalSource(source);
    if (nextText !== null) {
      setEntryText(nextText);
    }
  }, []);
  const entrySignals = useMemo(
    () => ({
      "notify::text": syncEntryText,
    }),
    [syncEntryText],
  );

  useEffect(() => {
    galleryDevControls.progressDown = decrementProgress;
    galleryDevControls.progressUp = incrementProgress;
    galleryDevControls.setEntryText = setEntryText;
    galleryDevControls.setProgress = (value) => setProgress(Math.max(0, Math.min(100, Math.round(value))));

    return () => {
      galleryDevControls.progressDown = undefined;
      galleryDevControls.progressUp = undefined;
      galleryDevControls.setEntryText = undefined;
      galleryDevControls.setProgress = undefined;
    };
  }, [decrementProgress, incrementProgress]);

  return (
    <Box flexDirection="column" gap={10} styleClass="panel st-panel" width={305}>
      <Label styleClass="panel-title">St widgets</Label>
      <Box flexDirection="row" gap={12} styleClass="row" width={260}>
        <Icon iconName="speedometer-symbolic" />
        <Label text={`Progress: ${progress}%`} width={130} />
      </Box>
      <Progress value={progress} max={100} width={260} />
      <Box flexDirection="row" gap={8} width={116}>
        <Button onClick={decrementProgress} styleClass="progress-step-button" width={54}>
          -10
        </Button>
        <Button onClick={incrementProgress} styleClass="progress-step-button" width={54}>
          +10
        </Button>
      </Box>
      <Entry editable height={44} placeholder="Editable entry" selectable signals={entrySignals} text={entryText} width={260} />
      <Box flexDirection="row" height={26} styleClass="solver-row" width={260}>
        <Label flexGrow={1} styleClass="solver-cell">
          1x
        </Label>
        <Label flexGrow={2} styleClass="solver-cell accent">
          2x
        </Label>
      </Box>
    </Box>
  );
});

const PopupPanel = memo(function PopupPanel({ setLog }: { setLog: SetLog }) {
  const [popupEnabled, setPopupEnabled] = useState(true);
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const imageItemRef = useRef<NativeActivatable | null>(null);
  const openItemRef = useRef<NativeActivatable | null>(null);
  const submenuRef = useRef<NativeActivatable | null>(null);
  const switchItemRef = useRef<NativeActivatable | null>(null);

  const activateOpen = useCallback(() => setLog("Popup item activated"), [setLog]);
  const activateImage = useCallback(() => setLog("Image menu item activated"), [setLog]);
  const activateNested = useCallback(() => setLog("Nested submenu item activated"), [setLog]);
  const activateMoreAction = useCallback(() => setLog("More action activated"), [setLog]);
  const setLoggedSubmenuOpen = useCallback(
    (open: boolean) => {
      setSubmenuOpen((current) => {
        if (current !== open) {
          setLog(`Submenu ${open ? "opened" : "closed"}`);
        }
        return open;
      });
    },
    [setLog],
  );
  const commitPopupSwitch = useCallback(
    (nextValue: boolean | ((current: boolean) => boolean), _source: string) => {
      setPopupEnabled((current) => {
        const next = typeof nextValue === "function" ? nextValue(current) : nextValue;
        setLog(`Popup switch: ${next ? "on" : "off"}`);
        return next;
      });
    },
    [setLog],
  );
  const activatePopupSwitch = useCallback(
    () => commitPopupSwitch((current) => !current, "activated"),
    [commitPopupSwitch],
  );
  const togglePopup = useCallback(
    ({ event }: ToggleEvent) => {
      commitPopupSwitch(typeof event === "boolean" ? event : (current) => !current, "toggled");
    },
    [commitPopupSwitch],
  );
  const toggleSubmenu = useCallback(() => {
    setSubmenuOpen((current) => {
      const next = !current;
      setLog(`Submenu ${next ? "opened" : "closed"}`);
      return next;
    });
  }, [setLog]);
  const closeSubmenuAfterNestedAction = useCallback(() => {
    activateNested();
    setSubmenuOpen(false);
  }, [activateNested]);

  useEffect(() => {
    galleryDevControls.activatePopupOpen = () => activateNative(openItemRef, activateOpen);
    galleryDevControls.activatePopupImage = () => activateNative(imageItemRef, activateImage);
    galleryDevControls.setSubmenuOpen = setLoggedSubmenuOpen;
    galleryDevControls.togglePopupSwitch = () => activateNative(switchItemRef, activatePopupSwitch);
    galleryDevControls.toggleSubmenu = () => activateNative(submenuRef, toggleSubmenu);

    return () => {
      galleryDevControls.activatePopupOpen = undefined;
      galleryDevControls.activatePopupImage = undefined;
      galleryDevControls.setSubmenuOpen = undefined;
      galleryDevControls.togglePopupSwitch = undefined;
      galleryDevControls.toggleSubmenu = undefined;
    };
  }, [activateImage, activateOpen, activatePopupSwitch, setLoggedSubmenuOpen, toggleSubmenu]);

  return (
    <Box flexDirection="column" gap={10} styleClass="panel popup-panel" width={340}>
      <Label styleClass="panel-title">PopupMenu</Label>
      <Box flexDirection="column" gap={8} styleClass="popup-list" width={316}>
        <PopupMenuSection width={296}>
          <PopupMenuItem onActivate={activateOpen} ref={refFor(openItemRef)} width={296}>
            Open item
          </PopupMenuItem>
          <PopupImageMenuItem iconName="info-symbolic" onActivate={activateImage} ref={refFor(imageItemRef)} width={296}>
            Image item
          </PopupImageMenuItem>
          <PopupSwitchMenuItem
            active={popupEnabled}
            onToggled={togglePopup}
            ref={refFor(switchItemRef)}
            statusText={popupEnabled ? "On" : "Off"}
            width={296}
          >
            Switch item
          </PopupSwitchMenuItem>
          <PopupSeparatorMenuItem width={296} />
          <PopupMenuItem onActivate={activateMoreAction} width={296}>
            More action
          </PopupMenuItem>
          <PopupSubMenuMenuItem
            onActivate={toggleSubmenu}
            open={submenuOpen}
            ref={refFor(submenuRef)}
            submenuHeight={58}
            text="Submenu"
            wantsIcon
            width={296}
          >
            <PopupMenuItem onActivate={closeSubmenuAfterNestedAction} width={296}>
              Nested item
            </PopupMenuItem>
          </PopupSubMenuMenuItem>
        </PopupMenuSection>
      </Box>
    </Box>
  );
});

const QuickSettingsPanel = memo(function QuickSettingsPanel({ setLog }: { setLog: SetLog }) {
  const [quickEnabled, setQuickEnabled] = useState(false);
  const [sliderValue, setSliderValue] = useState(0.35);
  const setClampedSliderValue = useCallback(
    (value: number) => setSliderValue(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))),
    [],
  );

  const toggleQuick = useCallback(
    ({ event }: ToggleEvent) => {
      setQuickEnabled(Boolean(event));
      setLog(`Quick toggle: ${event ? "on" : "off"}`);
    },
    [setLog],
  );

  useEffect(() => {
    galleryDevControls.setSliderValue = setClampedSliderValue;

    return () => {
      galleryDevControls.setSliderValue = undefined;
    };
  }, [setClampedSliderValue]);

  const sliderSignals = useMemo(
    () => ({
      "notify::value": (source: unknown) => {
        const nextProgress = sliderProgressValue(source);
        if (nextProgress !== null) {
          setClampedSliderValue(nextProgress / 100);
        }
        setLog("Slider signal fired");
      },
    }),
    [setClampedSliderValue, setLog],
  );
  const activateQuickAction = useCallback(() => setLog("Quick menu action activated"), [setLog]);

  return (
    <Box flexDirection="column" gap={10} styleClass="panel quick-panel" width={405}>
      <Label styleClass="panel-title">Quick Settings</Label>
      <Box flexDirection="column" gap={8} styleClass="quick-list" width={381}>
        <QuickToggle
          checked={quickEnabled}
          iconName="selection-mode-symbolic"
          iconSize={16}
          onToggled={toggleQuick}
          subtitle={quickEnabled ? "Enabled" : "Disabled"}
          title="Quick toggle"
          toggleMode
          width={345}
        />
        <QuickSlider
          iconLabel="Load"
          iconName="speedometer-symbolic"
          iconSize={16}
          signals={sliderSignals}
          value={sliderValue}
          width={345}
        />
        <QuickMenuToggle iconName="view-list-symbolic" iconSize={16} height={54} title="Quick menu" toggleMode width={361}>
          <PopupMenuItem onActivate={activateQuickAction}>Quick action</PopupMenuItem>
        </QuickMenuToggle>
      </Box>
    </Box>
  );
});

const EventLogPanel = memo(function EventLogPanel({ log }: { log: string }) {
  return (
    <Box flexDirection="column" gap={10} styleClass="panel log-panel" width={240}>
      <Label styleClass="panel-title">Event log</Label>
      <Box flexDirection="column" styleClass="log" width={216}>
        <Label width={192}>{log}</Label>
      </Box>
    </Box>
  );
});

export function Gallery() {
  const [log, setLog] = useState("Ready. Click a component.");
  const ping = useCallback(() => setLog(`Rendered at ${new Date().toLocaleTimeString()}`), []);

  return (
    <Box flexDirection="column" gap={10} styleClass="gallery" width={735}>
      <Box flexDirection="row" gap={14} styleClass="header" width={707}>
        <Box flexDirection="column" gap={6} styleClass="header-copy" width={575}>
          <Label styleClass="title">react-linux component gallery</Label>
          <Label styleClass="subtitle">St, PopupMenu, and QuickSettings rendered by one React tree.</Label>
        </Box>
        <Button onClick={ping} styleClass="ping-button" width={52}>
          Ping
        </Button>
      </Box>

      <Box flexDirection="column" gap={10} styleClass="gallery-body" width={707}>
        <Box flexDirection="row" gap={10} styleClass="gallery-row" width={707}>
          <StWidgetsPanel />
          <PopupPanel setLog={setLog} />
        </Box>

        <Box flexDirection="row" gap={10} styleClass="gallery-row" width={707}>
          <QuickSettingsPanel setLog={setLog} />
          <EventLogPanel log={log} />
        </Box>
      </Box>
    </Box>
  );
}
