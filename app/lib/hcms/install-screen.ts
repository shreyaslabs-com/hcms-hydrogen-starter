/**
 * "Install HydrogenCMS" screen: a storefront deployed to a real store without any HydrogenCMS
 * variables answers every page with a short setup guide instead of an empty storefront.
 *
 * Decided from the environment only, before React Router runs (`server.ts`), so:
 * - it never depends on our API: once any HydrogenCMS variable is set, the normal fallback chain
 *   (CDN → API → mirror → built-in theme) renders the store, even when HydrogenCMS is down;
 * - the mock.shop demo (no store token, `MOCK_SHOP=1`, local development) is never replaced;
 * - `/__hcms/*` (health, manifest, …) still answer, so the app's Check connection can report
 *   what's missing;
 * - it ships no JavaScript: one static HTML string, never part of the client build.
 *
 * Pure (tests import it directly): relative imports only.
 */
import { shouldUseMockShop } from '../shop.ts';

/** The variables the Setup guide lists, in its order. Names only ever leave this module. */
export const HCMS_REQUIRED_ENV = [
  'HCMS_API_URL',
  'HCMS_PREVIEW_SECRET',
  'HCMS_PUBLIC_KEY',
] as const;
export type HcmsRequiredEnv = (typeof HCMS_REQUIRED_ENV)[number];

/** Used when `HCMS_INSTALL_URL` isn't set. Swap for the App Store listing once it is public. */
export const DEFAULT_INSTALL_URL =
  'https://github.com/shreyaslabs-com/hydrogencms-starter#install-hydrogencms';

export type InstallScreenEnv = Partial<Record<HcmsRequiredEnv, string>> & {
  HCMS_INSTALL_URL?: string;
  MOCK_SHOP?: string;
  PRIVATE_STOREFRONT_API_TOKEN?: string;
  PUBLIC_STORE_DOMAIN?: string;
};

const isSet = (value: string | undefined) => Boolean(value?.trim());

/** Required HydrogenCMS variables that are unset or blank (names only). */
export function missingHcmsEnv(env: InstallScreenEnv): HcmsRequiredEnv[] {
  return HCMS_REQUIRED_ENV.filter((name) => !isSet(env[name]));
}

/**
 * True when this storefront runs on a real store and HydrogenCMS was never connected: no
 * HydrogenCMS variable at all. A partly configured storefront keeps rendering (the mirror still
 * serves the published theme); Check connection lists the rest.
 */
export function needsInstallScreen(env: InstallScreenEnv): boolean {
  if (shouldUseMockShop(env)) return false;
  return missingHcmsEnv(env).length === HCMS_REQUIRED_ENV.length;
}

/** `/__hcms/…`, also under a market prefix (`/en-ca/__hcms/…`). */
export function isInstallScreenExempt(pathname: string): boolean {
  return /^\/(?:[^/]+\/)?__hcms(?:\/|$)/.test(pathname);
}

/** `HCMS_INSTALL_URL` when it is an http(s) URL, else the default. */
export function installUrl(env: Pick<InstallScreenEnv, 'HCMS_INSTALL_URL'>): string {
  const raw = env.HCMS_INSTALL_URL?.trim();
  if (!raw) return DEFAULT_INSTALL_URL;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : DEFAULT_INSTALL_URL;
  } catch {
    return DEFAULT_INSTALL_URL;
  }
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch,
  );

/** The screen's HTML. Static apart from the escaped install link and variable names. */
export function installScreenHtml({
  missing,
  installHref,
}: {
  missing: readonly string[];
  installHref: string;
}): string {
  const href = escapeHtml(installHref);
  const vars = missing.map((name) => `<li><code>${escapeHtml(name)}</code></li>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Set up HydrogenCMS</title>
<style>
:root{color-scheme:light dark;--bg:#f1f1f1;--card:#fff;--text:#303030;--muted:#616161;--line:#e3e3e3;--code:#f3f3f3;--btn:#303030;--btn-text:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#1a1a1a;--card:#262626;--text:#e3e3e3;--muted:#b5b5b5;--line:#3d3d3d;--code:#333;--btn:#f1f1f1;--btn-text:#1a1a1a}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:var(--bg);color:var(--text);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
main{width:100%;max-width:560px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:32px 28px}
h1{margin:0 0 8px;font-size:1.5rem;line-height:1.25}
h2{margin:24px 0 8px;font-size:1rem}
p{margin:0 0 12px;color:var(--muted)}
ol{margin:0;padding-inline-start:1.25rem}
ol li{margin:0 0 8px}
ul{margin:8px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:8px}
code{font:0.875rem/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--code);border:1px solid var(--line);border-radius:6px;padding:2px 6px}
.cta{display:inline-block;margin-top:24px;padding:10px 18px;border-radius:8px;background:var(--btn);color:var(--btn-text);font-weight:600;text-decoration:none}
.cta:focus-visible{outline:2px solid var(--text);outline-offset:3px}
small{display:block;margin-top:20px;color:var(--muted);font-size:0.875rem}
</style>
</head>
<body>
<main>
<h1>This storefront runs on HydrogenCMS</h1>
<p>It's deployed, but it isn't connected to HydrogenCMS yet. Finish setup to show your store here.</p>
<h2>Finish setup</h2>
<ol>
<li>Install the HydrogenCMS app from the Shopify App Store.</li>
<li>In HydrogenCMS, open the <strong>Setup guide</strong> on Home, choose a plan, then open <strong>Connect your storefront</strong>.</li>
<li>In Shopify, go to <strong>Hydrogen › your storefront › Storefront settings › Environments and variables</strong> and add these variables to Production. Copy the values from the Setup guide.</li>
<li>Redeploy the storefront, then select <strong>Check connection</strong> in the Setup guide.</li>
</ol>
<h2>Missing variables</h2>
<ul>${vars}</ul>
<a class="cta" href="${href}" rel="noopener">Install HydrogenCMS</a>
<small>Already installed? The values are also in HydrogenCMS › Settings › Developers.</small>
</main>
</body>
</html>
`;
}

/** The full response: 503 so search engines don't index the setup screen. Never cached. */
export function installScreenResponse(env: InstallScreenEnv, method = 'GET'): Response {
  const html = installScreenHtml({ missing: missingHcmsEnv(env), installHref: installUrl(env) });
  return new Response(method === 'HEAD' ? null : html, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Retry-After': '300',
      'X-Robots-Tag': 'noindex',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    },
  });
}
