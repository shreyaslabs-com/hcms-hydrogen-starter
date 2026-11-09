import { AppComponentsProvider, type AppComponents, type NextPage } from '@hcms/hydrogen';
import { Suspense, lazy, useMemo, type ComponentProps, type ReactNode } from 'react';
import { useRouteLoaderData } from 'react-router';

import { hcmsAnalytics } from '~/lib/analytics';

import { AccountButton, CartButton, SearchButton } from '~/components/HeaderControls';
import { useRouteSlots } from '~/components/hcms/RouteSlots';
import { productSlots } from '~/components/product/product-slots';
import { HcmsImage } from '~/components/hcms/HcmsImage';
import { ModelViewer } from '~/components/hcms/ModelViewer';
import { ExternalVideo, HcmsVideo } from '~/components/hcms/HcmsVideo';
import { Link, useLocalePath } from '~/components/LocaleLink';
import { LocaleSwitcher } from '~/components/LocaleSwitcher';
import { PaymentMethodIcon } from '~/components/PaymentMethodIcon';
import { JsonLd } from '~/components/JsonLd';
import { SignInWithShop } from '~/components/SignInWithShop';
import { withCurrencyCode } from '~/lib/hcms/currency-code';
import { formatPrice } from '~/lib/money';
import type { StorefrontShop } from '~/lib/storefront-shop';

/**
 * The storefront's implementation of the HCMS app adapter (D-20): official sections render with
 * this app's links (market-aware), images, cart/search/account controls and shop identity.
 */
export function HcmsAppAdapter({
  shopInfo,
  integrations,
  currencyCode = false,
  children,
}: {
  shopInfo: StorefrontShop;
  /** Theme setting `currency_code_enabled` (T-2.65): append the ISO code to section prices. */
  currencyCode?: boolean;
  /** App integrations enabled in Embeds (T-2.8): vendor blocks render only for these. */
  integrations?: readonly string[];
  children: ReactNode;
}) {
  const localizePath = useLocalePath();
  const value = useMemo<AppComponents>(
    () => ({
      Link: ({ to, className, children: content, onClick, target, ...rest }) => (
        <Link
          to={to}
          className={className}
          aria-label={rest['aria-label']}
          aria-current={rest['aria-current']}
          {...(onClick ? { onClick } : {})}
          {...(target ? { target, rel: 'noopener' } : {})}
        >
          {/* react-router's `children` type resolves React types via its own path: cast to it. */}
          {content as ComponentProps<typeof Link>['children']}
        </Link>
      ),
      Image: ({ image, sizes, className, priority, aspectRatio, alt, mobile }) => (
        <HcmsImage
          image={image}
          sizes={sizes}
          {...(mobile ? { mobile } : {})}
          {...(className ? { className } : {})}
          {...(priority ? { priority } : {})}
          {...(aspectRatio ? { aspectRatio } : {})}
          {...(alt ? { alt } : {})}
        />
      ),
      Video: ({ sources, poster, autoPlay, loop, className, ...rest }) => (
        <HcmsVideo
          sources={sources}
          poster={poster ?? null}
          {...(autoPlay ? { autoPlay } : {})}
          {...(loop ? { loop } : {})}
          {...(className ? { className } : {})}
          aria-label={rest['aria-label']}
        />
      ),
      ExternalVideo: ({ url, title, poster }) => (
        <ExternalVideo url={url} title={title} poster={poster ?? null} />
      ),
      localizePath,
      // Page-specific slots come from the route (RouteSlots): code only in that route's chunk.
      BrowseLayout: SlotBrowseLayout,
      useNextPage: useSlotNextPage,
      CartPage: SlotCartPage,
      AccountPage: SlotAccountPage,
      OrderPage: SlotOrderPage,
      AddressesPage: SlotAddressesPage,
      // Loaded with product sections only (product-slots.ts).
      ...productSlots,
      ModelViewer,
      formatMoney: (money, options) => {
        const formatted = formatPrice(money as Parameters<typeof formatPrice>[0]);
        return (options?.currencyCode ?? currencyCode)
          ? withCurrencyCode(formatted, money.currencyCode)
          : formatted;
      },
      SearchButton,
      SearchField: SearchFieldSlot,
      AccountButton,
      CartButton,
      SignInWithShop,
      JsonLd,
      useCustomer,
      PaymentIcons: () =>
        shopInfo.paymentMethods.length > 0 ? (
          <ul
            role="list"
            aria-label="Payment methods"
            className="flex flex-wrap items-center gap-2"
          >
            {shopInfo.paymentMethods.map((method) => (
              <li key={method}>
                <PaymentMethodIcon method={method} />
              </li>
            ))}
          </ul>
        ) : null,
      LocaleSelector: LocaleSwitcher,
      shop: { name: shopInfo.name, logo: shopInfo.logo ?? null },
      analytics: hcmsAnalytics,
      integrations: integrations ?? [],
    }),
    [shopInfo, localizePath, integrations, currencyCode],
  );
  return <AppComponentsProvider value={value}>{children}</AppComponentsProvider>;
}

/**
 * Adapter `useCustomer`: root `customerSignedIn` (read-only `isLoggedIn`, T-2.50; `null` = no
 * customer accounts). No name: that would need a Customer Account API request per page.
 */
// Header search field (`search_style: field`): its own chunk, so stores on the icon style never
// download it (JS budget).
const LazySearchField = lazy(() =>
  import('~/components/SearchField').then((m) => ({ default: m.SearchField })),
);
function SearchFieldSlot() {
  return (
    <Suspense fallback={<span className="inline-block h-10 w-56 lg:w-72" aria-hidden="true" />}>
      <LazySearchField />
    </Suspense>
  );
}

function useCustomer() {
  const signedIn = useRouteLoaderData<{ customerSignedIn?: boolean | null }>(
    'root',
  )?.customerSignedIn;
  return typeof signedIn === 'boolean' ? { signedIn } : null;
}

type Slots = Required<ReturnType<typeof useRouteSlots>>;

function SlotBrowseLayout(props: ComponentProps<Slots['BrowseLayout']>) {
  const Impl = useRouteSlots().BrowseLayout;
  return Impl ? <Impl {...props} /> : <>{props.children}</>;
}

const IDLE_PAGE: NextPage = { load: () => {}, loading: false, href: null, data: null };
const useIdlePage = () => IDLE_PAGE;

/** Route-provided (collection/search) load-more fetcher; the slot value is a route constant. */
function useSlotNextPage(): NextPage {
  const useImpl = useRouteSlots().useNextPage ?? useIdlePage;
  return useImpl();
}

function SlotCartPage(props: ComponentProps<Slots['CartPage']>) {
  const Impl = useRouteSlots().CartPage;
  return Impl ? <Impl {...props} /> : null;
}

function SlotAccountPage(props: ComponentProps<Slots['AccountPage']>) {
  const Impl = useRouteSlots().AccountPage;
  return Impl ? <Impl {...props} /> : null;
}

function SlotOrderPage(props: ComponentProps<Slots['OrderPage']>) {
  const Impl = useRouteSlots().OrderPage;
  return Impl ? <Impl {...props} /> : null;
}

function SlotAddressesPage(props: ComponentProps<Slots['AddressesPage']>) {
  const Impl = useRouteSlots().AddressesPage;
  return Impl ? <Impl {...props} /> : null;
}
