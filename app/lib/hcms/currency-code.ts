/**
 * Theme setting `currency_code_enabled` (T-2.65, Dawn "Currency format"): prices show the ISO code
 * after the amount, like Dawn's `money_with_currency` (`$10.00 USD`). A formatted price that
 * already carries the code (e.g. `CHF 10.00`) is left alone.
 */
export function withCurrencyCode(formatted: string, currencyCode: string): string {
  const code = currencyCode.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code) || formatted.includes(code)) return formatted;
  return `${formatted} ${code}`;
}
