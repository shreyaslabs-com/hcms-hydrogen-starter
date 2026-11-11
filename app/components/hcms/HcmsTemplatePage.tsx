import {
  AppComponentsProvider,
  HcmsRenderProvider,
  HcmsSections,
  useAppComponents,
  type RefetchResult,
  type RefetchSection,
  type RenderContextValue,
} from '@hcms/hydrogen';
import type { Asset, Template } from '@hcms/schema';
import { use, useCallback, useMemo, type ReactNode } from 'react';

import { CartConditionsSlot } from '~/components/hcms/cart-conditions-slot';
import { useLocalePath } from '~/components/LocaleLink';
import { livePreview, loadLivePreview } from '~/lib/hcms/live-preview';
import type { AppWidgets } from '~/lib/hcms/judgeme';
import type { TemplatePage } from '~/lib/hcms/page';
import { reportSectionError } from '~/lib/hcms/report';
import { renderRegistry as registry } from '~/sections/render';

type Rendered = {
  template: Template;
  data: Readonly<Record<string, unknown>>;
  assets: Readonly<Record<string, Asset>>;
};

/**
 * Renders a resolved template's sections with their batched data. In preview, editor edits apply
 * live (no reload); sections with a data query or a dynamic value (`{{token}}`, `$source`) refetch
 * through `/__hcms/section`, which resolves them on the server (T-1.2.8). The live-edit code
 * loads only in preview (`lib/hcms/live-preview.ts`, T-2.106).
 */
export function HcmsTemplatePage({ page }: { page: TemplatePage }) {
  if (page.preview) return <LiveTemplatePage page={page} />;
  const view = (
    <TemplateView
      page={page}
      rendered={{ template: page.template, data: page.data, assets: page.assets }}
    />
  );
  return page.appWidgets ? <WithAppWidgets widgets={page.appWidgets}>{view}</WithAppWidgets> : view;
}

/**
 * Server-rendered app widgets (T-2.103): sections read the sanitized HTML through adapter
 * `appWidgetHtml`; the vendor's sanitized CSS renders once so widgets look right without JS.
 */
function WithAppWidgets({ widgets, children }: { widgets: AppWidgets; children: ReactNode }) {
  const parent = useAppComponents();
  const value = useMemo(
    () => ({ ...parent, appWidgetHtml: (key: string) => widgets.html[key] ?? null }),
    [parent, widgets],
  );
  return (
    <AppComponentsProvider value={value}>
      {/* S2-3: the browser Judge.me loader skips (no 404 in the console). Name =
          `JUDGEME_UNAVAILABLE_META` (literal: judgeme.ts stays out of this chunk). */}
      {widgets.unavailable ? <meta name="hcms-judgeme-unavailable" content="" /> : null}
      {widgets.css ? (
        <style data-hcms-app-widgets="" dangerouslySetInnerHTML={{ __html: widgets.css }} />
      ) : null}
      {children}
    </AppComponentsProvider>
  );
}

function LiveTemplatePage({ page }: { page: TemplatePage }) {
  const { useLivePage, instanceStyle } = livePreview() ?? use(loadLivePreview());
  const localize = useLocalePath();
  const refetch = useCallback<RefetchSection>(
    async ({ id, section }) => {
      const response = await fetch(localize('/__hcms/section'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          id,
          section,
          resource: page.resource,
          parent: page.parent,
          route: page.route,
        }),
      });
      if (!response.ok) throw new Error(`Section refetch failed (${response.status})`);
      return (await response.json()) as RefetchResult;
    },
    [localize, page.resource, page.parent, page.route],
  );
  const live = useLivePage({
    template: page.template,
    data: page.data,
    assets: page.assets,
    enabled: true,
    registry,
    refetch,
  });
  return (
    <>
      {/* Tells `entry.client.tsx` to load the live-edit module before hydrating. */}
      <meta name="hcms-preview" content="1" />
      {/* Style/visibility edits (T-2.168/T-2.169) show at once: attributes computed here. */}
      <TemplateView page={page} rendered={live} styleOf={instanceStyle} />
    </>
  );
}

function TemplateView({
  page,
  rendered,
  styleOf,
}: {
  page: TemplatePage;
  rendered: Rendered;
  styleOf?: RenderContextValue['styleOf'];
}) {
  return (
    <HcmsRenderProvider
      value={{
        registry,
        data: rendered.data,
        assets: rendered.assets,
        preview: page.preview,
        route: page.route,
        sectionCss: page.sectionCss,
        ...(styleOf ? { styleOf } : {}),
        onError: reportSectionError,
      }}
    >
      {/* Template name for real-user speed data (T-2.15); React hoists it into <head>. */}
      <meta name="hcms-template" content={page.name} />
      {/* T-2.132: only the first section's images may be priority (preloaded, eager). */}
      <HcmsSections container={rendered.template} placement={{ template: page.name }} />
      <CartConditionsSlot sectionCss={page.sectionCss} />
    </HcmsRenderProvider>
  );
}
