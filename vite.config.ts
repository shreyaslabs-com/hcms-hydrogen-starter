import { reactRouter } from '@react-router/dev/vite';
import { localHttps } from '@shopify/hydrogen/vite';
import { oxygen } from '@shopify/mini-oxygen/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

const oxygenPlugins = oxygen();
const oxygenPlugin = oxygenPlugins.find((plugin) => plugin.name === 'oxygen:main');
const enabled = process.env.npm_lifecycle_event === 'dev:https';
const httpsOptions = { enabled };

if (!oxygenPlugin?.api) {
  throw new Error('MiniOxygen plugin API is unavailable.');
}

// MiniOxygen infers the compatibility date 2026-10-01 from Hydrogen 2026.10.x, but its
// runtime doesn't support that date yet. Remove this override after MiniOxygen handles
// inferred dates that its runtime doesn't support.
oxygenPlugin.api.registerPluginOptions({ compatibilityDate: '2026-04-01' });

function allowedHosts() {
  const extra = process.env.HCMS_DEV_STOREFRONT_HOST?.trim();
  return ['.tryhydrogen.dev', ...(extra ? [extra] : [])];
}

type ModuleInfoLike = { importers: readonly string[] } | null;

/**
 * T-2.106 JS budget: every module that root.tsx / entry.client.tsx import statically loads on
 * every page, but Rolldown split the ones routes also import into ~20 tiny shared chunks (a gzip
 * header + an unprimed dictionary each). One `root-shared` chunk compresses them together
 * (~3 KB gz less per route). Route-only and lazy modules are never reached, so they stay split.
 */
const BARREL = /\/(?:index|official)\.(?:[cm]?js|tsx?)(?:\?.*)?$/;

function rootSharedChunk(
  id: string,
  ctx: { getModuleInfo: (id: string) => ModuleInfoLike },
): string | null {
  const seen = new Set<string>();
  const queue = [id];
  for (let current = queue.pop(); current !== undefined; current = queue.pop()) {
    if (seen.has(current)) continue;
    seen.add(current);
    if (/\/app\/(?:root|entry\.client)\.tsx$/.test(current))
      return current === id ? null : 'root-shared';
    // Barrels re-export far more than root uses: an edge through one proves nothing.
    if (current !== id && BARREL.test(current)) continue;
    queue.push(...(ctx.getModuleInfo(current)?.importers ?? []));
  }
  return null;
}

const EAGER_GLOB = /import\.meta\.glob(?:<[^>]*>)?\([^()]*?\beager:\s*true[^()]*\)/g;

/**
 * Custom sections (`app/sections/custom.ts`): the server imports `app/sections/custom/*` eagerly,
 * the browser lazily. Vite turns an eager glob into static imports even inside
 * `import.meta.env.SSR ? … : …`, which would put every custom section in the client entry, so the
 * client build sees `{}` instead (before Vite's glob plugin runs).
 */
function serverOnlyEagerGlobs(): Plugin {
  return {
    name: 'hcms:server-only-eager-globs',
    enforce: 'pre',
    transform(code, id, options) {
      if (options?.ssr || !/\/app\/sections\/custom\.ts$/.test(id)) return null;
      return { code: code.replace(EAGER_GLOB, '{}'), map: null };
    },
  };
}

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [
    serverOnlyEagerGlobs(),
    localHttps(httpsOptions),
    tailwindcss(),
    ...oxygenPlugins,
    reactRouter(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    // Allow a strict Content-Security-Policy
    // without inlining assets as base64:
    assetsInlineLimit: 0,
    // `HCMS_ANALYZE=1 pnpm build && node scripts/bundle-report.mjs` (T-1.8.1): per-module sizes.
    sourcemap: process.env.HCMS_ANALYZE === '1',
    ...(isSsrBuild
      ? {}
      : {
          rolldownOptions: {
            output: {
              codeSplitting: { groups: [{ name: rootSharedChunk }] },
            },
          },
        }),
  },
  ssr: {
    optimizeDeps: {
      /**
       * Include dependencies here if they throw CJS<>ESM errors.
       * For example, for the following error:
       *
       * > ReferenceError: module is not defined
       * >   at /Users/.../node_modules/example-dep/index.js:1:1
       *
       * Include 'example-dep' in the array below.
       * @see https://vitejs.dev/config/dep-optimization-options
       */
      include: [
        'react',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'react-dom',
        'react-dom/server',
        'react-router > set-cookie-parser',
        'react-router > cookie',
        'react-router',
      ],
    },
  },
  // Local storefront behind a dev tunnel (e.g. hcms-sf.shreyaslabs.com for in-admin preview tests).
  server: { allowedHosts: allowedHosts() },
  preview: { allowedHosts: allowedHosts() },
}));
