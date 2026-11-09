import assert from 'node:assert/strict';
import test from 'node:test';

import { buyerCountry, geolocationEnabled, marketSuggestion } from '../app/lib/geolocation.ts';
import type { Localization, Market } from '../app/lib/markets.ts';

const localization: Localization = {
  country: { isoCode: 'US' },
  language: { isoCode: 'EN' },
  availableCountries: [
    {
      isoCode: 'US',
      name: 'United States',
      currency: { isoCode: 'USD', symbol: '$' },
      availableLanguages: [{ isoCode: 'EN', endonymName: 'English' }],
    },
    {
      isoCode: 'CA',
      name: 'Canada',
      currency: { isoCode: 'CAD', symbol: '$' },
      availableLanguages: [
        { isoCode: 'EN', endonymName: 'English' },
        { isoCode: 'FR', endonymName: 'Français' },
      ],
    },
  ],
};
const us: Market = { country: 'US', language: 'EN', pathPrefix: '' };
const req = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://store.example.com${path}`, { headers });

test('suggests the buyer country market for the same page, keeping language and query', () => {
  const s = marketSuggestion({
    request: req('/products/kurta?variant=1', { 'oxygen-buyer-country': 'ca' }),
    market: us,
    localization,
  });
  assert.deepEqual(s, {
    countryName: 'Canada',
    currency: 'CAD',
    href: '/en-ca/products/kurta?variant=1',
  });
  const home = marketSuggestion({
    request: req('/', { 'oxygen-buyer-country': 'CA' }),
    market: us,
    localization,
  });
  assert.equal(home?.href, '/en-ca');
});

test('suggests the unprefixed primary market from a subfolder', () => {
  const ca: Market = { country: 'CA', language: 'FR', pathPrefix: '/fr-ca' };
  const s = marketSuggestion({
    request: req('/fr-ca/collections/all', { 'oxygen-buyer-country': 'US' }),
    market: ca,
    localization,
  });
  assert.equal(s?.href, '/collections/all');
});

test('no suggestion: same country, unsold country, no header, dismissed', () => {
  const none = (headers: Record<string, string>) =>
    marketSuggestion({ request: req('/', headers), market: us, localization });
  assert.equal(none({ 'oxygen-buyer-country': 'US' }), null);
  assert.equal(none({ 'oxygen-buyer-country': 'DE' }), null);
  assert.equal(none({}), null);
  assert.equal(none({ 'oxygen-buyer-country': 'CA', Cookie: 'a=1; hcms_geo=dismissed' }), null);
});

test('buyer country header is validated; setting is opt-in', () => {
  assert.equal(buyerCountry(new Headers({ 'oxygen-buyer-country': 'C<' })), null);
  assert.equal(buyerCountry(new Headers({ 'cf-ipcountry': 'in' })), 'IN');
  assert.equal(geolocationEnabled({ markets: { geolocation_banner: true } }), true);
  assert.equal(geolocationEnabled({ markets: { geolocation_banner: 'yes' } }), false);
  assert.equal(geolocationEnabled({}), false);
  assert.equal(geolocationEnabled(null), false);
});
