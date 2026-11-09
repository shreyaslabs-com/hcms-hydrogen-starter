/**
 * Cursor pagination for connections the collection-browse store doesn't cover (blogs, search
 * results outside it). URL params: `?after=<cursor>` (next) or `?before=<cursor>` (previous).
 */
export type CursorVariables =
  | { first: number; after: string | null; last?: never; before?: never }
  | { last: number; before: string; first?: never; after?: never };

export type PageInfo = {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string | null;
  endCursor?: string | null;
};

/** Reads `before`/`after` from the request; `before` wins (going back). */
export function getCursorVariables(request: Request, pageSize: number): CursorVariables {
  const params = new URL(request.url).searchParams;
  const before = params.get('before');
  if (before) return { last: pageSize, before };
  return { first: pageSize, after: params.get('after') || null };
}

/** Links for previous/next, preserving other query params (filters, `q`). */
export function paginationLinks(
  request: Request,
  pageInfo: PageInfo,
): { previous: string | null; next: string | null } {
  const url = new URL(request.url);
  const make = (key: 'before' | 'after', cursor: string) => {
    const params = new URLSearchParams(url.searchParams);
    params.delete('before');
    params.delete('after');
    params.set(key, cursor);
    return `${url.pathname}?${params.toString()}`;
  };
  return {
    previous:
      pageInfo.hasPreviousPage && pageInfo.startCursor
        ? make('before', pageInfo.startCursor)
        : null,
    next: pageInfo.hasNextPage && pageInfo.endCursor ? make('after', pageInfo.endCursor) : null,
  };
}
