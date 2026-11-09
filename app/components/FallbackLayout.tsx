/**
 * The starter's own header and footer, shown only when the theme document has no header/footer
 * group (a document without groups, or the slow-upstream fallback layout). Kept in its own chunk
 * (root lazy-loads it) so every normal page doesn't ship it in the shared bundle (JS budget).
 */
import type { StorefrontShop } from '~/lib/storefront-shop';

import { AnnouncementBar } from './AnnouncementBar';
import { Footer } from './Footer';
import { Header } from './Header';

export function FallbackHeader({ shopInfo }: { shopInfo: StorefrontShop }) {
  return (
    <>
      <AnnouncementBar />
      <Header shopInfo={shopInfo} />
    </>
  );
}

export function FallbackFooter({ shopInfo }: { shopInfo: StorefrontShop }) {
  return <Footer shopInfo={shopInfo} />;
}
