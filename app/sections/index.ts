import { createRegistry } from '@hcms/hydrogen';
import { officialBlocks, officialSections, officialStrings } from '@hcms/sections';

import { customBlocks, customSections } from './custom';

/**
 * Section definitions this storefront ships: official + `app/sections/custom/` (`./custom`);
 * validated server-side (dev) by the page pipeline. `concat` + PURE so the client bundle can drop it.
 */
export const sectionDefinitions = /*#__PURE__*/ officialSections.concat(customSections);

/** Official theme blocks (T-2.31 cards) + `app/sections/custom/blocks/`. */
export const blockDefinitions = /*#__PURE__*/ officialBlocks.concat(customBlocks);

/** Sections + theme blocks this storefront can render; served as `/__hcms/manifest` (T-1.1.7). */
export const registry = /*#__PURE__*/ createRegistry({
  sections: sectionDefinitions,
  blocks: blockDefinitions,
  // Default theme content catalog (T-2.33) for the editor's "Theme content" panel.
  strings: officialStrings,
});
