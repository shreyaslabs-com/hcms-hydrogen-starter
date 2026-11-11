import { readThemeFonts } from '@hcms/schema';
import { isbot } from 'isbot';
import { renderToReadableStream } from 'react-dom/server';
import { ServerRouter, type EntryContext, type RouterContextProvider } from 'react-router';

import { loadCartLines } from '~/components/cart-lines-slot';
import { loadSlots } from '~/components/hcms/ui-slots';
import { loadProductForm } from '~/components/product/product-slots';
import { NonceContext, contentSecurityPolicy, createNonce } from '~/lib/csp';
import { envContext } from '~/lib/env';
import { documentContext } from '~/lib/hcms/document';
import { embedCspSources } from '~/lib/hcms/embeds';
import { headTagManifestHosts, headTagsFor } from '~/lib/hcms/head';

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  context: RouterContextProvider,
) {
  const env = context.get(envContext);
  const nonce = createNonce();
  // Lazy on the client; on the server it must be ready before rendering (no SSR suspense).
  await Promise.all([loadProductForm(), loadCartLines(), loadSlots()]);
  const body = await renderToReadableStream(
    <NonceContext.Provider value={nonce}>
      <ServerRouter context={reactRouterContext} url={request.url} nonce={nonce} />
    </NonceContext.Provider>,
    {
      nonce,
      // Sections render inside Suspense boundaries; React outlines completed boundaries bigger
      // than ~12.8 KB (header with menus) and reveals them later by script, shifting the page
      // (CLS 0.065 on every route). Keep ready boundaries inline (T-1.8.1).
      progressiveChunkSize: Number.MAX_SAFE_INTEGER,
      signal: request.signal,
      onError(error) {
        console.error(error);
        responseStatusCode = 500;
      },
    },
  );

  if (isbot(request.headers.get('user-agent'))) {
    await body.allReady;
  }

  responseHeaders.set('Content-Type', 'text/html');
  // frame-ancestors is added by the root middleware (`applyPreviewHeaders`).
  responseHeaders.set(
    'Content-Security-Policy',
    contentSecurityPolicy({
      nonce,
      shopDomain: env.PUBLIC_STORE_DOMAIN,
      checkoutDomain: env.PUBLIC_CHECKOUT_DOMAIN,
      dev: import.meta.env.DEV,
      embeds: embedHosts(context, env.PUBLIC_STORE_DOMAIN),
      manifest: manifestHosts(context),
      adobeFonts: hasAdobeFonts(context),
    }),
  );

  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}

/** Embeds Manager hosts (T-2.9); none when the root middleware didn't load a document. */
function embedHosts(context: RouterContextProvider, shopDomain: string | undefined) {
  try {
    return embedCspSources(context.get(documentContext).document.embeds, shopDomain);
  } catch {
    return undefined;
  }
}

/** External web app manifest hosts from the Theme Document head tags (T-2.75). */
function manifestHosts(context: RouterContextProvider) {
  try {
    return headTagManifestHosts(headTagsFor(context.get(documentContext).document.seo));
  } catch {
    return undefined;
  }
}

/** Theme fonts (T-2.73): an Adobe Fonts project is set (validated like `themeStyles` does). */
function hasAdobeFonts(context: RouterContextProvider): boolean {
  try {
    return Boolean(
      readThemeFonts(context.get(documentContext).document.settings.fonts).adobe.projectId,
    );
  } catch {
    return false;
  }
}
