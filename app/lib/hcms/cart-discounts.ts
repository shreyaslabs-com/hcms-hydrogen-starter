/**
 * Which discount-code messages the cart shows (SF-13), pure so `node:test` can load it. Shopify
 * returns the same error for every code in a `cartDiscountCodesUpdate`, so Hydrogen's store keeps
 * it under each code: shown as-is, "Enter a valid discount code" repeated under the input and
 * every row. Rule: the last tried code's message sits under the input; a row shows a message only
 * when it is applicable (inapplicable rows are already labelled), it isn't the tried code, and the
 * text hasn't been shown above.
 */
export function discountRowMessages(
  codes: ReadonlyArray<{ code: string; applicable: boolean }>,
  messageFor: (code: string) => string | null,
  tried: string,
): Map<string, string> {
  const shown = new Set<string>();
  const applyMessage = tried ? messageFor(tried) : null;
  if (applyMessage) shown.add(applyMessage);
  const rows = new Map<string, string>();
  for (const { code, applicable } of codes) {
    const message = messageFor(code);
    const isTried = code.toLowerCase() === tried.toLowerCase();
    if (!message || !applicable || isTried || shown.has(message)) continue;
    shown.add(message);
    rows.set(code, message);
  }
  return rows;
}
