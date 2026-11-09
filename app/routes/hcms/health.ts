import { SDK_VERSION } from '@hcms/hydrogen';

import { documentContext } from '~/lib/hcms/document';
import { healthReport } from '~/lib/hcms/health';
import { REPORT_PARAM, reportHealth, reportPage } from '~/lib/hcms/health-report';
import { envContext } from '~/lib/env';
import { previewContext } from '~/lib/preview';

import type { Route } from './+types/health';

/**
 * `/__hcms/health` (T-1.1.7): which fallback tier served this request and which tiers failed,
 * plus whether the HCMS settings are present (T-1.5.1 onboarding check). Never cached.
 * With `hcms_report=1` (private environments: opened by the merchant from the setup wizard) it
 * also posts the report to the admin, signed, and answers with a short HTML page.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const state = context.get(documentContext);
  const env = context.get(envContext);
  const previewVerified = context.get(previewContext) !== null;
  const report = healthReport({
    source: state.source,
    failures: state.failures,
    sdkVersion: SDK_VERSION,
    env,
    previewVerified,
  });
  const url = new URL(request.url);
  if (url.searchParams.get(REPORT_PARAM) === '1')
    return reportPage(await reportHealth({ report, env, origin: url.origin, previewVerified }));
  return Response.json(report, { headers: { 'Cache-Control': 'no-store' } });
}
