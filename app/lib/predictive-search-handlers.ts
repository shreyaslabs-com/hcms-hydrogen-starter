import { createPredictiveSearchServerHandlers, gql } from '@shopify/hydrogen';

/**
 * Additive product fields for the result rows' quick add (SF-14): `@hcms/sections`
 * `QUICK_ADD_FIELDS` verbatim, so `quickAddMode()` sees single-variant products and adds them
 * directly instead of always offering "Choose options".
 */
const predictiveSearchFragments = {
  product: gql(`
    fragment PredictiveSearchProductFragment on Product {
      requiresSellingPlan
      variantsCount {
        count
      }
      quickVariant: selectedOrFirstAvailableVariant {
        id
        title
        availableForSale
        price {
          amount
          currencyCode
        }
        image {
          url
          altText
          width
          height
        }
        selectedOptions {
          name
          value
        }
      }
    }
  `),
};

// Mirrors the types the full /search page queries in app/lib/search.ts, so
// suggestions never offer what the fallback page cannot show.
export const predictiveSearchHandlers = createPredictiveSearchServerHandlers({
  types: ['PRODUCT', 'COLLECTION', 'QUERY'],
  fragments: predictiveSearchFragments,
});
