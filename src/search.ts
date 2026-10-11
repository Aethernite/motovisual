import Fuse from 'fuse.js';
import type { BikeSummary } from '../shared/types';
import { loadIndex } from './data';
import { h } from './dom';

export async function renderSearch(root: HTMLElement) {
  const input = h('input', {
    type: 'search',
    class: 'search-input',
    placeholder: 'Search a bike — e.g. "R7", "Yamaha 2022", "YZF690"',
    autofocus: true,
    'aria-label': 'Search bikes',
  });
  const results = h('div', { class: 'results', role: 'list' });
  root.replaceChildren(
    h(
      'main',
      { class: 'search-page' },
      h('h1', { class: 'brand' }, 'Moto', h('span', {}, 'Visual')),
      h('p', { class: 'tagline' }, 'Find your bike. Explore every OEM part in an exploded 3D schematic.'),
      input,
      results,
    ),
    footer(),
  );

  let bikes: BikeSummary[];
  try {
    bikes = await loadIndex();
  } catch (err) {
    results.replaceChildren(h('p', { class: 'empty' }, `Could not load the bike index: ${(err as Error).message}`));
    return;
  }

  if (!bikes.length) {
    results.replaceChildren(
      h(
        'div',
        { class: 'empty' },
        h('p', {}, 'No bikes have been scraped yet.'),
        h('p', {}, 'Run ', h('code', {}, 'npm run scrape -- <model-url>'), ' to add one.'),
      ),
    );
    return;
  }

  const fuse = new Fuse(bikes, {
    keys: ['make', 'model', 'code', { name: 'year', getFn: (b) => String(b.year) }, { name: 'label', getFn: (b) => `${b.make} ${b.model} ${b.year}` }],
    threshold: 0.35,
    ignoreLocation: true,
  });

  const show = () => {
    const q = input.value.trim();
    const list = q ? fuse.search(q).map((r) => r.item) : bikes;
    results.replaceChildren(
      ...(list.length
        ? list.map((b) =>
            h(
              'a',
              { class: 'bike-card', href: `#/bike/${b.id}`, role: 'listitem' },
              h('span', { class: 'bike-title' }, `${b.make} ${b.model}`),
              h('span', { class: 'bike-meta' }, `${b.year} · ${b.code}`),
              h('span', { class: 'bike-stats' }, `${b.assemblyCount} assemblies · ${b.partCount} parts`),
            ),
          )
        : [h('p', { class: 'empty' }, `No bikes match “${q}”.`)]),
    );
  };
  input.addEventListener('input', show);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') results.querySelector<HTMLAnchorElement>('a.bike-card')?.click();
  });
  show();
}

export function footer() {
  return h(
    'footer',
    { class: 'site-footer' },
    'Part data, prices and diagrams belong to their source catalogs; prices are a snapshot from the scrape date. 3D shapes are schematic, not to scale.',
  );
}
