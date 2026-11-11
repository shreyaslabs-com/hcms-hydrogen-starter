import { AnalyticsEvent } from '@shopify/hydrogen';
import { useCartAnalytics } from '@shopify/hydrogen/react';
import { useEffect } from 'react';
import { useLocation } from 'react-router';

// Cart events published from cart UI (`publishCheckoutStarted`, `publishCartViewed`) live in
// `~/lib/cart-analytics` so this root-chunk module stays small (JS budget).

export function PageViewedTracker() {
  const location = useLocation();
  const pageKey = `${location.pathname}${location.search}`;

  useEffect(() => {
    window.Shopify?.analytics?.publish(AnalyticsEvent.PAGE_VIEWED);
  }, [pageKey]);

  return null;
}

export function CartAnalyticsTracker() {
  useCartAnalytics();
  return null;
}
