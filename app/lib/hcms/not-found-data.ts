import type { TemplatePage } from './page';

/** Payload of a themed 404 (thrown as route error data by `throwNotFound`). */
export type NotFoundData = { hcms: TemplatePage | null; origin: string };

/** Narrows a route error's `data` to a themed 404 payload (null = render the app's NotFound). */
export function notFoundPage(value: unknown): { hcms: TemplatePage; origin: string } | null {
  if (!value || typeof value !== 'object') return null;
  const { hcms, origin } = value as Partial<NotFoundData>;
  return hcms && typeof hcms === 'object' && typeof origin === 'string' ? { hcms, origin } : null;
}
