/**
 * Customer account pages (T-2.22): pure helpers for the `customers/account`, `customers/order`
 * and `customers/addresses` routes (URL ↔ GID, form parsing). Unit-tested with node:test.
 */

const ORDER_GID = 'gid://shopify/Order/';
const ADDRESS_GID = /^gid:\/\/shopify\/CustomerAddress\/\d+(\?[\w=&-]*)?$/;
const DIGITS = /^\d{1,20}$/;

/** `/account/orders/:id` param (numeric legacy id) → Order GID; anything else → null (404). */
export function orderGid(param: string | undefined): string | null {
  return param && DIGITS.test(param) ? `${ORDER_GID}${param}` : null;
}

/** Order GID → its account page path (`/account/orders/123`); null for other GIDs. */
export function orderPath(gid: string): string | null {
  if (!gid.startsWith(ORDER_GID)) return null;
  const id = gid.slice(ORDER_GID.length).split('?')[0] ?? '';
  return DIGITS.test(id) ? `/account/orders/${id}` : null;
}

/** A CustomerAddress GID from a form field, or null (never pass arbitrary ids to mutations). */
export function addressGid(value: FormDataEntryValue | null): string | null {
  return typeof value === 'string' && ADDRESS_GID.test(value) ? value : null;
}

/** `PARTIALLY_REFUNDED` → `Partially refunded`. */
export function formatStatus(status: string | null | undefined): string {
  if (!status) return '';
  const text = status.toLowerCase().replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export type FieldErrors = Partial<Record<string, string>>;

/** Customer Account API `CustomerAddressInput` (2026-10, validated with the Dev MCP). */
export type AddressInput = {
  firstName: string;
  lastName: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  zoneCode: string;
  countryCode: string;
  zip: string;
  phoneNumber?: string;
};

const MAX = 255;
const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim().slice(0, MAX) : '';
};

/**
 * Address form → mutation variables. Required like Shopify's own form: address, city, country.
 * Phone must look like E.164-ish digits (Shopify validates the rest and returns `userErrors`).
 */
export function parseAddressForm(
  form: FormData,
):
  | { ok: true; address: AddressInput; defaultAddress: boolean }
  | { ok: false; errors: FieldErrors } {
  const address: AddressInput = {
    firstName: field(form, 'firstName'),
    lastName: field(form, 'lastName'),
    company: field(form, 'company'),
    address1: field(form, 'address1'),
    address2: field(form, 'address2'),
    city: field(form, 'city'),
    zoneCode: field(form, 'zoneCode').toUpperCase(),
    countryCode: field(form, 'countryCode').toUpperCase(),
    zip: field(form, 'zip'),
  };
  const phone = field(form, 'phoneNumber');
  if (phone) address.phoneNumber = phone;

  const errors: FieldErrors = {};
  if (!address.address1) errors.address1 = 'Enter an address';
  if (!address.city) errors.city = 'Enter a city';
  if (!/^[A-Z]{2}$/.test(address.countryCode)) errors.countryCode = 'Select a country/region';
  if (address.zoneCode && !/^[A-Z0-9-]{1,10}$/.test(address.zoneCode))
    errors.zoneCode = 'Use the state/province code, such as ON or CA';
  if (phone && !/^\+?[\d\s().-]{6,20}$/.test(phone))
    errors.phoneNumber = 'Enter a valid phone number';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, address, defaultAddress: form.get('defaultAddress') === 'on' };
}

/** Profile form (first/last name) → `CustomerUpdateInput`. Both may be empty (Shopify allows it). */
export function parseProfileForm(form: FormData): { firstName: string; lastName: string } {
  return { firstName: field(form, 'firstName'), lastName: field(form, 'lastName') };
}

/** Mutation `userErrors` → field errors (`['address', 'zip']` → `zip`), the rest under `form`. */
export function userErrorsToFields(
  userErrors: readonly { field?: readonly string[] | null; message: string }[] | null | undefined,
): FieldErrors {
  const errors: FieldErrors = {};
  for (const error of userErrors ?? []) {
    const key = error.field?.[error.field.length - 1] ?? 'form';
    errors[key] ??= error.message;
  }
  return errors;
}

/** Country options for the address form: the shop's market countries + the address's own. */
export function countryOptions(
  available: readonly { isoCode: string; name: string }[],
  current?: string | null,
): { isoCode: string; name: string }[] {
  const list = [...available].sort((a, b) => a.name.localeCompare(b.name));
  if (current && !list.some((c) => c.isoCode === current))
    list.unshift({ isoCode: current, name: current });
  return list;
}
