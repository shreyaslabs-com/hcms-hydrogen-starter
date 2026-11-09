/**
 * Automated visits (headless browsers, Lighthouse/PageSpeed, WebPageTest, crawlers) never count
 * towards real-user speed (T-2.15): the browser skips them in `rum-client.ts` and the beacon
 * route drops them by request user agent. Pure, tiny: shared by both sides.
 */
const AUTOMATED_UA = /HeadlessChrome|Lighthouse|PTST|bot\b|crawler|spider/i;

export const isAutomatedAgent = (userAgent: string | null | undefined): boolean =>
  !!userAgent && AUTOMATED_UA.test(userAgent);

type NavigatorLike = {
  webdriver?: boolean;
  userAgent?: string;
  userAgentData?: { brands?: readonly { brand: string }[] };
};

/** True for WebDriver/Playwright/Puppeteer sessions, headless brands and known test agents. */
export function isAutomatedBrowser(nav: NavigatorLike): boolean {
  if (nav.webdriver === true) return true;
  if (isAutomatedAgent(nav.userAgent)) return true;
  return !!nav.userAgentData?.brands?.some((b) => /headless/i.test(b.brand));
}
