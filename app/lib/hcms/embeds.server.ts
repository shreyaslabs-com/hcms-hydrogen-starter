/** Root-loader side of the Embeds Manager (T-2.9): keeps the sanitizer out of the client bundle. */
import { sanitizeHtml } from '@hcms/sections';

import { clientEmbeds, enabledIntegrations, type ClientEmbed } from './embeds';
import type { Vendor } from './integrations';

export function loadClientEmbeds(
  embeds: unknown,
  {
    country,
    preview,
    shopDomain,
  }: { country: string; preview: boolean; shopDomain?: string | undefined },
): { embeds: ClientEmbed[]; integrations: Vendor[] } {
  return {
    embeds: clientEmbeds(embeds, { country, preview, sanitize: sanitizeHtml, shopDomain }),
    integrations: enabledIntegrations(embeds, { country, shopDomain }),
  };
}

/**
 * S2-3: drops the Judge.me embed (its browser loader) when the server knows the shop isn't on
 * Judge.me. `integrations` keep it, so review containers render as before (empty, 0 px).
 */
export function withoutJudgeme<T extends { embeds: ClientEmbed[] }>(loaded: T, off: boolean): T {
  return off ? { ...loaded, embeds: loaded.embeds.filter((e) => e.type !== 'judgeme') } : loaded;
}
