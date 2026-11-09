/**
 * Page pipeline, part 2 (T-1.2.12): containers (a template, or the header/footer section groups)
 * → section/block queries + bindings + missing files → ONE Storefront query → plain values.
 */
import {
  collectFileGids,
  collectSectionRequests,
  collectSourceContexts,
  fileNodesRequest,
  mergeFileNodes,
  prepareReferenceSettings,
  resolveBindings,
  resolveData,
  resolveTemplate,
  rewriteReferenceRequests,
  sectionStyles,
  settingTypeLookup,
  sourceRequests,
  unwrapReferenceData,
  validateDefinitions,
  type SectionCss,
  type SectionDataRequest,
  type SectionQueryArgs,
  type SourceResource,
  type TemplateResource,
  type TemplateType,
} from '@hcms/hydrogen';
import type { Asset, SectionGroup, Template } from '@hcms/schema';
import type { RouterContextProvider } from 'react-router';

import { documentContext } from '~/lib/hcms/document';
import type { AppWidgets } from '~/lib/hcms/judgeme';
import { loadJudgemeWidgets } from '~/lib/hcms/judgeme.server';
import { marketContext } from '~/lib/localization';
import { previewContext } from '~/lib/preview';
import { storefrontClientContext, type RequestStorefrontClient } from '~/lib/storefront';
import { blockDefinitions, registry, sectionDefinitions } from '~/sections';

// Section schemas are validated on the server in development (never in client bundles).
let validated = false;
function validateOnce() {
  if (validated || !import.meta.env.DEV) return;
  validateDefinitions({ sections: sectionDefinitions, blocks: blockDefinitions });
  validated = true;
}

/** Setting types for binding conversions (richtext HTML, numbers, GIDs…), from the registry. */
const settingType = settingTypeLookup(registry);

/** Request id of the file `nodes` request (merged into the one batched query). */
const FILES_REQUEST = 'files';

type Container = Pick<Template | SectionGroup, 'order' | 'sections'>;

export type LoadedSections<T extends Container> = {
  /** Containers with bindings resolved (components receive plain values, ADR 003). */
  containers: T[];
  /** Per request id (`section:hero`): that section's slice of the batched query. */
  data: Record<string, unknown>;
  /** Snapshot asset map + files fetched for these sections + images reached through bindings. */
  assets: Record<string, Asset>;
  preview: boolean;
  /** Section Custom CSS (T-2.74), sanitized + scoped on the server (no sanitizer in the client). */
  sectionCss: SectionCss;
  /**
   * Some setting is bound to `variant.*` of the page's product: a shopper's variant pick must
   * reload the page data (the server resolves those bindings for the URL's options).
   */
  variantSources?: boolean;
};

export type LoadOptions = {
  /** Route state for "main" sections (D-22): parsed URL filters/sort/cursor, `search`. */
  route?: NonNullable<SectionQueryArgs['route']>;
  /**
   * The route's own data needs (meta, analytics, 404 check), merged into the SAME batched query.
   * Results come back in `data[id]`.
   */
  extra?: Record<string, SectionDataRequest>;
  /** Template to use when the document has none for this page (e.g. the default preset's). */
  fallback?: Template;
  /** Extra known assets (Component library sample images): never fetched, merged into `assets`. */
  assets?: Record<string, Asset>;
  /** Storefront client to query (Component library demo catalogue); default = the store's. */
  client?: RequestStorefrontClient;
  /**
   * Fail soft within this budget (layout groups, S2-2): a slow or failed query renders the
   * sections without data instead of throwing.
   */
  softTimeoutMs?: number;
};

