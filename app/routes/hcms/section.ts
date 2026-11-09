import { resolveData, verifyPreviewToken, type PreviewClaims } from '@hcms/hydrogen';
import type { JsonValue } from '@hcms/schema';

import { envContext } from '~/lib/env';
import { documentContext } from '~/lib/hcms/document';
import { loadSections } from '~/lib/hcms/page';
import { newAssets, parseSectionRefetch, sectionSlices } from '~/lib/hcms/section-refetch';
import { previewContext } from '~/lib/preview';
import { storefrontClientContext } from '~/lib/storefront';
import { registry } from '~/sections';

import type { Route } from './+types/section';

/**
 * `/{market?}/__hcms/section` (T-1.1.7): preview-only data refetch for ONE section or block when
 * the editor changes a setting that needs new data. Requires a valid preview token (cookie,
 * `?hcms_preview=` or `Authorization: Bearer`), so it is never an open GraphQL proxy.
 *
 * Live preview (the page's `useLivePage`): POST { id, section, resource?, parent?, route? } →
 * { data: { 'section:<id>' | 'block:<id>/…': … }, section, assets } — the section through
 * `loadSections` (ONE batched query: its queries + `$source`/`{{token}}` contexts + missing files),
 * bindings resolved for the request's market, the page resource and the shop.
 *
 * Single query: POST { kind: 'section' | 'block', type, settings, resource? } → { data, errors }
 */
type Body = {
  id?: unknown;
  section?: unknown;
  parent?: unknown;
  kind?: unknown;
  type?: unknown;
  settings?: unknown;
  resource?: unknown;
  route?: unknown;
};

async function authorize(
  request: Request,
  context: Route.ActionArgs['context'],
): Promise<PreviewClaims | null> {
  const preview = context.get(previewContext);
  if (preview) return preview.claims;
  const bearer = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  const secret = context.get(envContext).HCMS_PREVIEW_SECRET;
  return bearer && secret ? verifyPreviewToken(bearer, secret) : null;
}

function cors(claims: PreviewClaims | null): HeadersInit {
  return claims
    ? {
        'Access-Control-Allow-Origin': claims.editorOrigin,
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        Vary: 'Origin',
        'Cache-Control': 'no-store',
      }
    : { 'Cache-Control': 'no-store' };
}

const json = (body: unknown, status: number, headers: HeadersInit) =>
  Response.json(body, { status, headers });

/** CORS preflight for the editor origin (the token is checked on the POST itself). */
export function loader({ request }: Route.LoaderArgs) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': request.headers.get('Origin') ?? '',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      },
    });
  }
  return json({ error: 'Use POST' }, 405, { Allow: 'POST, OPTIONS' });
}

export async function action({ request, context }: Route.ActionArgs) {
  const claims = await authorize(request, context);
  const headers = cors(claims);
  if (!claims) return json({ error: 'Preview token required' }, 401, headers);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, headers);
  }

  // Live preview: the page's live section → data + bindings resolved, same path as the page.
  const live = parseSectionRefetch(body);
  if (live) {
    if (!registry.getSection(live.section.type)) {
      return json({ error: `Unknown section type "${live.section.type}"` }, 404, headers);
    }
    const loaded = await loadSections(
      context,
      [{ order: [live.id], sections: { [live.id]: live.section } }],
      live.resource ?? {},
      live.route ? { route: live.route } : {},
    );
    const { document } = context.get(documentContext);
    return json(
      {
        data: sectionSlices(loaded.data, live.id),
        section: loaded.containers[0]?.sections[live.id] ?? null,
        assets: newAssets(loaded.assets, document.assets ?? {}),
      },
      200,
      headers,
    );
  }

  const kind = body.kind === 'block' ? 'block' : 'section';
  const type = typeof body.type === 'string' ? body.type : '';
  const settings =
    body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings)
      ? (body.settings as Record<string, unknown>)
      : {};
  const definition = kind === 'block' ? registry.getBlock(type) : registry.getSection(type);
  if (!definition) return json({ error: `Unknown ${kind} type "${type}"` }, 404, headers);

  const resource =
    body.resource && typeof body.resource === 'object'
      ? (body.resource as { type: string; id?: string; handle?: string })
      : null;
  // Route state (D-22: filters/sort/cursor) the page was loaded with; plain JSON variables.
  const route =
    body.route && typeof body.route === 'object' && !Array.isArray(body.route)
      ? (body.route as Record<string, JsonValue>)
      : undefined;
  const request_ = definition.query?.({ settings, resource, route });
  if (!request_) return json({ data: null, errors: [] }, 200, headers);

  const storefrontClient = context.get(storefrontClientContext);
  const result = await resolveData(
    { refetch: request_ },
    (query, variables) =>
      storefrontClient.graphql(query as never, { variables } as never) as Promise<{
        data?: Record<string, unknown> | null;
        errors?: { message: string; path?: (string | number)[] }[] | null;
      }>,
  );
  return json(
    {
      data: result.data.refetch ?? null,
      errors: [...(result.errors.refetch ?? []), ...result.globalErrors].map((e) => e.message),
    },
    200,
    headers,
  );
}
