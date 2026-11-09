/**
 * Example theme block (docs/developers/custom-sections.md, "Blocks"), used by `feature-list`.
 * Theme blocks live in `app/sections/custom/blocks/<type>.tsx`; copy this file there to use it.
 */
import { defineBlock, type BlockComponentProps } from '@hcms/hydrogen';

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Theme block: registered on its own, usable by any section that accepts it (or `@theme`). */
function Badge({ settings, attributes }: BlockComponentProps) {
  const label = text(settings.label);
  if (!label) return null;
  return (
    <span {...attributes} className="type-body-sm inline-flex rounded-full border px-3 py-1">
      {label}
    </span>
  );
}

export const badgeBlock = defineBlock({
  type: 'badge',
  name: 'Badge',
  settings: [{ type: 'text', id: 'label', label: 'Label', default: 'New' }],
  presets: [{ name: 'Badge' }],
  component: Badge,
});
