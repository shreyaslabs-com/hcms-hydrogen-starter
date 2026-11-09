import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  STYLE_CATEGORIES,
  buildStyleGuide,
  buttonStyles,
  cardSamples,
  cartSpecimen,
  colorSchemes,
  customCssInfo,
  namedStyles,
  pickProducts,
  styleSectionId,
  themeFonts,
  tokenRows,
  typeScale,
  type SampleProduct,
} from '../app/lib/hcms/style-guide.ts';

test('style guide categories: the editor contract ids, in order', () => {
  assert.deepEqual(
    STYLE_CATEGORIES.map((c) => c.id),
    [
      'colors',
      'typography',
      'layout',
      'animations',
      'icons',
      'buttons',
      'variant_pills',
      'inputs',
      'product_cards',
      'collection_cards',
      'blog_cards',
      'content_containers',
      'media',
      'popups',
      'drawers',
      'badges',
      'currency_format',
      'styles',
      'cart',
      'markets',
      'custom_css',
    ],
  );
  assert.equal(STYLE_CATEGORIES.find((c) => c.id === 'popups')?.label, 'Dropdowns and pop-ups');
  assert.equal(styleSectionId('buttons'), '__lib-style-buttons');
});

test('colorSchemes: stored order, scheme class, core roles first, unsafe values dropped', () => {
  const schemes = colorSchemes({
    colors: {
      schemes: {
        'scheme-2': { shadow: '#000', text: '#121212', background: '#f3f3f3', bad: 'red;}' },
        'scheme-1': { button_label: '#fff', background: '#fff' },
        'bad id!': { background: '#000' },
      },
    },
  });
  assert.deepEqual(
    schemes.map((s) => [s.id, s.name, s.className]),
    [
      ['scheme-2', 'Scheme 2', 'color-scheme-2'],
      ['scheme-1', 'Scheme 1', 'color-scheme-1'],
    ],
  );
  assert.deepEqual(
    schemes[0]?.colors.map((c) => `${c.label}=${c.value}`),
    ['Background=#f3f3f3', 'Text=#121212', 'Shadow=#000'],
  );
  assert.deepEqual(
    schemes[1]?.colors.map((c) => c.label),
    ['Background', 'Button label'],
  );
  assert.deepEqual(colorSchemes(null), []);
});

test('themeFonts: names families, weights and sources; unset = store default', () => {
  const [heading, body] = themeFonts({
    typography: { heading: 'dm_sans_n7', body: 'custom:Brand Sans:i4' },
  });
  assert.deepEqual(
    { family: heading?.family, weight: heading?.weight, source: heading?.source },
    { family: 'DM Sans', weight: 700, source: 'Google Fonts' },
  );
  assert.equal(body?.family, 'Brand Sans');
  assert.equal(body?.style, 'italic');
  assert.equal(body?.source, 'Uploaded font');
  const [system, unset] = themeFonts({ typography: { heading: 'serif_n4' } });
  assert.equal(system?.family, 'System serif');
  assert.equal(unset?.set, false);
});

test('tokenRows: stored values marked edited, defaults otherwise', () => {
  const rows = tokenRows(
    { inputs_radius: 12, inputs_border_opacity: 500, animations_hover_elements: '3d-lift' },
    'inputs',
  );
  const radius = rows.find((r) => r.id === 'inputs_radius');
  assert.deepEqual(radius, {
    id: 'inputs_radius',
    label: 'Corner radius',
    value: '12px',
    edited: true,
  });
  // Out of range = not stored.
  assert.equal(rows.find((r) => r.id === 'inputs_border_opacity')?.edited, false);
  assert.equal(rows.find((r) => r.id === 'inputs_border_opacity')?.value, 'Default');
  const anim = tokenRows({ animations_hover_elements: '3d-lift' }, 'animations');
  assert.equal(anim.find((r) => r.id === 'animations_hover_elements')?.value, '3D lift');
  assert.equal(anim.find((r) => r.id === 'animations_reveal_on_scroll')?.value, 'Default');
  const badges = tokenRows({ sale_badge_color_scheme: 'scheme-4' }, 'badges');
  assert.equal(badges.find((r) => r.id === 'sale_badge_color_scheme')?.value, 'Scheme 4');
});

test('typeScale: body × font scale, headings × heading scale', () => {
  const base = typeScale({});
  assert.equal(base.find((s) => s.className === 'type-display')?.px, 36);
  assert.equal(base.find((s) => s.className === 'type-body')?.px, 16);
  const scaled = typeScale({ typography: { scale: 1.25 }, heading_scale: 150 });
  assert.equal(scaled.find((s) => s.className === 'type-body')?.px, 20);
  assert.equal(scaled.find((s) => s.className === 'type-heading-xl')?.px, 45);
  // No heading scale: headings follow the body scale (Dawn's ratio of 1).
  assert.equal(typeScale({ typography: { scale: 1.1 } })[0]?.px, 39.6);
});

test('buttonStyles: built-ins always, custom styles only when defined, named', () => {
  assert.deepEqual(
    buttonStyles({}).map((b) => b.id),
    ['primary', 'secondary', 'tertiary', 'link'],
  );
  const styles = buttonStyles({
    button_styles: { 'custom-2': { name: 'Glow', fill: 'outline' }, 'custom-1': {} },
  });
  assert.deepEqual(
    styles.map((b) => [b.id, b.label]),
    [
      ['primary', 'Primary'],
      ['secondary', 'Secondary'],
      ['tertiary', 'Tertiary'],
      ['link', 'Link'],
      ['custom-2', 'Glow'],
    ],
  );
  assert.equal(styles[1]?.className, 'button-outline hcms-button hcms-button--secondary');
  assert.match(styles[3]?.className ?? '', /^hcms-button--link/);
});

