/**
 * Cart status announcements (Build a box removals, ADR 010): the row that triggers one is gone by
 * the time it's read, so the drawer / cart page own the polite region. Tiny on purpose: the empty
 * cart page imports it without the cart row code (D-26 `/cart` budget).
 */
import { useEffect, useState } from 'react';

const ANNOUNCE_EVENT = 'hcms:cart-announce';

/** Announces `text` in the cart's status region. */
export function announceCart(text: string): void {
  window.dispatchEvent(new CustomEvent(ANNOUNCE_EVENT, { detail: text }));
}

/** Text for the cart's polite status region (cleared after a few seconds). */
export function useCartAnnouncement(): string {
  const [text, setText] = useState('');
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAnnounce = (event: Event) => {
      setText((event as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setText(''), 5000);
    };
    window.addEventListener(ANNOUNCE_EVENT, onAnnounce);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(ANNOUNCE_EVENT, onAnnounce);
    };
  }, []);
  return text;
}
