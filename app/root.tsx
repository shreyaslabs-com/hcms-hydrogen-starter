import {
  HcmsStringsProvider,
  applyExperimentHeaders,
  applyExperiments,
  applyLocalePatches,
  bucketRequest,
  experimentsForClient,
  applyConditionHeaders,
  applyMarketOverrides,
  applyPreviewHeaders,
  gateExempt,
  hasGateCookie,
  resolveFile,
  previewExitResponse,
  resolvePreview,
  resolveThemeStrings,
  themeStyles,
} from '@hcms/hydrogen';
import { handleShopifyRedirects, handleShopifyRoutes } from '@shopify/hydrogen';
import { ShopifyScripts } from '@shopify/hydrogen/react';
import { lazy, Suspense, type ReactNode } from 'react';
import {
  isRouteErrorResponse,
  redirect,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useMatches,
  useNavigate,
  useRouteError,
  useRouteLoaderData,
} from 'react-router';

import { CartAnalyticsTracker, PageViewedTracker } from '~/components/AnalyticsTrackers';
import { MarketSuggestionSlot as MarketSuggestionBanner } from '~/components/hcms/ui-slots';
import { blogFeedResponse } from '~/lib/blog-feed';
import { cartTypeFrom } from '~/lib/cart-type';
import {
  cartDisplayForDocument,
  cartDrawerForDocument,
  cartEmptyForDocument,
  cartRailsForDocument,
} from '~/lib/hcms/cart-display';
import { cartGiftsForDocument } from '~/lib/hcms/cart-gifts';
import { cartFreeShippingFrom } from '~/lib/hcms/free-shipping';
import { inlineGoogleFonts, themeFontFaces } from '~/lib/hcms/google-fonts.server';
import { fontProxySecret } from '~/lib/hcms/font-proxy';
import { mainCartSchemeClass } from '~/lib/hcms/upsell';
import { rumSampleRate } from '~/lib/hcms/rum';
import { trendingSearchesFrom } from '~/lib/hcms/trending-searches';
import { Deferred } from '~/components/Deferred';
import {
  NotFoundSlot as NotFound,
  RouteErrorMessageSlot as RouteErrorMessage,
} from '~/components/hcms/ui-slots';
import { HcmsAppAdapter } from '~/components/hcms/AppAdapter';
import { HeadTags } from '~/components/hcms/HeadTags';
import { HcmsLayoutGroup } from '~/components/hcms/HcmsLayoutGroup';
import { HcmsEmbedHtml, HcmsInbox } from '~/components/HcmsEmbeds';
import { loadClientEmbeds, withoutJudgeme } from '~/lib/hcms/embeds.server';
import { CartProvider } from '~/lib/cart';
import { conditionsContext, type ConditionsState } from '~/lib/hcms/conditions';
import { CART_OPEN_EVENT, EARLY_CART_CLICK_SCRIPT } from '~/lib/cart-drawer';
import { cartHandlers } from '~/lib/cart-handlers';
import {
  createRequestCustomerAccount,
  customerAccountContext,
  customerSignedIn,
} from '~/lib/customer-account';
import { envContext } from '~/lib/env';
import { predictiveSearchHandlers } from '~/lib/predictive-search-handlers';
import { withBudget } from '~/lib/hcms/budget';
import { judgemeKnownUnavailable } from '~/lib/hcms/judgeme.server';
import { shopifyRouteError } from '~/lib/hcms/shopify-route-error';
import { loadRootLayout } from '~/lib/root-layout';
import { loadLocalization, marketContext } from '~/lib/localization';
import { documentContext, loadPageDocument } from '~/lib/hcms/document';
import { experimentContext } from '~/lib/experiments';
import { gatePath } from '~/lib/hcms/gate';
import { canonicalUrl, seoContext } from '~/lib/hcms/seo';
import { applyHeaderRules, headTagsFor, verificationFileResponse } from '~/lib/hcms/head';
import { pwaSettings, themeColorFor } from '~/lib/hcms/pwa';
import { faviconLinks, faviconValue } from '~/lib/hcms/favicon';
import { loadLayoutGroups } from '~/lib/hcms/page';
import { previewContext } from '~/lib/preview';
import { geolocationEnabled, marketSuggestion } from '~/lib/geolocation';
import {
  hreflangAlternates,
  resolveMarket,
  stripLocalePrefix,
  textDirection,
  type Localization,
} from '~/lib/markets';
import { routeTemplates } from '~/lib/route-templates';
import { useNonce } from '~/lib/csp';
import { createEphemeralSessionManager } from '~/lib/session';
import { analyticsConsent, resolveShopIdentity } from '~/lib/shop';
import {
  createRequestStorefrontClient,
  storefrontClientContext,
  storefrontRequestContext,
} from '~/lib/storefront';

