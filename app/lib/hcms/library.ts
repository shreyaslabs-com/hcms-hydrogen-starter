/**
 * Component library page (T-2.85): every section a merchant can add, one example per preset, built
 * from this deployment's registry (official + the developer's own sections) and rendered with the
 * draft's theme settings. Preview only; the editor's Component library tab frames it.
 */
import {
  LIBRARY_SAMPLE_IMAGES,
  LIBRARY_SAMPLES_PATH,
  libraryTemplate,
  libraryVariants,
  savedVariants,
  type LibrarySampleRole,
  type Template,
} from '@hcms/schema';
import { Cache, createRunWithCache, gql, type CacheInstance } from '@shopify/hydrogen';
import type { RouterContextProvider } from 'react-router';

import { documentContext } from '~/lib/hcms/document';
import {
  fillLibrarySamples,
  type LibrarySamples,
  type SampleImage,
} from '~/lib/hcms/library-samples';
import { previewContext } from '~/lib/preview';
import { loadSections, type TemplatePage } from '~/lib/hcms/page';
import {
  createDemoStorefrontClient,
  storefrontClientContext,
  type RequestStorefrontClient,
} from '~/lib/storefront';
import { registry } from '~/sections';

/** One line under each category heading (unknown categories get none). */
const CATEGORY_BLURB: Record<string, string> = {
  Saved: 'Sections you set up and saved, ready to reuse on any page.',
  Apps: 'Widgets from the apps you connect.',
  Banners: 'Big first impressions for the top of a page.',
  Blog: 'Stories and news from your blogs.',
  Collections: 'Help shoppers find the right collection.',
  Custom: 'Your own content and code.',
  Forms: 'Sign-ups, contact and order lookups.',
  Image: 'Photography front and centre.',
  Layout: 'Structure: columns, spacing and dividers.',
  Products: 'Sell from any page.',
  Storytelling: 'Reviews, timelines and why your brand matters.',
  Text: 'Headlines, details and answers.',
  Video: 'Motion that shows the product in use.',
};

export type LibraryExample = {
  id: string;
  name: string;
  sectionName: string;
  /** 1-based position among this section's looks, and how many it has. */
  look: number;
  looks: number;
  /** A saved component (named by the merchant), not a preset look. */
  saved: boolean;
};
export type LibraryCategoryGroup = {
  category: string;
  /** Anchor id for the category chips. */
  slug: string;
  blurb: string | null;
  examples: LibraryExample[];
};
export type LibraryPage = {
  page: TemplatePage;
  categories: LibraryCategoryGroup[];
  stats: { sections: number; looks: number; categories: number };
};

const slugify = (s: string) =>
  `hl-${s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;

/** Demo catalogue products, collections and blogs for the examples (library page only). */
const SAMPLES_QUERY = gql(`
  query HcmsLibrarySamples($country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    products(first: 24, sortKey: BEST_SELLING) {
      nodes {
        id
        featuredImage { id url altText width height }
      }
    }
    collections(first: 8, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        image { id url altText width height }
      }
    }
    blogs(first: 3) {
      nodes { handle }
    }
  }
`);

type SampleImageNode = {
  id?: string | null;
  url: string;
  altText?: string | null;
  width?: number | null;
  height?: number | null;
} | null;

const withImagesFirst = <T>(items: readonly T[], image: (item: T) => unknown) => [
  ...items.filter((i) => image(i)),
  ...items.filter((i) => !image(i)),
];

/**
 * The demo catalogue (mock.shop) is public and rarely changes, and each query takes ~0.8 s: cache
 * them (1 h, stale-while-revalidate) so the library opens fast. Hydrogen 2026.10.1's `graphql()`
 * takes no per-query cache, hence `createRunWithCache`. Responses with errors aren't cached.
 * Never used for the store's own client (saved components must show their latest data).
 */
export function cachedDemoClient(
  client: RequestStorefrontClient,
  cache: CacheInstance,
  waitUntil: ExecutionContext['waitUntil'],
): RequestStorefrontClient {
  const runWithCache = createRunWithCache({ cache, waitUntil });
  const graphql = ((query: string, options?: { variables?: unknown }) =>
    runWithCache(
      {
        key: ['hcms', 'library-demo', query, JSON.stringify(options?.variables ?? null)],
        strategy: Cache.long(),
      },
      async () => {
        const result = (await (client.graphql as (q: string, o?: unknown) => Promise<unknown>)(
          query,
          options,
        )) as { errors?: unknown[] | null };
        return { data: result, shouldCache: !result.errors?.length };
      },
    ).then((r) => r.data)) as RequestStorefrontClient['graphql'];
  // A proxy keeps the client's other methods (and `this`) intact.
  return new Proxy(client, {
    get: (target, key) => (key === 'graphql' ? graphql : Reflect.get(target, key, target)),
  });
}

/** The HCMS sample pack, served by the admin that signed this preview (also the style guide's). */
export function samplePack(
  editorOrigin: string | null | undefined,
): Partial<Record<LibrarySampleRole, SampleImage[]>> {
  if (!editorOrigin) return {};
  const pack: Partial<Record<LibrarySampleRole, SampleImage[]>> = {};
  LIBRARY_SAMPLE_IMAGES.forEach((s, i) => {
    (pack[s.role] ??= []).push({
      // Numeric: the SDK resolves `gid://hcms/LibrarySample/<n>` from the asset map.
      id: `gid://hcms/LibrarySample/${i + 1}`,
      url: `${editorOrigin}${LIBRARY_SAMPLES_PATH}${s.file}`,
      width: s.width,
      height: s.height,
      alt: s.alt,
    });
  });
  return pack;
}

