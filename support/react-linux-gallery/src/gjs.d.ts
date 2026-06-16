declare module "gi://Clutter" {
  const Clutter: any;
  export default Clutter;
}

declare module "gi://Gio" {
  const Gio: any;
  export default Gio;
}

declare module "gi://GLib" {
  const GLib: any;
  export default GLib;
}

declare module "gi://GObject" {
  const GObject: {
    registerClass<T>(klass: T): T;
  };
  export default GObject;
}

declare module "gi://St" {
  const St: any;
  export default St;
}

declare module "gi://Shell" {
  export class Screenshot {
    screenshot_area(
      x: number,
      y: number,
      width: number,
      height: number,
      stream: unknown,
      callback: (source: Screenshot, result: unknown) => void,
    ): void;
    screenshot_area_finish(result: unknown): [boolean, string];
  }

  export default { Screenshot };
}

declare module "resource:///org/gnome/shell/extensions/extension.js" {
  export class Extension {
    uuid: string;
  }
}

declare module "resource:///org/gnome/shell/ui/main.js" {
  export const panel: any;
}

declare module "resource:///org/gnome/shell/ui/panelMenu.js" {
  export class Button {
    [key: string]: any;
    constructor(...args: any[]);
  }
}

declare module "resource:///org/gnome/shell/ui/popupMenu.js" {
  export class PopupBaseMenuItem {
    [key: string]: any;
    constructor(...args: any[]);
  }
  export class PopupImageMenuItem {
    [key: string]: any;
    constructor(...args: any[]);
  }
  export class PopupMenu {
    [key: string]: any;
    constructor(...args: any[]);
  }
  export class PopupMenuItem {
    [key: string]: any;
    constructor(...args: any[]);
  }
  export class PopupMenuSection {
    [key: string]: any;
    constructor(...args: any[]);
  }
  export class PopupSeparatorMenuItem {
    [key: string]: any;
    constructor(...args: any[]);
  }
  export class PopupSubMenuMenuItem {
    [key: string]: any;
    constructor(...args: any[]);
  }
  export class PopupSwitchMenuItem {
    [key: string]: any;
    constructor(...args: any[]);
  }
}

declare module "resource:///org/gnome/shell/ui/quickSettings.js" {
  export class QuickMenuToggle {
    [key: string]: any;
    constructor(...args: any[]);
  }
  export class QuickSettingsItem {
    [key: string]: any;
    constructor(...args: any[]);
  }
  export class QuickSlider {
    [key: string]: any;
    constructor(...args: any[]);
  }
  export class QuickToggle {
    [key: string]: any;
    constructor(...args: any[]);
  }
  export class SystemIndicator {
    [key: string]: any;
    constructor(...args: any[]);
  }
}

declare module "*.css";