import type { Route } from './+types/root';

import appStylesHref from './app.css?url';

/** A/B tracker loads only on pages with a running experiment (T-3.5); renders nothing. */
const ExperimentTracker = lazy(() =>
  import('~/components/ExperimentTracker').then((m) => ({ default: m.ExperimentTracker })),
);

export const links: Route.LinksFunction = () => [{ rel: 'stylesheet', href: appStylesHref }];

export const middleware: Route.MiddlewareFunction[] = [
  async ({ context, request }, next) => {
    const env = context.get(envContext);
    // Markets come from the merchant's Shopify setup: read them (long-cached), resolve the
    // URL prefix, then build the request's client with that market (T-1.1.4).
    const bootstrapClient = createRequestStorefrontClient(
      request,
      env,
      context.cache,
      context.waitUntil,
    );
    const localization = await loadLocalization(bootstrapClient, {
      cache: context.cache,
      waitUntil: context.waitUntil,
      storeKey: env.PUBLIC_STORE_DOMAIN || 'mock.shop',
    });
    const { market, valid } = resolveMarket(new URL(request.url).pathname, localization);
    const storefrontClient = createRequestStorefrontClient(
      request,
      env,
      context.cache,
      context.waitUntil,
      market,
    );
    const requestContext = storefrontClient.requestContext;
    const customerAccount = await createRequestCustomerAccount(request, env, requestContext);
    const sessionManager =
      customerAccount?.customerAccount.sessionManager ?? createEphemeralSessionManager(request);

    const shopifyRoute = handleShopifyRoutes({
      request,
      requestContext,
      sessionManager,
      storefrontClient,
      routeTemplates,
      handlers: customerAccount
        ? [cartHandlers, predictiveSearchHandlers, customerAccount.handlers]
        : [cartHandlers, predictiveSearchHandlers],
    });

    // S2-2: a cart mutation that times out upstream answers with a friendly retryable error,
    // not a 500 crash.
    if (shopifyRoute) return Promise.resolve(shopifyRoute).catch(shopifyRouteError(request));

    context.set(storefrontClientContext, storefrontClient);
    context.set(marketContext, { market, valid, localization });
    // "Exit preview" from the preview bar: clear the cookie, reload the live page.
    const exitPreview = previewExitResponse(request);
    if (exitPreview) return exitPreview;
    const preview = await resolvePreview(request, env.HCMS_PREVIEW_SECRET);
    context.set(previewContext, preview);
    // Conditional visibility (T-2.170): page loaders record date boundaries / customer rules.
    const conditions: ConditionsState = { expiresAt: null, personal: false };
    context.set(conditionsContext, conditions);
    const loadedDocument = await loadPageDocument({
      storefrontClient,
      cache: context.cache,
      waitUntil: context.waitUntil,
      storeKey: env.PUBLIC_STORE_DOMAIN || 'mock.shop',
      preview,
      api:
        env.HCMS_API_URL && env.HCMS_PUBLIC_KEY && env.PUBLIC_STORE_DOMAIN
          ? { baseUrl: env.HCMS_API_URL, shop: env.PUBLIC_STORE_DOMAIN, key: env.HCMS_PUBLIC_KEY }
          : undefined,
      cdn:
        env.HCMS_CDN_URL && env.PUBLIC_STORE_DOMAIN
          ? { baseUrl: env.HCMS_CDN_URL, shop: env.PUBLIC_STORE_DOMAIN }
          : undefined,
    });
    // Market overrides (T-2.5): sections hidden for this shopper's country are disabled.
    // Locale patches (T-2.4): theme text in the shopper's language over the primary's. Shopify
    // resources come translated (Translate & Adapt) via the batched query's `@inContext`.
    // A/B tests (T-3.5): sticky arm per visitor from the snapshot itself (no extra request; a
    // tier without experiments = control); applied before render, so no flicker or CLS.
    const experiments = bucketRequest(request, loadedDocument.document.experiments, {
      preview: Boolean(preview),
    });
    context.set(experimentContext, experiments);
    context.set(documentContext, {
      ...loadedDocument,
      document: applyLocalePatches(
        applyMarketOverrides(
          applyExperiments(loadedDocument.document, experiments),
          market.country,
        ),
        market.language,
        localization.language.isoCode,
      ),
    });
    // Site verification files (T-2.75): before the gate so Search Console can verify early.
    const verificationFile = verificationFileResponse(
      new URL(request.url).pathname,
      context.get(documentContext).document.seo,
      { preview: Boolean(preview) },
    );
    if (verificationFile) return verificationFile;
    // Storefront password gate (T-2.21): never in the editor preview.
    const gate = context.get(documentContext).gate;
    if (gate && !preview && !gateExempt(new URL(request.url).pathname)) {
      const unlocked = await hasGateCookie(
        env.HCMS_PREVIEW_SECRET ?? '',
        gate,
        request.headers.get('Cookie'),
      );
      if (!unlocked) {
        const url = new URL(request.url);
        const target = new URL(gatePath(url.pathname), url);
        target.searchParams.set('return_to', `${url.pathname}${url.search}`);
        return new Response(null, {
          status: 302,
          headers: { Location: `${target.pathname}${target.search}`, 'Cache-Control': 'no-store' },
        });
      }
    }
    context.set(storefrontRequestContext, requestContext);
    context.set(customerAccountContext, customerAccount?.customerAccount ?? null);

    // Blog Atom feeds (`/blogs/news.atom`, T-2.41), after the password gate.
    // Merchant response headers (T-2.76): allowlisted names only; security headers stay in code.
    const headerRules = (headers: Headers) =>
      applyHeaderRules(headers, context.get(documentContext).document.seo, {
        pathname: new URL(request.url).pathname,
        pathPrefix: market.pathPrefix,
      });
    const feed = await blogFeedResponse(request, storefrontClient, market.pathPrefix);
    if (feed) {
      headerRules(feed.headers);
      return feed;
    }

    const response = await next();
    headerRules(response.headers);
    // After the merchant's header rules, so their cache lifetime is capped too.
    if (!preview) applyConditionHeaders(response.headers, conditions, Date.now());
    applyPreviewHeaders(response.headers, preview);
    applyExperimentHeaders(response.headers, experiments);
    const sessionHeaders = new Headers((await sessionManager.commit?.()) ?? undefined);
    for (const [name, value] of sessionHeaders) response.headers.append(name, value);
    if (response.status === 404) {
      const redirect = await handleShopifyRedirects({
        request,
        storefrontClient,
        routeTemplates,
      });

      if (redirect) return redirect;
    }

    requestContext.applyResponseHeaders(response.headers);
    return response;
  },
];

