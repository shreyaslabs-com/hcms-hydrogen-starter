/**
 * Storefront password page (T-2.21, Online Store `password` template). The root middleware sends
 * gated visitors here; the right password sets a cookie bound to the current password.
 */
import {
  GATE_COOKIE,
  GATE_COOKIE_MAX_AGE,
  gateCookieValue,
  verifyGatePassword,
} from '@hcms/hydrogen';
import { Form, redirect, useActionData, useLoaderData } from 'react-router';

import { documentContext } from '~/lib/hcms/document';
import { safeReturnTo } from '~/lib/hcms/gate';
import { envContext } from '~/lib/env';
import { getShopNameFromRootMatch } from '~/lib/storefront-shop';

import type { Route } from './+types/password';

export function meta({ matches }: Route.MetaArgs) {
  return [
    { title: `${getShopNameFromRootMatch(matches[0])} · Opening soon` },
    { name: 'robots', content: 'noindex, nofollow' },
  ];
}

export function loader({ context, request }: Route.LoaderArgs) {
  const gate = context.get(documentContext).gate;
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get('return_to'));
  if (!gate) throw redirect(returnTo);
  return { message: gate.message ?? '', returnTo };
}

export async function action({ context, request }: Route.ActionArgs) {
  const gate = context.get(documentContext).gate;
  const form = await request.formData();
  const returnTo = safeReturnTo(String(form.get('return_to') ?? '/'));
  if (!gate) throw redirect(returnTo);
  const secret = context.get(envContext).HCMS_PREVIEW_SECRET ?? '';
  const password = String(form.get('password') ?? '');
  if (!(await verifyGatePassword(secret, gate, password)))
    return { error: secret ? 'Incorrect password' : 'This store can’t check passwords right now' };
  const cookie = `${GATE_COOKIE}=${await gateCookieValue(secret, gate)}; Path=/; Max-Age=${GATE_COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
  throw redirect(returnTo, { headers: { 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } });
}

export default function Password() {
  const { message, returnTo } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <main
      id="main-content"
      className="bg-surface text-on-surface flex min-h-svh flex-1 items-center justify-center px-6"
    >
      <div className="w-full max-w-sm text-center">
        <h1 className="font-heading mb-3 text-3xl">Opening soon</h1>
        {message ? <p className="text-on-surface-secondary mb-8">{message}</p> : null}
        <Form method="post" className="flex flex-col gap-3 text-start">
          <input type="hidden" name="return_to" value={returnTo} />
          <label htmlFor="store-password" className="text-sm font-medium">
            Enter store password
          </label>
          <input
            id="store-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            aria-invalid={result?.error ? true : undefined}
            aria-describedby={result?.error ? 'password-error' : undefined}
            className="border-border rounded-input min-h-11 border px-3"
          />
          {result?.error ? (
            <p id="password-error" role="alert" className="text-critical text-sm">
              {result.error}
            </p>
          ) : null}
          <button type="submit" className="rounded-button button-primary min-h-11 px-6">
            Enter
          </button>
        </Form>
      </div>
    </main>
  );
}
