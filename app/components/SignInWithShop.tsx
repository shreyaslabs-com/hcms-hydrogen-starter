import { useLocation, useRouteLoaderData } from 'react-router';

type RootData = { customerSignedIn?: boolean | null };

/**
 * Adapter `SignInWithShop` (T-2.50): signed-out shoppers get a Shop-branded link to customer
 * accounts sign-in (Hydrogen's `/account/login`; Shopify's login page offers Shop), returning to
 * this page. Nothing when signed in or without customer accounts. A plain `<a>`: the OAuth
 * redirect needs a full page navigation.
 */
export function SignInWithShop({ label }: { label: string }) {
  const signedIn = useRouteLoaderData<RootData>('root')?.customerSignedIn;
  const location = useLocation();
  if (signedIn !== false) return null;
  const returnTo = `${location.pathname}${location.search}`;
  return (
    <a
      href={`/account/login?return_to=${encodeURIComponent(returnTo)}`}
      className="rounded-button focus-visible:outline-accent inline-flex h-11 w-full items-center justify-center bg-[#5a31f4] px-4 text-sm font-medium text-white no-underline hover:bg-[#3c0ac9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {label}
    </a>
  );
}
