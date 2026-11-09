/** Password gate helpers (T-2.21), pure for tests. */
import { GATE_PATH } from '@hcms/hydrogen';

/** `/fr-ca/products/x` → `/fr-ca/password` (the visitor's market). */
export function gatePath(pathname: string): string {
  const locale = /^\/([a-z]{2}-[a-z]{2})(?=\/|$)/i.exec(pathname)?.[1];
  return locale ? `/${locale}${GATE_PATH}` : GATE_PATH;
}

/** Only same-site paths are valid return targets (no `//host`, no `/\\host`, no schemes). */
export function safeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || /^\/[/\\]/.test(raw) || raw.length > 2000) return '/';
  return raw.includes(GATE_PATH) ? '/' : raw;
}
