/**
 * Storefront-reported setup check (T-1.5.1). Development stores can only have private Oxygen
 * environments, so the admin can't call `/__hcms/health` itself. Its setup wizard instead links
 * the merchant (signed in as staff) to `/__hcms/health?hcms_preview=<token>&hcms_report=1`; this
 * posts the health report to the admin, signed with `HCMS_PREVIEW_SECRET` (same scheme as form
 * forwards), which also proves the secret matches. Returns the text shown in that tab.
 */
import { sign } from './forms.ts';

export const REPORT_PARAM = 'hcms_report';

const UNREACHABLE =
  'Couldn’t reach HCMS at HCMS_API_URL. Copy the current value from HCMS › Setup (a dev tunnel URL changes when the app restarts), update it in Hydrogen › Environments and variables, and redeploy.';

export type ReportEnv = {
  HCMS_API_URL?: string | undefined;
  HCMS_PREVIEW_SECRET?: string | undefined;
  PUBLIC_STORE_DOMAIN?: string | undefined;
};

export type ReportResult = { ok: boolean; message: string };

export async function reportHealth({
  report,
  env,
  origin,
  previewVerified,
  fetchImpl = fetch,
  now = () => Date.now(),
}: {
  report: object;
  env: ReportEnv;
  origin: string;
  previewVerified: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<ReportResult> {
  const api = env.HCMS_API_URL?.trim();
  const secret = env.HCMS_PREVIEW_SECRET?.trim();
  const shop = env.PUBLIC_STORE_DOMAIN?.trim();
  if (!api) return { ok: false, message: 'HCMS_API_URL is missing on this storefront.' };
  if (!secret) return { ok: false, message: 'HCMS_PREVIEW_SECRET is missing on this storefront.' };
  if (!shop) return { ok: false, message: 'PUBLIC_STORE_DOMAIN is missing on this storefront.' };
  if (!previewVerified)
    return {
      ok: false,
      message:
        'The link expired or HCMS_PREVIEW_SECRET doesn’t match. Copy it again from HCMS › Setup, redeploy, and check again.',
    };
  const payload = JSON.stringify({
    shop,
    kind: 'health',
    ts: Math.floor(now() / 1000),
    url: origin,
    report,
  });
  try {
    const res = await fetchImpl(`${api.replace(/\/+$/, '')}/api/storefront/health`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-HCMS-Shop': shop,
        'X-HCMS-Signature': await sign(secret, payload),
      },
      body: payload,
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok)
      return {
        ok: true,
        message: 'Connected. Go back to HCMS and press Refresh.',
      };
    if (res.status === 401)
      return {
        ok: false,
        message:
          'HCMS rejected the signature: HCMS_PREVIEW_SECRET or PUBLIC_STORE_DOMAIN doesn’t match this app install.',
      };
    // 502–504 / Cloudflare 52x–530: nothing answering at HCMS_API_URL (often a stale dev tunnel).
    if (res.status >= 502 && res.status <= 530) return { ok: false, message: UNREACHABLE };
    return { ok: false, message: `HCMS answered ${res.status}. Try again in a minute.` };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}

/** Minimal page for the tab (no scripts; messages are fixed strings, escaped anyway). */
export function reportPage({ ok, message }: ReportResult): Response {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const title = ok ? 'HCMS: storefront connected' : 'HCMS: check failed';
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head><body><main><h1>${esc(title)}</h1><p>${esc(message)}</p></main></body></html>`,
    {
      status: ok ? 200 : 422,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    },
  );
}
