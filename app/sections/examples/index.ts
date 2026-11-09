/**
 * The example sections as a stand-alone registry module, so they can be checked without being
 * added to the storefront: `npx hcms validate --entry app/sections/examples/index.ts`.
 * Nothing imports this file. It collects the files the same way `app/sections/custom.ts` collects
 * `app/sections/custom/` (one definition per file, file name = type), so the examples keep working
 * when you copy them there.
 */
import { createRegistry, type BlockDefinition, type SectionDefinition } from '@hcms/hydrogen';
import { officialBlocks, officialSections } from '@hcms/sections';

import { customDefinitions, type CustomModule } from '../custom-registry';

export const sectionDefinitions = officialSections.concat(
  customDefinitions<SectionDefinition>(import.meta.glob<CustomModule>('./*.tsx', { eager: true })),
);

export const blockDefinitions = officialBlocks.concat(
  customDefinitions<BlockDefinition>(
    import.meta.glob<CustomModule>('./blocks/*.tsx', { eager: true }),
  ),
);

export const registry = createRegistry({
  sections: sectionDefinitions,
  blocks: blockDefinitions,
});
