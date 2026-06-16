import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Shell from "gi://Shell";
import St from "gi://St";

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as QuickSettings from "resource:///org/gnome/shell/ui/quickSettings.js";

import { createGnomeShellRoot, type ReactLinuxRoot } from "../../..";
import { actorForObject } from "../../../gnome-shell/actors";
import { Gallery, galleryDevControls } from "./Gallery";

type GalleryIndicator = InstanceType<typeof GalleryIndicatorClass>;

type GalleryPerformanceMetrics = {
  jsFps: number;
  jsFrames: number;
  label: string;
  measuring: boolean;
  sampleMs: number;
  samples: number;
  uiFps: number;
  uiFrames: number;
};

const FPS_SAMPLE_INTERVAL_MS = 1000;
const FPS_TIMER_INTERVAL_MS = 16;
const INITIAL_PERFORMANCE_LABEL = "UI -- JS --";

const GalleryControlInterface = `
<node>
  <interface name="org.react_linux.ReactLinuxGallery">
    <method name="Open" />
    <method name="Close" />
    <method name="Toggle" />
    <method name="IsOpen">
      <arg name="open" type="b" direction="out" />
    </method>
    <method name="Dump">
      <arg name="tree" type="s" direction="out" />
    </method>
    <method name="ProgressDown" />
    <method name="ProgressUp" />
    <method name="SetProgress">
      <arg name="value" type="i" direction="in" />
    </method>
    <method name="SetSlider">
      <arg name="value" type="d" direction="in" />
    </method>
    <method name="SetEntryText">
      <arg name="value" type="s" direction="in" />
    </method>
    <method name="ActivatePopupOpen" />
    <method name="ActivatePopupImage" />
    <method name="TogglePopupSwitch" />
    <method name="ToggleSubmenu" />
    <method name="SetSubmenuOpen">
      <arg name="open" type="b" direction="in" />
    </method>
    <method name="Capture">
      <arg name="filename" type="s" direction="in" />
      <arg name="filename_used" type="s" direction="out" />
    </method>
    <method name="SetStepButtonsActive">
      <arg name="active" type="b" direction="in" />
    </method>
  </interface>
</node>`;

const GalleryIndicatorClass = GObject.registerClass(
  class GalleryIndicator extends PanelMenu.Button {
    declare _performanceLabel: any;

    _init() {
      super._init(0.5, "react-linux Gallery", false);

      const indicator = new St.BoxLayout({
        style_class: "react-linux-gallery-indicator",
        y_align: Clutter.ActorAlign.CENTER,
      });

      indicator.add_child(
        new St.Icon({
          icon_name: "applications-development-symbolic",
          style_class: "system-status-icon",
          y_align: Clutter.ActorAlign.CENTER,
        }),
      );

      this._performanceLabel = new St.Label({
        style_class: "react-linux-gallery-performance",
        text: INITIAL_PERFORMANCE_LABEL,
        y_align: Clutter.ActorAlign.CENTER,
      });
      indicator.add_child(this._performanceLabel);
      this.add_child(indicator);
    }

    setPerformanceText(text: string): void {
      if (!this._performanceLabel) {
        return;
      }
      this._performanceLabel.text = text;
      this._performanceLabel.set_text?.(text);
      this._performanceLabel.get_clutter_text?.()?.set_text?.(text);
      this._performanceLabel.queue_relayout?.();
      this._performanceLabel.queue_redraw?.();
      this.queue_redraw?.();
    }

    performanceText(): string {
      return String(
        this._performanceLabel?.text ??
          this._performanceLabel?.get_text?.() ??
          this._performanceLabel?.get_clutter_text?.()?.get_text?.() ??
          "",
      );
    }
  },
);

class GalleryPerformanceMonitor {
  private readonly indicator: GalleryIndicator;
  private frameClock: any = null;
  private frameClockUpdating = false;
  private frameSignalId = 0;
  private jsFrames = 0;
  private jsSourceId = 0;
  private lastSampleUs = 0;
  private metrics: GalleryPerformanceMetrics = {
    jsFps: 0,
    jsFrames: 0,
    label: INITIAL_PERFORMANCE_LABEL,
    measuring: false,
    sampleMs: 0,
    samples: 0,
    uiFps: 0,
    uiFrames: 0,
  };
  private redrawSourceId = 0;
  private sampleSourceId = 0;
  private uiFrames = 0;

  constructor(indicator: GalleryIndicator) {
    this.indicator = indicator;
  }

  snapshot(): GalleryPerformanceMetrics {
    return { ...this.metrics };
  }

