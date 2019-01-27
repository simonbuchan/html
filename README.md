# Yet Another HTML tagged string template library

What's this?

```js
document.body.append(html`
  Just a way to <em>safely</em> embed ${code('HTML DOM <3')} into Javascript.
`);

function code(content) {
  return html`<code>${content}</code>`;
}

const { fragment: message, slots: [messageList] } = html.instance`
  And further, allows poking values in after the fact.
  <ul>${null}</ul>
`;

document.body.append(message);
messageList.append(html`<li> First`);
messageList.append(html`<li> Second`);
messageList.append(html`<li> Third`);
```

Otherwise, this tries to get out of your way as much as it can, in the sense of not trying to hide DOM details.

See the API section below for more usage.

## Design

The API is based on JavaScript "tagged template literals" - which are a combination of regular template
string literals and function calls:

```js
const templateString = `before ${'first'} between ${'second'} after`;
console.log(templateString); // "before first between second after";

function join(strings, ...interpolations) {
  return strings.join("+") + " / " + interpolations.join("+");
}

const taggedTemplate = join`before ${'first'} between ${'second'} after`;
console.log(taggedTemplate); // "before + between + after / first+second"

// Largely equivalent to:
const functionResult = join(['before ', ' between ', ' after'], 'first', 'second');
console.log(functionResult); // "before + between + after / first+second"
```

However, note that unlike template string literals there is no requirement that tagged template literals has
interpolation values that can be converted to strings, or that it returns a string.

In this library, the interpolation arguments are HTML content that can be embedded, either a literal (not interpreted
as HTML) string, a DOM Node, or one of the "falsey" values `undefined`, `null` or `false`, all of which are treated
equivalently to an empty document fragment.

You can embed multiple nodes using `DocumentFragments`, in particular those from other ``` html`` ``` calls, or
if you have to create them dynamically, using `document.createDocumentFragment()` and the usual `.append(...args)` etc.
DOM methods. Be aware, however, that document fragments have their content removed when they are inserted, so they
can't be re-used. This is part of this library's approach of trying to avoid doing unrelated magic for you, you can
simply define a helper to convert an array to a document fragment in whatever way you like if it helps.

## API

### Creating DOM content once

The basic usage is the default export:

```ts
function html(strings: TemplateStringsArray, ...args: TemplateArguments[]): DocumentFragment;
```

Where `TemplateStringsArray` is the TypeScript built-in name for the strings array for tagged template literals,
`DocumentFragment` is the DOM type, and `TemplateArgument` is the values for the interpolated values you can provide:

```ts
export type TemplateArgument = string | Node | false | null;
```

Here `Node` is again, the DOM type, the supertype for every node in the DOM, be they elements, comments, documents,
etc. (it probably should in fact be `ChildNode | DocumentFragment` in order to exclude documents, but it's not worth
the extra confusion)

This has a simple helper method tacked on that verifies and returns a single Element, skipping any
surrounding whitespace Text nodes for example, for the common case of needing to then add event listeners,
or whatever:

```ts
function html.element(strings: TemplateStringsArray, ...args: TemplateArguments[]): Element;
function html.el(strings: TemplateStringsArray, ...args: TemplateArguments[]): Element;
```

#### Usage:

```js
import html from "@simonbuchan/html";

document.body.append(html`Hello, world!`); // Identical to .append('Hello, world!')
document.body.append(html`
  <!-- Parsed exactly as .html files are by the browser -->
  <h1>Header
  <p>Some content
`);

// string slots are not parsed as HTML, the markup will be rendered literally
const stringMessage = '<h1>Some content</h1>';
document.body.append(html`Your message: ${stringMessage}`);

// Creates a DocumentFragment Node, a single-use Node list.
const fragmentMessage = html`<h1>Some content</h1>`;
// This will append a Text node and an H1 Element, emptying `fragmentMessage`
document.body.append(html`Your message: ${fragmentMessage}`);
// This will append only a Text node, as `fragmentMessage` is now empty.
document.body.append(html`Your message: ${fragmentMessage}`);

// Creates an H1 Element Node, which can be re-used.
// This is simply asserting that the result of html() contains only a
// single top-level Element, and returning that.
const elementMessage = html.element`<h1>Some content</h1>`;
// This will append a Text node and an H1 Element
document.body.append(html`Your message: ${elementMessage}`);
// This will append a Text node and an H1 Element again.
document.body.append(html`Your message: ${elementMessage}`);
```

### Updating content after creation

This is why the package is not 1.0 yet - this API will need some iteration on to make it nicer to
use (probably symbols or something?). For now:

```ts
function html.instance(strings: TemplateStringsArray, ...args: TemplateArgument[]): Instance;

interface Instance {
  fragment: DocumentFragment;
  node: Node | null;
  element: Element | null;
  slots: Slot[];
  childSlots: ChildSlot[];
  attrSlots: AttrSlot[];
}

interface Slot {
  update(arg: TemplateArgument): void;
}

interface ChildSlot {
  nodes(): ChildNode[];
  range(): Range;
  clear(): void;
  prepend(...items: Array<string | Node>): void;
  append(...items: Array<string | Node>): void;
  replace(...items: Array<string | Node>): void;
}

interface AttrSlot {
  element: Element;
  name: string;
  remove(): void;
  set(value: string): void;
}
```

