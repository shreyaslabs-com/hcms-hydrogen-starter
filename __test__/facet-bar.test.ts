import assert from 'node:assert/strict';
import test from 'node:test';

import { bindFacetBar, nextPageSectionData } from '../app/lib/hcms/facet-bar.ts';

/** Minimal DOM fakes: a bar with `<details>` panels, each with a `<summary>`. */
class FakeNode extends EventTarget {
  parent: FakeNode | null = null;
  children: FakeNode[] = [];
  tag: string;
  constructor(tag: string) {
    super();
    this.tag = tag;
  }
  add(child: FakeNode) {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  contains(node: FakeNode | null): boolean {
    for (let n = node; n; n = n.parent) if (n === this) return true;
    return false;
  }
}
class Details extends FakeNode {
  open = false;
  summary = this.add(new Summary('summary')) as Summary;
  input = this.add(new FakeNode('input'));
  constructor() {
    super('details');
  }
  querySelector() {
    return this.summary;
  }
}
class Summary extends FakeNode {
  focused = 0;
  focus() {
    this.focused += 1;
  }
}
class Bar extends FakeNode {
  panels: Details[] = [];
  constructor() {
    super('div');
    for (let i = 0; i < 3; i += 1) this.panels.push(this.add(new Details()) as Details);
  }
  querySelectorAll() {
    return this.panels.filter((p) => p.open);
  }
}
// `closest` on non-details nodes walks up.
Object.assign(FakeNode.prototype, {
  closest(this: FakeNode, selector: string) {
    if (this instanceof Details && selector === 'details[open]' && this.open) return this;
    return this.parent
      ? (this.parent as FakeNode & { closest: (s: string) => unknown }).closest(selector)
      : null;
  },
});

const fire = (node: FakeNode, type: string, extra: Record<string, unknown> = {}) => {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, extra);
  Object.defineProperty(event, 'target', { value: node });
  // Root-level listeners see the event as if it bubbled from `node`.
  let top: FakeNode = node;
  while (top.parent) top = top.parent;
  EventTarget.prototype.dispatchEvent.call(top, event);
  return event;
};

test('one panel open at a time; Escape closes and returns focus to its summary', () => {
  const bar = new Bar();
  const doc = new EventTarget();
  const unbind = bindFacetBar(bar as never, doc as never);
  const [a, b] = bar.panels as [Details, Details];
  a.open = true;
  fire(a, 'toggle');
  b.open = true;
  fire(b, 'toggle');
  assert.equal(a.open, false);
  assert.equal(b.open, true);

  const escape = fire(b.input, 'keydown', { key: 'Escape' });
  assert.equal(b.open, false);
  assert.equal(b.summary.focused, 1);
  assert.equal(escape.defaultPrevented, true);

  // Other keys / closed panels are ignored.
  b.open = true;
  fire(b.input, 'keydown', { key: 'Enter' });
  assert.equal(b.open, true);
  unbind();
});

test('a click outside the bar closes open panels', () => {
  const bar = new Bar();
  const doc = new EventTarget();
  const unbind = bindFacetBar(bar as never, doc as never);
  const [a] = bar.panels as [Details];
  a.open = true;
  const inside = new Event('pointerdown');
  Object.defineProperty(inside, 'target', { value: a.input });
  doc.dispatchEvent(inside);
  assert.equal(a.open, true);
  const outside = new Event('pointerdown');
  Object.defineProperty(outside, 'target', { value: new FakeNode('button') });
  doc.dispatchEvent(outside);
  assert.equal(a.open, false);
  unbind();
  a.open = true;
  doc.dispatchEvent(outside);
  assert.equal(a.open, true); // listeners removed
});

test('nextPageSectionData reads the HCMS page data of a route loader result', () => {
  assert.deepEqual(nextPageSectionData({ hcms: { data: { 'section:s': 1 } } }), { 'section:s': 1 });
  assert.equal(nextPageSectionData({ hcms: null }), null);
  assert.equal(nextPageSectionData(undefined), null);
});
