/**
 * Conditional visibility (T-2.170), request state: the page loaders record the earliest date
 * boundary and whether content depends on the signed-in customer; the root middleware then caps
 * the response's cache lifetime (`applyConditionHeaders`), so a promo never stays cached past its
 * start/end and customer-specific HTML is never shared-cached.
 */
import { createContext } from 'react-router';

export type ConditionsState = { expiresAt: number | null; personal: boolean };

/** Set per request in the root middleware; `null` outside it (tests, library pages). */
export const conditionsContext = createContext<ConditionsState | null>(null);

export function recordConditions(state: ConditionsState | null, applied: ConditionsState): void {
  if (!state) return;
  if (
    applied.expiresAt !== null &&
    (state.expiresAt === null || applied.expiresAt < state.expiresAt)
  )
    state.expiresAt = applied.expiresAt;
  if (applied.personal) state.personal = true;
}
