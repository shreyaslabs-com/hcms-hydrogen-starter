/**
 * The registry components render with: the full (eager) one on the server, the lazy one in the
 * browser (T-1.8.1). `import.meta.env.SSR` is a build-time constant, so the client bundle drops
 * the eager `officialSections` import (see the PURE annotations in `./index`). Custom sections
 * (`app/sections/custom/`) join both from `./custom`; nothing to register here.
 */
import { blockLoaders, sectionLoaders } from '@hcms/sections/lazy';

import { customBlockLoaders, customSectionLoaders } from './custom';
import { registry as serverRegistry } from './index';
import { createLazyRegistry } from './lazy-registry';

export const lazySections = import.meta.env.SSR
  ? null
  : createLazyRegistry(
      { ...sectionLoaders, ...customSectionLoaders },
      { ...blockLoaders, ...customBlockLoaders },
    );
// The condition must be the build-time constant itself, or the eager branch isn't dropped.
export const renderRegistry = import.meta.env.SSR
  ? serverRegistry
  : (lazySections as NonNullable<typeof lazySections>).registry;
