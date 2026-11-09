/**
 * Accepted payment methods (theme `cart.payment_icons`) as text chips: the drawer footer
 * (`CartRich`) and the cart page summary under Checkout. Small module: the cart page doesn't load
 * the drawer's icon tables.
 */
import type { PaymentIcon } from '@hcms/schema';

import { useCartDisplay } from './CartOffers';

const PAYMENT_LABELS: Record<PaymentIcon, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  rupay: 'RuPay',
  upi: 'UPI',
  paypal: 'PayPal',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
  shop_pay: 'Shop Pay',
  cod: 'Cash on delivery',
};

export function PaymentChips({ icons }: { icons: PaymentIcon[] }) {
  if (!icons.length) return null;
  return (
    <ul
      role="list"
      aria-label="Accepted payment methods"
      className="flex flex-wrap justify-center gap-1.5"
      data-cart-payments=""
    >
      {icons.map((id) => (
        <li
          key={id}
          className="border-border text-on-surface-secondary rounded border px-2 py-0.5 text-xs"
        >
          {PAYMENT_LABELS[id]}
        </li>
      ))}
    </ul>
  );
}

/** Cart page: the theme's payment chips (nothing when the theme lists none). */
export function CartPaymentIcons({ className }: { className?: string }) {
  const icons = useCartDisplay()?.payments ?? [];
  if (!icons.length) return null;
  return (
    <div className={className}>
      <PaymentChips icons={icons} />
    </div>
  );
}
