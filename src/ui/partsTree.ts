import Fuse from 'fuse.js';
import { CATEGORY_LABELS } from '../../shared/categories';
import type { Category } from '../../shared/types';
import { h } from '../dom';
import type { PartNode } from '../viewer/layout';
import { CATEGORY_COLORS } from '../viewer/scene';

const MAX_RESULTS = 200;

/** Left panel: category → assembly → part tree with a fuzzy filter. */
export class PartsTree {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private rows = new Map<string, HTMLButtonElement>();
  private fuse: Fuse<PartNode>;
  private selected: string | null = null;

  constructor(
    private nodes: PartNode[],
    private onSelect: (node: PartNode) => void,
    private onIsolate: (assemblyId: string) => void,
  ) {
    this.fuse = new Fuse(nodes, {
      keys: [
        { name: 'part.description', weight: 2 },
        { name: 'part.partNo', weight: 2 },
        { name: 'assembly.name', weight: 1 },
      ],
      threshold: 0.3,
      ignoreLocation: true,
    });
    const filter = h('input', {
      type: 'search',
      class: 'tree-filter',
      placeholder: 'Filter parts or part numbers…',
      'aria-label': 'Filter parts',
    });
    filter.addEventListener('input', () => this.render(filter.value.trim()));
    this.body = h('div', { class: 'tree-body' });
    this.el = h('aside', { class: 'panel tree-panel' }, filter, this.body);
    this.render('');
  }

  private partRow(n: PartNode, showAssembly = false) {
    const row = h(
      'button',
      { class: 'part-row', type: 'button', onclick: () => this.onSelect(n) },
      h('span', { class: 'ref' }, n.part.ref || '·'),
      h('span', { class: 'desc' }, n.part.description, showAssembly ? h('small', {}, n.assembly.name) : null),
      h('span', { class: 'pn' }, n.part.partNo),
    );
    if (n.key === this.selected) row.classList.add('selected');
    this.rows.set(n.key, row);
    return row;
  }

  private render(query: string) {
    this.rows.clear();
    if (query) {
      // Exact substring hits (part numbers ignoring dashes, or description)
      // come first; fuzzy matches fill in after.
      const norm = (t: string) => t.toUpperCase().replace(/[\s-]/g, '');
      const q = norm(query);
      const exact = this.nodes.filter((n) => norm(n.part.partNo).includes(q) || norm(n.part.description).includes(q));
      const exactKeys = new Set(exact.map((n) => n.key));
      const fuzzy = this.fuse
        .search(query, { limit: MAX_RESULTS })
        .map((r) => r.item)
        .filter((n) => !exactKeys.has(n.key));
      const hits = [...exact, ...fuzzy].slice(0, MAX_RESULTS);
      this.body.replaceChildren(
        hits.length
          ? h('div', { class: 'flat-list' }, ...hits.map((n) => this.partRow(n, true)))
          : h('p', { class: 'empty' }, 'No matching parts.'),
      );
      return;
    }

    const byCat = new Map<Category, Map<string, PartNode[]>>();
    for (const n of this.nodes) {
      const cat = byCat.get(n.assembly.category) ?? new Map<string, PartNode[]>();
      const list = cat.get(n.assembly.id) ?? [];
      list.push(n);
      cat.set(n.assembly.id, list);
      byCat.set(n.assembly.category, cat);
    }

    const cats = [...byCat.entries()].sort((a, b) => CATEGORY_LABELS[a[0]].localeCompare(CATEGORY_LABELS[b[0]]));
    this.body.replaceChildren(
      ...cats.map(([cat, assemblies]) =>
        h(
          'details',
          { class: 'cat', 'data-cat': cat },
          h(
            'summary',
            {},
            h('i', { class: 'swatch', style: `background:${CATEGORY_COLORS[cat]}` }),
            CATEGORY_LABELS[cat],
            h('small', {}, String(assemblies.size)),
          ),
          ...[...assemblies.values()].map((parts) =>
            h(
              'details',
              { class: 'asm', 'data-asm': parts[0].assembly.id },
              h(
                'summary',
                {},
                parts[0].assembly.name,
                h(
                  'button',
                  {
                    class: 'isolate-btn',
                    type: 'button',
                    title: 'Show only this assembly',
                    onclick: (e: Event) => {
                      e.preventDefault();
                      this.onIsolate(parts[0].assembly.id);
                    },
                  },
                  '◎',
                ),
              ),
              ...parts.map((n) => this.partRow(n)),
            ),
          ),
        ),
      ),
    );
  }

  /** Highlight a part row, expanding its parents and scrolling it into view. */
  setSelected(key: string | null) {
    if (this.selected) this.rows.get(this.selected)?.classList.remove('selected');
    this.selected = key;
    if (!key) return;
    const row = this.rows.get(key);
    if (!row) return;
    row.classList.add('selected');
    for (let p = row.parentElement; p && p !== this.body; p = p.parentElement) {
      if (p instanceof HTMLDetailsElement) p.open = true;
    }
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
