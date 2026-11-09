import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  AppComponentsProvider,
  HcmsRenderProvider,
  HcmsSections,
  createRegistry,
  defineSection,
  useAppComponents,
  type AppComponents,
  type AppImageProps,
  type SectionContainerPlacement,
} from '@hcms/hydrogen';
import type { Template } from '@hcms/schema';
import { createElement } from 'react';
import { preload } from 'react-dom';
import { renderToStaticMarkup } from 'react-dom/server';

const source = (path: string) => readFileSync(new URL(`../app/${path}`, import.meta.url), 'utf8');

test('T-2.132: templates and layout groups render with their placement', () => {
  assert.match(
    source('components/hcms/HcmsTemplatePage.tsx'),
    /<HcmsSections container=\{rendered\.template\} placement=\{\{ template: page\.name \}\} \/>/,
  );
  assert.match(
    source('components/hcms/HcmsLayoutGroup.tsx'),
    /<HcmsSections container=\{group\} placement=\{\{ group: name \}\} \/>/,
  );
  const root = source('root.tsx');
  for (const group of ['header', 'footer', 'overlay'])
    assert.match(root, new RegExp(`name="${group}"\\s+group=\\{loaderData\\.groups\\.${group}\\}`));
});

// Same contract as the adapter's HcmsImage: `priority` → a high-priority image preload.
const Image = ({ image, priority }: AppImageProps) => {
  if (priority) preload(image.url, { as: 'image', fetchPriority: 'high' });
  return createElement('img', { src: image.url, alt: '', loading: priority ? 'eager' : 'lazy' });
};
const Banner = ({ settings }: { settings: Record<string, unknown> }) => {
  const app = useAppComponents();
  return createElement(app.Image, {
    image: { url: String(settings.url) },
    sizes: '100vw',
    priority: true,
  });
};
const registry = createRegistry({
  sections: [
    defineSection({ type: 'image-banner', name: 'Banner', settings: [], component: Banner }),
  ],
});

const home: Template = {
  order: ['hero', 'banner', 'more'],
  sections: {
    hero: { type: 'image-banner', settings: { url: 'https://cdn.shopify.com/hero.jpg' } },
    banner: { type: 'image-banner', settings: { url: 'https://cdn.shopify.com/lake.jpg' } },
    more: { type: 'image-banner', settings: { url: 'https://cdn.shopify.com/more.jpg' } },
  },
} as unknown as Template;

const markup = (placement?: SectionContainerPlacement) =>
  renderToStaticMarkup(
    createElement(
      AppComponentsProvider,
      { value: { Image } as unknown as AppComponents },
      createElement(
        HcmsRenderProvider,
        { value: { registry, data: {} } },
        createElement(HcmsSections, { container: home, ...(placement ? { placement } : {}) }),
      ),
    ),
  );

const preloads = (html: string) =>
  [...html.matchAll(/<link rel="preload"[^>]*href="([^"]+)"/g)].map((m) => m[1]);

test('T-2.132: on home only the first section preloads its image', () => {
  const html = markup({ template: 'index' });
  assert.deepEqual(preloads(html), ['https://cdn.shopify.com/hero.jpg']);
  assert.equal(html.match(/loading="lazy"/g)?.length, 2);
  // Without a placement (before T-2.132) every banner preloaded.
  assert.equal(preloads(markup()).length, 3);
  assert.deepEqual(preloads(markup({ group: 'footer' })), []);
});
