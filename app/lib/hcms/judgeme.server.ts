/**
 * Judge.me widgets on the server (T-2.103). Runs after the page's ONE batched Storefront query
 * (product ids come from it) and is a separate third-party call: cached in the sub-request cache
 * (short TTL + stale-while-revalidate, so most requests never wait), bounded by a small time
 * budget on a cache miss and fail-soft — when Judge.me is slow or down the page renders the empty
 * vendor containers and the client script fills them after consent.
 */
import { sanitizeReviewsHtml } from '@hcms/sections';
import { Cache, createRunWithCache } from '@shopify/hydrogen';
import type { Template } from '@hcms/schema';
import type { RouterContextProvider } from 'react-router';

import { documentContext } from '~/lib/hcms/document';
import { parseEmbeds } from '~/lib/hcms/embeds';
import {
  judgemeCacheKey,
  judgemeCacheUrl,
  judgemeTargets,
  parseJudgemeResponse,
  type AppWidgets,
} from '~/lib/hcms/judgeme';
import { marketContext } from '~/lib/localization';
import { previewContext } from '~/lib/preview';

/** Wait at most this long on a cache miss; the fetch keeps filling the cache afterwards. */
const RENDER_BUDGET_MS = 700;
const FETCH_TIMEOUT_MS = 5000;

const sanitize = sanitizeReviewsHtml;
/** How long a "not on Judge.me" answer (404) keeps browsers from asking (S2-3). */
const UNAVAILABLE_SECONDS = 900;
const UNAVAILABLE_WIDGETS: AppWidgets = {
  html: {},
  css: '',
  ratings: {},
  reviews: {},
  unavailable: true,
};

type RunWithCache = ReturnType<typeof createRunWithCache>;
const unavailableKey = (shop: string) => ['hcms', 'judgeme-unavailable', shop];

/** This market's Judge.me embed (shop domain + public token), or null. */
function judgemeEmbed(
  context: Readonly<RouterContextProvider>,
): { shop: string; token: string } | null {
  const { market } = context.get(marketContext);
  const { document } = context.get(documentContext);
  const embed = parseEmbeds(document.embeds, context.env.PUBLIC_STORE_DOMAIN).find(
    (e) =>
      e.type === 'judgeme' &&
      (!e.targeting.countries.length || e.targeting.countries.includes(market.country)),
  );
  const shop = embed?.config?.shopDomain;
  const token = embed?.config?.publicToken;
  return shop && token ? { shop, token } : null;
}

function markJudgemeUnavailable(runWithCache: RunWithCache, shop: string) {
  void runWithCache(
    { key: unavailableKey(shop), strategy: Cache.short({ maxAge: UNAVAILABLE_SECONDS }) },
    async () => ({ data: { unavailable: true }, shouldCache: true }),
  ).catch(() => undefined);
}

/**
 * Root loader (S2-2/S2-3): true when a server fetch already got Judge.me's 404 for this shop, so
 * the browser loader is skipped. A sub-request cache read only, never a network call.
 */
export async function judgemeKnownUnavailable(
  context: Readonly<RouterContextProvider>,
): Promise<boolean> {
  const embed = judgemeEmbed(context);
  if (!embed) return false;
  try {
    const runWithCache = createRunWithCache({ cache: context.cache, waitUntil: context.waitUntil });
    const { data } = await runWithCache(
      { key: unavailableKey(embed.shop), strategy: Cache.short({ maxAge: UNAVAILABLE_SECONDS }) },
      async (): Promise<{ data: { unavailable?: true }; shouldCache: boolean }> => ({
        data: {},
        shouldCache: false,
      }),
    );
    return data.unavailable === true;
  } catch {
    return false;
  }
}

export async function loadJudgemeWidgets(
  context: Readonly<RouterContextProvider>,
  template: Template,
  data: Record<string, unknown>,
): Promise<AppWidgets | null> {
  if (context.get(previewContext)) return null; // the editor shows placeholders
  const { cache, waitUntil } = context;
  const embed = judgemeEmbed(context);
  if (!embed) return null;
  const { shop, token } = embed;
  const targets = judgemeTargets(template, data);
  if (!targets) return null;

  const runWithCache = createRunWithCache({ cache, waitUntil });
  type Cached = AppWidgets | { unavailable: true } | Record<string, never>;
  const work = runWithCache(
    {
      key: judgemeCacheKey(shop, targets),
      strategy: Cache.short({ maxAge: 120, staleWhileRevalidate: 600 }),
    },
    async (): Promise<{ data: Cached; shouldCache: boolean }> => {
      const response = await fetch(judgemeCacheUrl(shop, token, targets), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (response.status === 404) {
        // The shop isn't on Judge.me (S2-3): remember it so browsers never ask (console 404s).
        markJudgemeUnavailable(runWithCache, shop);
        return { data: { unavailable: true }, shouldCache: true };
      }
      if (!response.ok) return { data: {}, shouldCache: false };
      const parsed = parseJudgemeResponse(await response.json(), targets, sanitize);
      // Sanitized values are cached, so hits skip the sanitizer too.
      return parsed ? { data: parsed, shouldCache: true } : { data: {}, shouldCache: false };
    },
  ).then(
    ({ data: value }): AppWidgets | null =>
      'html' in value
        ? (value as AppWidgets)
        : 'unavailable' in value
          ? { ...UNAVAILABLE_WIDGETS }
          : null,
    () => null,
  );
  waitUntil(work);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), RENDER_BUDGET_MS);
  });
  const result = await Promise.race([work, budget]);
  clearTimeout(timer);
  return result;
}
