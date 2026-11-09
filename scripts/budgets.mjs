#!/usr/bin/env node
/**
 * Performance budget: JavaScript per route (T-1.8.1, ADR 005: our code < 50 KB gzip/route on top
 * of the framework; the total keeps a CI ceiling via `--max` so nothing regresses).
 * Starts the BUILT worker (`vite preview`, workerd, mock.shop), loads each route's HTML and sums
 * the gzip size of every same-origin script it loads up front (`<script src>`,
 * `<link rel="modulepreload">`, inline module imports) = "initial", then adds what
 * `entry.client.tsx` awaits before hydrating (the page's section/theme-block chunks + the product
 * form, T-2.106) = "before hydration". ADR 011: sections marked `data-hcms-defer` (below the
 * first screen) load after hydration, so their chunks only count in "full page" = before
 * hydration + deferred chunks, gated loosely (`--max-page-ours`) so deferral can't hide growth.
 * The editor bridge and live-edit code are preview-only, so they must never appear here.
 * LCP/CLS need a browser: Lighthouse CI on a deployed storefront.
 *
 * Heavy fixture (ADR 011): `/products/sweatpants` renders `fixtures/heavy-product.json`, a
 * product template shaped like the dev-store theme (10 sections, 18 product blocks), served to
 * the worker by a tiny CDN-tier stand-in (`HCMS_CDN_URL`) = the bundled theme + that template.
 *
 * "Framework" = React, React DOM, React Router and Hydrogen (ADR 005). Each file's gzip size is
 * split by the share of its minified bytes that the sourcemap maps to framework sources, so the
 * app-code check needs a sourcemap build; without one only the total is checked.
 *
 * Usage: HCMS_ANALYZE=1 pnpm build && pnpm budgets
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import process, { stderr, stdout } from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { Buffer } from 'node:buffer';
import { existsSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const { fetch, URL } = globalThis;
const PORT = Number(process.env.BUDGETS_PORT ?? 4792); // BUDGETS_PORT: parallel worktrees
const ORIGIN = `http://localhost:${PORT}`;
/** ADR 005: our code per route. `--max <kb>` = total ceiling (ratchet). */
const APP_KB = 50;
const flag = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? Number(process.argv[i + 1]) : Infinity;
};
const BUDGET_KB = flag('--max');
/**
 * T-2.106: everything `entry.client.tsx` awaits before hydrating (the page's lazy section and
 * theme-block chunks, the product form) on top of the initial scripts. Ratchet ceilings until
 * ADR 005 decides whether "our code < 50 KB" covers them: `--max-hydrate` (total) and
 * `--max-hydrate-ours` (our code).
 */
const HYDRATE_KB = flag('--max-hydrate');
const HYDRATE_APP_KB = flag('--max-hydrate-ours');
/** ADR 011: before hydration + deferred section chunks, our code (loose gate, ratchet down only). */
const PAGE_APP_KB = flag('--max-page-ours');
/**
 * ADR 011 ratchet: before-hydration ceilings for our code per route (measured + 3 KB, the worst
 * of the default/electronics/beauty/pro presets; last ratchet 9 Nov 2026 after the loader map's
 * static export picks; ratchet down only); `--max-hydrate-ours` stays the global ceiling.
 */
const ROUTE_HYDRATE_APP_KB = {
  '/': 61,
  '/products/slides': 67,
  '/products/sweatpants': 75,
  '/collections/men': 74,
  '/collections': 60,
  '/search?q=shirt': 76,
  '/cart': 48,
  '/pages/contact': 53,
  '/blogs/news': 54,
  '/account': 50,
  '/account/addresses': 50,
  '/account/orders/1': 50,
};
const ASSETS = new URL('../dist/client/', import.meta.url);
const FRAMEWORK =
  /node_modules\/(react|react-dom|scheduler|react-router|@react-router\/[^/]+|@shopify\/hydrogen|cookie|set-cookie-parser|turbo-stream)\//;
const VERBOSE_ALL = process.argv.includes('--verbose=all');
const VERBOSE = VERBOSE_ALL || process.argv.includes('--verbose');
/** `BUDGETS_ROUTES=/a,/b` measures only those (local investigation; CI runs them all). */
const ROUTES = process.env.BUDGETS_ROUTES
  ? process.env.BUDGETS_ROUTES.split(',')
  : [
      '/',
      '/products/slides',
      // Heavy fixture (dev-store shaped product template).
      '/products/sweatpants',
      '/collections/men',
      '/collections',
      '/search?q=shirt',
      '/cart',
      '/pages/contact',
      '/blogs/news',
      '/account',
      '/account/addresses',
      '/account/orders/1',
    ];

