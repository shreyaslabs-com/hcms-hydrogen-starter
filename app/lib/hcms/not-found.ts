import { data, type RouterContextProvider } from 'react-router';

import type { NotFoundData } from './not-found-data';
import { loadTemplatePage, type TemplatePage } from './page';

/**
 * Missing resource on a page route: throws a 404 carrying the theme's `404` template (same
 * template + rendering path as the catch-all), so the error page keeps the theme, header and
 * footer (`routes/shell.tsx`). Without a template (or if it fails to load) the shell renders the
 * app's NotFound.
 */
export async function throwNotFound(
  context: Readonly<RouterContextProvider>,
  request: Request,
): Promise<never> {
  const hcms: TemplatePage | null = await loadTemplatePage(context, '404').catch(() => null);
  throw data({ hcms, origin: new URL(request.url).origin } satisfies NotFoundData, {
    status: 404,
  });
}
