import {
  collectChildNodes,
  createTemplate,
  createTemplateInstance,
  replacement,
  Template,
  TemplateArgument,
  updateSlot,
} from "./template";

export { TemplateArgument };

const templates = new WeakMap<TemplateStringsArray, Template>();

function getTemplate(strings: TemplateStringsArray): Template {
  let template = templates.get(strings);
  if (!template) {
    template = createTemplate(document, strings);
    templates.set(strings, template);
  }
  return template;
}

/** Create some HTML content from a template string. */
export default function html(strings: TemplateStringsArray, ...args: TemplateArgument[]): DocumentFragment {
  const template = getTemplate(strings);
  const { fragment } = createTemplateInstance(document, template, args);
  return fragment;
}

html.el = htmlElement;
html.element = htmlElement;
/** Create an HTML element from a template string. */
function htmlElement(strings: TemplateStringsArray, ...args: TemplateArgument[]): Element {
  const template = getTemplate(strings);

  if (template.content.childElementCount !== 1) {
    throw new Error(`html.element template should have a single top-level element: ${strings.join(replacement)}`);
  }

  const { fragment } = createTemplateInstance(document, template, args);

  return fragment.firstElementChild!;
}

export interface Instance {
  fragment: DocumentFragment;
  node: Node | null;
  element: Element | null;
  slots: Slot[];
  childSlots: ChildSlot[];
  attrSlots: AttrSlot[];
}

export interface Slot {
  update(arg: TemplateArgument): void;
}

export interface ChildSlot {
  nodes(): ChildNode[];
  range(): Range;
  clear(): void;
  prepend(...items: Array<string | Node>): void;
  append(...items: Array<string | Node>): void;
  replace(...items: Array<string | Node>): void;
}

export interface AttrSlot {
  element: Element;
  name: string;
  remove(): void;
  set(value: string): void;
}

html.instance = htmlInstance;

/** Create an API to dynamically update an HTML fragment from a template string. */
function htmlInstance(strings: TemplateStringsArray, ...args: TemplateArgument[]): Instance {
  const template = getTemplate(strings);

  const { fragment, slots, attrValueSlots, nodeSlots } = createTemplateInstance(document, template, args);

  return {
    fragment,
    node: fragment.firstChild,
    element: fragment.firstElementChild,
    slots: slots.map(slot => ({
      update(arg: TemplateArgument) {
        updateSlot(document, slot, arg);
      },
    })),
    attrSlots: attrValueSlots.map(({ element, name }) => ({
      element,
      name,
      remove() {
        element.removeAttribute(name);
      },
      set(value: string) {
        element.setAttribute(name, value);
      },
    })),
    childSlots: nodeSlots.map(({ startAfter, endBefore }) => {
      return ({
        nodes() {
          return collectChildNodes(startAfter, endBefore);
        },
        range,
        clear() {
          range().deleteContents();
        },
        prepend(...args: Array<Node | string>) {
          if (startAfter) {
            startAfter.after(...args);
          } else {
            endBefore.parentNode!.prepend(...args);
          }
        },
        append(...args: Array<Node | string>) {
          endBefore.before(...args);
        },
        replace(...args: Array<Node | string>) {
          range().deleteContents();
          endBefore.before(...args);
        },
      });

      function range(): Range {
        const range = document.createRange();
        if (startAfter) {
          range.setStartAfter(startAfter);
        } else {
          range.setStart(endBefore.parentNode!, 0);
        }
        range.setEndBefore(endBefore);
        return range;
      }
    }),
  }
}
