import { WISHLIST_METAFIELD_KEY, WISHLIST_NAMESPACE, parseHandles } from '@hcms/sections';
import { gql } from '@shopify/hydrogen/customer-account';

import { accountSession } from '~/lib/account.server';

import type { Route } from './+types/wishlist';

/** Customer Account API 2026-10, validated with the Dev MCP (`customer`). */
const WISHLIST_QUERY = gql(`
  query HcmsWishlist($namespace: String!, $key: String!) {
    customer {
      id
      metafield(namespace: $namespace, key: $key) {
        value
      }
    }
  }
`);

const WISHLIST_SET = gql(`
  mutation HcmsWishlistSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        key
        value
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`);

const noStore = { 'Cache-Control': 'private, no-store' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });

/**
 * `/{market?}/__hcms/wishlist` (T-2.78): the signed-in customer's wishlist, a customer metafield
 * `hcms.wishlist` (json array of product handles) via the Customer Account API. Guests get
 * `{ signedIn: false }` (they stay on localStorage). Needs a customer metafield definition with
 * customer-account access `READ_WRITE` (see docs/help); without it writes answer 409.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await accountSession(context, request);
  if (session.status !== 'ready') return json({ signedIn: false });
  try {
    const { data, errors } = await session.client.graphql(WISHLIST_QUERY, {
      accessToken: session.accessToken,
      variables: { namespace: WISHLIST_NAMESPACE, key: WISHLIST_METAFIELD_KEY },
    });
    if (errors?.length || !data?.customer) return json({ signedIn: false }, 502);
    return json({ signedIn: true, handles: parseHandles(data.customer.metafield?.value) });
  } catch {
    return json({ signedIn: false }, 502);
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== 'POST') return json({ ok: false }, 405);
  // Same-origin only (the session cookie is sent automatically).
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ ok: false }, 403);
  if (!request.headers.get('Content-Type')?.includes('application/json'))
    return json({ ok: false }, 415);
  const session = await accountSession(context, request);
  if (session.status !== 'ready') return json({ ok: false }, 401);

  let body: { handles?: unknown };
  try {
    body = (await request.json()) as { handles?: unknown };
  } catch {
    return json({ ok: false }, 400);
  }
  if (!Array.isArray(body.handles)) return json({ ok: false }, 400);
  const handles = parseHandles(body.handles);

  try {
    const owner = await session.client.graphql(WISHLIST_QUERY, {
      accessToken: session.accessToken,
      variables: { namespace: WISHLIST_NAMESPACE, key: WISHLIST_METAFIELD_KEY },
    });
    const ownerId = owner.data?.customer?.id;
    if (!ownerId) return json({ ok: false }, 502);
    const { data, errors } = await session.client.graphql(WISHLIST_SET, {
      accessToken: session.accessToken,
      variables: {
        metafields: [
          {
            ownerId,
            namespace: WISHLIST_NAMESPACE,
            key: WISHLIST_METAFIELD_KEY,
            type: 'json',
            value: JSON.stringify(handles),
          },
        ],
      },
    });
    // Missing definition / no customer-account access shows up as userErrors or GraphQL errors.
    if (errors?.length || data?.metafieldsSet?.userErrors?.length)
      return json({ ok: false, available: false }, 409);
    return json({ ok: true, handles });
  } catch {
    return json({ ok: false }, 502);
  }
}
