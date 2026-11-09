/**
 * Live preview section refetch (`/__hcms/section`, T-1.1.7): pure helpers so `node:test` can load
 * them. The page posts the live (raw) section; the route runs it through the same pipeline as
 * `loadTemplatePage` (one batched Storefront query, bindings resolved for the page's market and
 * resource) and answers with the section's data slices, the resolved section and new assets.
 */
import type { Asset, JsonValue, SectionInstance } from '@hcms/schema';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export type SectionRefetch = {
  id: string;
  section: SectionInstance;
  /** The page's template resource (+ `parent`: an article's blog handle). */
  resource: { type: string; id?: string; handle?: string; parent?: string } | null;
  route: Record<string, JsonValue> | undefined;
};

/** Validates a `{ id, section, resource?, parent?, route? }` body; null = not that shape. */
export function parseSectionRefetch(body: unknown): SectionRefetch | null {
  if (!isRecord(body)) return null;
  const { id, section, resource, parent, route } = body;
  if (typeof id !== 'string' || !id || !isRecord(section)) return null;
  if (
    typeof section.type !== 'string' ||
    !isRecord(section.settings) ||
    !isRecord(section.blocks) ||
    !Array.isArray(section.block_order)
  ) {
    return null;
  }
  const str = (value: unknown) => (typeof value === 'string' && value ? value : undefined);
  const type = isRecord(resource) ? str(resource.type) : undefined;
  const optional = (key: string, value: string | undefined) => (value ? { [key]: value } : {});
  return {
    id,
    section: section as SectionInstance,
    resource:
      type && isRecord(resource)
        ? {
            type,
            ...optional('id', str(resource.id)),
            ...optional('handle', str(resource.handle)),
            ...optional('parent', str(parent)),
          }
        : null,
    route: isRecord(route) ? (route as Record<string, JsonValue>) : undefined,
  };
}

/** This section's request slices (`section:<id>`, `block:<id>/…`) of the batched result. */
export function sectionSlices(
  data: Readonly<Record<string, unknown>>,
  id: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(
      ([key]) => key === `section:${id}` || key.startsWith(`block:${id}/`),
    ),
  );
}

/** Assets the page doesn't have from the snapshot (the snapshot map is already on the client). */
export function newAssets(
  all: Readonly<Record<string, Asset>>,
  known: Readonly<Record<string, Asset>>,
): Record<string, Asset> {
  return Object.fromEntries(Object.entries(all).filter(([gid]) => !(gid in known)));
}
