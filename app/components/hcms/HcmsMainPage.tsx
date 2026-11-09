import type { ReactNode } from 'react';

import { Breadcrumbs, type Crumb } from '~/components/ContentPage';
import { HcmsTemplatePage } from '~/components/hcms/HcmsTemplatePage';
import type { TemplatePage } from '~/lib/hcms/page';

/** A route rendered from a theme template (D-22): breadcrumbs, structured data, then sections. */
export function HcmsMainPage({
  page,
  crumbs,
  origin,
  children,
}: {
  page: TemplatePage;
  crumbs?: Crumb[];
  origin: string;
  children?: ReactNode;
}) {
  return (
    <main className="flex-1" id="main-content" tabIndex={-1}>
      {children}
      {crumbs ? (
        <div className="max-w-page px-margin mx-auto w-full pt-4 md:pt-6">
          <Breadcrumbs crumbs={crumbs} origin={origin} />
        </div>
      ) : null}
      <HcmsTemplatePage page={page} />
    </main>
  );
}
