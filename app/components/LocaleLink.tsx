/**
 * Market-aware drop-ins for React Router's `Link` and `Form`: root-relative paths get the current
 * market prefix (`/products/x` → `/fr-ca/products/x`). Import these instead of react-router's.
 */
import { forwardRef, useCallback } from 'react';
import {
  Form as RouterForm,
  Link as RouterLink,
  useRouteLoaderData,
  type FormProps,
  type LinkProps,
  type To,
} from 'react-router';

import { localizePath } from '~/lib/markets';

type RootData = { market?: { pathPrefix: string } };

/** Returns a function that prefixes app paths with the current market. */
export function useLocalePath(): (path: string) => string {
  const prefix = useRouteLoaderData<RootData>('root')?.market?.pathPrefix ?? '';
  // Stable identity per market, so it can sit in effect/callback dependencies.
  return useCallback((path: string) => localizePath(path, prefix), [prefix]);
}

function localizeTo(to: To, localize: (path: string) => string): To {
  if (typeof to === 'string') return localize(to);
  return to.pathname ? { ...to, pathname: localize(to.pathname) } : to;
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ to, ...rest }, ref) {
  const localize = useLocalePath();
  return <RouterLink ref={ref} to={localizeTo(to, localize)} {...rest} />;
});

export const Form = forwardRef<HTMLFormElement, FormProps>(function Form({ action, ...rest }, ref) {
  const localize = useLocalePath();
  return <RouterForm ref={ref} action={action ? localize(action) : action} {...rest} />;
});
