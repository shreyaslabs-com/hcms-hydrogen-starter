import { Form, Link } from '~/components/LocaleLink';

/** 404 page: says what happened and offers search and the main ways back into the store. */
export function NotFound() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="max-w-page px-margin mx-auto w-full flex-1 py-16"
    >
      <title>Page not found</title>
      <meta name="robots" content="noindex" />
      <div className="mx-auto max-w-xl text-center">
        <p className="text-on-surface-secondary text-sm font-medium">404</p>
        <h1 className="type-display text-on-surface mt-2">Page not found</h1>
        <p className="text-on-surface-secondary mt-4">
          The page you're looking for doesn't exist or has moved. Try searching for it instead.
        </p>
        <Form method="get" action="/search" role="search" className="mt-8 flex gap-2">
          <label htmlFor="not-found-search" className="sr-only">
            Search the store
          </label>
          <input
            id="not-found-search"
            type="search"
            name="q"
            placeholder="Search products"
            className="border-border min-w-0 flex-1 rounded border px-4 py-3"
          />
          <button
            type="submit"
            className="bg-on-surface text-surface rounded px-5 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            Search
          </button>
        </Form>
        <ul role="list" className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2">
          <li>
            <Link to="/" className="underline underline-offset-2">
              Home
            </Link>
          </li>
          <li>
            <Link to="/collections" className="underline underline-offset-2">
              All collections
            </Link>
          </li>
          <li>
            <Link to="/cart" className="underline underline-offset-2">
              Cart
            </Link>
          </li>
        </ul>
      </div>
    </main>
  );
}
