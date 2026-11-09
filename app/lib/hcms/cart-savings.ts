/**
 * Cart savings (replica P1-6), pure so `node:test` can load it. All maths is on integer
 * thousandths of the currency unit (Storefront amounts have at most 3 decimals), never floats.
 * Line `cost.totalAmount` is already after line discounts; the "was" price is the variant's
 * compare-at price × quantity, else the undiscounted unit price × quantity.
 */

export type Money = { amount: string; currencyCode: string };

export type SavingsLine = {
  quantity: number;
  cost?: {
    totalAmount?: Money | null;
    amountPerQuantity?: Money | null;
    compareAtAmountPerQuantity?: Money | null;
  } | null;
  discountAllocations?: ReadonlyArray<{
    discountedAmount?: Money | null;
    title?: string | null;
    code?: string | null;
  }> | null;
};

/** `'12.5'` → 12500 (thousandths). Invalid → 0. */
export function toMilli(amount: string | null | undefined): number {
  const match = /^(\d{1,12})(?:\.(\d{1,}))?$/.exec((amount ?? '').trim());
  if (!match) return 0;
  const fraction = ((match[2] ?? '') + '000').slice(0, 3);
  return Number(match[1]) * 1000 + Number(fraction);
}

/** Thousandths → a Money the starter's `formatPrice` prints. */
export function fromMilli(milli: number, currencyCode: string): Money {
  const whole = Math.trunc(milli / 1000);
  const fraction = String(milli % 1000).padStart(3, '0');
  return { amount: `${whole}.${fraction}`, currencyCode };
}

/** The line's "was" total in thousandths, or null when nothing is struck through. */
export function lineCompareAtMilli(line: SavingsLine): number | null {
  const compare = toMilli(line.cost?.compareAtAmountPerQuantity?.amount);
  const unit = toMilli(line.cost?.amountPerQuantity?.amount);
  return compare > unit && unit > 0 ? compare * line.quantity : null;
}

/** "BUY2 −₹100" parts per line discount allocation (automatic title, code or custom title). */
export function lineDiscounts(line: SavingsLine): { label: string; amount: Money }[] {
  return (line.discountAllocations ?? []).flatMap((a) => {
    const label = (a.title ?? a.code ?? '').trim();
    const amount = a.discountedAmount;
    return label && amount && toMilli(amount.amount) > 0 ? [{ label, amount }] : [];
  });
}

/**
 * Build a box bundle line (Cart Transform merge, S2-5): its components' list prices × quantity
 * minus the bundle's total, in thousandths; 0 for other lines or when a price is missing.
 */
export function bundleSavingMilli(line: SavingsLine, total: number): number {
  const components = (line as { lineComponents?: ReadonlyArray<unknown> | null }).lineComponents;
  if (!components?.length) return 0;
  let listed = 0;
  for (const component of components) {
    const c = component as {
      quantity?: number;
      merchandise?: { price?: { amount?: string | null } | null } | null;
    };
    const unit = toMilli(c.merchandise?.price?.amount);
    if (unit <= 0) return 0;
    listed += unit * (c.quantity ?? 1);
  }
  return Math.max(0, listed - total);
}

/**
 * Total saved vs the "was" prices: per line (compare-at or discount allocations) plus any
 * cart-level discount (`cost.subtotalAmount − cost.totalAmount`). `null` when nothing is saved.
 */
export function cartSavings(
  lines: readonly SavingsLine[],
  cost: { subtotalAmount?: Money | null; totalAmount?: Money | null } | null | undefined,
): Money | null {
  const currency = cost?.totalAmount?.currencyCode ?? cost?.subtotalAmount?.currencyCode;
  if (!currency) return null;
  let saved = 0;
  for (const line of lines) {
    const total = toMilli(line.cost?.totalAmount?.amount);
    const compare = lineCompareAtMilli(line);
    if (compare !== null) saved += Math.max(0, compare - total);
    else saved += lineDiscounts(line).reduce((sum, d) => sum + toMilli(d.amount.amount), 0);
    saved += bundleSavingMilli(line, total);
  }
  saved += Math.max(0, toMilli(cost?.subtotalAmount?.amount) - toMilli(cost?.totalAmount?.amount));
  return saved > 0 ? fromMilli(saved, currency) : null;
}
