import { HcmsRenderProvider, HcmsSections, type SectionCss } from '@hcms/hydrogen';
import type { SectionGroup } from '@hcms/schema';

import { reportSectionError } from '~/lib/hcms/report';
import { renderRegistry as registry } from '~/sections/render';

/** Renders a section group (header/footer) from the Theme Document. */
export function HcmsLayoutGroup({
  name,
  group,
  data,
  assets,
  preview,
  sectionCss,
  route,
}: {
  /** Group name (`header`, `footer`, `overlay`): only header groups may preload images (T-2.132). */
  name: string;
  group: SectionGroup;
  data: Record<string, unknown>;
  assets: Record<string, import('@hcms/schema').Asset>;
  preview: boolean;
  /** Section Custom CSS (T-2.74) from `loadLayoutGroups`. */
  sectionCss?: SectionCss;
  /** Route state for layout sections (T-2.98: the header's per-page behaviour reads `pathname`). */
  route?: Record<string, string>;
}) {
  return (
    <HcmsRenderProvider
      value={{
        registry,
        data,
        assets,
        preview,
        onError: reportSectionError,
        ...(sectionCss ? { sectionCss } : {}),
        ...(route ? { route } : {}),
      }}
    >
      <HcmsSections container={group} placement={{ group: name }} />
    </HcmsRenderProvider>
  );
}
