import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { HeadTags } from '../app/components/hcms/HeadTags.ts';
import { contentSecurityPolicy } from '../app/lib/csp.ts';
import {
  applyHeaderRules,
  headTagManifestHosts,
  headTagsFor,
  verificationFileResponse,
} from '../app/lib/hcms/head.ts';

// Fixture tokens in the shapes the providers issue (not real properties).
const GSC_TOKEN = 'rXOxyZounnZasA8Z7oaD3c14JdjS9aKSWvsR1EbUSIQ';
const BING_XML =
  '<?xml version="1.0"?>\n<users>\n\t<user>0123456789ABCDEF0123456789ABCDEF</user>\n</users>';

const render = (seo: unknown) =>
  renderToStaticMarkup(createElement(HeadTags, { tags: headTagsFor(seo) }));

test('T-2.75 AC (meta): verification codes render as <meta> in the head', () => {
  const html = render({
    verification: {
      google: GSC_TOKEN,
      bing: '0123456789ABCDEF0123456789ABCDEF',
      pinterest: 'abcdef0123456789abcdef0123456789',
      facebook: 'abc123def456ghi789jkl012mno345',
      yandex: '0123456789abcdef',
    },
  });
  // Exactly what Search Console looks for on the home page.
  assert.ok(html.includes(`<meta name="google-site-verification" content="${GSC_TOKEN}"/>`));
  assert.ok(
    html.includes('<meta name="msvalidate.01" content="0123456789ABCDEF0123456789ABCDEF"/>'),
  );
  assert.ok(html.includes('<meta name="p:domain_verify"'));
  assert.ok(html.includes('<meta name="facebook-domain-verification"'));
  assert.ok(html.includes('<meta name="yandex-verification" content="0123456789abcdef"/>'));
});