  start(): void {
    if (this.sampleSourceId !== 0) {
      return;
    }

    this.metrics = {
      jsFps: 0,
      jsFrames: 0,
      label: INITIAL_PERFORMANCE_LABEL,
      measuring: true,
      sampleMs: 0,
      samples: 0,
      uiFps: 0,
      uiFrames: 0,
    };
    this.uiFrames = 0;
    this.jsFrames = 0;
    this.lastSampleUs = GLib.get_monotonic_time();
    this.indicator.setPerformanceText(this.metrics.label);

    this.frameSignalId = global.stage.connect("after-paint", () => {
      this.uiFrames += 1;
    });
    this.jsSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FPS_TIMER_INTERVAL_MS, () => {
      this.jsFrames += 1;
      return GLib.SOURCE_CONTINUE;
    });
    this.sampleSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FPS_SAMPLE_INTERVAL_MS, () => this.sample());

    this.startContinuousPaint();
  }

  stop(): void {
    if (this.frameSignalId !== 0) {
      global.stage.disconnect(this.frameSignalId);
      this.frameSignalId = 0;
    }
    this.removeSource("sampleSourceId");
    this.removeSource("jsSourceId");
    this.removeSource("redrawSourceId");
    this.stopContinuousPaint();

    this.metrics = {
      ...this.metrics,
      label: INITIAL_PERFORMANCE_LABEL,
      measuring: false,
    };
    this.indicator.setPerformanceText(this.metrics.label);
  }

  private formatFps(value: number): string {
    return String(Math.max(0, Math.min(999, Math.round(value)))).padStart(2, " ");
  }

  private removeSource(field: "jsSourceId" | "redrawSourceId" | "sampleSourceId"): void {
    const sourceId = this[field];
    if (sourceId !== 0) {
      GLib.Source.remove(sourceId);
      this[field] = 0;
    }
  }

  private sample(): boolean {
    const nowUs = GLib.get_monotonic_time();
    const sampleMs = Math.max(1, (nowUs - this.lastSampleUs) / 1000);
    const uiFrames = this.uiFrames;
    const jsFrames = this.jsFrames;
    const uiFps = (uiFrames * 1000) / sampleMs;
    const jsFps = (jsFrames * 1000) / sampleMs;

    this.metrics = {
      jsFps: Math.round(jsFps),
      jsFrames,
      label: `UI ${this.formatFps(uiFps)} JS ${this.formatFps(jsFps)}`,
      measuring: true,
      sampleMs: Math.round(sampleMs),
      samples: this.metrics.samples + 1,
      uiFps: Math.round(uiFps),
      uiFrames,
    };
    this.indicator.setPerformanceText(this.metrics.label);

    this.uiFrames = 0;
    this.jsFrames = 0;
    this.lastSampleUs = nowUs;
    return GLib.SOURCE_CONTINUE;
  }

  private startContinuousPaint(): void {
    this.frameClock = global.stage.get_frame_clock?.() ?? null;
    if (this.frameClock?.begin_updating && this.frameClock?.end_updating) {
      this.frameClock.begin_updating();
      this.frameClockUpdating = true;
    }

    this.redrawSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FPS_TIMER_INTERVAL_MS, () => {
      global.stage.queue_redraw?.();
      return GLib.SOURCE_CONTINUE;
    });
  }

  private stopContinuousPaint(): void {
    if (this.frameClockUpdating && this.frameClock?.end_updating) {
      this.frameClock.end_updating();
    }
    this.frameClock = null;
    this.frameClockUpdating = false;
  }
}

export default class ReactLinuxGalleryExtension extends Extension {
  private control: ReturnType<typeof Gio.DBusExportedObject.wrapJSObject> | null = null;
  private indicator: GalleryIndicator | null = null;
  private hostItem: PopupMenu.PopupBaseMenuItem | null = null;
  private performanceMonitor: GalleryPerformanceMonitor | null = null;
  private root: ReactLinuxRoot | null = null;

  private hostActor(): any | null {
    return this.hostItem ? actorForObject(this.hostItem as any) : null;
  }

  private dumpActor(actor: any, depth = 0): unknown {
    if (!actor || depth > 14) {
      return null;
    }

    const [x, y] = actor.get_position?.() ?? [actor.x ?? 0, actor.y ?? 0];
    const [width, height] = actor.get_size?.() ?? [actor.width ?? 0, actor.height ?? 0];
    const children = actor.get_children?.() ?? [];

    return {
      accessibleName: actor.accessible_name ?? null,
      children: children.map((child: unknown) => this.dumpActor(child, depth + 1)).filter(Boolean),
      depth,
      height,
      name: actor.constructor?.name ?? "Actor",
      reactive: actor.reactive ?? false,
      style: actor.style ?? null,
      styleClass: actor.get_style_class_name?.() ?? actor.style_class ?? "",
      text: actor.text ?? actor.label ?? null,
      visible: actor.visible ?? true,
      width,
      x,
      y,
    };
  }

