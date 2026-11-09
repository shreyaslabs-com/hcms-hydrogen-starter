import { isRouteErrorResponse, useLocation } from 'react-router';

/**
 * Generic error page body (non-404 route errors): a plain-language message with Try again and
 * home links (S2-2), plus details and the stack in development. Plain `<a>`s: a full reload
 * re-runs the root loader, and they work before hydration.
 */
export function RouteErrorMessage({ error }: { error: unknown }) {
  const { pathname, search } = useLocation();
  let details = 'We couldn’t load this page just now. Please try again in a moment.';
  let stack: string | undefined;

  if (isRouteErrorResponse(error) && error.status === 404) {
    details = 'The requested page could not be found.';
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="max-w-page px-margin mx-auto w-full flex-1 py-16"
    >
      <title>Something went wrong</title>
      <meta name="robots" content="noindex" />
      <div className="mx-auto max-w-xl text-center">
        <h1 className="type-display text-on-surface">Something went wrong</h1>
        <p className="text-on-surface-secondary mt-4">{details}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <a
            href={`${pathname}${search}`}
            className="bg-on-surface text-surface rounded px-5 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            Try again
          </a>
          <a href="/" className="underline underline-offset-2">
            Go to the home page
          </a>
        </div>
      </div>
      {stack ? (
        <pre className="border-border mt-6 w-full overflow-x-auto rounded border p-4 text-sm">
          <code>{stack}</code>
        </pre>
      ) : null}
    </main>
  );
}
