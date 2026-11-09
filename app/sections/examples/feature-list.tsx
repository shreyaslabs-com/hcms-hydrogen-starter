/**
 * Example custom section with blocks (docs/developers/custom-sections.md, "Blocks"): a
 * section-local `feature` block, the theme block `badge` (`blocks/badge.tsx`), and a static
 * `badge` the preset places. Not registered: copy it to `app/sections/custom/feature-list.tsx`
 * and `blocks/badge.tsx` to `app/sections/custom/blocks/badge.tsx`.
 */
import {
  HcmsBlocks,
  HcmsStaticBlock,
  defineSection,
  type BlockNode,
  type SectionComponentProps,
} from '@hcms/hydrogen';

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Section-local block: the section renders it itself (the registry doesn't know it). */
function Feature({ block }: { block: BlockNode }) {
  return (
    <li
      data-hcms-block-id={block.id}
      data-hcms-block-type={block.type}
      data-hcms-local=""
      className="flex flex-col gap-2"
    >
      <h3 className="type-heading-sm">{text(block.settings.title)}</h3>
      <p className="type-body">{text(block.settings.text)}</p>
    </li>
  );
}

function FeatureList({ settings, blocks, staticBlocks }: SectionComponentProps) {
  const heading = text(settings.heading);
  return (
    <div className="max-w-page px-margin mx-auto flex flex-col gap-6 py-12">
      <div className="flex flex-wrap items-center gap-3">
        {heading ? <h2 className="type-heading-lg">{heading}</h2> : null}
        <HcmsStaticBlock block={staticBlocks.badge} />
      </div>
      <ul role="list" className="grid gap-8 md:grid-cols-3">
        {blocks.map((block) =>
          block.type === 'feature' ? (
            <Feature key={block.id} block={block} />
          ) : (
            <li key={block.id}>
              <HcmsBlocks blocks={[block]} />
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

export const featureList = defineSection({
  type: 'feature-list',
  name: 'Feature list',
  max_blocks: 12,
  settings: [{ type: 'text', id: 'heading', label: 'Heading', default: 'Why shop with us' }],
  blocks: [
    {
      type: 'feature',
      name: 'Feature',
      settings: [
        { type: 'text', id: 'title', label: 'Title', default: 'Fast delivery' },
        { type: 'textarea', id: 'text', label: 'Text', default: 'Ships in one business day.' },
      ],
    },
    { type: 'badge', limit: 3 },
  ],
  presets: [
    {
      name: 'Feature list',
      category: 'Text',
      blocks: [
        { type: 'badge', id: 'badge', static: true, settings: { label: 'Why us' } },
        { type: 'feature' },
        { type: 'feature', settings: { title: 'Easy returns', text: '30 days, free.' } },
        { type: 'feature', settings: { title: 'Real support', text: 'People, not bots.' } },
      ],
    },
  ],
  component: FeatureList,
});
