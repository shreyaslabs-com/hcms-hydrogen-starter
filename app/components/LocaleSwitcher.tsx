import { Link as RouterLink, useLocation, useRouteLoaderData } from 'react-router';

import {
  prefixForCountry,
  stripLocalePrefix,
  type Localization,
  type LocalizationCountry,
  type Market,
} from '~/lib/markets';

type RootData = {
  market: Market;
  countries: LocalizationCountry[];
  primaryCountry: string;
  primaryLanguage: string;
};

/**
 * Country/region switcher (T-1.1.4). Lists the merchant's Shopify Markets countries; each link
 * keeps the current page under the target market's subfolder. Works without JS (plain links).
 * `placement`: the list opens above (footer, default) or below (header `enable_country_selector`).
 */
export function LocaleSwitcher({ placement = 'above' }: { placement?: 'above' | 'below' } = {}) {
  const data = useRouteLoaderData<RootData>('root');
  const location = useLocation();
  if (!data || data.countries.length < 2) return null;

  const localization: Localization = {
    country: { isoCode: data.primaryCountry },
    language: { isoCode: data.primaryLanguage },
    availableCountries: data.countries,
  };
  const current = data.countries.find((c) => c.isoCode === data.market.country);
  const path = stripLocalePrefix(location.pathname);

  return (
    <details className="relative">
      <summary className="type-body-sm text-on-surface cursor-pointer list-none rounded py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current">
        <span className="sr-only">Country/region: </span>
        {current
          ? `${current.name} (${current.currency.isoCode} ${current.currency.symbol})`
          : data.market.country}
      </summary>
      <ul
        role="list"
        aria-label="Choose country/region"
        className={`border-border bg-surface absolute z-10 max-h-72 w-64 overflow-y-auto rounded border py-2 shadow-lg ${placement === 'below' ? 'end-0 top-full mt-2' : 'bottom-full mb-2'}`}
      >
        {data.countries.map((country) => {
          const prefix = prefixForCountry(localization, country.isoCode, data.market.language);
          const href = `${prefix}${path === '/' && prefix ? '' : path}${location.search}` || '/';
          const active = country.isoCode === data.market.country;
          return (
            <li key={country.isoCode}>
              <RouterLink
                to={href}
                hrefLang={`${(prefix.split('-')[0]?.slice(1) || data.primaryLanguage).toLowerCase()}-${country.isoCode}`}
                aria-current={active ? 'true' : undefined}
                className={`hover:bg-surface-secondary block px-4 py-2 text-sm ${active ? 'font-medium' : ''}`}
              >
                {country.name} ({country.currency.isoCode} {country.currency.symbol})
              </RouterLink>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
