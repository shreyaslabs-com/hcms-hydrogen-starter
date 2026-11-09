import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isAvailable,
  isUnknownLocale,
  localizePath,
  parseLocaleSegment,
  prefixForCountry,
  resolveMarket,
  stripLocalePrefix,
  type Localization,
} from '../app/lib/markets.ts';

const localization: Localization = {
  country: { isoCode: 'IN' },
  language: { isoCode: 'EN' },
  availableCountries: [
    {
      isoCode: 'IN',
      name: 'India',
      currency: { isoCode: 'INR', symbol: '₹' },
      availableLanguages: [
        { isoCode: 'EN', endonymName: 'English' },
        { isoCode: 'HI', endonymName: 'हिन्दी' },
      ],
    },
    {
      isoCode: 'CA',
      name: 'Canada',
      currency: { isoCode: 'CAD', symbol: '$' },
      availableLanguages: [
        { isoCode: 'EN', endonymName: 'English' },
        { isoCode: 'FR', endonymName: 'français' },
      ],
    },
    {
      isoCode: 'FR',
      name: 'France',
      currency: { isoCode: 'EUR', symbol: '€' },
      availableLanguages: [{ isoCode: 'FR', endonymName: 'français' }],
    },
  ],
};

test('parseLocaleSegment', () => {
  assert.deepEqual(parseLocaleSegment('fr-ca'), { language: 'FR', country: 'CA' });
  assert.deepEqual(parseLocaleSegment('EN-IN'), { language: 'EN', country: 'IN' });
  assert.equal(parseLocaleSegment('products'), null);
  assert.equal(parseLocaleSegment('fr'), null);
  assert.equal(parseLocaleSegment(undefined), null);
});

test('resolveMarket: unprefixed paths use the primary market', () => {
  assert.deepEqual(resolveMarket('/products/hoodie', localization), {
    market: { country: 'IN', language: 'EN', pathPrefix: '' },
    valid: true,
  });
});

test('resolveMarket: available prefixes resolve, unavailable ones are invalid', () => {
  assert.deepEqual(resolveMarket('/fr-ca/collections/all', localization), {
    market: { country: 'CA', language: 'FR', pathPrefix: '/fr-ca' },
    valid: true,
  });
  assert.equal(resolveMarket('/de-de/products/x', localization).valid, false);
  assert.equal(resolveMarket('/hi-ca/', localization).valid, false); // Canada has no Hindi
  assert.equal(isAvailable(localization, 'IN', 'HI'), true);
});

test('stripLocalePrefix and localizePath', () => {
  assert.equal(stripLocalePrefix('/fr-ca/products/x'), '/products/x');
  assert.equal(stripLocalePrefix('/fr-ca'), '/');
  assert.equal(stripLocalePrefix('/products/x'), '/products/x');
  assert.equal(localizePath('/products/x', '/fr-ca'), '/fr-ca/products/x');
  assert.equal(localizePath('/', '/fr-ca'), '/fr-ca');
  assert.equal(localizePath('/products/x', ''), '/products/x');
  assert.equal(localizePath('/api/cart', '/fr-ca'), '/api/cart');
  assert.equal(localizePath('/fr-ca/x', '/fr-ca'), '/fr-ca/x');
  assert.equal(localizePath('https://x.io/a', '/fr-ca'), 'https://x.io/a');
  assert.equal(localizePath('//cdn.x/a', '/fr-ca'), '//cdn.x/a');
  assert.equal(localizePath('?page=2', '/fr-ca'), '?page=2');
});

test('prefixForCountry keeps the language when possible', () => {
  assert.equal(prefixForCountry(localization, 'IN', 'EN'), '');
  assert.equal(prefixForCountry(localization, 'IN', 'HI'), '/hi-in');
  assert.equal(prefixForCountry(localization, 'CA', 'FR'), '/fr-ca');
  assert.equal(prefixForCountry(localization, 'CA', 'HI'), '/en-ca'); // falls back to shop language
  assert.equal(prefixForCountry(localization, 'FR', 'EN'), '/fr-fr'); // only French there
});

test('allMarketPrefixes lists every country/language subfolder once', async () => {
  const { allMarketPrefixes } = await import('../app/lib/markets.ts');
  assert.deepEqual(allMarketPrefixes(localization), ['', '/hi-in', '/en-ca', '/fr-ca', '/fr-fr']);
});

test('hreflangAlternates: every market + x-default, any prefix maps to the same page', async () => {
  const { hreflangAlternates } = await import('../app/lib/markets.ts');
  const links = hreflangAlternates(
    localization,
    'https://shop.test/',
    '/fr-ca/products/hat/',
    '?after=x',
  );
  assert.deepEqual(links, [
    { hreflang: 'en-IN', href: 'https://shop.test/products/hat?after=x' },
    { hreflang: 'hi-IN', href: 'https://shop.test/hi-in/products/hat?after=x' },
    { hreflang: 'en-CA', href: 'https://shop.test/en-ca/products/hat?after=x' },
    { hreflang: 'fr-CA', href: 'https://shop.test/fr-ca/products/hat?after=x' },
    { hreflang: 'fr-FR', href: 'https://shop.test/fr-fr/products/hat?after=x' },
    { hreflang: 'x-default', href: 'https://shop.test/products/hat?after=x' },
  ]);
  const home = hreflangAlternates(localization, 'https://shop.test', '/fr-fr');
  assert.equal(home[0]?.href, 'https://shop.test/');
  assert.equal(home[4]?.href, 'https://shop.test/fr-fr');
});

test('hreflangAlternates: one-market shops emit nothing; tags normalise Shopify codes', async () => {
  const { hreflangAlternates, hreflangTag, sitemapAlternates } =
    await import('../app/lib/markets.ts');
  const france = localization.availableCountries[2];
  assert.ok(france);
  const one: Localization = {
    country: { isoCode: 'FR' },
    language: { isoCode: 'FR' },
    availableCountries: [france],
  };
  assert.deepEqual(hreflangAlternates(one, 'https://s.test', '/'), []);
  assert.equal(sitemapAlternates(one, 'https://s.test', '/'), undefined);
  assert.equal(hreflangTag('PT_BR', 'br'), 'pt-BR');
  assert.equal(
    sitemapAlternates(localization, 'https://s.test', '/pages/a')?.['x-default'],
    'https://s.test/pages/a',
  );
});

test('isUnknownLocale: junk first segments and unknown prefixes 404 in the shell (SF-6)', () => {
  const primary = { market: { pathPrefix: '' }, valid: true };
  assert.equal(isUnknownLocale(undefined, primary), false);
  assert.equal(isUnknownLocale('junk-xyz', primary), true); // `/junk-xyz` matched `:locale?`
  assert.equal(isUnknownLocale('fr-ca', { market: { pathPrefix: '/fr-ca' }, valid: true }), false);
  assert.equal(isUnknownLocale('fr-zz', { market: { pathPrefix: '' }, valid: false }), true);
});
