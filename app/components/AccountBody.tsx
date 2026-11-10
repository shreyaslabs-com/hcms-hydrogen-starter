import { useEffect, useId, useRef, useState } from 'react';
import { useFetcher, useLocation, useNavigation } from 'react-router';

import {
  AccountGateView,
  AddressLines,
  Field,
  LogoutForm,
  buttonClass,
  dateFormat,
  inputClass,
} from '~/components/account/AccountShared';
import { Link, useLocalePath } from '~/components/LocaleLink';
import { formatStatus, orderPath } from '~/lib/hcms/account';
import { useFormatPrice } from '~/lib/money';
import type { loader, ProfileActionData } from '~/routes/account';

export type AccountData = Awaited<ReturnType<typeof loader>>;

/** Account page body (`customers/account`, adapter `AccountPage`): profile, address, orders. */
export function AccountBody({
  data,
  showOrders = true,
  showProfile = true,
  showAddresses = true,
}: {
  data: AccountData;
  showOrders?: boolean;
  showProfile?: boolean;
  showAddresses?: boolean;
}) {
  const { pathname } = useLocation();
  if (data.status !== 'signed-in') return <AccountGateView data={data} returnTo={pathname} />;
  return (
    <Customer
      customer={data.customer}
      showOrders={showOrders}
      showProfile={showProfile}
      showAddresses={showAddresses}
    />
  );
}

type Customer = Extract<AccountData, { status: 'signed-in' }>['customer'];

function Customer({
  customer,
  showOrders,
  showProfile,
  showAddresses,
}: {
  customer: Customer;
  showOrders: boolean;
  showProfile: boolean;
  showAddresses: boolean;
}) {
  const aside = showProfile || showAddresses;
  return (
    <div className={aside && showOrders ? 'grid gap-12 lg:grid-cols-[1fr_2fr]' : 'grid gap-12'}>
      <div className="flex flex-col gap-10">
        {showProfile ? <Profile customer={customer} /> : null}
        {showAddresses ? <DefaultAddress customer={customer} /> : null}
        {showProfile ? null : <LogoutForm />}
      </div>
      {showOrders ? <Orders orders={customer.orders} /> : null}
    </div>
  );
}

function Profile({ customer }: { customer: Customer }) {
  const [editing, setEditing] = useState(false);
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ');
  return (
    <section aria-labelledby="profile-heading">
      <h2 id="profile-heading" className="type-heading-md text-on-surface mb-3">
        Account details
      </h2>
      {editing ? (
        <ProfileForm customer={customer} onDone={() => setEditing(false)} />
      ) : (
        <>
          <dl className="text-on-surface-secondary flex flex-col gap-1">
            {name ? (
              <div>
                <dt className="sr-only">Name</dt>
                <dd className="text-on-surface font-medium">{name}</dd>
              </div>
            ) : null}
            {customer.emailAddress?.emailAddress ? (
              <div>
                <dt className="sr-only">Email</dt>
                <dd>{customer.emailAddress.emailAddress}</dd>
              </div>
            ) : null}
            {customer.phoneNumber?.phoneNumber ? (
              <div>
                <dt className="sr-only">Phone</dt>
                <dd>{customer.phoneNumber.phoneNumber}</dd>
              </div>
            ) : null}
          </dl>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={`button-outline mt-4 ${buttonClass}`}
          >
            Edit name
          </button>
        </>
      )}
      <LogoutForm />
    </section>
  );
}

