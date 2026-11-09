import type { AppComponents } from '@hcms/hydrogen';
import { createContext, useContext, type ReactNode } from 'react';

/**
 * Page-specific adapter slots, provided by the route that renders them (cart, account pages,
 * collection/search) so their code ships in that route's chunk only (T-1.8.1 JS budget).
 * Not `React.lazy`: a lazy slot inside a server-rendered section un-renders while hydrating
 * (CLS 0.49 on collections).
 */
export type RouteSlotValue = Partial<
  Pick<
    AppComponents,
    'CartPage' | 'AccountPage' | 'OrderPage' | 'AddressesPage' | 'BrowseLayout' | 'useNextPage'
  >
>;

const RouteSlotsContext = createContext<RouteSlotValue>({});

export function RouteSlots({ value, children }: { value: RouteSlotValue; children: ReactNode }) {
  return <RouteSlotsContext.Provider value={value}>{children}</RouteSlotsContext.Provider>;
}

export const useRouteSlots = () => useContext(RouteSlotsContext);