function scriptUrls(html) {
  const urls = new Set();
  for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) urls.add(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g))
    urls.add(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*href="([^"]+)"[^>]*rel="modulepreload"/g))
    urls.add(m[1]);
  for (const m of html.matchAll(/import\s*(?:[^'"]*from\s*)?["'](\/[^"']+\.js)["']/g))
    urls.add(m[1]);
  return [...urls]
    .map((u) => new URL(u.replace(/&amp;/g, '&'), ORIGIN))
    .filter((u) => u.origin === ORIGIN);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Decodes one sourcemap segment (base64 VLQ) into its numeric fields. */
function vlq(segment) {
  const out = [];
  let value = 0;
  let shift = 0;
  for (const ch of segment) {
    const digit = B64.indexOf(ch);
    value += (digit & 31) << shift;
    if (digit & 32) shift += 5;
    else {
      out.push(value & 1 ? -(value >>> 1) : value >>> 1);
      value = 0;
      shift = 0;
    }
  }
  return out;
}

/** Share (0–1) of a built file's bytes that come from framework sources; null without a map. */
export function frameworkShare(code, map) {
  const lines = code.split('\n');
  const framework = (map.sources ?? []).map((src) => FRAMEWORK.test(src));
  let fw = 0;
  let mapped = 0;
  let src = 0;
  map.mappings.split(';').forEach((line, i) => {
    const length = lines[i]?.length ?? 0;
    let col = 0;
    const segments = line ? line.split(',').map(vlq) : [];
    segments.forEach((seg, j) => {
      col += seg[0];
      if (seg.length > 1) src += seg[1];
      const end = j + 1 < segments.length ? col + segments[j + 1][0] : length;
      if (seg.length > 1) {
        mapped += end - col;
        if (framework[src]) fw += end - col;
      }
    });
  });
  return mapped ? fw / mapped : 0;
}

function shareOf(url) {
  const file = new URL(`.${url.pathname}`, ASSETS);
  const mapFile = new URL(`${file.href}.map`);
  if (!existsSync(file)) return null;
  // The bundler's CommonJS interop runtime (React is CJS) has no map: framework.
  if (/\/rolldown-runtime-[\w-]+\.js$/.test(url.pathname)) return 1;
  // Tiny re-export stubs (`export{…}from"./x.js"`) get no map: count them as ours.
  if (!existsSync(mapFile)) return readFileSync(file).length < 512 ? 0 : null;
  return frameworkShare(readFileSync(file, 'utf8'), JSON.parse(readFileSync(mapFile, 'utf8')));
}

/** Section types whose blocks use the product form slots (mirrors `product-slots.ts`). */
const PRODUCT_SECTION_TYPES = ['main-product', 'featured-product'];
const DEPS = String.raw`(?:,__vite__mapDeps\(\[([\d,]*)\]\))?`;
/**
 * The built loader map (`write-lazy.mjs`, compact form): an array of module loaders
 * `[()=>p(()=>import(\`./x.js\`),__vite__mapDeps([…])),…]` and packed type tables
 * `\`type,fileIndex[,slot][,flags];…\``, one for sections and one for theme blocks.
 */
// `.then(e=>[e.x])` = the static export pick; Rolldown appends `.then(e=>e.x)` to merged modules.
const LOADER = String.raw`\(\)=>(?:[\w$]+\(\(\)=>)?import\(\`\./([^\`]+)\`\)(?:\.then\((?:[^()]|\([^()]*\))*\))*${DEPS}\)?`;
const LOADER_LIST = new RegExp(String.raw`=\[((?:${LOADER},?)+)\]`);
const PACKED_ENTRY = String.raw`[a-z0-9_-]+,\d+(?:,[\w$]*){0,2}`;
const PACKED_TABLE = new RegExp(
  String.raw`[\`"](${PACKED_ENTRY}(?:;${PACKED_ENTRY}){2,})[\`"]`,
  'g',
);
/**
 * Custom sections (`app/sections/custom.ts`): the glob map `"./custom/<type>.tsx":()=>p(()=>import(…))`
 * (`blocks/` for theme blocks); a `<type>.browser.tsx` half wins, as in `custom-registry.ts`.
 */
const CUSTOM = new RegExp(
  String.raw`"\./custom/(?:blocks/)?([^"/]+?)(\.browser)?\.tsx":\(\)=>(?:[\w$]+\(\(\)=>)?import\(\`\./([^\`]+)\`\)${DEPS}`,
  'g',
);
const PRODUCT_FORM = new RegExp(
  String.raw`import\(\`\./(HcmsProductForm-[^\`]+)\`\)(?:\.then\((?:[^()]|\([^()]*\))*\))*${DEPS}`,
);
/** Cart page with lines (`cart-lines-slot.ts`): its chunk loads before hydrating. */
const CART_LINES = new RegExp(
  String.raw`import\(\`\./(CartPageLines-[^\`]+)\`\)(?:\.then\((?:[^()]|\([^()]*\))*\))*${DEPS}`,
);

/**
 * The page's sections in the server HTML (`data-hcms-section-type`), each with its ADR 011 marker
 * and extent (sections never nest), so blocks can be attributed to their section.
 */
export function sectionSpans(html) {
  const spans = [];
  for (const m of html.matchAll(/<([a-z][\w-]*)\b[^>]*\bdata-hcms-section-type="([^"]+)"[^>]*>/g)) {
    const tags = new RegExp(String.raw`<(/?)${m[1]}\b[^>]*>`, 'g');
    tags.lastIndex = m.index + m[0].length;
    let depth = 1;
    let end = html.length;
    for (let t = tags.exec(html); t; t = tags.exec(html)) {
      if (t[0].endsWith('/>')) continue;
      depth += t[1] ? -1 : 1;
      if (!depth) {
        end = t.index;
        break;
      }
    }
    const defer = /\bdata-hcms-defer="([^"]*)"/.exec(m[0])?.[1] ?? null;
    spans.push({ type: m[2], defer, start: m.index, end });
  }
  return spans;
}

/**
 * Same split as `entry.client` (`lib/hcms/deferred-hydration.ts` `planHydration`): eager = types
 * of unmarked sections + their theme blocks + blocks outside every section; deferred = the rest.
 * Section-local blocks (`data-hcms-local`) load nothing. Not mirrored: the boot-time "already on
 * screen" promotion (needs layout), so CI assumes the page is taller than one screen.
 */
export function hydrationTypes(html) {
  const spans = sectionSpans(html);
  const eager = new Set();
  const deferred = new Set();
  for (const s of spans) (s.defer === null ? eager : deferred).add(s.type);
  for (const m of html.matchAll(/<[a-z][^>]*\bdata-hcms-block-type="([^"]+)"[^>]*>/g)) {
    if (/\bdata-hcms-local=/.test(m[0])) continue;
    const owner = spans.find((s) => s.start < m.index && m.index < s.end);
    (owner && owner.defer !== null ? deferred : eager).add(m[1]);
  }
  for (const t of eager) deferred.delete(t);
  return { eager, deferred };
}

/**
 * Chunks for these section / theme-block types, read from the built loader map
 * (`__vite__mapDeps` = the module + the deps Vite preloads with it), plus the product form when
 * a product section is among them and (`cartLines`) the cart lines chunk.
 */
function chunkUrls(types, chunks, { cartLines = false } = {}) {
  const wanted = new Set();
  let loaders = 0;
  for (const text of chunks) {
    const table = /m\.f=\[([^\]]*)\]/
      .exec(text)?.[1]
      .match(/"[^"]+"/g)
      ?.map((s) => s.slice(1, -1));
    const add = (file, deps) => {
      wanted.add(`/assets/${file}`);
      for (const i of deps ? deps.split(',') : []) if (table?.[i]) wanted.add(`/${table[i]}`);
    };
    const list = LOADER_LIST.exec(text)?.[1];
    const modules = list ? [...list.matchAll(new RegExp(LOADER, 'g'))] : [];
    if (modules.length)
      for (const table of text.matchAll(PACKED_TABLE))
        for (const entry of table[1].split(';')) {
          const [type, index] = entry.split(',');
          const mod = modules[Number(index)];
          if (!mod) continue;
          loaders += 1;
          if (types.has(type)) add(mod[1], mod[2]);
        }
    const custom = new Map();
    for (const m of text.matchAll(CUSTOM)) {
      const key = m[0].slice(0, m[0].lastIndexOf(m[1]) + m[1].length);
      if (m[2] || !custom.has(key)) custom.set(key, m);
    }
    for (const m of custom.values()) if (types.has(m[1])) add(m[3], m[4]);
    const form = PRODUCT_FORM.exec(text);
    if (form && PRODUCT_SECTION_TYPES.some((t) => types.has(t))) add(form[1], form[2]);
    const lines = CART_LINES.exec(text);
    if (lines && cartLines) add(lines[1], lines[2]);
  }
  if (types.size && !loaders) throw new Error('No lazy section loaders found in the route chunks');
  return [...wanted].filter((p) => p.endsWith('.js')).map((p) => new URL(p, ORIGIN));
}

