/**
 * Product form adapter slots, loaded only on pages with a product section (T-1.8.1 JS budget:
 * Hydrogen's product form + options code left the root chunk). `entry.client.tsx` preloads it
 * before hydrating when `main-product`/`featured-product` is in the HTML, so hydration never
 * suspends; elsewhere (editor adds a featured product, client navigation) the slot suspends
 * inside the section's `<Suspense>` until loaded. The server imports it eagerly.
 */
import { createElement, use, type ComponentProps } from 'react';

import type * as ProductForm from './HcmsProductForm';

type Module = typeof ProductForm;

/** Section types whose blocks use the product form slots. */
export const PRODUCT_SECTION_TYPES = ['main-product', 'featured-product'];

let mod: Module | null = null;
let pending: Promise<Module> | null = null;

export function loadProductForm(): Promise<Module> {
  pending ??= import('./HcmsProductForm').then((m) => (mod = m));
  return pending;
}

const current = (): Module => mod ?? use(loadProductForm());

export const productSlots = {
  ProductForm: (props: ComponentProps<Module['HcmsProductForm']>) =>
    createElement(current().HcmsProductForm, props),
  // A hook slot: suspends (via `use`) until loaded, then always calls the same hook.
  useSelectedVariant: () => current().useHcmsSelectedVariant(),
  VariantPicker: (props: ComponentProps<Module['HcmsVariantPicker']>) =>
    createElement(current().HcmsVariantPicker, props),
  QuantitySelector: () => createElement(current().HcmsQuantitySelector),
  BuyButtons: (props: ComponentProps<Module['HcmsBuyButtons']>) =>
    createElement(current().HcmsBuyButtons, props),
  // Card quick add (T-2.77): suspends until loaded; cards mount it only after a click.
  useAddToCart: () => current().useHcmsAddToCart(),
};
