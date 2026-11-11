import { Outlet, isRouteErrorResponse, useRouteError } from 'react-router';

import {
  NotFoundSlot as NotFound,
  RouteErrorMessageSlot as RouteErrorMessage,
} from '~/components/hcms/ui-slots';
import { HcmsMainPage } from '~/components/hcms/HcmsMainPage';
import { throwNotFound } from '~/lib/hcms/not-found';
import { notFoundPage } from '~/lib/hcms/not-found-data';
import { marketContext } from '~/lib/localization';
import { isUnknownLocale } from '~/lib/markets';

import type { Route } from './+types/shell';

/**
 * Pathless layout around every page route. Its only job is the error boundary: page errors
 * (404 from `/pages/x`, a missing product…) render INSIDE the root app shell, so the header,
 * footer, theme fonts and cart stay. A themed 404 (`throwNotFound`) renders the theme's `404`
 * template like the catch-all; otherwise the app's NotFound. Root loader errors still use the
 * root ErrorBoundary (no shell data to render with).
 */
export async function loader({ context, request, params }: Route.LoaderArgs) {
  // `/junk-xyz` matches `:locale?` (home) and unknown locale prefixes: themed 404 in the shell.
  if (isUnknownLocale(params.locale, context.get(marketContext))) {
    await throwNotFound(context, request);
  }
  return null;
}

export default function Shell() {
  return <Outlet />;
}

export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    const themed = notFoundPage(error.data);
    if (!themed) return <NotFound />;
    return (
      <>
        <title>Page not found</title>
        <meta name="robots" content="noindex" />
        <HcmsMainPage page={themed.hcms} origin={themed.origin} />
      </>
    );
  }
  return <RouteErrorMessage error={error} />;
}
