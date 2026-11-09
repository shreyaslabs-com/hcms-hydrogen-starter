import { createCartServerHandlers, gql } from '@shopify/hydrogen';

/**
 * Extra cart fields on top of Hydrogen's default cart:
 * - `attributes` ride along with every cart response so the A/B tracker (T-3.5,
 *   `components/ExperimentTracker.tsx`) and the gift message (T-2.80) can resend them: Storefront
 *   `cartAttributesUpdate` replaces the whole set, so other apps' attributes must be kept.
 * - line `cost` unit/compare-at prices + `discountAllocations` + cart subtotal/total (richer drawer,
 *   `lib/hcms/cart-savings.ts`).
 * - line `sellingPlanAllocation` (T-2.104): the subscription plan name under the line's options;
 *   merchandise `id` finds the gift-wrap line (T-2.80).
 * - `lineComponents` of a Cart Transform merged line (Build a box bundle, ADR 010): the cart shows
 *   the bundle as one row with its items (`lib/hcms/cart-boxes.ts`).
 */
const CART_FRAGMENT = gql(`
  fragment CartFragment on Cart {
    attributes {
      key
      value
    }
    cost {
      subtotalAmount {
        amount
        currencyCode
      }
      totalAmount {
        amount
        currencyCode
      }
    }
    lines(first: 250) {
      nodes {
        id
        cost {
          amountPerQuantity {
            amount
            currencyCode
          }
          compareAtAmountPerQuantity {
            amount
            currencyCode
          }
        }
        discountAllocations {
          discountedAmount {
            amount
            currencyCode
          }
          ... on CartAutomaticDiscountAllocation {
            title
          }
          ... on CartCodeDiscountAllocation {
            code
          }
          ... on CartCustomDiscountAllocation {
            title
          }
        }
        sellingPlanAllocation {
          sellingPlan {
            name
          }
        }
        merchandise {
          ... on ProductVariant {
            id
          }
        }
      }
    }
  }
`);

/**
 * Cart Transform merged lines (Build a box, ADR 010): `lineComponents` exists only on
 * `ComponentizableCartLine`. Hydrogen 2026.10.1's typegen turns an inline fragment on the line
 * union into a `CartData` that no longer fits `CartProvider` (`lines.nodes` lose `quantity`), so
 * it is spliced into the typed fragment at runtime (`gql` returns the plain string; validated
 * against Storefront 2026-10 with the Dev MCP). Read through `CartLineView.lineComponents`.
 */
const LINE_COMPONENTS = `
  ... on ComponentizableCartLine {
    lineComponents {
      id
      quantity
      cost {
        totalAmount {
          amount
          currencyCode
        }
        amountPerQuantity {
          amount
          currencyCode
        }
      }
      merchandise {
        ... on ProductVariant {
          id
          title
          # Struck "was" total of the box row (S2-5): the bundle price is spread over the
          # components' own costs, so their list prices come from the variant.
          price {
            amount
            currencyCode
          }
          image {
            url
            altText
          }
          selectedOptions {
            name
            value
          }
          product {
            title
            handle
          }
        }
      }
    }
  }
`;

export const CART_FRAGMENT_WITH_COMPONENTS = CART_FRAGMENT.replace(
  /(merchandise \{\s*\.\.\. on ProductVariant \{\s*id\s*\}\s*\})/,
  `$1
${LINE_COMPONENTS}`,
) as typeof CART_FRAGMENT;

export const cartHandlers = createCartServerHandlers({ fragment: CART_FRAGMENT_WITH_COMPONENTS });
