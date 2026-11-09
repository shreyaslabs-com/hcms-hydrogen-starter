import {
  type CacheInstance,
  type I18nConfig,
  createShopifyRequestContext,
  createStorefrontClient,
  type PublicStorefrontClient,
  type RequestScopedPrivateStorefrontClient,
  type ShopifyRequestContext,
} from '@shopify/hydrogen';
import { createContext } from 'react-router';

import type { Env } from '~/lib/env';
import {
  getBuyerIp,
  getMockShopDomain,
  getPrivateStorefrontToken,
  getStoreDomain,
  storefrontConfig,
  shouldUseMockShop,
} from '~/lib/shop';

// Real store: private token + trusted buyer IP. mock.shop: tokenless public
// access (it is auth-free and rejects any private token, even a placeholder).
export type RequestStorefrontClient = RequestScopedPrivateStorefrontClient | PublicStorefrontClient;

export function createRequestStorefrontClient(
  request: Request,
  env: Env,
  cache: CacheInstance,
  waitUntil: ExecutionContext['waitUntil'],
  /** Resolved market (T-1.1.4); defaults to the bootstrap locale used to read `localization`. */
  i18n: I18nConfig = storefrontConfig.i18n,
): RequestStorefrontClient {
  if (shouldUseMockShop(env)) {
    return createStorefrontClient({
      type: 'public',
      requestContext: createShopifyRequestContext({ request, i18n }),
      config: {
        storeDomain: getMockShopDomain(env),
        cache,
        waitUntil,
      },
    });
  }

  return createStorefrontClient({
    type: 'private',
    requestContext: createShopifyRequestContext({
      request,
      i18n,
      buyerIp: getBuyerIp(request.headers),
    }),
    config: {
      storeDomain: getStoreDomain(env),
      privateStorefrontToken: getPrivateStorefrontToken(env),
      storefrontId: env.PUBLIC_STOREFRONT_ID,
      cache,
      waitUntil,
    },
  });
}

/**
 * Component library demo catalogue (T-2.85): Shopify's public mock.shop store, so every library
 * example shows varied, pictured products/collections whatever the merchant's catalogue. Editor
 * preview only; real pages always use the store's client.
 */
export function createDemoStorefrontClient(
  request: Request,
  cache: CacheInstance,
  waitUntil: ExecutionContext['waitUntil'],
): RequestStorefrontClient {
  return createStorefrontClient({
    type: 'public',
    requestContext: createShopifyRequestContext({ request, i18n: storefrontConfig.i18n }),
    config: { storeDomain: 'mock.shop', cache, waitUntil },
  });
}

export const storefrontClientContext = createContext<RequestStorefrontClient>();
export const storefrontRequestContext = createContext<ShopifyRequestContext>();
