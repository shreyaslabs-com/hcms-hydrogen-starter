import { Cache, createRunWithCache, gql, type CacheInstance } from '@shopify/hydrogen';
import { createContext } from 'react-router';

import { FALLBACK_LOCALIZATION, type Localization, type Market } from '~/lib/markets';
import type { RequestStorefrontClient } from '~/lib/storefront';

type WaitUntil = ExecutionContext['waitUntil'];

/** No @inContext: returns the shop's primary market plus every country/language it sells in. */
export const LOCALIZATION_QUERY = gql(`
  query Localization {
    localization {
      country {
        isoCode
      }
      language {
        isoCode
      }
      availableCountries {
        isoCode
        name
        currency {
          isoCode
          symbol
        }
        availableLanguages {
          isoCode
          endonymName
        }
      }
    }
  }
`);

/**
 * Markets change rarely: cached in the sub-request cache (Cache.long). In 2026.10.1 `graphql()`
 * takes no per-query `cache`, so the read goes through `createRunWithCache`. Errors aren't cached
 * and fall back to US/EN so the store still renders.
 */
export async function loadLocalization(
  storefrontClient: RequestStorefrontClient,
  { cache, waitUntil, storeKey }: { cache: CacheInstance; waitUntil: WaitUntil; storeKey: string },
): Promise<Localization> {
  const runWithCache = createRunWithCache({ cache, waitUntil });
  try {
    const { data } = await runWithCache(
      { key: ['hcms', 'localization', storeKey], strategy: Cache.long() },
      async (): Promise<{ data: { localization?: Localization }; shouldCache: boolean }> => {
        const result = await storefrontClient.graphql(LOCALIZATION_QUERY);
        const localization = result.data?.localization;
        // Cache values must be plain objects; `{}` (not cached) means "use the fallback".
        return localization
          ? { data: { localization }, shouldCache: true }
          : { data: {}, shouldCache: false };
      },
    );
    return data.localization ?? FALLBACK_LOCALIZATION;
  } catch {
    return FALLBACK_LOCALIZATION;
  }
}

export type MarketState = { market: Market; valid: boolean; localization: Localization };
export const marketContext = createContext<MarketState>();
