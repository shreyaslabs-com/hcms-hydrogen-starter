import { mainAccount, sectionFromPreset } from '@hcms/sections';
import { data } from 'react-router';

import { AccountBody } from '~/components/AccountBody';
import { HcmsMainPage } from '~/components/hcms/HcmsMainPage';
import { RouteSlots } from '~/components/hcms/RouteSlots';
import {
  ACCOUNT_QUERY,
  CUSTOMER_UPDATE_MUTATION,
  accountSession,
  type AccountSession,
} from '~/lib/account.server';
import { parseProfileForm, userErrorsToFields, type FieldErrors } from '~/lib/hcms/account';
import { loadTemplatePage } from '~/lib/hcms/page';
import { routeMeta } from '~/lib/hcms/route-seo';

import type { Route } from './+types/account';

const ORDERS_PAGE_SIZE = 10;

export function meta({ matches, loaderData }: Route.MetaArgs) {
  return routeMeta(matches, {
    template: loaderData?.hcms?.name ?? null,
    type: 'customers/account',
    title: 'Account',
    noindex: true,
  });
}

async function accountState(session: AccountSession, request: Request) {
  if (session.status !== 'ready') return session;
  const searchParams = new URL(request.url).searchParams;
  const before = searchParams.get('before');
  const variables = before
    ? { last: ORDERS_PAGE_SIZE, before }
    : { first: ORDERS_PAGE_SIZE, after: searchParams.get('after') };

  try {
    const { data, errors } = await session.client.graphql(ACCOUNT_QUERY, {
      accessToken: session.accessToken,
      variables,
    });
    if (errors || !data.customer) {
      return { status: 'error', message: errors?.[0]?.message ?? 'Customer not found.' } as const;
    }
    return { status: 'signed-in', customer: data.customer } as const;
  } catch {
    return {
      status: 'error',
      message: "We couldn't load your account. Try again later.",
    } as const;
  }
}

/**
 * Theme Document `customers/account` template (D-22, T-2.22): `main-account` renders
 * `AccountBody` (profile, default address, orders). Older documents without the template get
 * the section's default preset.
 */
export async function loader(args: Route.LoaderArgs) {
  const session = await accountSession(args.context, args.request);
  const [state, hcms] = await Promise.all([
    accountState(session, args.request),
    loadTemplatePage(
      args.context,
      'customers/account',
      {},
      { fallback: { order: ['main'], sections: { main: sectionFromPreset(mainAccount) } } },
    ),
  ]);
  return { ...state, hcms, origin: new URL(args.request.url).origin };
}

export type ProfileActionData = { ok: boolean; errors: FieldErrors };

/** Profile edit (first/last name) via `customerUpdate`. Works without JS (plain form POST). */
export async function action({ context, request }: Route.ActionArgs) {
  const session = await accountSession(context, request);
  if (session.status !== 'ready')
    return data<ProfileActionData>({ ok: false, errors: { form: 'Sign in again.' } }, 401);
  const form = await request.formData();
  if (form.get('intent') !== 'profile')
    return data<ProfileActionData>({ ok: false, errors: { form: 'Unknown action.' } }, 400);
  try {
    const { data: result, errors } = await session.client.graphql(CUSTOMER_UPDATE_MUTATION, {
      accessToken: session.accessToken,
      variables: { input: parseProfileForm(form) },
    });
    const fieldErrors = userErrorsToFields(result?.customerUpdate?.userErrors);
    if (errors?.length) fieldErrors.form ??= errors[0]?.message ?? 'Update failed.';
    const ok = Object.keys(fieldErrors).length === 0;
    return data<ProfileActionData>({ ok, errors: fieldErrors }, ok ? 200 : 400);
  } catch {
    return data<ProfileActionData>(
      { ok: false, errors: { form: "We couldn't save your details. Try again later." } },
      502,
    );
  }
}

export default function AccountRoute({ loaderData }: Route.ComponentProps) {
  if (loaderData.hcms)
    return (
      <RouteSlots
        value={{
          AccountPage: ({ showOrders, showProfile, showAddresses }) => (
            <AccountBody
              data={loaderData}
              showOrders={showOrders}
              showProfile={showProfile ?? true}
              showAddresses={showAddresses ?? true}
            />
          ),
        }}
      >
        <HcmsMainPage page={loaderData.hcms} origin={loaderData.origin} />
      </RouteSlots>
    );
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="max-w-page px-margin mx-auto w-full flex-1 py-12"
    >
      <h1 className="type-display text-on-surface mb-8">Account</h1>
      <AccountBody data={loaderData} />
    </main>
  );
}
