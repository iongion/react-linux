import { describe, expect, it } from "vitest";

import {
  allComponentDescriptors,
  componentChildContainerFor,
  componentChildPolicyFor,
  componentFamilyFor,
  resolveComponentDescriptor,
} from "./registry";

describe("component descriptor registry", () => {
  it("resolves built-in aliases to canonical host types", () => {
    expect(resolveComponentDescriptor("box").type).toBe("st:BoxLayout");
    expect(resolveComponentDescriptor("popupSwitchMenuItem").type).toBe("popup:PopupSwitchMenuItem");
    expect(resolveComponentDescriptor("quickToggle").type).toBe("quick:QuickToggle");
  });

  it("preserves native style classes required by GNOME Shell", () => {
    expect(resolveComponentDescriptor("quick:QuickToggle").nativeStyleClass).toBe("quick-toggle");
    expect(resolveComponentDescriptor("quick:QuickSlider").nativeStyleClass).toBe("quick-slider");
    expect(resolveComponentDescriptor("popup:PopupMenuItem").nativeStyleClass).toBe("popup-menu-item");
  });

  it("keeps child attachment metadata in one registry", () => {
    expect(componentFamilyFor("popup:PopupMenuItem")).toBe("popup");
    expect(componentChildPolicyFor("popup:PopupMenuItem")).toBe("menuItems");
    expect(componentChildPolicyFor("quick:QuickToggle")).toBe("quickSettingsItems");
    expect(componentChildContainerFor("popup:PopupSubMenuMenuItem")).toBe("menu");
    expect(componentChildContainerFor("quick:QuickMenuToggle")).toBe("menu");
  });

  it("supports prefixed escape-hatch component names", () => {
    expect(resolveComponentDescriptor("st:PasswordEntry")).toMatchObject({
      family: "st",
      nativeObjectName: "PasswordEntry",
      styleName: "password-entry",
      type: "st:PasswordEntry",
    });
  });

  it("registers unique canonical descriptor types", () => {
    const types = allComponentDescriptors().map((descriptor) => descriptor.type);
    expect(new Set(types).size).toBe(types.length);
  });
});
