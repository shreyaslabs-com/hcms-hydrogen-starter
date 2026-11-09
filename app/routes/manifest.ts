import { resolveFile } from '@hcms/hydrogen';

import { documentContext } from '~/lib/hcms/document';
import { buildManifest, pwaSettings } from '~/lib/hcms/pwa';
import { marketContext } from '~/lib/localization';
import { previewContext } from '~/lib/preview';
import { loadRootLayout } from '~/lib/root-layout';
import { storefrontClientContext } from '~/lib/storefront';

import type { Route } from './+types/manifest';

/** `/manifest.webmanifest` (T-2.83): 404 unless the theme turns "Installable storefront" on. */
export async function loader({ context }: Route.LoaderArgs) {
  const { document } = context.get(documentContext);
  const pwa = pwaSettings(document.settings);
  if (!pwa.enabled) return new Response('Not found', { status: 404 });
  const file = resolveFile(pwa.icon, document.assets ?? {});
  const layout = await loadRootLayout(context.get(storefrontClientContext));
  const preview = context.get(previewContext) !== null;
  const manifest = buildManifest({
    settings: document.settings,
    shopName: layout.shopInfo.name,
    iconUrl: file?.kind === 'image' ? file.url : (layout.shopInfo.logo?.url ?? null),
    lang: context.get(marketContext).market.language.toLowerCase(),
  });
  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': preview ? 'no-store' : 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}
