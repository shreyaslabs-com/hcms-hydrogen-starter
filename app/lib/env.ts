import { createContext } from 'react-router';

export type Env = {
  /** HCMS admin base URL; newsletter/contact forms forward here (D-21). Unset = forms answer 503. */
  HCMS_API_URL?: string;
  /** Public read key for the HCMS read API (T-1.4.9). With HCMS_API_URL: API tier before the mirror. */
  HCMS_PUBLIC_KEY?: string;
  /** HCMS snapshot CDN (Cloudflare R2 + KV, T-0.8), e.g. https://cdn.hydrogencms.com. Tried first. */
  HCMS_CDN_URL?: string;
  /** Signs editor preview tokens (T-1.2.7). Unset = preview off. Set per store during onboarding. */
  HCMS_PREVIEW_SECRET?: string;
  /** "Install HydrogenCMS" button on the setup screen (shown while no HCMS_* variable is set). */
  HCMS_INSTALL_URL?: string;
  MOCK_SHOP?: string;
  PRIVATE_STOREFRONT_API_TOKEN?: string;
  PUBLIC_CHECKOUT_DOMAIN?: string;
  PUBLIC_STORE_DOMAIN?: string;
  PUBLIC_STOREFRONT_ID?: string;
  PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID?: string;
  SESSION_SECRET?: string;
  SHOP_ID?: string;
  /** Shiprocket serviceability for the delivery check block (T-2.82); server-side only. */
  SHIPROCKET_EMAIL?: string;
  SHIPROCKET_PASSWORD?: string;
  SHIPROCKET_PICKUP_PINCODE?: string;
  SHIPROCKET_WEIGHT_KG?: string;
};

export const envContext = createContext<Env>();
