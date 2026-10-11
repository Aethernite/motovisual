type Attrs = Record<string, string | number | boolean | undefined | ((e: Event) => void)>;

/** Tiny hyperscript helper: h('a', { href, onclick }, 'text', childNode). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function formatPrice(p?: { amount: number; currency: string }): string {
  if (!p) return '—';
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: p.currency }).format(p.amount);
}
