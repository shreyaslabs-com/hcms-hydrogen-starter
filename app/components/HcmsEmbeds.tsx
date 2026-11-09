/**
 * Embeds Manager (T-2.9) in the browser: Custom HTML embeds and the Shopify Inbox chat. The root
 * loader sends this market's embeds (HTML already sanitized); here they are filtered by
 * template/path and gated on the visitor's Customer Privacy consent. Script-type tags (pixels,
 * analytics, app integrations) live in the lazy `HcmsEmbedScripts`.
 */
import { createElement } from 'react';
import { useLocation } from 'react-router';
import { useConsent } from '@hcms/hydrogen';

import { consentAllows, embedTargets, inboxEmbeds } from '~/lib/hcms/embed-targeting';
import type { ClientEmbed } from '~/lib/hcms/embeds';

/**
 * Shopify Inbox chat (T-2.54): the root passes `inbox` to ShopifyScripts when any Inbox embed is
 * on for this market; `<shopify-chat>` shows the chat where template/path targeting allows.
 */
export function HcmsInbox({ embeds }: { embeds: ClientEmbed[] }) {
  const { pathname } = useLocation();
  return inboxEmbeds(embeds).some((e) => embedTargets(e, pathname))
    ? createElement('shopify-chat')
    : null;
}

/** Custom HTML embeds for one placement. Ungated (`none`) ones render on the server too. */
export function HcmsEmbedHtml({
  embeds,
  placement,
}: {
  embeds: ClientEmbed[];
  placement: ClientEmbed['placement'];
}) {
  const consent = useConsent();
  const { pathname } = useLocation();
  const visible = embeds.filter(
    (e) =>
      e.type === 'html' &&
      e.placement === placement &&
      embedTargets(e, pathname) &&
      consentAllows(e.consent, consent),
  );
  if (!visible.length) return null;
  return (
    <>
      {visible.map((e) => (
        // Sanitized by the root loader (sections `sanitizeHtml`: no scripts/handlers).
        <div key={e.id} data-hcms-embed={e.id} dangerouslySetInnerHTML={{ __html: e.value }} />
      ))}
    </>
  );
}
