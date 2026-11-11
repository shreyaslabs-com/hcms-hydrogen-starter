import { useState } from 'react';

import { GEO_DISMISS_COOKIE, GEO_DISMISS_MAX_AGE, type MarketSuggestion } from '~/lib/geolocation';

/**
 * "Shop in {country}?" banner (T-2.45). Server-rendered above the header, so nothing shifts on
 * load. "Shop in…" is a plain link (works without JS; the new market matches, so the banner
 * goes away); "Stay" remembers the choice for 30 days in a first-party cookie.
 */
export function MarketSuggestionBanner({ suggestion }: { suggestion: MarketSuggestion }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const stay = () => {
    document.cookie = `${GEO_DISMISS_COOKIE}=dismissed; Max-Age=${GEO_DISMISS_MAX_AGE}; Path=/; SameSite=Lax; Secure`;
    setHidden(true);
  };
  return (
    <aside
      data-hcms-slot="geo"
      aria-label="Country suggestion"
      className="bg-surface-secondary text-on-surface border-border border-b"
    >
      <div className="max-w-page px-margin mx-auto flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 py-3 text-sm">
        <p>
          Looks like you’re in {suggestion.countryName}. Shop in {suggestion.currency} for local
          prices and shipping?
        </p>
        <div className="flex items-center gap-2">
          {/* Full navigation: the root loader must rerun in the new market (prices, cart). */}
          <a
            href={suggestion.href}
            className="bg-interactive text-interactive-text rounded px-3 py-1.5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            Shop in {suggestion.countryName}
          </a>
          <button
            type="button"
            onClick={stay}
            className="rounded px-3 py-1.5 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            Stay here
          </button>
        </div>
      </div>
    </aside>
  );
}