Respectively, `fragment` is what `html` would have returned, `node` is `fragment.firstChild`, `element` is
`fragment.firstElementChild`, `slots` allows generically updating all slots in the same order in the template, while
more usefully, `childSlots` and `attrSlots` are filtered to just those types of slots, and have specialized APIs.

This gives you the created content, and some DOM-like wrappers for the slots that provide common shortcuts, and
hide some of the detail of how to handle inserting the first item or removing all the current content, which would
otherwise depend on knowing the internal guarantees of the library.

Otherwise, keep in mind that you can do whatever you like to the contents of the slots: in particular removing or
reparenting contents, using `.before()` or `.after()` on items, etc. is perfectly fine.

Modifying the returned slot objects will have no effect: setting `element` will not change the behavior of
`set()`, for example.

#### Usage

```js
function createList(renderItem, {
  headers = null,
  footers = null,
  containerClass = null,
  listClass = 'list',
  listItemClass = null,
  // Or you can use literal `null`, if you don't want an initial item.
  empty = html.el`<span class=list--empty>Empty</span>`,
}) {
  const {
    element,
    childSlots: [headersSlot, itemsSlot],
    attrSlots: [, listClassSlot],
  } = html.instance`
    <div class=${containerClass}>
      ${headers}
      <ul class=${listClass}>${empty}</ul>
      ${footers}
    </div>
  `;

  const items = [];

  return { element, setListClass, setHeaders, add, remove, clear };

  function setListClass(value) {
    listClassSlot.set(value);
  }

  function setHeaders(...contents) {
    headersSlot.replace(...contents);
  }

  function add(value) {
    if (empty) {
      empty.remove();
    }
    const node = html.el`<li class=${listItemClass}>${renderItem(value)}</li>`;
    items.push({ node, value });
    itemsSlot.append(node);
    return node;
  }

  function remove(value) {
    const index = items.findIndex(i => i.value === value);
    let node;
    if (index >= 0) {
      node = items[index].node;
      node.remove();
      items.splice(index, 1);
    }
    if (!items.length && empty) {
      itemsSlot.append(empty);
    }
    return node;
  }

  function clear() {
    itemsSlot.clear();
    items.splice(0, items.length);
    if (empty) {
      itemsSlot.append(empty);
    }
  }
}
```

## But why?

You may be aware of libraries like [hyperHTML](https://github.com/WebReflection/hyperHTML) or
[lit-html](https://github.com/Polymer/lit-html), which let you use a somewhat obscure feature
of JavaScript, tagged string templates, in order to elegantly and easily create HTML content
in your code, without requiring transpilers or large VDOM runtimes.

For a very simple example:

```js
import hyper from 'hyperhtml';

const message = 'I <3 the DOM!';

hyper(document.body)`
  <h1>Hello, world!</h1>
  <output>${message}</output>
`;
// Or:
document.body.appendChild(hyper`<h1>Hello, world!</h1>`);

import lit from 'lit-html';
lit.render(
  lit.html`
    <h1>Hello, world!</h1>
    <output>${message}</output>
  `,
  document.body);
```

As you can see, they can be quite similar, but these libraries can do much more, in particular they both support
various methods of hooking into objects in order to add event listeners, promises in slots, diffed updates, etc!

These extra abilities are why they prefer to add the extra indirection of being told where to add the content, which
allows them more control about when the DOM updates.

I found this all a bit overkill or difficult for what I actually wanted, essentially a shorthand for getting a DOM
element with potentially complex content I can do whatever I want to, but I really liked the syntax, and the impressive
performance the technique these both use, and I've stolen shamelessly, to parse the HTML into DOM elements, which they
both describe much more nicely than I could here.

## Differences

Unlike both these libraries, instead of accepting fancy arguments like promises or callbacks in slots, or separating
the template from the render steps, I simply return the created HTML content and, if requested, APIs to immediately
replace the slot content. Otherwise, I try to just get out of your way by giving you what so you can chose how to modify the DOM. If you
want to add or move elements in a list, the DOM already provides methods like `.append()` and `.before()` that will handle moving
the elements, if you want to add events, then get the element first with `html.element` then use `.addEventListener()`,
and so on. If you find that you are ending up with common patterns, then there's nothing stopping you from creating
straight-forward short-hand methods like:

```js
function addEvents(node, events) {
  for (const [name, listener] of Object.entries(events)) {
    node.addEventListener(name, listener);
  }
  return node;
}

document.body.append(html`
  <h1>Embedding fancier things
  <p>This button has events:
  ${addEvents(html.el`<button>Click me!</button>`, {
    click(event) {
      console.log('Clicked!');
      event.target.remove();
    },
  })}
`);
```