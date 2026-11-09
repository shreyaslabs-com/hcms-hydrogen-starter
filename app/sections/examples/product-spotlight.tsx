/**
 * Example custom section with Shopify data (docs/developers/custom-sections.md, "Shopify data").
 * `query` returns one standalone Storefront query; the storefront merges it into the page's single
 * batched request and passes this section's part back as `data`. Not registered: copy it to
 * `app/sections/custom/product-spotlight.tsx` to use it.
 */
import {
  defineSection,
  useAppComponents,
  useIsPreview,
  type SectionComponentProps,
  type SectionQuery,
} from '@hcms/hydrogen';

type Data = {
  product: {
    handle: string;
    title: string;
    featuredImage: { url: string; altText: string | null; width: number; height: number } | null;
    priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
  } | null;
};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const FIELDS = `handle title
  featuredImage { url altText width height }
  priceRange { minVariantPrice { amount currencyCode } }`;

/** A `product` setting holds a product GID or (from presets and imports) a handle. */
const productSpotlightQuery: SectionQuery = ({ settings }) => {
  const value = text(settings.product);
  if (!value) return null; // nothing picked: no request, `data` is null
  return value.startsWith('gid://shopify/Product/')
    ? {
        query: `query ProductSpotlight($product: ID!) { product(id: $product) { ${FIELDS} } }`,
        variables: { product: value },
      }
    : {
        query: `query ProductSpotlight($product: String!) { product(handle: $product) { ${FIELDS} } }`,
        variables: { product: value },
      };
};

function ProductSpotlight({ settings, data }: SectionComponentProps) {
  const { Image, Link, formatMoney } = useAppComponents();
  const preview = useIsPreview();
  const product = (data as Data | null)?.product ?? null;
  if (!product) {
    // Live: render nothing. Editor: tell the merchant what to do.
    return preview ? (
      <p className="max-w-page px-margin type-body mx-auto py-12">Select a product.</p>
    ) : null;
  }
  return (
    <div className="max-w-page px-margin mx-auto grid items-center gap-8 py-12 md:grid-cols-2">
      {product.featuredImage ? (
        <Image
          image={product.featuredImage}
          sizes="(min-width: 768px) 50vw, 100vw"
          className="h-auto w-full"
        />
      ) : null}
      <div className="flex flex-col gap-3">
        <h2 className="type-heading-lg">{text(settings.heading) || product.title}</h2>
        <p className="type-body-lg">{formatMoney(product.priceRange.minVariantPrice)}</p>
        <Link to={`/products/${product.handle}`} className="type-body underline underline-offset-4">
          View product
        </Link>
      </div>
    </div>
  );
}

export const productSpotlight = defineSection({
  type: 'product-spotlight',
  name: 'Product spotlight',
  settings: [
    { type: 'product', id: 'product', label: 'Product' },
    { type: 'text', id: 'heading', label: 'Heading', info: 'Leave empty to use the product title' },
  ],
  presets: [{ name: 'Product spotlight', category: 'Products' }],
  query: productSpotlightQuery,
  component: ProductSpotlight,
});