/**
 * Fallback `<title>` = the shop name (S2-12): React Router reuses the nearest parent's meta for
 * routes without their own, so every document has a title. Routes with `meta` replace it; error
 * pages render their own.
 */
export function meta({ loaderData, error }: Route.MetaArgs) {
  return error || !loaderData ? [] : [{ title: loaderData.shopInfo.name }];
}

/** The shopper's cart is worth a little longer than the layout, but never the client's 30 s. */
const ROOT_CART_TIMEOUT_MS = 4000;

export async function loader({ context, request }: Route.LoaderArgs) {
  const env = context.get(envContext);
  const { market, localization } = context.get(marketContext);
  const url = new URL(request.url);
  // Unknown locale prefixes (and junk first segments matching `:locale?`) 404 in the page shell
  // (`routes/shell.tsx`), so the error page keeps the header and footer; the market here is the
  // primary one.
  // The primary market is served unprefixed (Online Store behaviour): /en-us/x → /x.
  const primary =
    localization.country.isoCode === market.country &&
    localization.language.isoCode === market.language;
  if (primary && market.pathPrefix) {
    throw redirect(`${stripLocalePrefix(url.pathname)}${url.search}`, 301);
  }
  const storefrontClient = context.get(storefrontClientContext);
  // S2-2: root data is chrome, so a slow Storefront API renders the page with fallbacks (empty
  // cart, fallback layout, data-less header/footer) within a few seconds, never the error page.
  const themeCss = themeStyles(context.get(documentContext).document.settings);
  const [cartResult, layout, groups, signedIn, judgemeOff, themeFonts] = await Promise.all([
    withBudget(
      cartHandlers.get({ storefrontClient, request }),
      ROOT_CART_TIMEOUT_MS,
      () => ({ type: 'json' as const, data: { cart: null } }),
      'Cart',
    ),
    loadRootLayout(storefrontClient, {
      fallbackCurrency: localization.availableCountries.find((c) => c.isoCode === market.country)
        ?.currency.isoCode,
    }),
    loadLayoutGroups(context),
    customerSignedIn(context.get(customerAccountContext)),
    // S2-3: a server fetch already got Judge.me's 404 → the browser loader never starts.
    judgemeKnownUnavailable(context),
    // PSI gate: Google Fonts CSS inlined (no render-blocking cross-origin stylesheet).
    // T-2.135: font files from our origin (`/__hcms/fonts/*`, signed), heading/body preloaded.
    inlineGoogleFonts(themeCss.links, {
      cache: context.cache,
      waitUntil: context.waitUntil,
      secret: fontProxySecret(env),
      faces: themeFontFaces(context.get(documentContext).document.settings.typography),
    }),
  ]);

  return {
    cartData: cartResult.data,
    // Sign in with Shop (T-2.50): shown only when `false` (accounts on, shopper signed out).
    customerSignedIn: signedIn,
    shopInfo: layout.shopInfo,
    groups,
    shopIdentity: resolveShopIdentity(env, layout.shopId),
    currency: layout.currency,
    market,
    origin: url.origin,
    // Inlined @font-face rules ride the theme `<style>` (no extra client code: JS budget).
    theme: { ...themeCss, links: themeFonts.links, css: themeFonts.fontCss + themeCss.css },
    // Embeds Manager (T-2.9) + app integrations (T-2.8): this market's tags and enabled vendors;
    // template/path + consent apply in the browser.
    ...withoutJudgeme(
      loadClientEmbeds(context.get(documentContext).document.embeds, {
        country: market.country,
        preview: Boolean(context.get(previewContext)),
        shopDomain: env.PUBLIC_STORE_DOMAIN,
      }),
      judgemeOff,
    ),
    seo: (() => {
      const { document } = context.get(documentContext);
      return seoContext(
        document.seo,
        (value) => {
          const file = resolveFile(value, document.assets ?? {});
          return file?.kind === 'image'
            ? { url: file.url, width: file.width, height: file.height, altText: file.alt }
            : null;
        },
        { description: layout.shopDescription },
      );
    })(),
    // Site verification + allowlisted custom <meta>/<link> tags (T-2.75).
    headTags: headTagsFor(context.get(documentContext).document.seo),
    // Favicon (theme settings › Logo and favicon): CDN-cropped icons, else /favicon.svg.
    favicon: (() => {
      const { document } = context.get(documentContext);
      const file = resolveFile(faviconValue(document.settings), document.assets ?? {});
      return faviconLinks(file?.kind === 'image' ? file.url : null);
    })(),
    // Installable storefront (T-2.83): theme colour only when the theme turns it on.
    pwaThemeColor: pwaSettings(context.get(documentContext).document.settings).enabled
      ? themeColorFor(context.get(documentContext).document.settings)
      : null,
    preview: (() => {
      const preview = context.get(previewContext);
      return preview
        ? {
            editorOrigin: preview.claims.editorOrigin,
            token: preview.token,
            tokenSource: preview.source,
            draftId: preview.claims.sub,
          }
        : null;
    })(),
    // Never in the editor preview (merchants would see their own country's suggestion).
    cartType: cartTypeFrom(context.get(documentContext).document.settings),
    earlyCartScript:
      cartTypeFrom(context.get(documentContext).document.settings) === 'drawer'
        ? EARLY_CART_CLICK_SCRIPT
        : null,
    // Cart drawer settings (T-2.159): upsell (own setting, else the cart page's `show_upsell`),
    // upsell layout + fallback collection, line badges/nudges, layout, Shop Pay, payment logos.
    cartDrawer: cartDrawerForDocument(context.get(documentContext).document),
    // Cart page colour scheme for the drawer's Checkout button (S2-11).
    cartScheme: mainCartSchemeClass(context.get(documentContext).document),
    // Free-shipping bar (T-2.43): per-currency thresholds (theme settings) + drawer toggle.
    cartFreeShipping: cartFreeShippingFrom(context.get(documentContext).document),
    // Gift wrap variant + gift message toggle (T-2.80, theme settings); null = neither.
    cartGifts: cartGiftsForDocument(context.get(documentContext).document),
    // Richer drawer (message strips, trust/payment icons, savings) + upsell rails (replica P1-6/7).
    cartDisplay: cartDisplayForDocument(context.get(documentContext).document),
    cartRails: cartRailsForDocument(context.get(documentContext).document, resolveFile),
    // Drawer empty state (theme settings › Cart; null = default copy).
    cartEmpty: cartEmptyForDocument(context.get(documentContext).document),
    // Search drawer empty state (T-2.72): terms of the layout groups' `trending-searches` section.
    trendingSearches: (() => {
      const { document } = context.get(documentContext);
      // Published snapshots carry every file; a preview draft has none, so the layout groups'
      // fetched files fill in (a promo image used only in the search template still shows
      // after publish, not in preview).
      const assets = { ...(document.assets ?? {}), ...(groups.assets ?? {}) };
      return trendingSearchesFrom(document, (value) => {
        const file = resolveFile(value, assets);
        return file?.kind === 'image' ? file.url : null;
      });
    })(),
    // Real-user Core Web Vitals (T-2.15): only when the admin can receive them, never in preview.
    // Value = the store's sample rate (busy stores measure 1 in N views); null = off.
    rum:
      env.HCMS_API_URL && env.HCMS_PREVIEW_SECRET && !context.get(previewContext)
        ? rumSampleRate()
        : null,
    // A/B tests (T-3.5): the visitor's counted arms (exposure + cart attribution in the browser).
    experiments: experimentsForClient(context.get(experimentContext)),
    abBeacon: env.HCMS_API_URL && env.HCMS_PREVIEW_SECRET ? '/__hcms/ab' : null,
    // Default theme content (T-2.33): overrides for the shopper's language over the primary's.
    themeStrings: resolveThemeStrings(
      context.get(documentContext).document.content,
      market.language,
      localization.language.isoCode,
    ),
    marketSuggestion:
      !context.get(previewContext) &&
      geolocationEnabled(context.get(documentContext).document.settings)
        ? marketSuggestion({ request, market, localization })
        : null,
    countries: localization.availableCountries,
    primaryLanguage: localization.language.isoCode,
    primaryCountry: localization.country.isoCode,
  };
}

