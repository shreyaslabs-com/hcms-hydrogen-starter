/**
 * T-2.114 facet values as list / swatches / buttons with a no-JS "Show more (N)": every value is in
 * the HTML; values past `maxValues` sit in a nested native `<details>` (opened when one of them is
 * active). Checkbox semantics stay (sr-only inputs, visible label, count as sr text). Plain
 * `createElement` (no JSX) so `node:test` renders it.
 */
import { createElement as h, type ChangeEvent, type CSSProperties, type ReactNode } from 'react';

import { splitValues } from '../../lib/hcms/filter-display.ts';

export type FacetOption = {
  id: string;
  label: string;
  count: number;
  /** URL param name/value of the filter input. */
  name: string;
  value: string;
  active: boolean;
  /** Swatch paint (swatches display): CSS colour from Shopify / a safe colour name, image URL. */
  color?: string | null;
  image?: string | null;
};

export type FacetValuesProps = {
  /** id of the filter's visible label (the fieldset's name). */
  labelId: string;
  display: 'list' | 'swatches' | 'buttons';
  options: readonly FacetOption[];
  maxValues?: number;
  onChange?: (event: ChangeEvent<HTMLInputElement>, option: FacetOption) => void;
};

const productsText = (count: number) => `${count} ${count === 1 ? 'product' : 'products'}`;

function CheckIcon() {
  return h(
    'svg',
    {
      className: 'filter-check-icon',
      width: 12,
      height: 12,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 3,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
    },
    h('path', { d: 'M20 6 9 17l-5-5' }),
  );
}

function optionItem(
  option: FacetOption,
  idPrefix: string,
  display: FacetValuesProps['display'],
  onChange: FacetValuesProps['onChange'],
): ReactNode {
  const valueId = `${idPrefix}-${encodeURIComponent(option.id)}`;
  const countId = `${valueId}-count`;
  const input = (props: Record<string, unknown>) =>
    h('input', {
      type: 'checkbox',
      name: option.name,
      value: option.value,
      checked: option.active,
      className: 'sr-only',
      'aria-describedby': countId,
      onChange: (event: ChangeEvent<HTMLInputElement>) => onChange?.(event, option),
      ...props,
    });
  // Referenced by aria-describedby (read as the description, not twice in browse mode).
  const srCount = h(
    'span',
    { id: countId, className: 'sr-only', 'aria-hidden': true },
    productsText(option.count),
  );

  if (display === 'swatches') {
    const style = {
      ...(option.color ? { '--filter-swatch-color': option.color } : {}),
      ...(option.image
        ? { backgroundImage: `url("${option.image}")`, backgroundSize: 'cover' }
        : {}),
    } as CSSProperties;
    return h(
      'li',
      { key: option.id },
      h(
        'label',
        {
          'data-testid': 'facet-option',
          className:
            'min-h-touch-target min-w-touch-target relative inline-flex cursor-pointer items-center justify-center motion-safe:transition-transform motion-safe:active:scale-[0.93]',
          // Visible name on hover/long-press; the input's accessible name is the label text.
          title: `${option.label} (${option.count})`,
        },
        input({ 'aria-label': option.label }),
        h('span', { className: 'filter-swatch shrink-0', style }, h(CheckIcon)),
        srCount,
      ),
    );
  }

  if (display === 'buttons') {
    return h(
      'li',
      { key: option.id },
      h(
        'label',
        {
          'data-testid': 'facet-option',
          className:
            'border-border rounded-button min-h-touch-target min-w-touch-target text-on-surface has-[:checked]:bg-interactive has-[:checked]:text-interactive-text has-[:checked]:border-interactive has-[:focus-visible]:outline-accent inline-flex cursor-pointer items-center justify-center gap-1 border px-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 motion-safe:transition-transform motion-safe:active:scale-[0.97]',
        },
        input({ 'aria-labelledby': `${valueId}-label` }),
        h('span', { id: `${valueId}-label` }, option.label),
        h('span', { className: 'text-xs opacity-70', 'aria-hidden': true }, `(${option.count})`),
        srCount,
      ),
    );
  }

  return h(
    'li',
    { key: option.id },
    h(
      'label',
      {
        'data-testid': 'facet-option',
        className:
          'min-h-touch-target text-on-surface flex cursor-pointer items-center gap-2 py-1 text-sm motion-safe:transition-transform motion-safe:active:scale-[0.97]',
      },
      input({ 'aria-labelledby': `${valueId}-label` }),
      h('span', { className: 'filter-checkbox shrink-0' }, h(CheckIcon)),
      h('span', { id: `${valueId}-label`, className: 'flex-1' }, option.label),
      h(
        'span',
        { className: 'text-on-surface-secondary text-xs', 'aria-hidden': true },
        `(${option.count})`,
      ),
      srCount,
    ),
  );
}

export function FacetValues({ labelId, display, options, maxValues, onChange }: FacetValuesProps) {
  if (options.length === 0) return null;
  const { shown, more } = splitValues(options, maxValues);
  const listClass = display === 'list' ? 'space-y-1 pt-2' : 'flex flex-wrap gap-2.5 pt-2';
  const items = (list: readonly FacetOption[]) =>
    list.map((option) => optionItem(option, labelId, display, onChange));
  return h(
    'fieldset',
    { className: 'm-0 border-0 p-0', 'aria-labelledby': labelId },
    h('ul', { className: listClass }, items(shown)),
    more.length
      ? h(
          'details',
          { className: 'group/more', open: more.some((o) => o.active) || undefined },
          h(
            'summary',
            {
              className:
                'marker-hidden text-on-surface min-h-touch-target inline-flex cursor-pointer items-center text-sm underline underline-offset-2',
            },
            h('span', { className: 'group-open/more:hidden' }, `Show more (${more.length})`),
            h('span', { className: 'hidden group-open/more:inline' }, 'Show less'),
          ),
          h('ul', { className: listClass }, items(more)),
        )
      : null,
  );
}