/**
 * Chunks `entry.client.tsx` awaits BEFORE hydrating (they are not in the HTML): the eager
 * section/theme-block modules, the product form with an eager product section, the cart lines
 * chunk on a cart page with lines. `later` = what ADR 011 loads after hydration (minus those).
 */
function preHydrationUrls(html, chunks) {
  const { eager, deferred } = hydrationTypes(html);
  const before = chunkUrls(eager, chunks, { cartLines: /\bdata-hcms-cart-lines\b/.test(html) });
  const seen = new Set(before.map((u) => u.href));
  const later = chunkUrls(deferred, chunks).filter((u) => !seen.has(u.href));
  return { before, later };
}

const sizes = new Map();
const texts = new Map();
async function gzipKb(url) {
  if (!sizes.has(url.href)) {
    const response = await fetch(url);
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !/javascript/.test(type))
      throw new Error(
        `${url.pathname}: ${response.status} ${type} (stale server on port ${PORT}?)`,
      );
    // A sourcemap build adds `//# sourceMappingURL=`; production builds don't have it.
    const text = (await response.text()).replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, '');
    texts.set(url.href, text);
    const body = Buffer.from(text);
    sizes.set(url.href, gzipSync(body, { level: 9 }).length / 1024);
  }
  return sizes.get(url.href);
}

