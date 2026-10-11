import { CATEGORY_LABELS } from '../../shared/categories';
import { formatPrice, h } from '../dom';
import type { PartNode } from '../viewer/layout';
import { CATEGORY_COLORS } from '../viewer/scene';

/** Right panel: everything we know about the selected part. */
export class DetailPanel {
  readonly el = h('aside', { class: 'panel detail-panel', hidden: true, 'aria-live': 'polite' });

  constructor(
    private onClose: () => void,
    private onIsolate: (assemblyId: string) => void,
  ) {}

  show(node: PartNode | null) {
    if (!node) {
      this.el.hidden = true;
      this.el.replaceChildren();
      return;
    }
    const { part, assembly } = node;
    const copy = h('button', { class: 'copy-btn', type: 'button', title: 'Copy part number' }, 'Copy');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(part.partNo);
        copy.textContent = 'Copied';
      } catch {
        copy.textContent = 'Copy failed';
      }
      setTimeout(() => (copy.textContent = 'Copy'), 1500);
    });

    const diagram = assembly.diagramUrl
      ? h(
          'figure',
          { class: 'diagram' },
          h('img', {
            src: assembly.diagramUrl,
            alt: `${assembly.name} diagram`,
            loading: 'lazy',
            referrerpolicy: 'no-referrer',
            onerror: (e: Event) => ((e.target as HTMLElement).closest('figure')!.hidden = true),
          }),
          h('figcaption', {}, part.ref ? `Ref ${part.ref} on the ${assembly.name} diagram` : assembly.name),
        )
      : null;

    this.el.replaceChildren(
      h('button', { class: 'close-btn', type: 'button', 'aria-label': 'Close', onclick: () => this.onClose() }, '×'),
      h(
        'p',
        { class: 'crumb' },
        h('i', { class: 'swatch', style: `background:${CATEGORY_COLORS[assembly.category]}` }),
        `${CATEGORY_LABELS[assembly.category]} › ${assembly.name}`,
      ),
      h('h2', {}, part.description),
      h('p', { class: 'part-no' }, h('code', {}, part.partNo), copy),
      h(
        'dl',
        { class: 'facts' },
        h('dt', {}, 'Price'),
        h('dd', { class: 'price' }, formatPrice(part.price)),
        part.inStock !== undefined ? h('dt', {}, 'Stock') : null,
        part.inStock !== undefined
          ? h('dd', { class: part.inStock ? 'stock in' : 'stock out' }, part.inStock ? 'In stock' : 'Out of stock')
          : null,
        h('dt', {}, 'Diagram ref'),
        h('dd', {}, part.ref || '—'),
        h('dt', {}, 'Qty per bike'),
        h('dd', {}, String(part.qty)),
        part.notes ? h('dt', {}, 'Notes') : null,
        part.notes ? h('dd', {}, part.notes) : null,
      ),
      h(
        'div',
        { class: 'actions' },
        part.buyUrl
          ? h('a', { class: 'btn primary', href: part.buyUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Buy / check stock ↗')
          : null,
        h('a', { class: 'btn', href: assembly.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Source page ↗'),
        h('button', { class: 'btn', type: 'button', onclick: () => this.onIsolate(assembly.id) }, 'Isolate assembly'),
      ),
    );
    if (diagram) this.el.append(diagram);
    this.el.hidden = false;
  }
}
