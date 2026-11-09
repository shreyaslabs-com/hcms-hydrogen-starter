import type { ReactNode } from 'react';
import { JsonLd } from '~/components/JsonLd';
import { Link } from '~/components/LocaleLink';

export type Crumb = { label: string; to?: string };

const linkClass =
  'hover:text-on-surface rounded-sm py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current motion-safe:transition-colors';

/** Breadcrumb trail; the last crumb is the current page. Includes BreadcrumbList JSON-LD. */
export function Breadcrumbs({ crumbs, origin }: { crumbs: Crumb[]; origin: string }) {
  const all: Crumb[] = [{ label: 'Home', to: '/' }, ...crumbs];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: all.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      ...(crumb.to ? { item: `${origin}${crumb.to}` } : {}),
    })),
  };

  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <JsonLd data={jsonLd} />
      <ol className="text-on-surface-secondary flex flex-wrap items-center gap-1.5 text-sm">
        {all.map((crumb, index) => {
          const last = index === all.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              {last || !crumb.to ? (
                <span
                  aria-current={last ? 'page' : undefined}
                  className="text-on-surface font-medium"
                >
                  {crumb.label}
                </span>
              ) : (
                <Link to={crumb.to} className={linkClass}>
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Standard content page frame: main landmark, page width, breadcrumbs and an h1. */
export function ContentPage({
  title,
  crumbs,
  origin,
  narrow = false,
  children,
}: {
  title: string;
  crumbs: Crumb[];
  origin: string;
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="flex-1" id="main-content" tabIndex={-1}>
      <div className="max-w-page px-margin mx-auto w-full py-8 md:py-12">
        <Breadcrumbs crumbs={crumbs} origin={origin} />
        <div className={narrow ? 'mx-auto max-w-3xl' : undefined}>
          <h1 className="type-display text-on-surface mb-8 wrap-anywhere">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}

/** Merchant HTML from Shopify (page body, article content, policy body). */
export function ShopifyHtml({ html }: { html: string }) {
  return <div className="rte" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function formatDate(iso: string, locale = 'en'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(iso));
}
