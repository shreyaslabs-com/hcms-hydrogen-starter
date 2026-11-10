import { useLocation } from 'react-router';

import { AccountGateView, AddressLines, dateFormat } from '~/components/account/AccountShared';
import { shopifyImageUrl } from '~/lib/image';
import { formatStatus } from '~/lib/hcms/account';
import { useFormatPrice } from '~/lib/money';
import type { OrderData } from '~/routes/account-order';

type Order = Extract<OrderData, { status: 'signed-in' }>['order'];
type Money = Order['totalPrice'];

/**
 * Order detail body (`customers/order`, adapter `OrderPage`, T-2.22), Dawn layout: title + date,
 * line items table, totals, addresses, shipments. Owns the page `<h1>` (the order name).
 */
export function OrderBody({
  data,
  showImages,
  showTracking,
}: {
  data: OrderData;
  showImages: boolean;
  showTracking: boolean;
}) {
  const { pathname } = useLocation();
  if (data.status !== 'signed-in')
    return (
      <>
        <h1 className="type-heading-xl mb-8">Order</h1>
        <AccountGateView data={data} returnTo={pathname} />
      </>
    );
  const { order } = data;
  return (
    <article aria-labelledby="order-title">
      <header className="mb-8">
        <h1 id="order-title" className="type-heading-xl mb-2">
          Order {order.name}
        </h1>
        <p className="text-on-surface-secondary">
          Placed on{' '}
          <time dateTime={order.processedAt}>{dateFormat.format(new Date(order.processedAt))}</time>
        </p>
        {order.cancelledAt ? (
          <p role="status" className="border-border bg-surface-secondary mt-4 rounded border p-4">
            Order cancelled on{' '}
            <time dateTime={order.cancelledAt}>
              {dateFormat.format(new Date(order.cancelledAt))}
            </time>
          </p>
        ) : null}
      </header>
      <div className="grid gap-12 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-10">
          <LineItems order={order} showImages={showImages} />
          {showTracking ? <Shipments order={order} /> : null}
        </div>
        <aside className="flex flex-col gap-8" aria-label="Order summary">
          <Status order={order} />
          {order.shippingAddress ? (
            <section aria-labelledby="shipping-address-heading">
              <h2 id="shipping-address-heading" className="type-heading-sm mb-2">
                Shipping address
              </h2>
              <AddressLines lines={order.shippingAddress.formatted} />
            </section>
          ) : null}
          {order.billingAddress ? (
            <section aria-labelledby="billing-address-heading">
              <h2 id="billing-address-heading" className="type-heading-sm mb-2">
                Billing address
              </h2>
              <AddressLines lines={order.billingAddress.formatted} />
            </section>
          ) : null}
          <a
            href={order.statusPageUrl}
            className="text-on-surface font-medium underline underline-offset-4"
          >
            View order status page
          </a>
        </aside>
      </div>
    </article>
  );
}

function Status({ order }: { order: Order }) {
  return (
    <section aria-labelledby="order-status-heading">
      <h2 id="order-status-heading" className="type-heading-sm mb-2">
        Status
      </h2>
      <dl className="text-on-surface-secondary grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt>Payment</dt>
        <dd className="text-on-surface">{formatStatus(order.financialStatus) || '—'}</dd>
        <dt>Fulfillment</dt>
        <dd className="text-on-surface">
          {formatStatus(order.fulfillments.nodes[0]?.status) || 'Unfulfilled'}
        </dd>
      </dl>
    </section>
  );
}

