import { mainAddresses, sectionFromPreset } from '@hcms/sections';
import { data } from 'react-router';

import { AddressesBody } from '~/components/account/AddressesBody';
import { HcmsMainPage } from '~/components/hcms/HcmsMainPage';
import { RouteSlots } from '~/components/hcms/RouteSlots';
import {
  ADDRESSES_QUERY,
  ADDRESS_CREATE_MUTATION,
  ADDRESS_DELETE_MUTATION,
  ADDRESS_UPDATE_MUTATION,
  accountSession,
  type AccountSession,
} from '~/lib/account.server';
import {
  addressGid,
  countryOptions,
  parseAddressForm,
  userErrorsToFields,
  type FieldErrors,
} from '~/lib/hcms/account';
import { loadTemplatePage } from '~/lib/hcms/page';
import { routeMeta } from '~/lib/hcms/route-seo';
import { marketContext } from '~/lib/localization';

import type { Route } from './+types/account-addresses';

export function meta({ matches, loaderData }: Route.MetaArgs) {
  return routeMeta(matches, {
    template: loaderData?.hcms?.name ?? null,
    type: 'customers/addresses',
    title: 'Addresses',
    noindex: true,
  });
}

async function addressesState(session: AccountSession) {
  if (session.status !== 'ready') return session;
  try {
    const { data, errors } = await session.client.graphql(ADDRESSES_QUERY, {
      accessToken: session.accessToken,
    });
    if (errors || !data.customer)
      return { status: 'error', message: errors?.[0]?.message ?? 'Customer not found.' } as const;
    return {
      status: 'signed-in',
      addresses: data.customer.addresses.nodes,
      defaultAddressId: data.customer.defaultAddress?.id ?? null,
    } as const;
  } catch {
    return {
      status: 'error',
      message: "We couldn't load your addresses. Try again later.",
    } as const;
  }
}

/**
 * `/account/addresses` → Theme Document `customers/addresses` (T-2.22): `main-addresses`
 * renders `AddressesBody` via the adapter. Country options = the shop's market countries.
 */
export async function loader({ context, request }: Route.LoaderArgs) {
  const session = await accountSession(context, request);
  const [state, hcms] = await Promise.all([
    addressesState(session),
    loadTemplatePage(
      context,
      'customers/addresses',
      {},
      { fallback: { order: ['main'], sections: { main: sectionFromPreset(mainAddresses) } } },
    ),
  ]);
  const countries = countryOptions(
    context.get(marketContext).localization.availableCountries.map(({ isoCode, name }) => ({
      isoCode,
      name,
    })),
  );
  return { ...state, hcms, countries, origin: new URL(request.url).origin };
}

export type AddressActionData = {
  ok: boolean;
  /** Which form answered: `new`, an address GID, or `delete:<gid>`. */
  form: string;
  errors: FieldErrors;
};

/** Add / edit / delete an address. Plain form POSTs, so they work without JS. */
export async function action({ context, request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = form.get('intent');
  const id = addressGid(form.get('addressId'));
  const formKey = intent === 'create' ? 'new' : intent === 'delete' ? `delete:${id}` : String(id);
  const fail = (errors: FieldErrors, status = 400) =>
    data<AddressActionData>({ ok: false, form: formKey, errors }, status);

  const session = await accountSession(context, request);
  if (session.status !== 'ready') return fail({ form: 'Sign in again.' }, 401);
  const { client, accessToken } = session;

  try {
    if (intent === 'delete') {
      if (!id) return fail({ form: 'Unknown address.' });
      const { data: result, errors } = await client.graphql(ADDRESS_DELETE_MUTATION, {
        accessToken,
        variables: { addressId: id },
      });
      return respond(
        formKey,
        userErrorsToFields(result?.customerAddressDelete?.userErrors),
        errors,
      );
    }
    if (intent !== 'create' && intent !== 'update') return fail({ form: 'Unknown action.' });
    if (intent === 'update' && !id) return fail({ form: 'Unknown address.' });
    const parsed = parseAddressForm(form);
    if (!parsed.ok) return fail(parsed.errors);
    const { defaultAddress } = parsed;
    // Two letters checked by `parseAddressForm`; Shopify rejects unknown codes as userErrors.
    const address = { ...parsed.address, countryCode: parsed.address.countryCode as never };
    if (intent === 'create') {
      const { data: result, errors } = await client.graphql(ADDRESS_CREATE_MUTATION, {
        accessToken,
        variables: { address, defaultAddress },
      });
      return respond(
        formKey,
        userErrorsToFields(result?.customerAddressCreate?.userErrors),
        errors,
      );
    }
    const { data: result, errors } = await client.graphql(ADDRESS_UPDATE_MUTATION, {
      accessToken,
      variables: { addressId: id as string, address, defaultAddress },
    });
    return respond(formKey, userErrorsToFields(result?.customerAddressUpdate?.userErrors), errors);
  } catch {
    return fail({ form: "We couldn't save your address. Try again later." }, 502);
  }
}

function respond(
  form: string,
  fieldErrors: FieldErrors,
  errors: readonly { message: string }[] | undefined,
) {
  if (errors?.length) fieldErrors.form ??= errors[0]?.message ?? 'Request failed.';
  const ok = Object.keys(fieldErrors).length === 0;
  return data<AddressActionData>({ ok, form, errors: fieldErrors }, ok ? 200 : 400);
}

export type AddressesData = Awaited<ReturnType<typeof loader>>;

export default function AccountAddressesRoute({ loaderData }: Route.ComponentProps) {
  if (!loaderData.hcms) return null; // unreachable: `fallback` always yields a template
  return (
    <RouteSlots
      value={{
        AddressesPage: ({ showPhone }) => <AddressesBody data={loaderData} showPhone={showPhone} />,
      }}
    >
      <HcmsMainPage page={loaderData.hcms} origin={loaderData.origin} />
    </RouteSlots>
  );
}
