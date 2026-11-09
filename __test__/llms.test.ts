import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LLMS_LIMITS,
  llmsResponse,
  llmsSettings,
  llmsTxt,
  robotsAllows,
  robotsRulesForAll,
  type LlmsData,
} from '../app/lib/hcms/llms.ts';

const ORIGIN = 'https://store.example';

const node = (handle: string, extra: Record<string, unknown> = {}) => ({
  handle,
  title: handle[0]!.toUpperCase() + handle.slice(1),
  ...extra,
});

function data(overrides: Partial<LlmsData> = {}): LlmsData {
  return {
    shop: {
      name: 'Bagru & Co',
      description: 'Hand-block printed textiles.',
      privacyPolicy: { title: 'Privacy policy', handle: 'privacy-policy' },
      refundPolicy: { title: 'Refund policy', handle: 'refund-policy' },
      shippingPolicy: null,
      termsOfService: { title: 'Terms of service', handle: 'terms-of-service' },
      subscriptionPolicy: null,
    },
    collections: {
      nodes: [
        node('indigo', { description: 'Indigo <b>dyed</b>\n cottons', seo: { description: null } }),
        node('quilts', { description: 'Long', seo: { description: 'Razai quilts, SEO text' } }),
        node('secret', { hidden: { value: '1' } }),
      ],
    },
    pages: { nodes: [node('about', { bodySummary: 'Our story.' }), node('cart-guide')] },
    blogs: { nodes: [] },
    ...overrides,
  };
}

const settings = (raw: unknown = {}) => llmsSettings(raw);