// A leftover server would answer with an old build: refuse instead of measuring it.
const busy = await fetch(`${ORIGIN}/__hcms/health`).then(
  () => true,
  () => false,
);
if (busy) {
  stderr.write(`Port ${PORT} is already serving; stop it (pkill -f "vite preview") and retry.\n`);
  process.exit(1);
}

/**
 * Heavy fixture: a CDN-tier stand-in serving the bundled theme + `fixtures/heavy-product.json`
 * as `product.heavy`, assigned to `sweatpants`; every other route renders the bundled theme.
 */
const SHOP = 'mock.shop';
const SNAPSHOT = 'snap_budgetsheavy';
const bundledTheme = JSON.parse(
  readFileSync(new URL('../app/hcms/last-known-good.json', import.meta.url), 'utf8'),
);
const heavyTheme = {
  ...bundledTheme,
  snapshotId: SNAPSHOT,
  templates: {
    ...bundledTheme.templates,
    'product.heavy': JSON.parse(
      readFileSync(new URL('./fixtures/heavy-product.json', import.meta.url), 'utf8'),
    ),
  },
  assignments: {
    ...bundledTheme.assignments,
    byHandle: { ...bundledTheme.assignments?.byHandle, product: { sweatpants: 'product.heavy' } },
  },
};
const cdn = createServer((request, response) => {
  const body =
    request.url === `/v1/${SHOP}/live`
      ? { snapshotId: SNAPSHOT, themeId: 'thm_budgets', publishedAt: bundledTheme.publishedAt }
      : request.url === `/v1/${SHOP}/snapshots/${SNAPSHOT}.json`
        ? heavyTheme
        : null;
  response.writeHead(body ? 200 : 404, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body ?? { error: 'not found' }));
});
await new Promise((resolve) => cdn.listen(0, '127.0.0.1', resolve));
const CDN_URL = `http://127.0.0.1:${cdn.address().port}`;