function ProfileForm({ customer, onDone }: { customer: Customer; onDone: () => void }) {
  const fetcher = useFetcher<ProfileActionData>();
  const localize = useLocalePath();
  const id = useId();
  const first = useRef<HTMLInputElement>(null);
  const errors = fetcher.data?.errors ?? {};
  const busy = fetcher.state !== 'idle';

  useEffect(() => first.current?.focus(), []);
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok) onDone();
  }, [fetcher.state, fetcher.data, onDone]);

  return (
    <fetcher.Form method="post" action={localize('/account')} className="flex flex-col gap-4">
      <input type="hidden" name="intent" value="profile" />
      {errors.form ? (
        <p role="alert" className="text-critical text-sm">
          {errors.form}
        </p>
      ) : null}
      <Field id={`${id}-first`} label="First name" error={errors.firstName}>
        {(props) => (
          <input
            {...props}
            ref={first}
            name="firstName"
            autoComplete="given-name"
            defaultValue={customer.firstName ?? ''}
            maxLength={255}
            className={inputClass}
          />
        )}
      </Field>
      <Field id={`${id}-last`} label="Last name" error={errors.lastName}>
        {(props) => (
          <input
            {...props}
            name="lastName"
            autoComplete="family-name"
            defaultValue={customer.lastName ?? ''}
            maxLength={255}
            className={inputClass}
          />
        )}
      </Field>
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy}
          aria-disabled={busy}
          className={`button-primary ${buttonClass}`}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onDone} className={`button-outline ${buttonClass}`}>
          Cancel
        </button>
      </div>
    </fetcher.Form>
  );
}

function DefaultAddress({ customer }: { customer: Customer }) {
  return (
    <section aria-labelledby="default-address-heading">
      <h2 id="default-address-heading" className="type-heading-md text-on-surface mb-3">
        Default address
      </h2>
      {customer.defaultAddress ? (
        <AddressLines lines={customer.defaultAddress.formatted} />
      ) : (
        <p className="text-on-surface-secondary">No address saved yet.</p>
      )}
      <Link
        to="/account/addresses"
        className="text-on-surface mt-3 inline-block font-medium underline underline-offset-4"
      >
        Manage addresses
      </Link>
    </section>
  );
}

function Orders({ orders }: { orders: Customer['orders'] }) {
  const formatPrice = useFormatPrice();
  const navigation = useNavigation();
  const localize = useLocalePath();
  const isPaging =
    navigation.state === 'loading' && navigation.location?.pathname === localize('/account');
  const { pageInfo } = orders;

  return (
    <section aria-labelledby="orders-heading">
      <h2 id="orders-heading" className="type-heading-md text-on-surface mb-4">
        Order history
      </h2>
      {orders.nodes.length === 0 ? (
        <div>
          <p className="text-on-surface font-medium">You haven&apos;t placed any orders yet.</p>
          <Link to="/collections" className={`button-primary mt-6 ${buttonClass}`}>
            Continue shopping
          </Link>
        </div>
      ) : (
        <ul
          role="list"
          aria-busy={isPaging}
          className={`divide-border divide-y ${isPaging ? 'opacity-50' : ''}`}
        >
          {orders.nodes.map((order) => {
            const path = orderPath(order.id);
            const fulfillment = order.fulfillments.nodes[0]?.status;
            return (
              <li key={order.id} className="flex flex-wrap items-baseline gap-x-6 gap-y-1 py-4">
                {path ? (
                  <Link
                    to={path}
                    className="text-on-surface font-medium underline-offset-4 hover:underline"
                  >
                    Order {order.name}
                  </Link>
                ) : (
                  <span className="text-on-surface font-medium">Order {order.name}</span>
                )}
                <time dateTime={order.processedAt} className="text-on-surface-secondary text-sm">
                  {dateFormat.format(new Date(order.processedAt))}
                </time>
                <span className="text-on-surface-secondary text-sm">
                  {formatStatus(order.financialStatus)}
                  {fulfillment ? ` · ${formatStatus(fulfillment)}` : ''}
                </span>
                <span className="text-on-surface ms-auto font-medium">
                  {formatPrice(order.totalPrice)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {pageInfo.hasPreviousPage || pageInfo.hasNextPage ? (
        <nav aria-label="Orders pagination" className="mt-6 flex justify-between gap-4">
          {pageInfo.hasPreviousPage && pageInfo.startCursor ? (
            <Link
              to={`?before=${encodeURIComponent(pageInfo.startCursor)}`}
              preventScrollReset
              className={`button-outline ${buttonClass}`}
            >
              Newer orders
            </Link>
          ) : (
            <span />
          )}
          {pageInfo.hasNextPage && pageInfo.endCursor ? (
            <Link
              to={`?after=${encodeURIComponent(pageInfo.endCursor)}`}
              preventScrollReset
              className={`button-outline ${buttonClass}`}
            >
              Older orders
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
