import { documentContext } from '~/lib/hcms/document';
import { robotsTxt } from '~/lib/hcms/sitemap';
import { previewContext } from '~/lib/preview';

import type { Route } from './+types/robots';

export function loader({ request, context }: Route.LoaderArgs) {
  const { document } = context.get(documentContext);
  const preview = context.get(previewContext) !== null;
  const body = robotsTxt(new URL(request.url).origin, { custom: document.seo?.robots });
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Published edits show up within minutes (custom rules live in the Theme Document).
      'Cache-Control': preview ? 'no-store' : 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}
