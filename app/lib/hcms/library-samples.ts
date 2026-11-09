/**
 * Component library sample content (T-2.85): empty image, collection, product and blog settings in
 * the library's preset examples are filled with sample content (the HCMS sample pack by role, the
 * demo catalogue's products/collections/blogs), so each example shows how the section really looks
 * instead of grey placeholders; images in one section share a shape. Library page only:
 * what a merchant adds to a page is still the plain preset. Pure; the loader fetches `samples`.
 */
import {
  blockDef,
  type Asset,
  type BlockDefLike,
  type BlockInstance,
  type LibrarySampleRole,
  type PresetManifest,
  type SectionInstance,
  type Template,
} from '@hcms/schema';

export type SampleImage = { id: string; url: string; width: number; height: number; alt?: string };
export type LibrarySamples = {
  /** The store's own pictures: the fallback when the sample pack has none for a role. */
  images: SampleImage[];
  /** HCMS sample pack by role (served by the admin, `@hcms/schema` `LIBRARY_SAMPLE_IMAGES`). */
  pack?: Partial<Record<LibrarySampleRole, SampleImage[]>>;
  /** Product / collection GIDs, newest first. */
  products: string[];
  collections: string[];
  /** Blog handles (for `blog` settings). */
  blogs?: string[];
};

type SettingDef = { id?: string; type?: string };
type Node = Pick<BlockInstance, 'settings' | 'blocks' | 'block_order'> & { type: string };

/** What a Custom HTML example shows (sanitized like any merchant HTML). */
export const SAMPLE_HTML =
  '<div style="padding:48px 24px;text-align:center"><h2>Your own HTML</h2>' +
  '<p>Paste an embed, a widget or your own markup. Scripts wait for cookie consent.</p></div>';

/** Where an empty button link points in an example (so buttons look live, not disabled). */
export const SAMPLE_LINK = '/collections/all';

/** A countdown end date a fortnight from `now` (examples tick instead of asking for a date). */
export const sampleEndDate = (now: Date) =>
  new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16) + 'Z';

/** How many items a filled `product_list` / `collection_list` gets. */
export const SAMPLE_LIST_SIZE = 4;

const isEmpty = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** Which kind of picture an image setting wants, from its section/block type and setting id. */
export function sampleRole(
  sectionType: string,
  blockType: string | null,
  settingId: string,
): LibrarySampleRole {
  const id = settingId.toLowerCase();
  const type = `${sectionType} ${blockType ?? ''}`.toLowerCase();
  if (/compare/.test(type) && /before/.test(id)) return 'before';
  if (/compare/.test(type) && /after/.test(id)) return 'after';
  if (/logo/.test(id) || /logo/.test(type)) return 'logo';
  if (/avatar|author|portrait|person|profile/.test(id) || /testimonial|review/.test(type))
    return 'portrait';
  if (
    /banner|hero|background|poster|cover/.test(id) ||
    /banner|slide|hero|video|countdown|hotspot|compare/.test(type)
  )
    return 'banner';
  if (/blog|article|multirow|timeline/.test(type)) return 'editorial';
  if (/store|location|contact/.test(type)) return 'brand';
  return 'lifestyle';
}

/**
 * Fills the empty sample-able settings of `ids` (preset examples; saved components stay exactly as
 * saved). Images rotate through the store's pictures so neighbouring examples differ; `assets` maps
 * the sample image ids to the asset entries the renderer needs.
 */
