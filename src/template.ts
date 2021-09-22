import { nodeFromPath, NodePath, pathToNode } from './paths';

// Stolen from hyper-html! Should work fine for now as it
// just needs to not be in the template, not the content.
export const replacement = '⚡';

export interface TemplateNodeSlot {
  type: 'node';
  path: NodePath;
}

export interface TemplateAttrValueSlot {
  type: 'attr-value';
  path: NodePath;
  name: string;
}

export type TemplateSlot = TemplateNodeSlot | TemplateAttrValueSlot;

export interface Template {
  element: HTMLTemplateElement;
  content: DocumentFragment;
  slots: TemplateSlot[];
}

export type TemplateArgument = string | Node | false | null;

export function createTemplate(document: Document, strings: TemplateStringsArray): Template {
  const element = document.createElement('template');
  element.innerHTML = strings.join(replacement);
  const { content } = element;

  const it = document.createNodeIterator(
    content,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );

  const slots: TemplateSlot[] = [];

  let node = it.nextNode();
  while (node) {
    // grab the next node first, so changes to the current node
    // (for example, splitting Text) won't break iteration.
    const next = it.nextNode();

    switch (node.nodeType) {
      case Node.TEXT_NODE: {
        let lastSlot: TemplateNodeSlot | null = null;
        let text = node as Text;
        let dataIndex;
        while (0 <= (dataIndex = text.data.indexOf(replacement))) {
          // splitText() returns the new Text node after the split.
          // First cut off the text after the replacement character,
          // then if needed cut off the text before it.
          // The unconditional first split is needed to ensure there
          // is always a node to be before (that is, node.nextSibling
          // and node.previousSibling are constant in instances)
          const before = text;
          text = text.splitText(dataIndex + 1);
          const split = dataIndex ? before.splitText(dataIndex) : before;
          dataIndex = 0;

          let slot: TemplateNodeSlot = {
            type: 'node',
            path: pathToNode(content, split),
          };
          lastSlot = slot;

          slots.push(slot);
        }
        break;
      }
      case Node.ELEMENT_NODE: {
        const element = node as Element;
        for (const attr of element.attributes) {
          if (attr.value === replacement) {
            slots.push({
              type: 'attr-value',
              path: pathToNode(content, element),
              name: attr.name,
            });
          }
        }
        break;
      }
    }

    node = next;
  }

  if (slots.length !== strings.length - 1) {
    throw new Error(`Could not find all replacements in template: ${strings.join(replacement)}`);
  }

  return { element, content, slots };
}

export interface NodeSlot {
  type: 'node';
  startAfter: ChildNode | null;
  endBefore: ChildNode;
}

export interface AttrValueSlot {
  type: 'attr-value';
  element: Element;
  name: string;
}

export type TemplateInstanceSlot = NodeSlot | AttrValueSlot;

export interface TemplateInstance {
  fragment: DocumentFragment;
  slots: TemplateInstanceSlot[];
  nodeSlots: NodeSlot[];
  attrValueSlots: AttrValueSlot[];
}

export function createTemplateInstance(
  document: Document,
  template: Template,
  args: TemplateArgument[],
): TemplateInstance {
  const fragment = document.importNode(template.content, true);

  // First, collect new slots...
  const slots: TemplateInstanceSlot[] = [];
  const nodeSlots: NodeSlot[] = [];
  const attrValueSlots: AttrValueSlot[] = [];

  for (let i = 0; i !== template.slots.length; i++) {
    const templateSlot = template.slots[i];

    const node = nodeFromPath(fragment, templateSlot.path);

    switch (templateSlot.type) {
      default:
        throw new Error(`Unhandled type for template slot: ${JSON.stringify(templateSlot)}`);

      case 'node':
        const nodeSlot: NodeSlot = {
          type: 'node',
          startAfter: node.previousSibling as ChildNode | null,
          endBefore: node.nextSibling as ChildNode,
        };
        slots.push(nodeSlot);
        nodeSlots.push(nodeSlot);
        break;

      case 'attr-value':
        const attrValueSlot: AttrValueSlot = {
          type: 'attr-value',
          element: node as Element,
          name: templateSlot.name,
        };
        slots.push(attrValueSlot);
        attrValueSlots.push(attrValueSlot);
        break;
    }
  }

  // ... then update slots, in case it messes up traversal
  for (let i = 0; i !== template.slots.length; i++) {
    const slot = slots[i];
    const arg = args[i];
    switch (slot.type) {
      case 'node':
        updateNodeSlot(document, slot, arg);
        break;
      case 'attr-value':
        updateAttrValueSlot(slot, arg);
        break;
    }
  }

  return {
    fragment,
    slots,
    nodeSlots,
    attrValueSlots,
  };
}

export function collectChildNodes(startAfter: ChildNode | null, endBefore: ChildNode) {
  // Collect current nodes. Trying to handle external mutations as best we can here, so the code is a little
  // redundant.
  const nodes = [];
  if (startAfter) {
    for (let node: Node | null = startAfter; (node = node.nextSibling) && node !== endBefore;) {
      nodes.push(node as ChildNode); // if a node has a sibling, it must be a ChildNode.
    }
  } else {
    for (let node: Node | null = endBefore; (node = node.previousSibling);) {
      nodes.unshift(node as ChildNode);
    }
  }
  return nodes;
}

export function updateNodeSlot(document: Document, slot: NodeSlot, arg: TemplateArgument) {
  const current = collectChildNodes(slot.startAfter, slot.endBefore);

  if (typeof arg === 'string') {
    let textNode = current.find(node => node.nodeType === Node.TEXT_NODE) as Text | null;
    if (textNode) {
      textNode.data = arg;
    } else {
      textNode = document.createTextNode(arg);
      slot.endBefore.before(textNode);
    }
    for (const node of current) {
      if (node !== textNode) {
        node.remove();
      }
    }
  } else if (arg != null && arg !== false) {
    if (!(current as Node[]).includes(arg)) {
      slot.endBefore.before(arg);
    }
    for (const node of current) {
      if (node !== arg) {
        node.remove();
      }
    }
  } else {
    for (const node of current) {
      node.remove();
    }
  }
}

export function updateAttrValueSlot(slot: AttrValueSlot, arg: TemplateArgument) {
  if (typeof arg === 'string') {
    slot.element.setAttribute(slot.name, arg);
  } else if (arg != null && arg !== false) {
    console.warn('Cannot assign non-string value to attribute slot %O: %O', name, arg);
    slot.element.removeAttribute(slot.name);
  } else {
    slot.element.removeAttribute(slot.name);
  }
}

export function updateSlot(document: Document, slot: TemplateInstanceSlot, arg: TemplateArgument) {
  switch (slot.type) {
    case 'node': {
      updateNodeSlot(document, slot, arg);
      break;
    }
    case 'attr-value': {
      updateAttrValueSlot(slot, arg);
      break;
    }
  }
}
