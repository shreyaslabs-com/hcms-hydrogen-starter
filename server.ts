import { createRequestHandler, RouterContextProvider } from 'react-router';
import * as serverBuild from 'virtual:react-router/server-build';

import { withReconciledCartCookie } from '~/lib/cart-cookie';
import { envContext } from '~/lib/env';
import { FONT_PATH_PREFIX, fontProxySecret, serveSelfHostedFont } from '~/lib/hcms/font-proxy';
import {
  installScreenResponse,
  isInstallScreenExempt,
  needsInstallScreen,
} from '~/lib/hcms/install-screen';

/**
 * Export a fetch handler in module format for Oxygen / mini-oxygen.
 */
export default {
  async fetch(
    rawRequest: Request,
    env: Env,
    executionContext: ExecutionContext,
  ): Promise<Response> {
    try {
      // Shared Online Store / Hydrogen cart cookie (T-2.53): one canonical `cart` cookie before
      // Hydrogen reads it; a no-op (same request, same response) in the common case.
      const cart = withReconciledCartCookie(toPublicRequest(rawRequest));
      const request = cart.request;
      const method = request.method;
      if ((method === 'GET' || method === 'HEAD') && request.body) {
        return new Response(`${method} requests cannot have a body`, { status: 400 });
      }

      const url = new URL(request.url);
      if (url.pathname.includes('//')) {
        return new Response(null, {
          status: 301,
          headers: { location: url.pathname.replace(/[/]+/g, '/') },
        });
      }

      // Deployed to a real store but HydrogenCMS was never connected: every page shows the
      // "Install HydrogenCMS" screen (env check only, so an outage of our API never triggers it).
      // `/__hcms/*` still answers, so the app's Check connection can report what's missing.
      if (needsInstallScreen(env) && !isInstallScreenExempt(url.pathname)) {
        return installScreenResponse(env, method);
      }

      const cache = await caches.open('hydrogen-v1');
      // Self-hosted Google font files (T-2.135): before React Router, so no middleware (market,
      // document, gate) and no route-manifest entry in the HTML.
      if (url.pathname.startsWith(FONT_PATH_PREFIX)) {
        return await serveSelfHostedFont(request, {
          secret: fontProxySecret(env),
          cache,
          waitUntil: (promise) => executionContext.waitUntil(promise),
        });
      }

      const routerContext = new RouterContextProvider();
      routerContext.cache = cache;
      routerContext.set(envContext, env);
      routerContext.env = env;
      routerContext.waitUntil = executionContext.waitUntil.bind(executionContext);

      const handleRequest = createRequestHandler(serverBuild, process.env.NODE_ENV);
      return cart.finish(await handleRequest(request, routerContext as never));
    } catch (error) {
      console.error(error);
      return new Response('An unexpected error occurred', { status: 500 });
    }
  },
};

// Behind a proxy that terminates TLS, such as a tunnel, the worker sees `http:`
// with `x-forwarded-proto: https`. Customer Account OAuth needs the public
// `https:` origin.
function toPublicRequest(request: Request): Request {
  const url = new URL(request.url);
  if (url.protocol !== 'http:' || request.headers.get('x-forwarded-proto') !== 'https') {
    return request;
  }
  url.protocol = 'https:';
  return new Request(url, request);
}