test('namedStyles: names and edited counts from Theme settings › Styles', () => {
  const styles = namedStyles({
    badge_styles: { 'custom-1': { name: 'Vegan' } },
    card_styles: { 'custom-3': { corner_radius: 8, border_thickness: 2 } },
  });
  assert.deepEqual(
    styles.map((s) => [s.kind, s.id, s.label, s.edited]),
    [
      ['card', 'custom-3', 'Custom 3', 2],
      ['badge', 'custom-1', 'Vegan', 0],
    ],
  );
});

test('cartSpecimen: store currency goal first, 60 % subtotal, gifts', () => {
  const settings = {
    cart: {
      free_shipping_thresholds: {
        EUR: '50',
        USD: [{ amount: '100' }, { amount: '200', label: 'Gift' }],
      },
      gift_message: true,
    },
  };
  const usd = cartSpecimen(settings, 'USD');
  assert.deepEqual(usd.subtotal, { amount: '60.00', currencyCode: 'USD' });
  assert.equal(usd.thresholds?.USD?.length, 2);
  assert.equal(usd.giftMessage, true);
  assert.equal(usd.giftWrap, false);
  // No goal in the store currency: the first configured currency.
  assert.deepEqual(cartSpecimen(settings, 'JPY').subtotal, {
    amount: '30.00',
    currencyCode: 'EUR',
  });
  assert.deepEqual(cartSpecimen({}, 'USD'), {
    thresholds: null,
    subtotal: null,
    giftWrap: false,
    giftMessage: false,
  });
});

const product = (id: string, extra: Partial<SampleProduct> = {}): SampleProduct => ({
  id,
  handle: id,
  title: id,
  availableForSale: true,
  featuredImage: { url: `https://cdn.shopify.com/${id}.jpg` },
  priceRange: { minVariantPrice: { amount: '10.0', currencyCode: 'USD' } },
  ...extra,
});

test('pickProducts: regular, on sale and sold out when the catalogue has them', () => {
  const sale = product('sale', {
    compareAtPriceRange: { minVariantPrice: { amount: '20.0', currencyCode: 'USD' } },
  });
  const sold = product('sold', { availableForSale: false });
  const bare = product('bare', { featuredImage: null });
  const picks = pickProducts([bare, sold, sale, product('a'), product('b')]);
  assert.deepEqual(
    picks.map((p) => p.id),
    ['a', 'sale', 'sold'],
  );
  assert.deepEqual(
    pickProducts([bare, product('x')]).map((p) => p.id),
    ['x'], // pictured products only when there are any (an empty image reads as broken)
  );
  assert.deepEqual(
    pickProducts([bare]).map((p) => p.id),
    ['bare'],
  );
});

test('cardSamples: tolerant of missing lists and junk nodes', () => {
  assert.deepEqual(cardSamples(null), { products: [], collections: [], articles: [] });
  const samples = cardSamples({
    products: { nodes: [product('a'), null, { id: 'no-price' }] },
    collections: { nodes: [{ id: 'c1', handle: 'c1', title: 'C1' }, 'x'] },
    articles: { nodes: [{ id: 'a1', handle: 'a1', title: 'A1' }] },
  });
  assert.deepEqual(
    samples.products.map((p) => p.id),
    ['a'],
  );
  assert.deepEqual(
    samples.collections.map((c) => c.id),
    ['c1'],
  );
  assert.equal(samples.articles.length, 1);
});

test('customCssInfo + buildStyleGuide: one model for every category', () => {
  assert.deepEqual(customCssInfo({ custom_css: '  a{color:red}  ' }), {
    set: true,
    characters: 12,
  });
  assert.deepEqual(customCssInfo({}), { set: false, characters: 0 });
  const guide = buildStyleGuide(
    {
      layout: { pageWidth: 1400 },
      markets: { geolocation_banner: true },
      animations_reveal_on_scroll: true,
    },
    { currency: 'USD' },
  );
  assert.equal(guide.values.layout?.[0]?.value, '1400px');
  assert.equal(guide.values.layout?.[0]?.edited, true);
  assert.equal(guide.values.buttons?.[0]?.id, 'buttons_radius');
  assert.equal(guide.geolocation, true);
  assert.equal(guide.animations.reveal, true);
  // Unset = on (Dawn default); only an explicit false turns it off.
  assert.equal(buildStyleGuide({}, { currency: 'USD' }).animations.reveal, true);
  assert.equal(
    buildStyleGuide({ animations_reveal_on_scroll: false }, { currency: 'USD' }).animations.reveal,
    false,
  );
  assert.equal(buildStyleGuide({}, { currency: 'USD' }).values.layout?.[0]?.value, 'Default');
  assert.equal(guide.animations.hover, 'default');
  assert.equal(guide.values.colors, undefined);
  assert.equal(guide.categories.length, 21);
  assert.equal(guide.icons.stroke, 'default');
  assert.equal(
    buildStyleGuide({ icon_stroke: 'heavy' }, { currency: 'USD' }).icons.stroke,
    'heavy',
  );
  assert.equal(buildStyleGuide({ icon_stroke: 'x' }, { currency: 'USD' }).icons.stroke, 'default');
});