export function fillLibrarySamples(
  template: Template,
  manifest: PresetManifest,
  ids: readonly string[],
  samples: LibrarySamples,
  now: Date = new Date(),
): { template: Template; assets: Record<string, Asset> } {
  let image = 0;
  const perRole = new Map<LibrarySampleRole, number>();
  let product = 0;
  let collection = 0;
  const assets: Record<string, Asset> = {};
  /** Landscape, portrait or square: images in one section share the first one's shape. */
  const shape = (img: { width: number; height: number }) =>
    img.width > img.height * 1.15 ? 'wide' : img.height > img.width * 1.15 ? 'tall' : 'square';
  const nextImage = (role: LibrarySampleRole) => {
    const pool = samples.pack?.[role];
    let img: SampleImage | undefined;
    if (pool?.length) {
      const fitting = sectionShape ? pool.filter((i) => shape(i) === sectionShape) : pool;
      const from = fitting.length ? fitting : pool;
      const at = perRole.get(role) ?? 0;
      perRole.set(role, at + 1);
      img = from[at % from.length];
    } else {
      img = samples.images[image++ % samples.images.length];
    }
    if (!img) return null;
    sectionShape ??= shape(img);
    assets[img.id] = {
      type: 'image',
      url: img.url,
      width: img.width,
      height: img.height,
      ...(img.alt ? { alt: img.alt } : {}),
    };
    return { $file: img.id };
  };
  const rotate = (list: string[], at: number) => list[at % list.length] ?? null;

  let sectionType = '';
  let sectionShape: 'wide' | 'tall' | 'square' | null = null;
  let blog = 0;
  const fill = (
    settings: Record<string, unknown>,
    defs: readonly SettingDef[] | undefined,
    blockType: string | null,
  ) => {
    const out: Record<string, unknown> = { ...settings };
    for (const def of defs ?? []) {
      if (!def.id || !isEmpty(out[def.id])) continue;
      // `*_mobile` images fall back to the desktop one: leave them empty.
      if (def.type === 'image_picker' && !def.id.endsWith('_mobile')) {
        const value = nextImage(sampleRole(sectionType, blockType, def.id));
        if (value) out[def.id] = value;
      } else if (def.type === 'product' && samples.products.length) {
        out[def.id] = rotate(samples.products, product++);
      } else if (def.type === 'collection' && samples.collections.length) {
        out[def.id] = rotate(samples.collections, collection++);
      } else if (def.type === 'product_list' && samples.products.length) {
        out[def.id] = samples.products.slice(0, SAMPLE_LIST_SIZE);
      } else if (def.type === 'collection_list' && samples.collections.length) {
        out[def.id] = samples.collections.slice(0, SAMPLE_LIST_SIZE);
      } else if (def.type === 'url') {
        out[def.id] = SAMPLE_LINK;
      } else if (def.id === 'end_date' && (def.type === 'text' || def.type === undefined)) {
        out[def.id] = sampleEndDate(now);
      } else if (def.type === 'html') {
        out[def.id] = SAMPLE_HTML;
      } else if (def.type === 'blog' && samples.blogs?.length) {
        out[def.id] = rotate(samples.blogs, blog++);
      }
    }
    return out;
  };

  const walk = <T extends Node>(
    node: T,
    defs: readonly SettingDef[] | undefined,
    refs: readonly BlockDefLike[] | undefined,
  ): T => {
    // The section's own settings first: its main image gets the first (best) sample.
    const settings = fill(
      node.settings as Record<string, unknown>,
      defs,
      node.type === sectionType ? null : node.type,
    );
    const blocks = Object.fromEntries(
      Object.entries(node.blocks ?? {}).map(([id, block]) => {
        const def = blockDef(manifest, refs, block.type);
        return [id, walk(block as Node, def?.settings, def?.blocks)];
      }),
    );
    return { ...node, settings, ...(node.blocks ? { blocks } : {}) } as T;
  };

  const sections: Template['sections'] = { ...template.sections };
  for (const id of ids) {
    const section = sections[id];
    const def = section && manifest.sections.find((s) => s.type === section.type);
    if (!section || !def) continue;
    sectionType = section.type;
    sectionShape = null;
    sections[id] = walk(
      section as SectionInstance & Node,
      def.settings as SettingDef[],
      def.blocks as BlockDefLike[] | undefined,
    ) as SectionInstance;
  }
  return { template: { ...template, sections }, assets };
}