/**
 * One canonical per page (T-1.1.5) + hreflang alternates for every market subfolder and
 * `x-default` (T-2.7): React Router replaces route `meta`, so the root owns them.
 */
function CanonicalLinks({
  origin,
  pathname,
  search,
  localization,
}: {
  origin: string;
  pathname: string;
  search: string;
  localization: Localization;
}) {
  const href = canonicalUrl(origin, pathname, search);
  const alternates = hreflangAlternates(localization, origin, pathname, new URL(href).search);
  return (
    <>
      <link rel="canonical" href={href} />
      <meta property="og:url" content={href} />
      {alternates.map((link) => (
        <link key={link.hreflang} rel="alternate" hrefLang={link.hreflang} href={link.href} />
      ))}
    </>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  // Error pages (404 etc.) get no canonical; NotFound adds noindex.
  const routeError = useRouteError();
  // Absent when the root loader failed (error page only).
  const rootData = useRouteLoaderData<typeof loader>('root');
  const nonce = useNonce();

  const language = rootData?.market.language ?? 'en';

  return (
    // `dir` from the market language (T-2.92): RTL locales mirror the logical-CSS layout.
    // Theme Animations (Nov 9): `hcms-reveal hcms-reveal--<style>` / `hcms-motion--expressive`
    // switch on the CSS-only scroll animations (`@hcms/sections` sections.css); no JS. Theme
    // `icon_stroke`: `hcms-icons--thin|heavy` swaps the icon masks (same stylesheet).
    <html
      lang={language.toLowerCase()}
      dir={textDirection(language)}
      className={
        [rootData?.theme.flags.motionClass, rootData?.theme.flags.iconClass]
          .filter(Boolean)
          .join(' ') || undefined
      }
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {rootData ? (
          <ShopifyScripts
            nonce={nonce}
            i18n={{
              country: rootData.market.country,
              language: rootData.market.language,
              currency: rootData.currency,
            }}
            shop={rootData.shopIdentity.scriptShop}
            analytics={{ channel: rootData.shopIdentity.analyticsShop.channel }}
            shopifyAnalytics={rootData.shopIdentity.shopifyAnalytics}
            // Shopify Inbox embed (T-2.54): ShopifyScripts loads it; HcmsInbox places the chat.
            inbox={rootData.embeds.some((e) => e.type === 'shopify_inbox')}
            consent={analyticsConsent}
            navigate={navigate}
            routes={routeTemplates}
          />
        ) : null}
        <Meta />
        {rootData ? (
          rootData.favicon.map((link) => <link key={link.rel} {...link} />)
        ) : (
          <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        )}
        {rootData ? <HeadTags tags={rootData.headTags} /> : null}
        {rootData?.pwaThemeColor ? (
          <>
            {/* Credentials so the password gate's cookie reaches the manifest request. */}
            <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
            <meta name="theme-color" content={rootData.pwaThemeColor} />
          </>
        ) : null}
        {rootData?.theme.links.map((link) => (
          <link key={link.href} {...link} />
        ))}
        {rootData?.theme.css ? (
          // Values are validated by themeStyles (no `<`, `;`, `{}` from settings); Google's
          // @font-face rules by `safeGoogleFontCss` (gstatic URLs only).
          <style data-hcms-theme="" dangerouslySetInnerHTML={{ __html: rootData.theme.css }} />
        ) : null}
        {rootData && !routeError ? (
          <CanonicalLinks
            origin={rootData.origin}
            pathname={location.pathname}
            search={location.search}
            localization={{
              country: { isoCode: rootData.primaryCountry },
              language: { isoCode: rootData.primaryLanguage },
              availableCountries: rootData.countries,
            }}
          />
        ) : null}
        <Links />
        {rootData?.theme.customCss ? (
          // Theme Custom CSS (T-2.74): after the app's stylesheets so it wins; sanitized by
          // themeStyles (no `<`, @import or off-CDN url()).
          <style
            data-hcms-custom-css=""
            dangerouslySetInnerHTML={{ __html: rootData.theme.customCss }}
          />
        ) : null}
      </head>
      <body className="bg-surface text-on-surface font-body flex min-h-svh flex-col antialiased">
        {rootData?.earlyCartScript ? (
          // SF-22: holds a cart click made before hydration until the drawer mounts. The source
          // comes from loader data so it stays out of the client JS (budget).
          <script nonce={nonce} dangerouslySetInnerHTML={{ __html: rootData.earlyCartScript }} />
        ) : null}
        <a
          href="#main-content"
          className="focus-visible:bg-interactive focus-visible:text-interactive-text sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:start-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded focus-visible:px-4 focus-visible:py-2"
        >
          Skip to content
        </a>
        {children}
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

// Only for documents without header/footer groups (and the slow-upstream fallback layout): its own
// chunk, so normal pages never ship the starter's header/footer (JS budget). Server HTML stays in
// place until the chunk hydrates it.
const FallbackHeader = lazy(() =>
  import('~/components/FallbackLayout').then((m) => ({ default: m.FallbackHeader })),
);
const FallbackFooter = lazy(() =>
  import('~/components/FallbackLayout').then((m) => ({ default: m.FallbackFooter })),
);

// Closed on load: loaded after hydration (T-1.8.1 JS budget).
const CartDrawer = lazy(() =>
  import('~/components/CartDrawer').then((m) => ({ default: m.CartDrawer })),
);
const CartNotification = lazy(() =>
  import('~/components/CartNotification').then((m) => ({ default: m.CartNotification })),
);
const SearchDrawer = lazy(() =>
  import('~/components/SearchDrawer').then((m) => ({ default: m.SearchDrawer })),
);
// Script-type embeds render nothing and run only after hydration + consent (JS budget).
const HcmsEmbedScripts = lazy(() =>
  import('~/components/HcmsEmbedScripts').then((m) => ({ default: m.HcmsEmbedScripts })),
);

// Preview-only: the bridge chunk is never downloaded on normal storefront pages.
const HcmsPreviewBridge = lazy(() =>
  import('@hcms/hydrogen/bridge').then((m) => ({ default: m.HcmsPreviewBridge })),
);

function PreviewBridgeLoader(props: {
  editorOrigin: string;
  token: string;
  tokenSource: 'param' | 'cookie';
}) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <HcmsPreviewBridge
      editorOrigin={props.editorOrigin}
      token={props.token}
      tokenSource={props.tokenSource}
      path={`${location.pathname}${location.search}`}
      navigate={(to) => void navigate(to)}
    />
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  const { pathname } = useLocation();
  // The password page stands alone (no header/footer links that would bounce back to it).
  const gated = useMatches().some((m) => m.id === 'routes/password');
  if (gated) return <Outlet />;
  return (
    <CartProvider initialData={loaderData.cartData}>
      <PageViewedTracker />
      <CartAnalyticsTracker />
      {loaderData.experiments.length ? (
        <Suspense fallback={null}>
          <ExperimentTracker experiments={loaderData.experiments} beacon={loaderData.abBeacon} />
        </Suspense>
      ) : null}
      <HcmsAppAdapter
        shopInfo={loaderData.shopInfo}
        integrations={loaderData.integrations}
        currencyCode={loaderData.theme.flags.currencyCode}
        hideDecimals={loaderData.theme.flags.hideDecimals}
      >
        <HcmsStringsProvider strings={loaderData.themeStrings}>
          {loaderData.rum ? (
            <meta name="hcms-rum" content="/__hcms/rum" data-rate={loaderData.rum} />
          ) : null}
          <HcmsEmbedHtml embeds={loaderData.embeds} placement="body_start" />
          {loaderData.marketSuggestion ? (
            <MarketSuggestionBanner suggestion={loaderData.marketSuggestion} />
          ) : null}
          {loaderData.groups.header ? (
            <HcmsLayoutGroup
              name="header"
              group={loaderData.groups.header}
              route={{ pathname: stripLocalePrefix(pathname) }}
              data={loaderData.groups.data}
              assets={loaderData.groups.assets}
              preview={loaderData.groups.preview}
              sectionCss={loaderData.groups.sectionCss}
            />
          ) : (
            <Suspense fallback={null}>
              <FallbackHeader shopInfo={loaderData.shopInfo} />
            </Suspense>
          )}
          <Outlet />
          {loaderData.groups.footer ? (
            <HcmsLayoutGroup
              name="footer"
              group={loaderData.groups.footer}
              data={loaderData.groups.data}
              assets={loaderData.groups.assets}
              preview={loaderData.groups.preview}
              sectionCss={loaderData.groups.sectionCss}
            />
          ) : (
            <Suspense fallback={null}>
              <FallbackFooter shopInfo={loaderData.shopInfo} />
            </Suspense>
          )}
          {loaderData.groups.overlay ? (
            <HcmsLayoutGroup
              name="overlay"
              group={loaderData.groups.overlay}
              data={loaderData.groups.data}
              assets={loaderData.groups.assets}
              preview={loaderData.groups.preview}
              sectionCss={loaderData.groups.sectionCss}
            />
          ) : null}
          <HcmsEmbedHtml embeds={loaderData.embeds} placement="body_end" />
          {/* Inside the adapter + strings providers: the drawer's free-shipping bar (T-2.43)
              formats money and reads theme content through them. */}
          <Deferred wakeOn={CART_OPEN_EVENT}>
            <CartDrawer />
            <SearchDrawer />
            {loaderData.cartType === 'notification' ? <CartNotification /> : null}
          </Deferred>
        </HcmsStringsProvider>
      </HcmsAppAdapter>
      {loaderData.embeds.length ? (
        <Deferred idle={false}>
          <HcmsEmbedScripts
            embeds={loaderData.embeds}
            country={loaderData.market.country}
            currency={loaderData.currency}
          />
        </Deferred>
      ) : null}
      {loaderData.embeds.length ? <HcmsInbox embeds={loaderData.embeds} /> : null}
      {loaderData.preview ? (
        <Suspense fallback={null}>
          <PreviewBridgeLoader {...loaderData.preview} />
        </Suspense>
      ) : null}
    </CartProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  // Root loader errors only (bad market prefix, …): page-route errors render inside the app shell
  // (routes/shell.tsx) with the theme's header, footer and 404 template.
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;
  return <RouteErrorMessage error={error} />;
}
