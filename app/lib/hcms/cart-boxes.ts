/**
 * Build a box cart rows (ADR 010), pure so `node:test` can load it. Lines of one box share the
 * line attribute `_hcms_box` = `<boxId>:<instance>` (+ visible `Box` = the box name; keys match
 * `@hcms/sections` `BOX_ATTRIBUTE` / `BOX_NAME_ATTRIBUTE`). Display only: a group sits where its
 * first line was, lines without the attribute stay single rows. Money is integer thousandths.
 * A complete box that the Cart Transform merged (`linesMerge`) comes back as ONE line with
 * `_hcms_bundle` + `Box` attributes and `lineComponents`: it is a box row listing its components,
 * and Remove deletes that one line.
 */
import { fromMilli, toMilli, type Money, type SavingsLine } from './cart-savings.ts';

export const BOX_ATTRIBUTE = '_hcms_box';
export const BOX_NAME_ATTRIBUTE = '_hcms_box_name';
/** Carts made before the hidden attribute still carry the visible one. */
const LEGACY_NAME_ATTRIBUTE = 'Box';
/** Hidden attribute the Cart Transform puts on the merged bundle line (`hcms-box-bundle`). */
export const BUNDLE_ATTRIBUTE = '_hcms_bundle';

export type BoxLine = SavingsLine & {
  id: string;
  attributes?: ReadonlyArray<{ key: string; value: string | null }> | null;
  /** `ComponentizableCartLine` children (Cart Transform merged line). */
  lineComponents?: ReadonlyArray<unknown> | null;
};

export type CartBox<L extends BoxLine> = {
  kind: 'box';
  /** The `_hcms_box` value (unique per added box), or the merged line's id. */
  key: string;
  name: string;
  /** What the row lists: the box lines, or a merged line's components. */
  lines: L[];
  /** Cart line ids Remove deletes: the box lines, or the one merged line. */
  lineIds: string[];
  /** Sum of the lines' quantities. */
  itemCount: number;
  /** Before line discounts (unit price × quantity); equals `total` when nothing is discounted. */
  original: Money;
  /** Sum of the lines' discounted `cost.totalAmount` (merged: the bundle line's total). */
  total: Money;
};

export type CartRow<L extends BoxLine> = { kind: 'line'; line: L } | CartBox<L>;

const attribute = (line: BoxLine, key: string) =>
  line.attributes?.find((a) => a.key === key)?.value?.trim() || null;

/** Undiscounted line total: unit price × quantity, else discounted total + its allocations. */
function lineOriginalMilli(line: SavingsLine): number {
  const unit = toMilli(line.cost?.amountPerQuantity?.amount);
  if (unit > 0) return unit * line.quantity;
  const allocated = (line.discountAllocations ?? []).reduce(
    (sum, a) => sum + toMilli(a.discountedAmount?.amount),
    0,
  );
  return toMilli(line.cost?.totalAmount?.amount) + allocated;
}

/** Sum of the lines' variant list prices × quantity; 0 when any price is missing. */
function listedMilli(lines: readonly SavingsLine[]): number {
  let sum = 0;
  for (const line of lines) {
    const unit = toMilli(
      (line as { merchandise?: { price?: { amount?: string | null } | null } | null }).merchandise
        ?.price?.amount,
    );
    if (unit <= 0) return 0;
    sum += unit * line.quantity;
  }
  return sum;
}

/**
 * Box totals; `original` never drops below `total` (stale unit prices never show a "gain"). It is
 * the larger of the undiscounted line costs and the variants' list prices: Cart Transform
 * components already carry a share of the bundle price in their own costs (S2-5).
 */
export function boxTotals(lines: readonly SavingsLine[]): { original: Money; total: Money } {
  const currency =
    lines.find((l) => l.cost?.totalAmount?.currencyCode)?.cost?.totalAmount?.currencyCode ?? '';
  let total = 0;
  let original = 0;
  for (const line of lines) {
    total += toMilli(line.cost?.totalAmount?.amount);
    original += lineOriginalMilli(line);
  }
  return {
    original: fromMilli(Math.max(original, listedMilli(lines), total), currency),
    total: fromMilli(total, currency),
  };
}

// The `Box` attribute carries a short instance suffix ("Build your box #c184") so checkout can
// tell two boxes apart; the grouped row doesn't need it.
const boxName = (raw: string | null) => raw?.replace(/\s+#[0-9a-z]{1,8}$/i, '') || 'Box';

/** A Cart Transform merged bundle line → one box row of its components; else null. */
function mergedBox<L extends BoxLine>(line: L): CartBox<L> | null {
  const components = line.lineComponents;
  if (!attribute(line, BUNDLE_ATTRIBUTE) || !components?.length) return null;
  const lines = components as L[];
  const parts = boxTotals(lines);
  const total = line.cost?.totalAmount ?? parts.total;
  // Struck "was" total = the components' list prices / undiscounted costs, only when above the
  // bundle price.
  const original = toMilli(parts.original.amount) > toMilli(total.amount) ? parts.original : total;
  return {
    kind: 'box',
    key: line.id,
    name: boxName(attribute(line, BOX_NAME_ATTRIBUTE) ?? attribute(line, LEGACY_NAME_ATTRIBUTE)),
    lines,
    lineIds: [line.id],
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    original,
    total,
  };
}

/** Cart lines → rows: one row per box (at its first line's position), others unchanged. */
export function groupCartLines<L extends BoxLine>(lines: readonly L[]): CartRow<L>[] {
  type Pending = { kind: 'box'; key: string; name: string | null; lines: L[] };
  const rows: Array<{ kind: 'line'; line: L } | Pending | CartBox<L>> = [];
  const boxes = new Map<string, Pending>();
  for (const line of lines) {
    const merged = mergedBox(line);
    if (merged) {
      rows.push(merged);
      continue;
    }
    const key = attribute(line, BOX_ATTRIBUTE);
    if (!key) {
      rows.push({ kind: 'line', line });
      continue;
    }
    const box = boxes.get(key);
    if (box) {
      box.lines.push(line);
      box.name ??= attribute(line, BOX_NAME_ATTRIBUTE) ?? attribute(line, LEGACY_NAME_ATTRIBUTE);
      continue;
    }
    // The row sits at the first line's position; later lines of the box join it.
    const created: Pending = {
      kind: 'box',
      key,
      name: attribute(line, BOX_NAME_ATTRIBUTE) ?? attribute(line, LEGACY_NAME_ATTRIBUTE),
      lines: [line],
    };
    boxes.set(key, created);
    rows.push(created);
  }
  return rows.map((row) =>
    row.kind === 'line' || 'lineIds' in row
      ? row
      : {
          kind: 'box',
          key: row.key,
          name: boxName(row.name),
          lines: row.lines,
          lineIds: row.lines.map((l) => l.id),
          itemCount: row.lines.reduce((sum, l) => sum + l.quantity, 0),
          ...boxTotals(row.lines),
        },
  );
}

/** True when the box's struck-through original total should show. */
export const boxDiscounted = (box: { original: Money; total: Money }) =>
  toMilli(box.original.amount) > toMilli(box.total.amount);
