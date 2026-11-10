import { formatMoney, type MoneyV2 } from '@shopify/hydrogen';
import { createContext, useCallback, useContext } from 'react';

export const DEFAULT_MONEY_LOCALE = 'en-US';

export type PriceFormat = {
  /** Theme `money_hide_decimals` (T-2.157): whole amounts without their zero decimals. */
  hideDecimals?: boolean;
};

const fractionDigits = new Map<string, number>();
/** The currency's minor-unit digits for the locale (INR/USD 2, JPY 0); 0 when unknown. */
function currencyDigits(currencyCode: string, locale: string): number {
  const key = `${locale}|${currencyCode}`;
  let digits = fractionDigits.get(key);
  if (digits === undefined) {
    try {
      digits =
        new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: currencyCode,
        }).resolvedOptions().maximumFractionDigits ?? 0;
    } catch {
      digits = 0;
    }
    fractionDigits.set(key, digits);
  }
  return digits;
}

/**
 * Drops the zero decimals of a whole amount from a formatted price: `₹1,299.00` → `₹1,299`,
 * `€10,00` → `€10`. Only the LAST separator + exactly the currency's digits of zeros, so group
 * separators (`1,00,000.00`, `1,000`) and non-whole amounts (`₹1,299.50`) stay as they are.
 */
export function hideWholeDecimals(
  formatted: string,
  money: { amount: string; currencyCode: string },
  locale = DEFAULT_MONEY_LOCALE,
): string {
  const amount = Number(money.amount);
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) return formatted;
  const digits = currencyDigits(money.currencyCode, locale);
  if (digits <= 0) return formatted;
  return formatted.replace(new RegExp(`[.,٫]0{${digits}}(?![\\s\\S]*\\d)`), '');
}

export function formatPrice(
  money: MoneyV2,
  locale = DEFAULT_MONEY_LOCALE,
  format: PriceFormat = {},
): string {
  const formatted = formatMoney(money, { locale }).toString();
  return format.hideDecimals ? hideWholeDecimals(formatted, money, locale) : formatted;
}

/** The theme's price format (root → `HcmsAppAdapter` provides it; default = Hydrogen's). */
const PriceFormatContext = createContext<PriceFormat>({});
export const PriceFormatProvider = PriceFormatContext.Provider;

/** `formatPrice` with the theme's price format (cart, search, account: every app-owned price). */
export function useFormatPrice(): (money: MoneyV2) => string {
  const { hideDecimals = false } = useContext(PriceFormatContext);
  return useCallback(
    (money: MoneyV2) => formatPrice(money, DEFAULT_MONEY_LOCALE, { hideDecimals }),
    [hideDecimals],
  );
}

export function compareMoney(a: MoneyV2 | null | undefined, b: MoneyV2 | null | undefined): number {
  if (!a || !b) return 0;
  return Number.parseFloat(a.amount) - Number.parseFloat(b.amount);
}

export function salePercent(
  price: MoneyV2,
  compareAtPrice: MoneyV2 | null | undefined,
): number | null {
  if (!compareAtPrice) return null;
  const current = Number.parseFloat(price.amount);
  const compare = Number.parseFloat(compareAtPrice.amount);
  if (!Number.isFinite(current) || !Number.isFinite(compare) || compare <= current) return null;
  return Math.round(((compare - current) / compare) * 100);
}
