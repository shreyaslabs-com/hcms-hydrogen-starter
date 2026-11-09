/**
 * Metaobject web page SEO (T-2.38, docs/11 §4). The definition's `renderable` capability names
 * the fields used as meta title / description; Storefront resolves them as `metaobject.seo`
 * (`MetaobjectSEO.title` / `.description` are those fields). Precedence mirrors Online Store:
 * renderable meta fields (resource SEO) → theme override → entry title / description fields.
 */
import { parseRichText, richTextToPlainText } from './rich-text.ts';

type Img = { url: string; altText?: string | null; width?: number | null; height?: number | null };
export type MetaobjectSeoField = {
  key: string;
  type?: string | null;
  value?: string | null;
  reference?: { __typename?: string; image?: Img | null } | null;
};
export type MetaobjectSeoEntry = {
  handle: string;
  fields: MetaobjectSeoField[];
  seo?: {
    title?: { type?: string | null; value?: string | null } | null;
    description?: { type?: string | null; value?: string | null } | null;
  } | null;
};

/** Field keys used as the page title, in order of preference (same as `main-metaobject`). */
export const TITLE_KEYS = ['title', 'name', 'heading'];
/** Field keys used as the description when the definition names no meta description field. */
export const DESCRIPTION_KEYS = ['description', 'summary', 'excerpt', 'body', 'bio'];
const IMAGE_KEYS = ['image', 'cover', 'photo', 'featured_image'];

/** A field value as plain text: rich text JSON → text, other JSON/refs ignored. */
export function fieldText(
  field: { type?: string | null; value?: string | null } | null | undefined,
) {
  const value = field?.value?.trim();
  if (!value) return null;
  if (field?.type === 'rich_text_field' || (!field?.type && value.startsWith('{"type":"root"')))
    return richTextToPlainText(parseRichText(value)) || null;
  if (field?.type === 'json' || field?.type?.includes('reference')) return null;
  return value;
}

const humanize = (key: string) => {
  const text = key.replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export function metaobjectSeo(entry: MetaobjectSeoEntry) {
  const byKey = (keys: string[]) =>
    keys.map((key) => entry.fields.find((f) => f.key === key)).find((f) => fieldText(f));
  const title = fieldText(byKey(TITLE_KEYS)) ?? humanize(entry.handle);
  const description = fieldText(byKey(DESCRIPTION_KEYS));
  const imageField =
    IMAGE_KEYS.map((key) => entry.fields.find((f) => f.key === key)).find(
      (f) => f?.reference?.image,
    ) ?? entry.fields.find((f) => f.reference?.__typename === 'MediaImage' && f.reference.image);
  const image = imageField?.reference?.image ?? null;
  return {
    title,
    description,
    image: image?.url ? image : null,
    /** From the definition's renderable meta title/description fields (win over everything). */
    resourceSeo: {
      title: fieldText(entry.seo?.title),
      description: fieldText(entry.seo?.description),
    },
  };
}
