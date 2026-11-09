/**
 * The ONE gtag.js loader for GA4 and Google Ads (pure: globals and the script injector are passed
 * in, so it's unit-tested; only the lazy ad chunk imports it). The first Google tag creates
 * `dataLayer`/`gtag`, sends the Consent Mode v2 defaults and loads gtag.js once; every later tag
 * (another G-/AW- id) only adds its `config` (gtag.js fetches each destination itself).
 */
import { googleConsentDefault } from './ad-events.ts';

type Call = (...args: unknown[]) => void;
export type GtagWin = { dataLayer?: unknown[]; gtag?: Call; hcmsGtagLoaded?: string };

export function startGoogleTag(
  w: GtagWin,
  id: string,
  params: Record<string, unknown> | undefined,
  consent: { analytics: boolean; marketing: boolean },
  addScript: (src: string) => void,
): Call {
  const dataLayer = (w.dataLayer = w.dataLayer ?? []);
  w.gtag =
    w.gtag ??
    function gtag() {
      // gtag.js expects the `arguments` object itself.
      // eslint-disable-next-line prefer-rest-params
      dataLayer.push(arguments);
    };
  if (!w.hcmsGtagLoaded) {
    w.hcmsGtagLoaded = id;
    w.gtag('consent', 'default', googleConsentDefault(consent));
    w.gtag('js', new Date());
    addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
  }
  if (params) w.gtag('config', id, params);
  else w.gtag('config', id);
  return w.gtag;
}
