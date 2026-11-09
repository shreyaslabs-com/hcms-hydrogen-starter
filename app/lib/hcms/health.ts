/**
 * `/__hcms/health` body (T-1.1.7, onboarding checks T-1.5.1). No secrets or document content:
 * only which tier served, which tiers failed, and whether the HCMS settings are present.
 * `preview` = a preview token on this request verified, which proves `HCMS_PREVIEW_SECRET`
 * matches the admin's (the onboarding check signs one).
 */
export type HealthInput = {
  source: string;
  failures: { tier: string; error: { code: string; message: string } }[];
  sdkVersion: string;
  env: {
    HCMS_API_URL?: string | undefined;
    HCMS_PREVIEW_SECRET?: string | undefined;
    HCMS_PUBLIC_KEY?: string | undefined;
  };
  previewVerified: boolean;
  now?: Date;
};

export function healthReport({
  source,
  failures,
  sdkVersion,
  env,
  previewVerified,
  now = new Date(),
}: HealthInput) {
  // NOT_FOUND = nothing published yet (new store): expected, not an outage.
  const failed = failures.some((f) => f.error.code !== 'NOT_FOUND');
  const status = failed ? 'degraded' : source === 'bundled' ? 'unpublished' : 'ok';
  return {
    status,
    sdkVersion,
    documentSource: source,
    failures: failures.map((f) => ({ tier: f.tier, code: f.error.code, message: f.error.message })),
    config: {
      apiUrl: Boolean(env.HCMS_API_URL),
      previewSecret: Boolean(env.HCMS_PREVIEW_SECRET),
      publicKey: Boolean(env.HCMS_PUBLIC_KEY),
    },
    preview: previewVerified,
    time: now.toISOString(),
  };
}