async function loadSamples(
  context: Readonly<RouterContextProvider>,
  client: RequestStorefrontClient,
): Promise<LibrarySamples | null> {
  try {
    const { data } = await client.graphql(SAMPLES_QUERY);
    const products = data?.products.nodes ?? [];
    const collections = data?.collections.nodes ?? [];
    if (!products.length) return null;
    const images = [
      ...products.map((p) => p.featuredImage as SampleImageNode),
      ...collections.map((c) => c.image as SampleImageNode),
    ].flatMap((img, i) =>
      img?.url && img.width && img.height
        ? [
            {
              id: img.id ?? `gid://hcms/LibrarySample/${i}`,
              url: img.url,
              width: img.width,
              height: img.height,
              ...(img.altText ? { alt: img.altText } : {}),
            },
          ]
        : [],
    );
    return {
      images,
      pack: samplePack(context.get(previewContext)?.claims.editorOrigin),
      // Pictured products/collections first: a sample without an image looks like a placeholder.
      products: withImagesFirst(products, (p) => p.featuredImage).map((p) => p.id),
      collections: withImagesFirst(collections, (c) => c.image).map((c) => c.id),
      blogs: (data?.blogs.nodes ?? []).map((b) => b.handle),
    };
  } catch {
    return null;
  }
}

/** The sample pack as plain pictures for placeholder slots (render context `sampleImage`). */
export type LibraryPicture = { url: string; width: number; height: number; altText?: string };

/**
 * Preset examples use the demo catalogue (mock.shop: varied, pictured products, collections and
 * blogs) with the HCMS sample pack; saved components use the store's own client (they reference
 * the store's products and files). Falls back to the store's catalogue when the demo is down.
 */
export async function loadLibraryPage(
  context: Readonly<RouterContextProvider> & {
    cache: CacheInstance;
    waitUntil: ExecutionContext['waitUntil'];
  },
  request: Request,
): Promise<LibraryPage & { pictures: LibraryPicture[] }> {
  const manifest = registry.manifest();
  const components = context.get(documentContext).components ?? [];
  const presetVariants = libraryVariants(manifest);
  // Saved components (T-2.86) first, then every section × preset.
  const variants = [...savedVariants(manifest, components), ...presetVariants];
  const store = context.get(storefrontClientContext);
  const demo = cachedDemoClient(
    createDemoStorefrontClient(request, context.cache, context.waitUntil),
    context.cache,
    context.waitUntil,
  );
  let client: RequestStorefrontClient = demo;
  let samples = await loadSamples(context, demo);
  if (!samples) {
    client = store;
    samples = (await loadSamples(context, store)) ?? {
      images: [],
      products: [],
      collections: [],
      pack: samplePack(context.get(previewContext)?.claims.editorOrigin),
    };
  }
  const full = libraryTemplate(manifest, presetVariants, components);
  const filled = fillLibrarySamples(
    {
      order: presetVariants.map((v) => v.id),
      sections: pick(
        full,
        presetVariants.map((v) => v.id),
      ),
    },
    manifest,
    presetVariants.map((v) => v.id),
    samples,
  );
  const savedIds = savedVariants(manifest, components).map((v) => v.id);
  const [presets, saved] = await Promise.all([
    loadSections(context, [filled.template], {}, { assets: filled.assets, client }),
    savedIds.length
      ? loadSections(context, [{ order: savedIds, sections: pick(full, savedIds) }])
      : null,
  ]);
  const template = {
    order: [...savedIds, ...presetVariants.map((v) => v.id)],
    sections: {
      ...(saved?.containers[0]?.sections ?? {}),
      ...(presets.containers[0]?.sections ?? filled.template.sections),
    },
  } as Template;
  const loaded = {
    data: { ...saved?.data, ...presets.data },
    assets: { ...saved?.assets, ...presets.assets },
    sectionCss: { ...saved?.sectionCss, ...presets.sectionCss },
    preview: presets.preview,
  };
  const pictures: LibraryPicture[] = Object.entries(samples.pack ?? {})
    // Placeholder slots are mostly product/collection cards: no logos, compare pair or headshots.
    .filter(([role]) => !['logo', 'before', 'after', 'portrait'].includes(role))
    .flatMap(([, list]) =>
      (list ?? []).map((p) => ({
        url: p.url,
        width: p.width,
        height: p.height,
        ...(p.alt ? { altText: p.alt } : {}),
      })),
    );

  const looks = new Map<string, number>();
  for (const v of presetVariants) looks.set(v.type, (looks.get(v.type) ?? 0) + 1);
  const seen = new Map<string, number>();
  const categories: LibraryCategoryGroup[] = [];
  for (const v of variants) {
    let group = categories.find((c) => c.category === v.category);
    if (!group)
      categories.push(
        (group = {
          category: v.category,
          slug: slugify(v.category),
          blurb: CATEGORY_BLURB[v.category] ?? null,
          examples: [],
        }),
      );
    const look = v.componentId ? 1 : (seen.get(v.type) ?? 0) + 1;
    if (!v.componentId) seen.set(v.type, look);
    group.examples.push({
      id: v.id,
      name: v.name,
      sectionName: v.sectionName,
      look,
      looks: looks.get(v.type) ?? 1,
      saved: Boolean(v.componentId),
    });
  }

  return {
    page: {
      name: 'library',
      template,
      resource: null,
      parent: null,
      route: {},
      data: loaded.data,
      assets: loaded.assets,
      preview: loaded.preview,
      sectionCss: loaded.sectionCss,
      appWidgets: null,
    },
    categories,
    stats: { sections: looks.size, looks: presetVariants.length, categories: categories.length },
    pictures,
  };
}

const pick = (template: Template, ids: readonly string[]): Template['sections'] =>
  Object.fromEntries(
    ids.flatMap((id) => (template.sections[id] ? [[id, template.sections[id]]] : [])),
  );
