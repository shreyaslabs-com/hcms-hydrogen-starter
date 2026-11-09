import { defaultTheme } from '@hcms/sections';
import { getSelectedProductOptions } from '@shopify/hydrogen';

import { HcmsMainPage } from '~/components/hcms/HcmsMainPage';
import { ratingJsonLd, type AppWidgets } from '~/lib/hcms/judgeme';
import { throwNotFound } from '~/lib/hcms/not-found';
import { loadTemplatePage } from '~/lib/hcms/page';
import { productCrumbs } from '~/lib/hcms/product-crumbs';
import { routeMeta } from '~/lib/hcms/route-seo';
import { JsonLd } from '~/components/JsonLd';

import type { Route } from './+types/product';

/**
 * Product page (T-1.3.7, D-22): the theme's `product` template (official `main-product` +
 * whatever the merchant added). The URL's option params become `selectedOptions` route state, so
 * the section query resolves the variant server-side; the route's SEO/JSON-LD/404 request rides
 * in the same batched query. No product template in the document → the default preset's.
 */
const PRODUCT_META = `query HcmsProductRoute($handle: String!) {
  product(handle: $handle) {
    id handle title vendor description
    seo { title description } hidden: metafield(namespace: "seo", key: "hidden") { value }
    featuredImage { url altText width height }
    rating: metafield(namespace: "reviews", key: "rating") { value }
    ratingCount: metafield(namespace: "reviews", key: "rating_count") { value }
    priceRange { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
    variants(first: 100) {
      nodes { id title sku availableForSale price { amount currencyCode } image { url } }
    }
  }
}`;

type Money = { amount: string; currencyCode: string };
type ProductMeta = {
  id: string;
  handle: string;
  title: string;
  vendor: string;
  description: string;
  seo?: { title?: string | null; description?: string | null } | null;
  /** Shopify `seo.hidden` metafield ("1" = hide from search engines, T-2.48). */
  hidden?: { value?: string | null } | null;
  featuredImage?: {
    url: string;
    altText?: string | null;
    width?: number | null;
    height?: number | null;
  } | null;
  /** Standard product rating metafields (review apps such as Judge.me sync them). */
  rating?: { value?: string | null } | null;
  ratingCount?: { value?: string | null } | null;
  priceRange: { minVariantPrice: Money; maxVariantPrice: Money };
  variants: {
    nodes: {
      id: string;
      title: string;
      sku?: string | null;
      availableForSale: boolean;
      price: Money;
      image?: { url: string } | null;
    }[];
  };
};

export function meta({ matches, loaderData }: Route.MetaArgs) {
  const product = loaderData?.product;
  return routeMeta(matches, {
    template: (loaderData as { hcms?: { name: string } | null } | undefined)?.hcms?.name ?? null,
    type: 'product',
    title: product?.title || 'Product',
    description: product?.description,
    image: product?.featuredImage,
    resourceSeo: product?.seo,
    hidden: (product as { hidden?: { value?: string | null } | null } | null | undefined)?.hidden,
    ogType: 'product',
  });
}

export async function loader({ context, params, request }: Route.LoaderArgs) {
  const handle = params.handle;
  if (!handle) throw new Response('Not Found', { status: 404 });
  const url = new URL(request.url);
  const selectedOptions = getSelectedProductOptions({ searchParams: url.searchParams });
  const hcms = await loadTemplatePage(
    context,
    'product',
    { type: 'product', handle },
    {
      route: { selectedOptions: selectedOptions.map(({ name, value }) => ({ name, value })) },
      extra: { route: { query: PRODUCT_META, variables: { handle } } },
      fallback: defaultTheme.templates.product,
    },
  );
  const product = (hcms?.data.route as { product?: ProductMeta | null } | null)?.product;
  if (!hcms || !product) return throwNotFound(context, request);
  // JSON-LD built here (server only): the builder never ships in the product route's JS.
  const jsonLd = productJsonLd(product, url.origin, hcms.appWidgets);
  // `main-product` `show_breadcrumbs`: Home / product (same component as content pages).
  const crumbs = productCrumbs(hcms.template, product.title);
  return { hcms, product, origin: url.origin, jsonLd, crumbs };
}

/**
 * schema.org Product / ProductGroup (one Offer per variant; canonical stays the product URL).
 * `aggregateRating` (+ a few `review`s) only from real data (T-2.103, `ratingJsonLd`).
 */
function productJsonLd(product: ProductMeta, origin: string, widgets: AppWidgets | null) {
  const url = `${origin}/products/${product.handle}`;
  const offer = (variant: ProductMeta['variants']['nodes'][number]) => ({
    '@type': 'Offer',
    price: variant.price.amount,
    priceCurrency: variant.price.currencyCode,
    availability: variant.availableForSale
      ? 'https://schema.org/InStock'
      : 'https://schema.org/OutOfStock',
    url,
  });
  const base = {
    '@context': 'https://schema.org',
    name: product.title,
    description: product.description,
    url,
    ...(product.vendor ? { brand: { '@type': 'Brand', name: product.vendor } } : {}),
    ...(product.featuredImage ? { image: product.featuredImage.url } : {}),
    ...ratingJsonLd(product, widgets, product.id),
  };
  const variants = product.variants.nodes;
  if (variants.length <= 1) {
    return {
      ...base,
      '@type': 'Product',
      ...(variants[0] ? { sku: variants[0].sku ?? undefined, offers: offer(variants[0]) } : {}),
    };
  }
  return {
    ...base,
    '@type': 'ProductGroup',
    productGroupID: product.id,
    hasVariant: variants.map((variant) => ({
      '@type': 'Product',
      name: `${product.title} — ${variant.title}`,
      ...(variant.sku ? { sku: variant.sku } : {}),
      ...(variant.image ? { image: variant.image.url } : {}),
      offers: offer(variant),
    })),
  };
}

export default function ProductRoute({ loaderData }: Route.ComponentProps) {
  const { hcms, origin, jsonLd, crumbs } = loaderData;
  return (
    <HcmsMainPage page={hcms} origin={origin} {...(crumbs ? { crumbs } : {})}>
      <JsonLd data={jsonLd} />
    </HcmsMainPage>
  );
}
