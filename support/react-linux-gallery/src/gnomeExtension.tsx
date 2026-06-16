import Clutter from "gi://Clutter";
import Gio from "gi://Gio";
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
    _init() {
      super._init(0.5, "react-linux Gallery", false);

      this.add_child(
        new St.Icon({
          icon_name: "applications-development-symbolic",
          style_class: "system-status-icon",
        }),
      );
    }
  },
);

export default class ReactLinuxGalleryExtension extends Extension {
  private control: ReturnType<typeof Gio.DBusExportedObject.wrapJSObject> | null = null;
  private indicator: GalleryIndicator | null = null;
  private hostItem: PopupMenu.PopupBaseMenuItem | null = null;
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
      menuOpen: Boolean(this.indicator?.menu.isOpen),
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

    this.root?.unmount();
    this.root = null;

    this.hostItem?.destroy();
    this.hostItem = null;

    this.indicator?.destroy();
    this.indicator = null;
  }
}
