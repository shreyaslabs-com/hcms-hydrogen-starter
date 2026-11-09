import { useEffect, useId, useRef, useState, type Ref } from 'react';
import { useFetcher, useLocation } from 'react-router';

import {
  AccountGateView,
  AddressLines,
  Field,
  buttonClass,
  inputClass,
} from '~/components/account/AccountShared';
import { useLocalePath } from '~/components/LocaleLink';
import { countryOptions } from '~/lib/hcms/account';
import type { AddressActionData, AddressesData } from '~/routes/account-addresses';

type SignedIn = Extract<AddressesData, { status: 'signed-in' }>;
type Address = SignedIn['addresses'][number];
type Country = AddressesData['countries'][number];

/**
 * Addresses body (`customers/addresses`, adapter `AddressesPage`, T-2.22), Dawn behaviour: list
 * with the default first, add / edit (inline disclosure forms) and delete. Forms post to the
 * route action (fetchers with JS, plain POST without).
 */
export function AddressesBody({ data, showPhone }: { data: AddressesData; showPhone: boolean }) {
  const { pathname } = useLocation();
  const [adding, setAdding] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  if (data.status !== 'signed-in') return <AccountGateView data={data} returnTo={pathname} />;

  const addresses = [...data.addresses].sort(
    (a, b) => Number(b.id === data.defaultAddressId) - Number(a.id === data.defaultAddressId),
  );
  return (
    <div className="flex flex-col gap-10">
      <div>
        {adding ? (
          <section
            aria-labelledby="new-address-heading"
            className="border-border rounded border p-6"
          >
            <h2 id="new-address-heading" className="type-heading-md mb-4">
              Add a new address
            </h2>
            <AddressForm
              countries={data.countries}
              showPhone={showPhone}
              onDone={() => {
                setAdding(false);
                requestAnimationFrame(() => addButton.current?.focus());
              }}
            />
          </section>
        ) : (
          <button
            ref={addButton}
            type="button"
            onClick={() => setAdding(true)}
            className={`button-primary ${buttonClass}`}
          >
            Add a new address
          </button>
        )}
      </div>
      {addresses.length === 0 ? (
        <p className="text-on-surface-secondary">No addresses saved yet.</p>
      ) : (
        <ul role="list" className="grid gap-6 md:grid-cols-2">
          {addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              isDefault={address.id === data.defaultAddressId}
              countries={data.countries}
              showPhone={showPhone}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AddressCard({
  address,
  isDefault,
  countries,
  showPhone,
}: {
  address: Address;
  isDefault: boolean;
  countries: Country[];
  showPhone: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const remove = useFetcher<AddressActionData>();
  const localize = useLocalePath();
  const headingId = useId();
  const label = address.formatted[0] ?? 'Address';

  return (
    <li className="border-border rounded border p-6">
      <h2 id={headingId} className="type-heading-sm mb-2">
        {isDefault ? 'Default address' : label}
      </h2>
      {editing ? (
        <AddressForm
          address={address}
          isDefault={isDefault}
          countries={countries}
          showPhone={showPhone}
          onDone={() => {
            setEditing(false);
            requestAnimationFrame(() => editButton.current?.focus());
          }}
        />
      ) : (
        <>
          <AddressLines lines={address.formatted} />
          {showPhone && address.phoneNumber ? (
            <p className="text-on-surface-secondary">{address.phoneNumber}</p>
          ) : null}
          {remove.data?.errors.form ? (
            <p role="alert" className="text-critical mt-2 text-sm">
              {remove.data.errors.form}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              ref={editButton}
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`Edit ${label}`}
              className={`button-outline ${buttonClass}`}
            >
              Edit
            </button>
            <remove.Form
              method="post"
              action={localize('/account/addresses')}
              onSubmit={(event) => {
                if (!window.confirm('Delete this address?')) event.preventDefault();
              }}
            >
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="addressId" value={address.id} />
              <button
                type="submit"
                disabled={remove.state !== 'idle'}
                aria-label={`Delete ${label}`}
                className={`button-outline ${buttonClass}`}
              >
                {remove.state !== 'idle' ? 'Deleting…' : 'Delete'}
              </button>
            </remove.Form>
          </div>
        </>
      )}
    </li>
  );
}

function AddressForm({
  address,
  isDefault = false,
  countries,
  showPhone,
  onDone,
}: {
  address?: Address;
  isDefault?: boolean;
  countries: Country[];
  showPhone: boolean;
  onDone: () => void;
}) {
  const fetcher = useFetcher<AddressActionData>();
  const localize = useLocalePath();
  const id = useId();
  const first = useRef<HTMLInputElement>(null);
  const errors = fetcher.data?.errors ?? {};
  const busy = fetcher.state !== 'idle';
  const options = countryOptions(countries, address?.countryCode);

  useEffect(() => first.current?.focus(), []);
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok) onDone();
  }, [fetcher.state, fetcher.data, onDone]);

  const text = (
    name: keyof Address & string,
    label: string,
    autoComplete: string,
    extra: { required?: boolean; ref?: Ref<HTMLInputElement>; type?: string } = {},
  ) => (
    <Field
      id={`${id}-${name}`}
      label={extra.required ? `${label} (required)` : label}
      error={errors[name]}
    >
      {(props) => (
        <input
          {...props}
          ref={extra.ref}
          type={extra.type ?? 'text'}
          name={name}
          autoComplete={autoComplete}
          defaultValue={(address?.[name] as string | null | undefined) ?? ''}
          maxLength={255}
          required={extra.required}
          className={inputClass}
        />
      )}
    </Field>
  );

  return (
    <fetcher.Form
      method="post"
      action={localize('/account/addresses')}
      className="grid gap-4 sm:grid-cols-2"
      noValidate
    >
      <input type="hidden" name="intent" value={address ? 'update' : 'create'} />
      {address ? <input type="hidden" name="addressId" value={address.id} /> : null}
      {errors.form ? (
        <p role="alert" className="text-critical text-sm sm:col-span-2">
          {errors.form}
        </p>
      ) : null}
      {text('firstName', 'First name', 'given-name', { ref: first })}
      {text('lastName', 'Last name', 'family-name')}
      <div className="sm:col-span-2">{text('company', 'Company', 'organization')}</div>
      <div className="sm:col-span-2">
        {text('address1', 'Address', 'address-line1', { required: true })}
      </div>
      <div className="sm:col-span-2">
        {text('address2', 'Apartment, suite, etc.', 'address-line2')}
      </div>
      {text('city', 'City', 'address-level2', { required: true })}
      <Field id={`${id}-countryCode`} label="Country/region (required)" error={errors.countryCode}>
        {(props) => (
          <select
            {...props}
            name="countryCode"
            autoComplete="country"
            defaultValue={address?.countryCode ?? ''}
            required
            className={inputClass}
          >
            <option value="" disabled>
              Select…
            </option>
            {options.map((country) => (
              <option key={country.isoCode} value={country.isoCode}>
                {country.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      {text('zoneCode', 'State/province code', 'address-level1')}
      {text('zip', 'Postal/ZIP code', 'postal-code')}
      {showPhone ? text('phoneNumber', 'Phone', 'tel', { type: 'tel' }) : null}
      <label className="text-on-surface flex min-h-11 items-center gap-3 sm:col-span-2">
        <input
          type="checkbox"
          name="defaultAddress"
          defaultChecked={isDefault}
          className="size-5"
        />
        Set as default address
      </label>
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <button type="submit" disabled={busy} className={`button-primary ${buttonClass}`}>
          {busy ? 'Saving…' : address ? 'Update address' : 'Add address'}
        </button>
        <button type="button" onClick={onDone} className={`button-outline ${buttonClass}`}>
          Cancel
        </button>
      </div>
    </fetcher.Form>
  );
}
