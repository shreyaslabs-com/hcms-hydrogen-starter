import { Link } from '~/components/LocaleLink';

const linkClass =
  'border-border inline-block rounded border px-5 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current';

/** Previous/next links from `paginationLinks()`. Renders nothing when there's one page. */
export function CursorPagination({
  previous,
  next,
  previousLabel = 'Previous',
  nextLabel = 'Next',
}: {
  previous: string | null;
  next: string | null;
  previousLabel?: string;
  nextLabel?: string;
}) {
  if (!previous && !next) return null;
  return (
    <nav aria-label="Pagination" className="mt-10 flex justify-center gap-4">
      {previous ? (
        <Link to={previous} rel="prev" className={linkClass}>
          {previousLabel}
        </Link>
      ) : null}
      {next ? (
        <Link to={next} rel="next" className={linkClass}>
          {nextLabel}
        </Link>
      ) : null}
    </nav>
  );
}
