/**
 * Your own sections and theme blocks (docs/developers/custom-sections.md) — the one place they
 * are registered. Add a file, nothing else:
 *
 *   app/sections/custom/<type>.tsx          exports one `defineSection({ type: '<type>', … })`
 *   app/sections/custom/blocks/<type>.tsx   exports one `defineBlock({ type: '<type>', … })`
 *
 * The server imports them eagerly (render registry + `/__hcms/manifest`, via `./index`); the
 * browser loads each one lazily, only on pages that show it (`./render`, preloaded before
 * hydration by `entry.client.tsx`). The eager globs must never reach the client bundle: Vite
 * hoists them into static imports even inside `import.meta.env.SSR ? … : …`, so `vite.config.ts`
 * (`serverOnlyEagerGlobs`) blanks them in the client build.
 */
import type { BlockDefinition, SectionDefinition } from '@hcms/hydrogen';

import { customDefinitions, customLoaders, type CustomModule } from './custom-registry';

export const customSections: SectionDefinition[] = import.meta.env.SSR
  ? customDefinitions(
      import.meta.glob<CustomModule>(['./custom/*.tsx', '!./custom/*.browser.tsx'], {
        eager: true,
      }),
    )
  : [];

export const customBlocks: BlockDefinition[] = import.meta.env.SSR
  ? customDefinitions(
      import.meta.glob<CustomModule>(['./custom/blocks/*.tsx', '!./custom/blocks/*.browser.tsx'], {
        eager: true,
      }),
    )
  : [];

export const customSectionLoaders = import.meta.env.SSR
  ? {}
  : customLoaders<SectionDefinition>(import.meta.glob<CustomModule>('./custom/*.tsx'));

export const customBlockLoaders = import.meta.env.SSR
  ? {}
  : customLoaders<BlockDefinition>(import.meta.glob<CustomModule>('./custom/blocks/*.tsx'));
