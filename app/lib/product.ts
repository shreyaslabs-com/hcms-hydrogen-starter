import type { MainProductData, MainProductVariant } from '@hcms/sections';
import { createProductComponents } from '@shopify/hydrogen/react';

/** Product data = the official `main-product` section query (T-1.3.7). */
export type ProductData = MainProductData;
export type ProductVariantData = MainProductVariant;

export const { ProductProvider, useProduct, useProductForm } =
  createProductComponents<ProductData>();