  private dumpLayout(): string {
    const [stageWidth, stageHeight] = global.stage.get_size();

    return JSON.stringify({
      indicator: this.dumpActor(this.indicator ? actorForObject(this.indicator as any) : null),
      menuOpen: Boolean(this.indicator?.menu.isOpen),
      performance: this.performanceMonitor?.snapshot() ?? null,
      performanceText: this.indicator?.performanceText?.() ?? null,
      stage: { height: stageHeight, width: stageWidth },
      tree: this.dumpActor(this.hostActor()),
    });
  }

  private setStepButtonsActive(active: boolean): void {
    const visit = (actor: any) => {
      if (!actor) {
        return;
      }
      const styleClass = actor.get_style_class_name?.() ?? actor.style_class ?? "";
      if (String(styleClass).split(/\s+/).includes("progress-step-button")) {
        if (active) {
          actor.add_style_pseudo_class?.("active");
        } else {
          actor.remove_style_pseudo_class?.("active");
        }
      }
      for (const child of actor.get_children?.() ?? []) {
        visit(child);
      }
    };

    visit(this.hostActor());
  }

  private captureStage(filename: string): string {
    const [stageWidth, stageHeight] = global.stage.get_size();
    const file = Gio.File.new_for_path(filename);
    const stream = file.replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    const screenshot = new Shell.Screenshot();
    screenshot.screenshot_area(0, 0, stageWidth, stageHeight, stream, (source, result) => {
      try {
        source.screenshot_area_finish(result);
      } catch (error) {
        console.error(error);
      } finally {
        stream.close(null);
      }
    });
    return filename;
  }

  enable() {
    this.indicator = new GalleryIndicatorClass();
    Main.panel.addToStatusArea(this.uuid, this.indicator);
    this.performanceMonitor = new GalleryPerformanceMonitor(this.indicator);
    this.performanceMonitor.start();

    this.hostItem = new PopupMenu.PopupBaseMenuItem({
      can_focus: false,
      reactive: false,
      style_class: "react-linux-gallery-host-item",
    });
    this.indicator.menu.addMenuItem(this.hostItem);

    this.root = createGnomeShellRoot(
      this.hostActor(),
      {
        Clutter,
        PopupMenu,
        QuickSettings,
        St,
      },
      {
        eventStopValue: Clutter.EVENT_STOP,
      },
    );
    this.root.render(<Gallery />);

    this.control = Gio.DBusExportedObject.wrapJSObject(GalleryControlInterface, {
      ActivatePopupImage: () => {
        galleryDevControls.activatePopupImage?.();
      },
      ActivatePopupOpen: () => {
        galleryDevControls.activatePopupOpen?.();
      },
      Capture: (filename: string) => this.captureStage(filename),
      Close: () => {
        this.indicator?.menu.close();
      },
      Dump: () => this.dumpLayout(),
      IsOpen: () => Boolean(this.indicator?.menu.isOpen),
      Open: () => {
        this.indicator?.menu.open();
      },
      ProgressDown: () => {
        galleryDevControls.progressDown?.();
      },
      ProgressUp: () => {
        galleryDevControls.progressUp?.();
      },
      SetProgress: (value: number) => {
        galleryDevControls.setProgress?.(value);
      },
      SetSlider: (value: number) => {
        galleryDevControls.setSliderValue?.(value);
      },
      SetSubmenuOpen: (open: boolean) => {
        galleryDevControls.setSubmenuOpen?.(open);
      },
      SetEntryText: (value: string) => {
        galleryDevControls.setEntryText?.(value);
      },
      SetStepButtonsActive: (active: boolean) => {
        this.setStepButtonsActive(active);
      },
      Toggle: () => {
        if (this.indicator?.menu.isOpen) {
          this.indicator.menu.close();
        } else {
          this.indicator?.menu.open();
        }
      },
      TogglePopupSwitch: () => {
        galleryDevControls.togglePopupSwitch?.();
      },
      ToggleSubmenu: () => {
        galleryDevControls.toggleSubmenu?.();
      },
    });
    this.control.export(Gio.DBus.session, "/org/react_linux/ReactLinuxGallery");
  }

  disable() {
    this.control?.unexport();
    this.control = null;

    this.performanceMonitor?.stop();
    this.performanceMonitor = null;

    this.root?.unmount();
    this.root = null;

    this.hostItem?.destroy();
    this.hostItem = null;

    this.indicator?.destroy();
    this.indicator = null;
  }
}
