import { useState } from 'react';
import { Link } from '~/components/LocaleLink';

import type { StorefrontShop } from '~/lib/storefront-shop';

import { AccountButton, CartButton, SearchButton } from './HeaderControls';
import { MobileNav, MobileNavTrigger } from './MobileNav';

export function Header({ shopInfo }: { shopInfo: StorefrontShop }) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const logo = shopInfo.logo;

  return (
    <header className="border-border bg-surface sticky top-0 z-40 border-b">
      <div
        className="max-w-page px-margin mx-auto flex h-16 w-full items-center justify-between"
        data-header-nav-group
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 pe-3 md:max-w-48 md:flex-none md:pe-0">
          <div className="-ms-2 hidden shrink-0 max-md:block" data-hamburger-wrapper>
            <MobileNavTrigger />
          </div>
          <Link
            to="/"
            aria-label={shopInfo.name}
            title={shopInfo.name}
            className="text-on-surface focus-visible:outline-accent inline-flex max-w-48 min-w-0 items-center rounded-sm text-lg font-medium no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {logo && failedLogoUrl !== logo.url ? (
              <img
                src={logo.url}
                alt={logo.altText ?? shopInfo.name}
                width={logo.width ?? undefined}
                height={logo.height ?? undefined}
                className="h-auto max-h-10 w-auto max-w-full object-contain"
                // An SSR image can fail before hydration attaches onError, so also check on mount.
                ref={(img) => {
                  if (img?.complete && img.naturalWidth === 0) setFailedLogoUrl(logo.url);
                }}
                onError={() => setFailedLogoUrl(logo.url)}
              />
            ) : (
              <span className="line-clamp-2 leading-tight wrap-anywhere">{shopInfo.name}</span>
            )}
          </Link>
        </div>

        <nav
          aria-label="Main navigation"
          className="mx-8 hidden min-w-0 flex-1 items-center gap-8 overflow-x-auto md:flex"
          data-desktop-nav
        >
          <Link
            to="/collections"
            className="text-on-surface focus-visible:outline-accent shrink-0 rounded-sm text-sm font-normal whitespace-nowrap no-underline hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-safe:transition-opacity"
          >
            Collections
          </Link>
        </nav>

        <div className="flex shrink-0 items-center gap-0">
          <SearchButton />
          <AccountButton />
          <CartButton />
        </div>
      </div>
      <MobileNav />
    </header>
  );
}