function LineItems({ order, showImages }: { order: Order; showImages: boolean }) {
  const formatPrice = useFormatPrice();
  return (
    <section aria-labelledby="order-items-heading">
      <h2 id="order-items-heading" className="type-heading-md mb-4">
        Items
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-start text-sm">
          <thead className="text-on-surface-secondary border-border border-b">
            <tr>
              <th scope="col" className="py-2 pe-4 font-medium">
                Product
              </th>
              <th scope="col" className="py-2 pe-4 text-end font-medium">
                Price
              </th>
              <th scope="col" className="py-2 pe-4 text-end font-medium">
                Quantity
              </th>
              <th scope="col" className="py-2 text-end font-medium">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {order.lineItems.nodes.map((item) => (
              <tr key={item.id}>
                <th scope="row" className="py-4 pe-4 font-normal">
                  <div className="flex items-center gap-4">
                    {showImages && item.image ? (
                      <img
                        src={shopifyImageUrl(item.image.url, { width: 128, height: 128 })}
                        alt={item.image.altText ?? ''}
                        width={64}
                        height={64}
                        loading="lazy"
                        decoding="async"
                        className="bg-surface-secondary size-16 shrink-0 rounded object-cover"
                      />
                    ) : null}
                    <div>
                      <span className="text-on-surface block font-medium">{item.title}</span>
                      {item.variantTitle ? (
                        <span className="text-on-surface-secondary block">{item.variantTitle}</span>
                      ) : null}
                      {item.sku ? (
                        <span className="text-on-surface-secondary block">SKU: {item.sku}</span>
                      ) : null}
                    </div>
                  </div>
                </th>
                <td className="py-4 pe-4 text-end">{item.price ? formatPrice(item.price) : '—'}</td>
                <td className="py-4 pe-4 text-end">{item.quantity}</td>
                <td className="py-4 text-end">
                  {item.totalPrice ? formatPrice(item.totalPrice) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Totals order={order} />
    </section>
  );
}

function discountLabel(node: Order['discountApplications']['nodes'][number]): string {
  if ('code' in node && node.code) return node.code;
  if ('title' in node && node.title) return node.title;
  return 'Discount';
}

function Totals({ order }: { order: Order }) {
  const formatPrice = useFormatPrice();
  const rows: { label: string; value: Money | string | null | undefined; strong?: boolean }[] = [
    { label: 'Subtotal', value: order.subtotal },
    ...order.discountApplications.nodes.map((node) => ({
      label: `Discount (${discountLabel(node)})`,
      value:
        node.value.__typename === 'PricingPercentageValue'
          ? `−${node.value.percentage}%`
          : node.value.__typename === 'MoneyV2'
            ? `−${formatPrice(node.value)}`
            : null,
    })),
    { label: 'Shipping', value: order.totalShipping },
    { label: 'Tax', value: order.totalTax },
    { label: 'Total', value: order.totalPrice, strong: true },
  ];
  if (order.totalRefunded && Number(order.totalRefunded.amount) > 0)
    rows.push({ label: 'Refunded', value: `−${formatPrice(order.totalRefunded)}` });
  return (
    <dl className="border-border ms-auto mt-4 grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-2 border-t pt-4 text-sm">
      {rows
        .filter((row) => row.value != null)
        .map((row) => (
          <div key={row.label} className="contents">
            <dt
              className={row.strong ? 'text-on-surface font-semibold' : 'text-on-surface-secondary'}
            >
              {row.label}
            </dt>
            <dd className={`text-end ${row.strong ? 'text-on-surface font-semibold' : ''}`}>
              {typeof row.value === 'string' ? row.value : formatPrice(row.value as Money)}
            </dd>
          </div>
        ))}
    </dl>
  );
}

function Shipments({ order }: { order: Order }) {
  const shipments = order.fulfillments.nodes.filter((f) => f.trackingInformation.length > 0);
  if (shipments.length === 0) return null;
  return (
    <section aria-labelledby="order-shipments-heading">
      <h2 id="order-shipments-heading" className="type-heading-md mb-4">
        Shipments
      </h2>
      <ul role="list" className="flex flex-col gap-4">
        {shipments.map((fulfillment) => (
          <li key={fulfillment.id} className="border-border rounded border p-4">
            <p className="text-on-surface font-medium">{formatStatus(fulfillment.status)}</p>
            <ul role="list" className="text-on-surface-secondary mt-1 text-sm">
              {fulfillment.trackingInformation.map((tracking, i) => (
                <li key={i}>
                  {[tracking.company, tracking.number].filter(Boolean).join(' · ') || 'Tracking'}
                  {tracking.url && /^https:\/\//.test(tracking.url) ? (
                    <>
                      {' '}
                      <a
                        href={tracking.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-on-surface underline underline-offset-4"
                      >
                        Track shipment<span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
