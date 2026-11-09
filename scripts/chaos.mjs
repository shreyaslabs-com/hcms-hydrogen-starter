#!/usr/bin/env node
/**
 * Chaos test (T-1.8.2, T-0.8): the HCMS API and the snapshot CDN are down → the storefront still
 * renders. Runs the BUILT worker (`vite preview`, workerd) with `HCMS_API_URL` and `HCMS_CDN_URL`
 * pointing at a broken server
 * (connection refused, hanging, HTTP 500) and checks that home, a product and a collection
 * render (200 + main content) fast, and that `/__hcms/health` reports the failed `api` tier.
 *
 * Usage: pnpm build && pnpm chaos   (mock.shop; no secrets needed)
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import process, { stdout, stderr } from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

const { fetch } = globalThis;
const PORT = 4791;
const PAGES = ['/', '/products/slides', '/collections/men'];
// CDN and API tiers time out at 1.5 s each (then the breaker skips them); the page must not wait much longer.
const MAX_MS = 5500;

async function brokenApi(mode) {
  if (mode === 'refused') return { url: 'http://127.0.0.1:9', close: async () => {} };
  const server = createServer((req, res) => {
    if (mode === 'hang') return; // never answers
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end('{"error":"boom"}');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => {
      server.closeAllConnections?.();
      return new Promise((r) => server.close(r));
    },
  };
}

async function startStorefront(apiUrl) {
  const child = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort'], {
    env: {
      ...process.env,
      HCMS_API_URL: apiUrl,
      HCMS_CDN_URL: apiUrl,
      HCMS_PUBLIC_KEY: 'hcms_pk_chaos',
      PUBLIC_STORE_DOMAIN: 'mock.shop',
      MOCK_SHOP: '1',
    },
    stdio: 'ignore',
    detached: true,
  });
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`http://localhost:${PORT}/__hcms/health`);
      return child;
    } catch {
      await sleep(500);
    }
  }
  process.kill(-child.pid);
  throw new Error('storefront did not start');
}

const failures = [];
const check = (ok, message) => {
  stdout.write(`${ok ? '  ✔' : '  ✖'} ${message}\n`);
  if (!ok) failures.push(message);
};

for (const mode of ['refused', 'hang', 'error500']) {
  stdout.write(`HCMS API ${mode}\n`);
  const api = await brokenApi(mode);
  const child = await startStorefront(api.url);
  try {
    for (const path of PAGES) {
      const started = Date.now();
      const response = await fetch(`http://localhost:${PORT}${path}`);
      const html = await response.text();
      const ms = Date.now() - started;
      check(
        response.status === 200 && html.includes('id="main-content"') && ms < MAX_MS,
        `${path} → ${response.status} in ${ms} ms`,
      );
    }
    const health = await (await fetch(`http://localhost:${PORT}/__hcms/health`)).json();
    check(
      ['cdn', 'api'].every((tier) => health.failures?.some((f) => f.tier === tier)) &&
        !['cdn', 'api'].includes(health.documentSource),
      `health: source=${health.documentSource}, failed tiers=${(health.failures ?? []).map((f) => f.tier).join(',')}`,
    );
  } finally {
    process.kill(-child.pid);
    await api.close();
    await sleep(500);
  }
}

if (failures.length) {
  stderr.write(`\n${failures.length} chaos check(s) failed\n`);
  process.exit(1);
}
stdout.write('\nStorefront renders with the HCMS API and CDN down.\n');
