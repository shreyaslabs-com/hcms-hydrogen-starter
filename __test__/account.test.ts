import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addressGid,
  countryOptions,
  formatStatus,
  orderGid,
  orderPath,
  parseAddressForm,
  parseProfileForm,
  userErrorsToFields,
} from '../app/lib/hcms/account.ts';

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
};

test('order ids: URL param ↔ GID, only numeric ids', () => {
  assert.equal(orderGid('5512'), 'gid://shopify/Order/5512');
  for (const bad of [undefined, '', 'abc', '12a', '../1', 'gid://shopify/Order/1'])
    assert.equal(orderGid(bad), null, String(bad));
  assert.equal(orderPath('gid://shopify/Order/5512'), '/account/orders/5512');
  assert.equal(orderPath('gid://shopify/Order/5512?key=abc'), '/account/orders/5512');
  assert.equal(orderPath('gid://shopify/Product/1'), null);
});

test('address ids: only CustomerAddress GIDs reach mutations', () => {
  assert.equal(addressGid('gid://shopify/CustomerAddress/9'), 'gid://shopify/CustomerAddress/9');
  assert.equal(
    addressGid('gid://shopify/CustomerAddress/9?model_name=CustomerAddress'),
    'gid://shopify/CustomerAddress/9?model_name=CustomerAddress',
  );
  for (const bad of [null, '', 'gid://shopify/Order/1', 'gid://shopify/CustomerAddress/x'])
    assert.equal(addressGid(bad), null);
});

test('formatStatus humanizes enum values', () => {
  assert.equal(formatStatus('PARTIALLY_REFUNDED'), 'Partially refunded');
  assert.equal(formatStatus(null), '');
});

test('parseAddressForm: valid input → CustomerAddressInput + default flag', () => {
  const result = parseAddressForm(
    form({
      firstName: ' Ada ',
      lastName: 'Lovelace',
      address1: '1 Main St',
      city: 'Toronto',
      countryCode: 'ca',
      zoneCode: 'on',
      zip: 'M5V 1A1',
      phoneNumber: '+1 416 555 0100',
      defaultAddress: 'on',
    }),
  );
  assert.ok(result.ok);
  assert.equal(result.address.firstName, 'Ada');
  assert.equal(result.address.countryCode, 'CA');
  assert.equal(result.address.zoneCode, 'ON');
  assert.equal(result.address.phoneNumber, '+1 416 555 0100');
  assert.equal(result.defaultAddress, true);
});

test('parseAddressForm: required fields and formats', () => {
  const result = parseAddressForm(
    form({ countryCode: 'Canada', zoneCode: 'not a code!', phoneNumber: 'call me' }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(Object.keys(result.errors).sort(), [
    'address1',
    'city',
    'countryCode',
    'phoneNumber',
    'zoneCode',
  ]);
  const noPhone = parseAddressForm(form({ address1: 'a', city: 'b', countryCode: 'US' }));
  assert.ok(noPhone.ok && !('phoneNumber' in noPhone.address) && !noPhone.defaultAddress);
});

test('parseProfileForm trims and caps names', () => {
  assert.deepEqual(parseProfileForm(form({ firstName: ' A ', lastName: 'x'.repeat(300) })), {
    firstName: 'A',
    lastName: 'x'.repeat(255),
  });
});

test('userErrorsToFields maps the last field segment, else form', () => {
  assert.deepEqual(
    userErrorsToFields([
      { field: ['address', 'zip'], message: 'Zip is invalid' },
      { field: null, message: 'Something' },
      { field: ['address', 'zip'], message: 'second' },
    ]),
    { zip: 'Zip is invalid', form: 'Something' },
  );
  assert.deepEqual(userErrorsToFields(undefined), {});
});

test('countryOptions sorts by name and keeps an off-market address country', () => {
  const list = countryOptions(
    [
      { isoCode: 'US', name: 'United States' },
      { isoCode: 'CA', name: 'Canada' },
    ],
    'FR',
  );
  assert.deepEqual(
    list.map((c) => c.isoCode),
    ['FR', 'CA', 'US'],
  );
  assert.equal(countryOptions([{ isoCode: 'CA', name: 'Canada' }], 'CA').length, 1);
});
