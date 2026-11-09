import { gql, type StorefrontApi, type StorefrontClient } from '@shopify/hydrogen';

import { normalizeStorefrontShop, type StorefrontShop } from '~/lib/storefront-shop';

export const ROOT_LAYOUT_QUERY = gql(`
  query RootLayout($country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    shop {
      id
      name
      description
      brand {
        logo {
          alt
          image {
            url
            altText
            width
            height
          }
        }
      }
      paymentSettings {
        acceptedCardBrands
        supportedDigitalWallets
      }
    }
    localization {
      country {
        currency {
          isoCode
        }
      }
    }
  }
`);

export type RootLayoutQueryResult = StorefrontApi.ResultOf<typeof ROOT_LAYOUT_QUERY>;
type RootLayoutResponse = {
  data?: RootLayoutQueryResult | null;
  errors?: ReadonlyArray<{ message: string }> | null;
};

type RootLayoutLoaderData = {
  /** Empty when the layout query failed or timed out (fallback layout, S2-2). */
  shopId: string;
  shopInfo: StorefrontShop;
  /** Shopify Preferences meta description: the store-wide SEO fallback (T-2.48). */
  shopDescription: string | null;
  // Browse events carry no price, so shopify.js reads their currency from
  // window.Shopify.currency.active. The cart tracker only sets that once a cart exists,
  // so the bootstrap needs it up front.
  currency: string;
};

/**
 * Layout data is chrome (shop name, logo, payment icons), never worth a long wait: past this the
 * page renders with the fallback layout instead of holding the shopper for the client's 30 s
 * default (S2-2: the storefront renders when upstream is slow).
 */
export const ROOT_LAYOUT_TIMEOUT_MS = 3000;

/** Layout used when the Storefront API is down or slow, so the page still renders. */
export function fallbackRootLayout(currency = 'USD'): RootLayoutLoaderData {
  return {
    shopId: '',
    shopInfo: normalizeStorefrontShop({
      id: '',
      name: '',
      description: null,
      brand: null,
      paymentSettings: { acceptedCardBrands: [], supportedDigitalWallets: [] },
    }),
    shopDescription: null,
    currency,
  };
}

export async function loadRootLayout(
  storefrontClient: Pick<StorefrontClient, 'graphql'>,
  {
    fallbackCurrency,
    timeoutMs = ROOT_LAYOUT_TIMEOUT_MS,
  }: {
    /** Currency when the query fails (the market's, from the cached localization). */
    fallbackCurrency?: string;
    timeoutMs?: number;
  } = {},
): Promise<RootLayoutLoaderData> {
  let layoutResult: RootLayoutResponse;
  try {
    layoutResult = await storefrontClient.graphql(ROOT_LAYOUT_QUERY, {
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // Timeout, network failure or non-200: log it and render with the fallback layout.
    console.error(
      `Root layout query failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return fallbackRootLayout(fallbackCurrency);
  }

  if (layoutResult.errors) {
    console.error(
      `Root layout query failed: ${layoutResult.errors.map(({ message }) => message).join('\n')}`,
    );
  }

  // Upstream error details are logged above; the page renders with the fallback layout.
  if (!layoutResult.data) return fallbackRootLayout(fallbackCurrency);

  const { shop, localization } = layoutResult.data;
  return {
    shopId: shop.id,
    shopInfo: normalizeStorefrontShop(shop),
    shopDescription: shop.description ?? null,
    currency: localization.country.currency.isoCode,
  };
}
