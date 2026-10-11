import { loadBike } from './data';
import { h } from './dom';
import { DetailPanel } from './ui/detailPanel';
import { PartsTree } from './ui/partsTree';
import { computeLayout, type PartNode } from './viewer/layout';
import { ExplodedScene } from './viewer/scene';

export const partHash = (bikeId: string, n: PartNode) => `#/bike/${bikeId}/${n.assembly.id}/${n.index}`;

export interface BikePage {
  bikeId: string;
  /** Apply the part selected in the URL (null = none). */
  selectFromRoute(partKey: string | null): void;
  dispose(): void;
}

export async function renderBikePage(root: HTMLElement, bikeId: string): Promise<BikePage | null> {
  root.replaceChildren(h('div', { class: 'loading' }, 'Loading parts catalog…'));
  let bike;
  try {
    bike = await loadBike(bikeId);
  } catch (err) {
    root.replaceChildren(
      h('div', { class: 'loading' }, `Could not load “${bikeId}”: ${(err as Error).message} `, h('a', { href: '#/' }, 'Back to search')),
    );
    return null;
  }

  const layout = computeLayout(bike);
  const byKey = new Map(layout.parts.map((n) => [n.key, n]));
  const go = (n: PartNode | null) => {
    location.hash = n ? partHash(bike.id, n) : `#/bike/${bike.id}`;
  };

  const tooltip = h('div', { class: 'tooltip', hidden: true });
  const viewport = h('div', { class: 'viewport' }, tooltip);
  const explode = h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: 0.7, 'aria-label': 'Explode' });
  const clearIso = h('button', { class: 'btn small', type: 'button', hidden: true }, 'Show all');
  const toggleTree = h('button', { class: 'btn small tree-toggle', type: 'button' }, 'Parts');

  const page = h('div', { class: 'bike-page' });
  root.replaceChildren(page);

  let scene: ExplodedScene;
  const isolate = (assemblyId: string | null) => {
    scene.isolate(assemblyId);
    clearIso.hidden = assemblyId === null;
  };

  const tree = new PartsTree(layout.parts, go, isolate);
  const detail = new DetailPanel(() => go(null), isolate);

  page.append(
    h(
      'header',
      { class: 'toolbar' },
      h('a', { class: 'back', href: '#/' }, '← Search'),
      h('h1', {}, `${bike.make} ${bike.model} `, h('small', {}, `${bike.year} · ${bike.code}`)),
      toggleTree,
      h('label', { class: 'explode' }, 'Explode', explode),
      clearIso,
      h('button', { class: 'btn small', type: 'button', onclick: () => scene.resetView() }, 'Reset view'),
    ),
    h('div', { class: 'workspace' }, tree.el, viewport, detail.el),
    h('p', { class: 'hint' }, 'Drag to orbit · scroll to zoom · click a part · double-click to isolate an assembly'),
  );

  scene = new ExplodedScene(viewport, layout, {
    onSelect: (n) => go(n),
    onHover: (n, x, y) => {
      if (!n) {
        tooltip.hidden = true;
        return;
      }
      const rect = viewport.getBoundingClientRect();
      tooltip.textContent = `${n.part.description} · ${n.part.partNo}`;
      tooltip.style.transform = `translate(${x - rect.left + 14}px, ${y - rect.top + 14}px)`;
      tooltip.hidden = false;
    },
  });

  explode.addEventListener('input', () => scene.setExplode(Number(explode.value)));
  clearIso.addEventListener('click', () => isolate(null));
  toggleTree.addEventListener('click', () => page.classList.toggle('tree-open'));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (scene.isolated) isolate(null);
      else go(null);
    }
  };
  window.addEventListener('keydown', onKey);

  return {
    bikeId: bike.id,
    selectFromRoute(partKey) {
      const node = partKey ? byKey.get(partKey) ?? null : null;
      scene.select(node?.key ?? null);
      tree.setSelected(node?.key ?? null);
      detail.show(node);
      page.classList.toggle('detail-open', !!node);
      if (node) page.classList.remove('tree-open');
    },
    dispose() {
      window.removeEventListener('keydown', onKey);
      scene.dispose();
    },
  };
}
