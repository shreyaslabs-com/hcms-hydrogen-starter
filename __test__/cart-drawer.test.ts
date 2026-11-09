import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import {
  CART_OPEN_EVENT,
  EARLY_CART_CLICK_SCRIPT,
  cartOpenPending,
  consumePendingCartOpen,
  requestCartDrawer,
} from '../app/lib/cart-drawer.ts';

class FakeDialog {
  open = false;
  showModal() {
    this.open = true;
  }
}

type Globals = Record<string, unknown>;
const g = globalThis as unknown as Globals;
const keys = ['window', 'document', 'HTMLDialogElement'];
const saved = Object.fromEntries(keys.map((k) => [k, g[k]]));

function setup(dialog: FakeDialog | null) {
  const events: string[] = [];
  const assign = mock.fn();
  g.HTMLDialogElement = FakeDialog;
  g.document = { getElementById: () => dialog, readyState: 'complete' };
  g.window = {
    location: { assign },
    dispatchEvent: (event: Event) => events.push(event.type),
  };
  return { events, assign };
}

const click = (extra: Partial<MouseEvent> = {}) => {
  const event = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
    ...extra,
  };
  return event;
};

afterEach(() => {
  for (const k of keys) g[k] = saved[k];
  mock.timers.reset();
});

describe('early cart clicks (SF-22)', () => {
  it('opens a mounted drawer at once', () => {
    const dialog = new FakeDialog();
    setup(dialog);
    const event = click();
    requestCartDrawer(event, '/cart');
    assert.equal(event.prevented, true);
    assert.equal(dialog.open, true);
  });

  it('holds the click until the drawer mounts, then opens it (no /cart fallback)', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const { events, assign } = setup(null);
    requestCartDrawer(click(), '/cart');
    assert.equal(cartOpenPending(), true);
    assert.deepEqual(events, [CART_OPEN_EVENT]);
    const dialog = new FakeDialog();
    (g.document as { getElementById: () => unknown }).getElementById = () => dialog;
    consumePendingCartOpen();
    assert.equal(dialog.open, true);
    assert.equal(cartOpenPending(), false);
    mock.timers.tick(5000);
    assert.equal(assign.mock.callCount(), 0);
  });

  it('falls back to the cart page when the drawer is slow', () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    const { assign } = setup(null);
    requestCartDrawer(click(), '/cart');
    mock.timers.tick(2000);
    assert.deepEqual(assign.mock.calls[0]?.arguments, ['/cart']);
  });

  it('leaves modified clicks (new tab) alone', () => {
    setup(null);
    const event = click({ metaKey: true });
    requestCartDrawer(event, '/cart');
    assert.equal(event.prevented, false);
    assert.equal(cartOpenPending(), false);
  });

  it('the inline pre-hydration script targets drawer triggers only', () => {
    assert.match(EARLY_CART_CLICK_SCRIPT, /\[data-cart-drawer-trigger\]/);
    assert.doesNotMatch(EARLY_CART_CLICK_SCRIPT, /<\/script/i);
  });
});
