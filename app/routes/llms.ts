import { documentContext } from '~/lib/hcms/document';
import { llmsResponse, llmsSettings } from '~/lib/hcms/llms';
import { loadLlmsData } from '~/lib/llms-data';
import { previewContext } from '~/lib/preview';
import { storefrontClientContext } from '~/lib/storefront';

import type { Route } from './+types/llms';

/** `/llms.txt` (llmstxt.org): store map for AI assistants; 404 when the merchant turns it off. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { document } = context.get(documentContext);
  const settings = llmsSettings(document.seo?.llms);
  const url = new URL(request.url);
  const data = settings.enabled ? await loadLlmsData(context.get(storefrontClientContext)) : null;
  return llmsResponse({
    origin: url.origin,
    settings,
    data,
    robots: document.seo?.robots,
    overrides: document.seo?.overrides,
    fallbackName: url.hostname,
    preview: context.get(previewContext) !== null,
  });
}