/** One batched Storefront query for every section in `containers`. */
export async function loadSections<T extends Container>(
  context: Readonly<RouterContextProvider>,
  containers: T[],
  resource: TemplateResource & { type?: string } = {},
  options: LoadOptions = {},
): Promise<LoadedSections<T>> {
  validateOnce();
  const { document } = context.get(documentContext);
  const storefrontClient = options.client ?? context.get(storefrontClientContext);
  const sectionResource = resource.type
    ? {
        type: resource.type,
        ...(resource.id ? { id: resource.id } : {}),
        ...(resource.handle ? { handle: resource.handle } : {}),
      }
    : null;
  // `$source` / `{{token}}` bindings: one request per resource context, same batched query.
  const templateResource: SourceResource | null = sectionResource
    ? {
        root: sectionResource.type,
        ...(sectionResource.id ? { id: sectionResource.id } : {}),
        ...(sectionResource.handle ? { handle: sectionResource.handle } : {}),
        ...(resource.parent ? { parent: resource.parent } : {}),
        ...sourceRouteContext(options.route),
      }
    : null;

  // Resource settings bound to reference sources: sections query through the source (T-2.2).
  const prepared = prepareReferenceSettings(containers, templateResource, settingType);
  const { requests, rewrites } = rewriteReferenceRequests(
    {
      ...options.extra,
      ...collectSectionRequests(registry, prepared.containers, sectionResource, options.route),
    },
    prepared.bindings,
  );
  let variantSources = false;
  for (const container of containers) {
    const contexts = collectSourceContexts(container, templateResource);
    if (Object.values(contexts).some((c) => c.variant)) variantSources = true;
    Object.assign(requests, sourceRequests(contexts));
  }

  // Files not in the snapshot asset map (drafts, files added since publish): one `nodes` request.
  const known = { ...document.assets, ...options.assets };
  const missing = [...collectFileGids(containers.map((c) => c.sections))].filter(
    (gid) => !known[gid],
  );
  const files = fileNodesRequest(missing);
  if (files) requests[FILES_REQUEST] = files;

  const soft = options.softTimeoutMs;
  const result = await resolveData(requests, (query, variables) => {
    // Batched document built by the SDK; `$country`/`$language` are injected by the client.
    const response = storefrontClient.graphql(
      query as never,
      (soft ? { variables, signal: AbortSignal.timeout(soft) } : { variables }) as never,
    ) as Promise<{
      data?: Record<string, unknown> | null;
      errors?: { message: string; path?: (string | number)[] }[] | null;
    }>;
    return soft
      ? response.catch((error: unknown) => {
          console.error(
            `Section data unavailable: ${error instanceof Error ? error.message : String(error)}`,
          );
          return { data: null, errors: null };
        })
      : response;
  });

  unwrapReferenceData(result.data, rewrites);

  const { market } = context.get(marketContext);
  const locale = `${market.language.toLowerCase()}-${market.country}`;
  const boundAssets: Record<string, Asset> = {};
  const resolved = containers.map((container) => {
    const bound = resolveBindings(container as Template, result.data, {
      templateResource,
      locale,
      settingType,
    });
    Object.assign(boundAssets, bound.assets);
    return { ...container, sections: bound.template.sections } as T;
  });

  return {
    containers: resolved,
    data: result.data,
    assets: {
      ...boundAssets,
      ...mergeFileNodes(
        known,
        (result.data[FILES_REQUEST] as { nodes?: Parameters<typeof mergeFileNodes>[1] } | null)
          ?.nodes,
      ),
    },
    preview: context.get(previewContext) !== null,
    sectionCss: sectionStyles(containers),
    ...(variantSources ? { variantSources } : {}),
  };
}

/** Route state that sharpens a source context: selected variant options, metaobject type. */
function sourceRouteContext(
  route: LoadOptions['route'],
): Pick<SourceResource, 'selectedOptions' | 'type'> {
  const options = route?.selectedOptions;
  const type = route?.metaobjectType;
  return {
    ...(Array.isArray(options)
      ? {
          selectedOptions: options.flatMap((o) =>
            o && typeof o === 'object' && !Array.isArray(o) && typeof o.name === 'string'
              ? [{ name: o.name, value: String(o.value ?? '') }]
              : [],
          ),
        }
      : {}),
    ...(typeof type === 'string' ? { type } : {}),
  };
}

