/**
 * Page pipeline, part 1 (T-1.2.12): which Theme Document renders this request.
 * Live: HCMS read API when configured (T-1.4.9, pointer cached 10 s / SWR 60 s) → metaobject
 * mirror (cached 10 s / SWR 60 s, "nothing published" included) → bundled last-known-good. Preview: the editor's draft, falling back to the live chain if it fails.
 * Licence lease (T-2.150): a pointer whose `licensed_until` has passed (checked against the
 * request time, server only) is refused, so the bundled default theme renders.
 */
import {
  MIRROR_CACHE_SECONDS,
  createApiSource,
  createCdnSource,
  createBundledSource,
  createMirrorSource,
  loadDraft,
  licenseStatus,
  loadThemeDocument,
  type ApiPointer,
  type LicenseState,
  type LoadResult,
  type MirrorQueryData,
  type PreviewState,
  type SnapshotSource,
  type TierFailure,
  type StorefrontGate,
} from '@hcms/hydrogen';
import type { SavedComponent, ThemeDocument } from '@hcms/schema';
import { Cache, createRunWithCache, type CacheInstance } from '@shopify/hydrogen';
import { createContext } from 'react-router';

import lastKnownGood from '~/hcms/last-known-good.json';
import type { RequestStorefrontClient } from '~/lib/storefront';

/** The parts of a document the renderer needs (drafts have no publish metadata). */
export type RenderableDocument = Pick<
  ThemeDocument,
  | 'settings'
  | 'groups'
  | 'templates'
  | 'assignments'
  | 'seo'
  | 'content'
  | 'markets'
  | 'embeds'
  | 'experiments'
> & {
  /** Publish-time asset map; drafts have none (files are fetched per page). */
  assets?: ThemeDocument['assets'];
};

export type DocumentState = {
  document: RenderableDocument;
  source: LoadResult['tier'] | 'draft';
  /** Tiers that failed before this one (non-empty = degraded; log/alert). */
  failures: TierFailure[];
  draftError?: string;
  /** Password gate from the live pointer (T-2.21); null = open. */
  gate?: StorefrontGate | null;
  /** Licence lease (T-2.150) for `/__hcms/health`: expired = the mirror was refused → bundled. */
  license?: LicenseState;
  /** Preview only: the store's saved components (T-2.86) for the Component library page. */
  components?: SavedComponent[];
};

export const documentContext = createContext<DocumentState>();

const bundled = createBundledSource(lastKnownGood);

export async function loadPageDocument({
  storefrontClient,
  cache,
  waitUntil,
  storeKey,
  preview,
  api,
  cdn,
}: {
  storefrontClient: RequestStorefrontClient;
  cache: CacheInstance;
  waitUntil: ExecutionContext['waitUntil'];
  storeKey: string;
  preview: PreviewState | null;
  /** HCMS read API (`HCMS_API_URL` + `HCMS_PUBLIC_KEY`); omitted = mirror first. */
  api?: { baseUrl: string; shop: string; key: string } | undefined;
  /** Cloudflare CDN tier (`HCMS_CDN_URL`, T-0.8): tried first; omitted = api/mirror first. */
  cdn?: { baseUrl: string; shop: string } | undefined;
}): Promise<DocumentState> {
  let draftError: string | undefined;
  if (preview) {
    try {
      const { document, components } = await loadDraft(preview);
      return { document, source: 'draft', failures: [], components };
    } catch (error) {
      draftError = error instanceof Error ? error.message : String(error);
    }
  }

  const runWithCache = createRunWithCache({ cache, waitUntil });
  const requestTime = Date.now();
  const now = () => requestTime;
  const mirror = createMirrorSource({
    now,
    // The SDK passes its validated MIRROR_QUERY string; the client injects nothing here.
    query: (query) =>
      storefrontClient.graphql(query as never) as Promise<{
        data?: MirrorQueryData | null;
        errors?: unknown;
      }>,
    cacheRead: async (load) => {
      const { data } = await runWithCache(
        { key: ['hcms', 'mirror', storeKey], strategy: Cache.short(MIRROR_CACHE_SECONDS) },
        async () => ({ data: (await load()) as Record<string, unknown>, shouldCache: true }),
      );
      return data as MirrorQueryData;
    },
  });

  const sources: SnapshotSource[] = [mirror, bundled];
  if (api) {
    sources.unshift(
      createApiSource({
        ...api,
        now,
        cacheRead: async (load) => {
          const { data } = await runWithCache(
            { key: ['hcms', 'api-pointer', storeKey], strategy: Cache.short(MIRROR_CACHE_SECONDS) },
            async () => ({ data: await load(), shouldCache: true }),
          );
          return data as ApiPointer;
        },
      }),
    );
  }

  if (cdn) {
    sources.unshift(
      createCdnSource({
        ...cdn,
        now,
        cacheRead: async (load) => {
          const { data } = await runWithCache(
            { key: ['hcms', 'cdn-pointer', storeKey], strategy: Cache.short(MIRROR_CACHE_SECONDS) },
            async () => ({ data: await load(), shouldCache: true }),
          );
          return data as ApiPointer;
        },
      }),
    );
  }

  try {
    const result = await loadThemeDocument(sources);
    return {
      document: result.document,
      source: result.tier,
      failures: result.failures,
      gate: result.gate ?? null,
      license: licenseStatus(result, requestTime),
      ...(draftError ? { draftError } : {}),
    };
  } catch {
    // Every tier failed, including the bundled file: render the store's own pages without sections.
    return {
      document: { settings: {}, groups: {}, templates: {} },
      source: 'bundled',
      failures: [],
    };
  }
}