test('builds the llmstxt.org layout with absolute links and descriptions', () => {
  const txt = llmsTxt({ origin: ORIGIN, settings: settings(), data: data(), fallbackName: 'x' });
  assert.equal(
    txt,
    [
      '# Bagru & Co',
      '',
      '> Hand-block printed textiles.',
      '',
      '## Collections',
      '',
      `- [Indigo](${ORIGIN}/collections/indigo): Indigo dyed cottons`,
      `- [Quilts](${ORIGIN}/collections/quilts): Razai quilts, SEO text`,
      '',
      '## Pages',
      '',
      `- [About](${ORIGIN}/pages/about): Our story.`,
      '',
      '## Policies',
      '',
      `- [Privacy policy](${ORIGIN}/policies/privacy-policy)`,
      `- [Refund policy](${ORIGIN}/policies/refund-policy)`,
      `- [Terms of service](${ORIGIN}/policies/terms-of-service)`,
      '',
      '## Optional',
      '',
      `- [Sitemap](${ORIGIN}/sitemap.xml): Every product, collection, page and article URL`,
      '',
    ].join('\n'),
  );
  // Hidden (seo.hidden) and robots-blocked (`/*/cart`) entries are left out; no empty Blogs.
  assert.doesNotMatch(txt, /secret|cart-guide|## Blogs/);
});

test('merchant summary wins over the shop description; custom markdown is appended', () => {
  const txt = llmsTxt({
    origin: ORIGIN,
    settings: settings({
      summary: 'Natural dyes,\n\nmade in Rajasthan.',
      custom: '## Shipping\r\n\r\n\r\n\r\n- Free over ₹999 <script>alert(1)</script>',
    }),
    data: data(),
    fallbackName: 'x',
  });
  assert.match(txt, /^# Bagru & Co\n\n> Natural dyes, made in Rajasthan\.\n/);
  assert.match(txt, /\n## Shipping\n\n- Free over ₹999 alert\(1\)\n\n## Optional\n/);
  assert.doesNotMatch(txt, /<script|Hand-block/);
});

test('caps lists and trims long descriptions', () => {
  const many = Array.from({ length: 80 }, (_, i) =>
    node(`c${i}`, { description: 'word '.repeat(100) }),
  );
  const txt = llmsTxt({
    origin: ORIGIN,
    settings: settings(),
    data: data({ collections: { nodes: many } }),
    fallbackName: 'x',
  });
  const links = txt.split('\n').filter((l) => l.includes('/collections/'));
  assert.equal(links.length, LLMS_LIMITS.collections);
  const note = links[0]!.split('): ')[1]!;
  assert.ok([...note].length <= LLMS_LIMITS.description);
  assert.ok(note.endsWith('…'));
});

test('falls back to a minimal file when the Storefront query failed', () => {
  const txt = llmsTxt({
    origin: ORIGIN,
    settings: settings({ summary: 'Still here.' }),
    data: null,
    fallbackName: 'store.example',
  });
  assert.equal(
    txt,
    `# store.example\n\n> Still here.\n\n## Optional\n\n- [Sitemap](${ORIGIN}/sitemap.xml): Every product, collection, page and article URL\n`,
  );
});

test('response: text/plain + cache headers; disabled → 404; preview never cached', async () => {
  const base = { origin: ORIGIN, data: data(), fallbackName: 'x', preview: false };
  const on = llmsResponse({ ...base, settings: settings() });
  assert.equal(on.status, 200);
  assert.equal(on.headers.get('Content-Type'), 'text/plain; charset=utf-8');
  assert.equal(on.headers.get('Cache-Control'), 'public, max-age=300, stale-while-revalidate=3600');
  assert.match(await on.text(), /^# Bagru & Co/);

  const off = llmsResponse({ ...base, settings: settings({ enabled: false }) });
  assert.equal(off.status, 404);
  assert.doesNotMatch(await off.text(), /Bagru/);

  const failed = llmsResponse({ ...base, data: null, settings: settings() });
  assert.equal(failed.status, 200);
  assert.equal(failed.headers.get('Cache-Control'), 'public, max-age=60');
  const preview = llmsResponse({ ...base, preview: true, settings: settings() });
  assert.equal(preview.headers.get('Cache-Control'), 'no-store');
});

test('settings: on by default, off only when enabled is false; text sanitized and capped', () => {
  assert.deepEqual(settings(undefined), { enabled: true, summary: '', custom: '' });
  assert.equal(settings({ enabled: false }).enabled, false);
  assert.equal(settings({ enabled: 'no' }).enabled, true);
  assert.ok([...settings({ summary: 'a '.repeat(2000) }).summary].length <= LLMS_LIMITS.summary);
  assert.ok(settings({ custom: 'b'.repeat(20_000) }).custom.length <= LLMS_LIMITS.custom);
  assert.equal(settings({ custom: '<!-- x --><p>Hi</p>\u0007' }).custom, 'Hi');
});

test('robots rules: defaults, merchant * groups, longest match, other agents ignored', () => {
  const rules = robotsRulesForAll(
    [
      'Disallow: /pages/wholesale',
      '',
      'User-agent: GPTBot',
      'Disallow: /collections/',
      '',
      'User-agent: Bingbot',
      'User-agent: *',
      'Disallow: /blogs/',
      'Allow: /blogs/news',
    ].join('\n'),
  );
  assert.equal(robotsAllows(rules, '/__hcms/health'), false);
  assert.equal(robotsAllows(rules, '/fr/cart'), false);
  assert.equal(robotsAllows(rules, '/pages/wholesale'), false);
  assert.equal(robotsAllows(rules, '/collections/indigo'), true);
  assert.equal(robotsAllows(rules, '/blogs/journal'), false);
  assert.equal(robotsAllows(rules, '/blogs/news'), true);
  assert.equal(robotsAllows(robotsRulesForAll('Disallow: /*.pdf$'), '/pages/a.pdf'), false);
  assert.equal(robotsAllows(robotsRulesForAll('Disallow: /*.pdf$'), '/pages/a.pdfx'), true);

  const txt = llmsTxt({
    origin: ORIGIN,
    settings: settings(),
    data: data(),
    robots: 'Disallow: /collections/quilts',
    overrides: { page: { noindex: true } },
    fallbackName: 'x',
  });
  assert.doesNotMatch(txt, /quilts|## Pages/);
  assert.match(txt, /collections\/indigo/);
});
