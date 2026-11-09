import {
  HcmsRenderProvider,
  HcmsSections,
  LIBRARY_ADD_ATTRIBUTE,
  LIBRARY_SELECT_ATTRIBUTE,
} from '@hcms/hydrogen';
import { useMemo, type ReactNode } from 'react';

import libraryStylesHref from '~/library.css?url';
import { throwNotFound } from '~/lib/hcms/not-found';
import { loadLibraryPage, type LibraryExample, type LibraryPicture } from '~/lib/hcms/library';
import { reportSectionError } from '~/lib/hcms/report';
import { previewContext } from '~/lib/preview';
import { renderRegistry as registry } from '~/sections/render';

import type { Route } from './+types/library';

/**
 * `/{market?}/__hcms/library` (T-2.85): the editor's Component library preview. Gallery showcase:
 * intro band, sticky category chips, every example as a specimen card (live section, the draft's
 * theme settings). "Add to page" and the card name talk to the editor through the preview bridge
 * (`data-hcms-library-*`). Shoppers get the 404 page: a valid preview token is required.
 */
export function meta() {
  return [{ title: 'Component library' }, { name: 'robots', content: 'noindex, nofollow' }];
}

export function links() {
  return [{ rel: 'stylesheet', href: libraryStylesHref }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  if (!context.get(previewContext)) return throwNotFound(context, request);
  return loadLibraryPage(context, request);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function LibraryRoute({ loaderData }: Route.ComponentProps) {
  const { page, categories, stats, pictures } = loaderData;
  const sampleImage = useMemo(() => samplePicker(pictures), [pictures]);
  return (
    <main className="hl flex-1" id="main-content" tabIndex={-1}>
      <header className="hl-intro">
        <div className="hl-wrap">
          <span className="hl-eyebrow">Component library</span>
          <h1 className="hl-title">Everything your store can show</h1>
          <p className="hl-lede">
            Every section, in every look, styled by your theme. Change colors or fonts in Theme
            settings and each one follows. Add any of them to a page in one click.
          </p>
          <div className="hl-stats">
            <div className="hl-stat">
              <b>{stats.sections}</b>
              <span>Sections</span>
            </div>
            <div className="hl-stat">
              <b>{stats.looks}</b>
              <span>Looks to choose from</span>
            </div>
            <div className="hl-stat">
              <b>{stats.categories}</b>
              <span>Categories</span>
            </div>
          </div>
        </div>
      </header>

      {categories.length > 0 && (
        <nav className="hl-nav" aria-label="Component categories">
          <div className="hl-wrap hl-chips">
            {categories.map((c) => (
              <a key={c.slug} className="hl-chip" href={`#${c.slug}`}>
                {c.category}
                <small>{c.examples.length}</small>
              </a>
            ))}
          </div>
        </nav>
      )}

      <HcmsRenderProvider
        value={{
          registry,
          data: page.data,
          assets: page.assets,
          preview: page.preview,
          route: page.route,
          sectionCss: page.sectionCss,
          sampleImage,
          onError: reportSectionError,
        }}
      >
        <div className="hl-wrap">
          {categories.length === 0 ? (
            <p className="hl-empty">This storefront has no sections to show yet.</p>
          ) : (
            categories.map((c) => (
              <section
                key={c.slug}
                id={c.slug}
                className="hl-category"
                aria-labelledby={`${c.slug}-h`}
              >
                <div className="hl-category-head">
                  <h2 id={`${c.slug}-h`}>{c.category}</h2>
                  <p>
                    {c.blurb ? `${c.blurb} · ` : ''}
                    {plural(c.examples.length, 'component')}
                  </p>
                </div>
                <div className="hl-cards">
                  {c.examples.map((example) => {
                    const section = page.template.sections[example.id];
                    return section ? (
                      <Specimen key={example.id} example={example}>
                        {/* One container per example so each sits in its own card. */}
                        <HcmsSections
                          container={{ order: [example.id], sections: { [example.id]: section } }}
                          placement={LIBRARY_PLACEMENT}
                        />
                      </Specimen>
                    ) : null;
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </HcmsRenderProvider>
    </main>
  );
}

/** Dozens of specimens: none may preload its image (T-2.132). */
const LIBRARY_PLACEMENT = { group: 'library' } as const;

function Specimen({ example, children }: { example: LibraryExample; children: ReactNode }) {
  const single = !example.saved && example.name === example.sectionName;
  return (
    <article className="hl-card" data-hcms-library-example={example.id}>
      <div className="hl-card-bar">
        <button
          type="button"
          className="hl-card-name"
          {...{ [LIBRARY_SELECT_ATTRIBUTE]: example.id }}
        >
          <b>{example.saved ? example.name : example.sectionName}</b>
          <span>
            {example.saved
              ? `Saved · ${example.sectionName}`
              : single
                ? 'Default look'
                : example.name}
          </span>
        </button>
        {!example.saved && example.looks > 1 && (
          <span className="hl-pill">
            Look {example.look} of {example.looks}
          </span>
        )}
        <button
          type="button"
          className="hl-add"
          aria-label={`Add ${example.saved || !single ? `${example.sectionName}, ${example.name}` : example.sectionName} to a page`}
          {...{ [LIBRARY_ADD_ATTRIBUTE]: example.id }}
        >
          <span aria-hidden="true">＋</span> Add to page
        </button>
      </div>
      <div className="hl-stage">{children}</div>
    </article>
  );
}

/**
 * Placeholder slots (cards without data or images) get a sample picture: picked by the slot's
 * shape when it says one, stable per key so neighbouring cards differ but never flicker.
 */
function samplePicker(pictures: readonly LibraryPicture[]) {
  const shape = (ratio: number) => (ratio > 1.15 ? 'wide' : ratio < 0.87 ? 'tall' : 'square');
  return (key: string, ratio?: number) => {
    if (!pictures.length) return null;
    const fitting =
      ratio === undefined
        ? pictures
        : pictures.filter((p) => shape(p.width / p.height) === shape(ratio));
    const pool = fitting.length ? fitting : pictures;
    let hash = 0;
    for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return pool[hash % pool.length] ?? null;
  };
}
