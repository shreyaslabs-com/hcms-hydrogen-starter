/**
 * Customer account pages (T-2.22): session + Customer Account API documents shared by the
 * `/account`, `/account/orders/:id` and `/account/addresses` routes. Server-only: tokens never
 * reach loader data. All documents validated against Customer Account API 2026-10 (Dev MCP).
 */
import { gql } from '@shopify/hydrogen/customer-account';
import type { RouterContextProvider } from 'react-router';

import { customerAccountContext, type CustomerAccount } from '~/lib/customer-account';

export type AccountSession =
  | { status: 'unavailable' }
  | { status: 'signed-out'; loginFailed: boolean }
  | { status: 'ready'; client: CustomerAccount['client']; accessToken: string };

/**
 * The signed-in customer's client + access token. Refreshing writes the session cookie, which the
 * root middleware commits on the response. Reading the token marks the response personalized.
 */
export async function accountSession(
  context: Readonly<RouterContextProvider>,
  request: Request,
): Promise<AccountSession> {
  const customerAccount = context.get(customerAccountContext);
  if (!customerAccount) {
    // Shoppers see generic copy (SF-10); the setup details are for the developer's logs only.
    console.warn(
      '[hcms] Customer Accounts unavailable: needs a real store, SHOP_ID, PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID, SESSION_SECRET and HTTPS (npm run dev:https locally).',
    );
    return { status: 'unavailable' };
  }
  const { client, session, sessionManager, requestContext } = customerAccount;
  const accessToken = await session.getOrRefreshAccessToken(sessionManager, requestContext);
  if (!accessToken) {
    const loginFailed = new URL(request.url).searchParams.get('login') === 'failed';
    return { status: 'signed-out', loginFailed };
  }
  return { status: 'ready', client, accessToken };
}

export const ACCOUNT_QUERY = gql(`
  query AccountPage($first: Int, $after: String, $last: Int, $before: String) {
    customer {
      firstName
      lastName
      emailAddress {
        emailAddress
      }
      phoneNumber {
        phoneNumber
      }
      defaultAddress {
        id
        formatted(withName: true, withCompany: true)
      }
      orders(
        first: $first
        after: $after
        last: $last
        before: $before
        sortKey: PROCESSED_AT
        reverse: true
      ) {
        nodes {
          id
          name
          processedAt
          financialStatus
          fulfillments(first: 1) {
            nodes {
              status
            }
          }
          totalPrice {
            amount
            currencyCode
          }
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
      }
    }
  }
`);

export const CUSTOMER_UPDATE_MUTATION = gql(`
  mutation AccountProfileUpdate($input: CustomerUpdateInput!) {
    customerUpdate(input: $input) {
      customer {
        firstName
        lastName
      }
      userErrors {
        code
        field
        message
      }
    }
  }
`);

export const ORDER_QUERY = gql(`
  query AccountOrder($id: ID!) {
    order(id: $id) {
      id
      name
      processedAt
      cancelledAt
      financialStatus
      statusPageUrl
      subtotal {
        amount
        currencyCode
      }
      totalShipping {
        amount
        currencyCode
      }
      totalTax {
        amount
        currencyCode
      }
      totalPrice {
        amount
        currencyCode
      }
      totalRefunded {
        amount
        currencyCode
      }
      discountApplications(first: 10) {
        nodes {
          value {
            __typename
            ... on MoneyV2 {
              amount
              currencyCode
            }
            ... on PricingPercentageValue {
              percentage
            }
          }
          ... on DiscountCodeApplication {
            code
          }
          ... on AutomaticDiscountApplication {
            title
          }
          ... on ManualDiscountApplication {
            title
          }
          ... on ScriptDiscountApplication {
            title
          }
        }
      }
      shippingAddress {
        formatted(withName: true, withCompany: true)
      }
      billingAddress {
        formatted(withName: true, withCompany: true)
      }
      fulfillments(first: 10) {
        nodes {
          id
          status
          updatedAt
          trackingInformation {
            company
            number
            url
          }
        }
      }
      lineItems(first: 100) {
        nodes {
          id
          title
          variantTitle
          sku
          quantity
          image {
            url
            altText
            width
            height
          }
          price {
            amount
            currencyCode
          }
          totalPrice {
            amount
            currencyCode
          }
          totalDiscount {
            amount
            currencyCode
          }
        }
      }
    }
  }
`);

export const ADDRESSES_QUERY = gql(`
  query AccountAddresses {
    customer {
      defaultAddress {
        id
      }
      addresses(first: 50) {
        nodes {
          id
          firstName
          lastName
          company
          address1
          address2
          city
          zoneCode
          countryCode
          zip
          phoneNumber
          formatted(withName: true, withCompany: true)
        }
      }
    }
  }
`);

export const ADDRESS_CREATE_MUTATION = gql(`
  mutation AccountAddressCreate($address: CustomerAddressInput!, $defaultAddress: Boolean) {
    customerAddressCreate(address: $address, defaultAddress: $defaultAddress) {
      customerAddress {
        id
      }
      userErrors {
        code
        field
        message
      }
    }
  }
`);

export const ADDRESS_UPDATE_MUTATION = gql(`
  mutation AccountAddressUpdate(
    $addressId: ID!
    $address: CustomerAddressInput
    $defaultAddress: Boolean
  ) {
    customerAddressUpdate(addressId: $addressId, address: $address, defaultAddress: $defaultAddress) {
      customerAddress {
        id
      }
      userErrors {
        code
        field
        message
      }
    }
  }
`);

export const ADDRESS_DELETE_MUTATION = gql(`
  mutation AccountAddressDelete($addressId: ID!) {
    customerAddressDelete(addressId: $addressId) {
      deletedAddressId
      userErrors {
        code
        field
        message
      }
    }
  }
`);