export type TemplatePage = {
  name: string;
  template: Template;
  /** Passed back on preview refetches so main sections keep their context. */
  resource: SectionQueryArgs['resource'];
  /** Parent handle of the resource (an article's blog), for preview refetches' sources. */
  parent: string | null;
  route: NonNullable<SectionQueryArgs['route']>;
  data: Record<string, unknown>;
  assets: Record<string, Asset>;
  preview: boolean;
  sectionCss: SectionCss;
  /** Server-rendered app widgets (T-2.103 Judge.me), sanitized; null = none / unavailable. */
  appWidgets: AppWidgets | null;
  /** Settings bound to `variant.*`: variant picks revalidate (`HcmsProductForm`). */
  variantSources?: boolean;
};

/** Null when the document has no template for this page (the route renders its own UI). */
export async function loadTemplatePage(
  context: Readonly<RouterContextProvider>,
  type: TemplateType,
  resource: TemplateResource & { type?: string } = {},
  options: LoadOptions = {},
): Promise<TemplatePage | null> {
  const { document } = context.get(documentContext);
  const found = resolveTemplate(document, type, resource);
  const resolved = found ?? (options.fallback ? { name: type, template: options.fallback } : null);
  if (!resolved) return null;
  const loaded = await loadSections(context, [resolved.template], resource, options);
  const template = loaded.containers[0] as Template;
  // Judge.me needs the product ids from the batched query; cached, time-boxed, fail-soft.
  const appWidgets = options.client
    ? null
    : await loadJudgemeWidgets(context, template, loaded.data);
  return {
    name: resolved.name,
    template,
    resource: resource.type
      ? {
          type: resource.type,
          ...(resource.id ? { id: resource.id } : {}),
          ...(resource.handle ? { handle: resource.handle } : {}),
        }
      : null,
    parent: resource.parent ?? null,
    route: options.route ?? {},
    data: loaded.data,
    assets: loaded.assets,
    preview: loaded.preview,
    sectionCss: loaded.sectionCss,
    appWidgets,
    ...(loaded.variantSources ? { variantSources: true } : {}),
  };
}

export type LayoutGroups = {
  header: SectionGroup | null;
  footer: SectionGroup | null;
  /** Popups / age gate (T-2.29). */
  overlay: SectionGroup | null;
  data: Record<string, unknown>;
  assets: Record<string, Asset>;
  preview: boolean;
  sectionCss: SectionCss;
};

/** Budget for the layout groups' data (menus, header/footer products) before they render empty. */
export const LAYOUT_DATA_TIMEOUT_MS = 3000;

/** Header/footer section groups for the root layout (null group = app's own header/footer). */
export async function loadLayoutGroups(
  context: Readonly<RouterContextProvider>,
): Promise<LayoutGroups> {
  const { document } = context.get(documentContext);
  const names = (['header', 'footer', 'overlay'] as const).filter(
    (name) => (document.groups[name]?.order.length ?? 0) > 0,
  );
  if (names.length === 0) {
    return {
      header: null,
      footer: null,
      overlay: null,
      data: {},
      assets: {},
      preview: false,
      sectionCss: {},
    };
  }
  // Header/footer/menus are chrome: a slow Storefront API never holds the page (S2-2).
  const loaded = await loadSections(
    context,
    names.map((name) => document.groups[name] as SectionGroup),
    {},
    { softTimeoutMs: LAYOUT_DATA_TIMEOUT_MS },
  );
  const byName = Object.fromEntries(names.map((name, i) => [name, loaded.containers[i]]));
  return {
    header: byName.header ?? null,
    footer: byName.footer ?? null,
    overlay: byName.overlay ?? null,
    data: loaded.data,
    assets: loaded.assets,
    preview: loaded.preview,
    sectionCss: loaded.sectionCss,
  };
}
