import { SDK_VERSION } from '@hcms/hydrogen';

import { registry } from '~/sections';

/**
 * `/__hcms/manifest` (T-1.1.7, docs/05 flow 4): the section/block schemas this deployment can
 * render. Public JSON (no secrets); the admin and the editor read it.
 */
export function loader() {
  return Response.json(
    { ...registry.manifest(), sdkVersion: SDK_VERSION },
    {
      headers: {
        'Cache-Control': 'public, max-age=60',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}