const child = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort'], {
  env: { ...process.env, MOCK_SHOP: '1', HCMS_CDN_URL: CDN_URL, PUBLIC_STORE_DOMAIN: SHOP },
  stdio: 'ignore',
  detached: true,
});
let failed = 0;
let needsMaps = false;
try {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`${ORIGIN}/__hcms/health`);
      break;
    } catch {
      await sleep(500);
    }
  }
  for (const route of ROUTES) {
    const html = await (await fetch(`${ORIGIN}${route}`)).text();
    const initial = scriptUrls(html);
    for (const url of initial) await gzipKb(url);
    const seen = new Set(initial.map((u) => u.href));
    const { before, later } = preHydrationUrls(
      html,
      initial.map((u) => texts.get(u.href)),
    );
    const urls = [...initial, ...before.filter((u) => !seen.has(u.href))];
    const awaited = new Set(urls.map((u) => u.href));
    const deferredUrls = later.filter((u) => !awaited.has(u.href));
    if (route === '/products/sweatpants' && !html.includes('data-hcms-section-type="testimonials"'))
      throw new Error('Heavy fixture not rendered on /products/sweatpants (CDN stand-in ignored?)');
    if (urls.some((u) => /bridge/i.test(u.pathname))) {
      failed += 1;
      stderr.write(`  ✖ ${route}: editor bridge loaded outside preview\n`);
    }
    const sum = (list) => {
      let total = 0;
      let app = 0;
      for (const url of list) {
        const kb = sizes.get(url.href);
        const share = shareOf(url);
        if (share === null) needsMaps = true;
        total += kb;
        app += kb * (1 - (share ?? 0));
      }
      return { total, app };
    };
    for (const url of [...urls, ...deferredUrls]) await gzipKb(url);
    const first = sum(initial);
    const all = sum(urls);
    const page = sum([...urls, ...deferredUrls]);
    const routeCap = ROUTE_HYDRATE_APP_KB[route] || Infinity;
    if (VERBOSE)
      for (const url of [...urls, ...deferredUrls]
        .sort((a, b) => sizes.get(b.href) - sizes.get(a.href))
        .slice(0, VERBOSE_ALL ? undefined : 8))
        stdout.write(
          `      ${sizes.get(url.href).toFixed(1).padStart(6)} KB ${url.pathname}${seen.has(url.href) ? '' : awaited.has(url.href) ? ' (sections)' : ' (deferred)'}\n`,
        );
    const ok =
      first.total < BUDGET_KB &&
      all.total < HYDRATE_KB &&
      (needsMaps || first.app < APP_KB) &&
      (needsMaps || (all.app < HYDRATE_APP_KB && all.app < routeCap)) &&
      (needsMaps || page.app < PAGE_APP_KB);
    if (!ok) failed += 1;
    const kb = (n) => n.toFixed(1).padStart(6);
    const ours = (n) => (needsMaps ? '   n/a' : kb(n));
    stdout.write(
      `  ${ok ? '✔' : '✖'} ${route.padEnd(20)} initial: ours ${ours(first.app)} · total ${kb(first.total)} KB | before hydration: ours ${ours(all.app)}${Number.isFinite(routeCap) ? ` (< ${routeCap})` : ''} · total ${kb(all.total)} KB gz (${urls.length} files) | full page: ours ${ours(page.app)} · total ${kb(page.total)} KB\n`,
    );
  }
} finally {
  try {
    process.kill(-child.pid);
  } catch {
    /* already exited */
  }
  cdn.close();
}
const limits = [
  `initial: ours < ${APP_KB} KB`,
  Number.isFinite(BUDGET_KB) && `total < ${BUDGET_KB} KB`,
  Number.isFinite(HYDRATE_APP_KB) && `before hydration: ours < ${HYDRATE_APP_KB} KB`,
  Number.isFinite(HYDRATE_KB) && `before hydration: total < ${HYDRATE_KB} KB`,
  'before hydration: ours < the route cap',
  Number.isFinite(PAGE_APP_KB) && `full page: ours < ${PAGE_APP_KB} KB`,
]
  .filter(Boolean)
  .join(', ')
  .concat(' gzip per route');
if (failed) {
  stderr.write(`\n${failed} budget check(s) failed (${limits})\n`);
  process.exit(1);
}
if (needsMaps) {
  stderr.write(
    `\nNo sourcemaps, so our-code share wasn't checked: HCMS_ANALYZE=1 pnpm build first.\n`,
  );
  process.exit(process.argv.includes('--require-maps') ? 1 : 0);
}
stdout.write(`\nAll routes within budget (${limits}).\n`);
