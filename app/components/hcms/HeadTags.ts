/** Theme Document head tags (T-2.75), rendered by the root `Layout` inside `<head>`. */
import { Fragment, createElement } from 'react';

import type { HeadTagProps } from '../../lib/hcms/head.ts';

export function HeadTags({ tags }: { tags: HeadTagProps[] }) {
  return createElement(
    Fragment,
    null,
    tags.map((tag, i) => createElement(tag.tagName, { key: `hcms-head-${i}`, ...tag.attrs })),
  );
}
