import { type RouteConfig, index, layout, prefix, route } from '@react-router/dev/routes';

// Every page also works under a market subfolder (`/fr-ca/products/x`, T-1.1.4). The root loader
// 404s a `locale` param that isn't one of the shop's markets.
export default [
  // Pathless shell: page errors (404s) render inside the app shell with the theme's 404 template.
  layout('routes/shell.tsx', [
    ...prefix(':locale?', [
      index('routes/home.tsx'),
      route('products/:handle', 'routes/product.tsx'),
      route('collections', 'routes/collections.tsx'),
      route('collections/:handle', 'routes/collection.tsx'),
      route('cart', 'routes/cart.tsx'),
      route('search', 'routes/search.tsx'),
      route('account', 'routes/account.tsx'),
      route('account/orders/:id', 'routes/account-order.tsx'),
      route('account/addresses', 'routes/account-addresses.tsx'),
      route('pages/:handle', 'routes/page.tsx'),
      route('pages/:type/:handle', 'routes/metaobject-page.tsx'),
      route('blogs/:blogHandle', 'routes/blog.tsx'),
      route('blogs/:blogHandle/tagged/:tag', 'routes/blog-tagged.tsx'),
      route('blogs/:blogHandle/:articleHandle', 'routes/article.tsx'),
      route('policies', 'routes/policies.tsx'),
      route('policies/:handle', 'routes/policy.tsx'),
      route('password', 'routes/password.tsx'),
      // One segment (`products-1.xml`) so it can't match `:locale?/products/:handle`.
      route('sitemap/:file', 'routes/sitemap-page.ts'),
      route('__hcms/section', 'routes/hcms/section.ts'),
      route('__hcms/newsletter', 'routes/hcms/newsletter.ts'),
      route('__hcms/contact', 'routes/hcms/contact.ts'),
      route('__hcms/products', 'routes/hcms/products.ts'),
      route('__hcms/upsell', 'routes/hcms/upsell.ts'),
      route('__hcms/wishlist', 'routes/hcms/wishlist.ts'),
      route('__hcms/gift-wrap', 'routes/hcms/gift-wrap.ts'),
      route('__hcms/quick-view', 'routes/hcms/quick-view.ts'),
      route('__hcms/search-popular', 'routes/hcms/search-popular.ts'),
      route('__hcms/compare', 'routes/hcms/compare.ts'),
      route('__hcms/siblings', 'routes/hcms/siblings.ts'),
      route('__hcms/back-in-stock', 'routes/hcms/back-in-stock.ts'),
      route('__hcms/cart/add', 'routes/hcms/cart-add.ts'),
      route('__hcms/delivery', 'routes/hcms/delivery.ts'),
      // Custom HTML JavaScript frames (sandboxed iframe documents, by ids).
      route('__hcms/embed/*', 'routes/hcms/embed.ts'),
      // Editor-only (preview token); under the shell so examples sit in the real header/footer.
      route('__hcms/library', 'routes/hcms/library.tsx'),
      route('__hcms/styles', 'routes/hcms/styles.tsx'),
    ]),
    route('*', 'routes/catchall.tsx'),
  ]),
  route('sitemap.xml', 'routes/sitemap-index.ts'),
  route('robots.txt', 'routes/robots.ts'),
  route('llms.txt', 'routes/llms.ts'),
  route('manifest.webmanifest', 'routes/manifest.ts'),
  route('__hcms/health', 'routes/hcms/health.ts'),
  route('__hcms/manifest', 'routes/hcms/manifest.ts'),
  route('__hcms/rum', 'routes/hcms/rum.ts'),
  route('__hcms/ab', 'routes/hcms/ab.ts'),
] satisfies RouteConfig;