test('head tags: invalid tokens and disallowed tags are dropped; values escaped', () => {
  const html = render({
    verification: { google: '"><script>alert(1)</script>', bing: 7 },
    headTags: [
      { tag: 'meta', name: 'author', content: 'Tom & "Jerry" <b>' },
      { tag: 'meta', httpEquiv: 'refresh', content: '0;url=https://evil.example' },
      { tag: 'meta', httpEquiv: 'Content-Security-Policy', content: 'default-src *' },
      { tag: 'script', src: 'https://evil.example/x.js' },
      { tag: 'link', rel: 'stylesheet', href: 'https://evil.example/x.css' },
      { tag: 'link', rel: 'icon', href: 'javascript:alert(1)' },
      { tag: 'link', rel: 'preconnect', href: 'https://cdn.example.com', crossorigin: 'anonymous' },
      {
        tag: 'link',
        rel: 'alternate',
        href: 'https://x.example/feed',
        hreflang: 'en',
        type: 'application/rss+xml',
      },
      { tag: 'meta', property: 'fb:app_id', content: '123' },
    ],
  });
  assert.ok(!html.includes('script'));
  assert.ok(!html.includes('refresh'));
  assert.ok(!html.includes('Content-Security-Policy'));
  assert.ok(!html.includes('stylesheet'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('<meta name="author" content="Tom &amp; &quot;Jerry&quot; &lt;b&gt;"/>'));
  assert.ok(
    html.includes(
      '<link rel="preconnect" href="https://cdn.example.com" crossorigin="anonymous"/>',
    ),
  );
  assert.ok(html.includes('hrefLang="en"'));
  assert.ok(html.includes('<meta property="fb:app_id" content="123"/>'));
  assert.deepEqual(headTagsFor(undefined), []);
});

test('head tags: external manifest gets a CSP manifest-src; preconnect needs none', () => {
  const tags = headTagsFor({
    headTags: [
      { tag: 'link', rel: 'manifest', href: 'https://apps.example.com/manifest.json' },
      { tag: 'link', rel: 'preconnect', href: 'https://cdn.example.com' },
    ],
  });
  const hosts = headTagManifestHosts(tags);
  assert.deepEqual(hosts, ['https://apps.example.com']);
  const csp = contentSecurityPolicy({ nonce: 'n', manifest: hosts });
  assert.match(csp, /manifest-src 'self' [^;]*https:\/\/apps\.example\.com/);
  assert.doesNotMatch(contentSecurityPolicy({ nonce: 'n' }), /manifest-src/);
  assert.doesNotMatch(contentSecurityPolicy({ nonce: 'n' }), /cdn\.example\.com/);
});

test('T-2.75 AC (file): /google<id>.html and /BingSiteAuth.xml served from the document', async () => {
  const seo = {
    verificationFiles: [
      { filename: 'google1234abcd.html', content: 'google-site-verification: google1234abcd.html' },
      { filename: 'BingSiteAuth.xml', content: BING_XML },
    ],
  };
  const google = verificationFileResponse('/google1234abcd.html', seo);
  assert.ok(google);
  assert.equal(google.status, 200);
  assert.equal(google.headers.get('Content-Type'), 'text/html; charset=utf-8');
  assert.equal(google.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(google.headers.get('Content-Security-Policy'), "default-src 'none'");
  assert.match(google.headers.get('Cache-Control') ?? '', /public/);
  // Search Console compares the body with this exact line.
  assert.equal(await google.text(), 'google-site-verification: google1234abcd.html');

  const bing = verificationFileResponse('/BingSiteAuth.xml', seo, { preview: true });
  assert.ok(bing);
  assert.equal(bing.headers.get('Content-Type'), 'application/xml; charset=utf-8');
  assert.equal(bing.headers.get('Cache-Control'), 'no-store');
  assert.equal(await bing.text(), BING_XML);

  // Unknown file, market prefix, other paths, tampered content → not answered (404 as usual).
  assert.equal(verificationFileResponse('/google999.html', seo), null);
  assert.equal(verificationFileResponse('/fr-ca/google1234abcd.html', seo), null);
  assert.equal(verificationFileResponse('/products/x', seo), null);
  assert.equal(
    verificationFileResponse('/google1.html', {
      verificationFiles: [{ filename: 'google1.html', content: '<script>alert(1)</script>' }],
    }),
    null,
  );
});

test('T-2.76: header rules apply on matching paths only, never security headers', () => {
  const seo = {
    headers: [
      { path: '/search', name: 'X-Robots-Tag', value: 'noindex' },
      { path: '/products/*', name: 'Link', value: '<https://cdn.example.com>; rel=preconnect' },
      { path: '/sitemap.xml', name: 'Access-Control-Allow-Origin', value: '*' },
      { path: '/', name: 'Content-Language', value: 'en' },
      // Rejected even if they reached a snapshot:
      { path: '/', name: 'Content-Security-Policy', value: 'default-src *' },
      { path: '/', name: 'Set-Cookie', value: 'a=b' },
      { path: '/', name: 'Cache-Control', value: 'public, max-age=99999' },
      { path: '/', name: 'X-Robots-Tag', value: 'noindex\r\nSet-Cookie: a=b' },
      { path: '/', name: 'Access-Control-Allow-Origin', value: '*' },
    ],
  };
  const html = () =>
    new Headers({
      'Content-Type': 'text/html',
      'Content-Security-Policy': "default-src 'self'",
      'Cache-Control': 'no-store',
    });

  const search = html();
  applyHeaderRules(search, seo, { pathname: '/search' });
  assert.equal(search.get('X-Robots-Tag'), 'noindex');
  assert.equal(search.get('Content-Language'), 'en');
  assert.equal(search.get('Content-Security-Policy'), "default-src 'self'");
  assert.equal(search.get('Cache-Control'), 'no-store');
  assert.equal(search.get('Set-Cookie'), null);
  assert.equal(search.get('Access-Control-Allow-Origin'), null);

  const product = html();
  applyHeaderRules(product, seo, { pathname: '/fr-ca/products/shirt', pathPrefix: '/fr-ca' });
  assert.equal(product.get('Link'), '<https://cdn.example.com>; rel=preconnect');
  assert.equal(product.get('X-Robots-Tag'), null);

  // Existing single-valued headers are never replaced.
  const fr = new Headers({ 'Content-Type': 'text/html', 'Content-Language': 'fr' });
  applyHeaderRules(fr, seo, { pathname: '/' });
  assert.equal(fr.get('Content-Language'), 'fr');

  const sitemap = new Headers({ 'Content-Type': 'application/xml' });
  applyHeaderRules(sitemap, seo, { pathname: '/sitemap.xml' });
  assert.equal(sitemap.get('Access-Control-Allow-Origin'), '*');

  // CORS never on HTML, even when a rule's path would match.
  const htmlAtXml = html();
  applyHeaderRules(htmlAtXml, seo, { pathname: '/sitemap.xml' });
  assert.equal(htmlAtXml.get('Access-Control-Allow-Origin'), null);

  const none = html();
  applyHeaderRules(none, undefined, { pathname: '/' });
  assert.equal(none.get('X-Robots-Tag'), null);
});

test('T-2.105: a header value the runtime refuses skips that rule, never throws', () => {
  const seo = {
    headers: [
      { path: '/', name: 'Link', value: '</日本.woff2>; rel=preload; as=font' },
      { path: '/', name: 'Link', value: '<https://cdn.shopify.com>; rel=preconnect' },
      { path: '/', name: 'X-Robots-Tag', value: 'noindex' },
    ],
  };
  // Non-ASCII never reaches Headers (schema check)…
  const plain = new Headers({ 'Content-Type': 'text/html' });
  assert.doesNotThrow(() => applyHeaderRules(plain, seo, { pathname: '/' }));
  assert.equal(plain.get('Link'), '<https://cdn.shopify.com>; rel=preconnect');
  // …and a forced runtime refusal (TypeError from append/set) is swallowed per rule.
  class Strict extends Headers {
    override append(name: string, value: string): void {
      if (name.toLowerCase() === 'link') throw new TypeError('Invalid header value');
      super.append(name, value);
    }
  }
  const strict = new Strict({ 'Content-Type': 'text/html' });
  assert.doesNotThrow(() => applyHeaderRules(strict, seo, { pathname: '/' }));
  assert.equal(strict.get('Link'), null);
  assert.equal(strict.get('X-Robots-Tag'), 'noindex'); // later rules still apply
});
