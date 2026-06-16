import { propsWithoutChildren, type ReactLinuxAdapter, type ReactLinuxProps } from "./adapter";

export type MockNode = MockElement | MockText;

export interface MockContainer {
  kind: "container";
  children: MockNode[];
}

export interface MockElement {
  kind: "element";
  type: string;
  props: ReactLinuxProps;
  children: MockNode[];
  visible: boolean;
  destroyed: boolean;
  parent: MockContainer | MockElement | null;
}

export interface MockText {
  kind: "text";
  text: string;
  visible: boolean;
  destroyed: boolean;
  parent: MockContainer | MockElement | null;
}

function isElement(node: MockContainer | MockNode): node is MockContainer | MockElement {
  return "children" in node;
}

function childrenOf(parent: MockContainer | MockElement): MockNode[] {
  return parent.children;
}

function detach(child: MockNode): void {
  const parent = child.parent;
  if (!parent || !isElement(parent)) {
    return;
  }
  const siblings = childrenOf(parent);
  const index = siblings.indexOf(child);
  if (index >= 0) {
    siblings.splice(index, 1);
  }
  child.parent = null;
}

function destroy(node: MockNode): void {
  node.destroyed = true;
  if (node.kind === "element") {
    for (const child of [...node.children]) {
      detach(child);
      destroy(child);
    }
    node.children = [];
  }
}

function isTextContent(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

function widgetNameFor(type: string): string {
  if (type.startsWith("st:")) {
    return type.slice(3);
  }
  return type;
}

function hostPropsFor(type: string, props: ReactLinuxProps): ReactLinuxProps {
  const nextProps = propsWithoutChildren(props);
  const widgetName = widgetNameFor(type);
  if (isTextContent(props.children)) {
    if (widgetName === "Button" || type === "button") {
      return { ...nextProps, label: String(props.children) };
    }
    if (widgetName === "Label" || type === "label") {
      return { ...nextProps, text: String(props.children) };
    }
  }
  return nextProps;
}

export function createMockContainer(): MockContainer {
  return { kind: "container", children: [] };
}

export function createMockAdapter(): ReactLinuxAdapter<MockElement, MockText, MockContainer> {
  return {
    createInstance(type, props) {
      return {
        kind: "element",
        type,
        props: hostPropsFor(type, props),
        children: [],
        visible: props.hidden !== true,
        destroyed: false,
        parent: null,
      };
    },

    createText(text) {
      return { kind: "text", text, visible: true, destroyed: false, parent: null };
    },

    appendChild(parent, child) {
      detach(child);
      childrenOf(parent).push(child);
      child.parent = parent;
    },

    insertBefore(parent, child, before) {
      detach(child);
      const children = childrenOf(parent);
      const beforeIndex = children.indexOf(before);
      if (beforeIndex < 0) {
        children.push(child);
      } else {
        children.splice(beforeIndex, 0, child);
      }
      child.parent = parent;
    },

    removeChild(parent, child) {
      const children = childrenOf(parent);
      const index = children.indexOf(child);
      if (index >= 0) {
        children.splice(index, 1);
      }
      child.parent = null;
      destroy(child);
    },

    clearContainer(container) {
      for (const child of [...container.children]) {
        child.parent = null;
        destroy(child);
      }
      container.children = [];
    },

    commitUpdate(node, _type, _prevProps, nextProps) {
      node.props = hostPropsFor(node.type, nextProps);
      node.visible = nextProps.hidden !== true;
    },

    resetTextContent(node) {
      node.children = node.children.filter((child) => {
        if (child.kind !== "text") {
          return true;
        }
        child.parent = null;
        destroy(child);
        return false;
      });
    },

    setText(textNode, text) {
      textNode.text = text;
    },

    setVisible(node, visible) {
      node.visible = visible;
    },

    getPublicInstance(node) {
      return node;
    },
  };
}
