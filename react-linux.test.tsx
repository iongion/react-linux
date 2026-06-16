import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { Box, Button, createMockAdapter, createMockContainer, createRoot, Label, type MockElement } from ".";

function elementText(node: MockElement): string {
  return node.children
    .map((child) => {
      if (child.kind === "text") {
        return child.text;
      }
      return elementText(child);
    })
    .join("");
}

describe("react-linux mock renderer", () => {
  it("mounts an element tree into a container", () => {
    const container = createMockContainer();
    const root = createRoot(container, createMockAdapter());

    root.render(
      <Box role="root">
        <Label text="ignored">Hello</Label>
        <Button enabled={true}>Run</Button>
      </Box>,
    );

    expect(container.children).toHaveLength(1);
    const box = container.children[0] as MockElement;
    expect(box.type).toBe("st:BoxLayout");
    expect(box.props.role).toBe("root");
    expect(box.children.map((child) => (child.kind === "element" ? child.type : child.kind))).toEqual([
      "st:Label",
      "st:Button",
    ]);
    expect((box.children[0] as MockElement).props.text).toBe("Hello");
    expect((box.children[1] as MockElement).props.label).toBe("Run");
  });

  it("updates props and text content", () => {
    const container = createMockContainer();
    const root = createRoot(container, createMockAdapter());

    root.render(<Label tone="quiet">Old</Label>);
    root.render(<Label tone="loud">New</Label>);

    const label = container.children[0] as MockElement;
    expect(label.props.tone).toBe("loud");
    expect(label.props.text).toBe("New");
  });

  it("reorders keyed children without destroying them", () => {
    const container = createMockContainer();
    const root = createRoot(container, createMockAdapter());

    root.render(
      <Box>
        <Label key="a">A</Label>
        <Label key="b">B</Label>
        <Label key="c">C</Label>
      </Box>,
    );
    const box = container.children[0] as MockElement;
    const [a, b, c] = box.children;

    root.render(
      <Box>
        <Label key="c">C</Label>
        <Label key="a">A</Label>
        <Label key="b">B</Label>
      </Box>,
    );

    expect(box.children).toEqual([c, a, b]);
    expect(a.destroyed).toBe(false);
    expect(b.destroyed).toBe(false);
    expect(c.destroyed).toBe(false);
  });

  it("destroys removed subtrees", () => {
    const container = createMockContainer();
    const root = createRoot(container, createMockAdapter());

    root.render(
      <Box>
        <Label key="keep">Keep</Label>
        <Box key="drop">
          <Label>Drop</Label>
        </Box>
      </Box>,
    );
    const box = container.children[0] as MockElement;
    const dropped = box.children[1] as MockElement;
    const droppedChild = dropped.children[0];

    root.render(
      <Box>
        <Label key="keep">Keep</Label>
      </Box>,
    );

    expect(box.children).toHaveLength(1);
    expect(dropped.destroyed).toBe(true);
    expect(droppedChild.destroyed).toBe(true);
  });

  it("stores event props and exposes public refs", () => {
    const container = createMockContainer();
    const root = createRoot(container, createMockAdapter());
    const onClick = vi.fn();
    const ref = createRef<MockElement>();

    root.render(
      <Button ref={ref} onClick={onClick}>
        Start
      </Button>,
    );

    const button = container.children[0] as MockElement;
    expect(button.props.onClick).toBe(onClick);
    expect(ref.current).toBe(button);
  });

  it("clears the container on unmount", () => {
    const container = createMockContainer();
    const root = createRoot(container, createMockAdapter());

    root.render(<Label>Mounted</Label>);
    const label = container.children[0];
    root.unmount();

    expect(container.children).toEqual([]);
    expect(label.destroyed).toBe(true);
  });
});
