import type { JsonValue } from '@hcms/schema';
import { parseCollectionParams } from '@shopify/hydrogen';

/**
 * URL → route state for HCMS main sections (D-22): Hydrogen parses filters/sort; cursors and the
 * raw query string (for pagination links) ride along. Plain JSON, used as GraphQL variables.
 */
export function browseRouteState(url: URL): Record<string, JsonValue> {
  const browse = parseCollectionParams(url.searchParams);
  return {
    filters: browse.filters as JsonValue,
    ...(browse.sortKey ? { sortKey: browse.sortKey } : {}),
    reverse: browse.reverse,
    after: url.searchParams.get('after') ?? '',
    before: url.searchParams.get('before') ?? '',
    q: url.searchParams.get('q') ?? '',
    search: url.searchParams.toString(),
  };
}
