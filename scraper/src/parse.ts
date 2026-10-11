import * as cheerio from 'cheerio';
import type { Price } from '../../shared/types';

// The parser is deliberately structure-tolerant: it keys off URL shape,
// table header text and the Yamaha part-number format rather than exact CSS
// classes, so small markup changes on the source site don't break it.
// When real pages are captured, add them as fixtures and tighten as needed.

/** Yamaha part numbers: 1WD-14710-00-00, 90105-08X00-00, B7N-2510A-00 … */
export const PART_NO_RE = /\b[0-9A-Z]{3,5}-[0-9A-Z]{5}-[0-9A-Z]{2}(?:-[0-9A-Z]{2})?\b/;

export interface AssemblyLink {
  name: string;
  url: string;
}

export interface ParsedPart {
  ref: string;
  partNo: string;
  description: string;
  qty: number;
  price?: Price;
  buyUrl?: string;
}

export interface ParsedAssembly {
  diagramUrl?: string;
  parts: ParsedPart[];
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Model page → assembly links. Assembly pages live one or more path segments
 * below the model URL, so any same-origin link that extends the model path is
 * treated as an assembly.
 */
export function parseModelPage(html: string, modelUrl: string): AssemblyLink[] {
  const $ = cheerio.load(html);
  const base = new URL(modelUrl);
  const basePath = base.pathname.replace(/\/+$/, '');
  const seen = new Map<string, AssemblyLink>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')!;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      return;
    }
    url.hash = '';
    if (url.origin !== base.origin) return;
    if (!url.pathname.startsWith(basePath + '/')) return;

    const $a = $(el);
    const name = clean(
      $a.attr('title') || $a.text() || $a.find('img').attr('alt') || $a.find('img').attr('title') || '',
    );
    const key = url.toString();
    const existing = seen.get(key);
    // The same assembly is often linked twice (thumbnail + caption); keep the best name.
    if (!existing || (!existing.name && name)) seen.set(key, { name, url: key });
  });

  return [...seen.values()].map((a) => ({
    ...a,
    name: a.name || decodeURIComponent(a.url.split('/').filter(Boolean).pop() ?? '').replace(/[-_]+/g, ' '),
  }));
}

/** "€1,234.56", "12,34 €", "EUR 9.90" → Price */
export function parsePrice(text: string): Price | undefined {
  const t = clean(text);
  const m = t.match(/(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2})?)/);
  if (!m) return undefined;
  let num = m[1].replace(/\s/g, '');
  // Whichever separator comes last is the decimal separator.
  const lastComma = num.lastIndexOf(',');
  const lastDot = num.lastIndexOf('.');
  if (lastComma > lastDot) num = num.replace(/\./g, '').replace(',', '.');
  else num = num.replace(/,/g, '');
  const amount = Number(num);
  if (!Number.isFinite(amount)) return undefined;
  const currency = /£|GBP/.test(t) ? 'GBP' : /\$|USD/.test(t) ? 'USD' : 'EUR';
  return { amount, currency };
}

type Column = 'ref' | 'partNo' | 'description' | 'qty' | 'price';

const HEADER_RULES: [Column, RegExp][] = [
  ['partNo', /part\s*(no|number|#)|article|art\.?\s*no|oem|item\s*no/i],
  ['ref', /^(ref|pos|no\.?|#|nr\.?|key)\b/i],
  ['qty', /qty|quantity|req|pcs/i],
  ['price', /price|cost|€|eur/i],
  ['description', /desc|name|designation|part$/i],
];

function headerMap(headers: string[]): Partial<Record<Column, number>> {
  const map: Partial<Record<Column, number>> = {};
  headers.forEach((h, i) => {
    for (const [col, re] of HEADER_RULES) {
      if (map[col] === undefined && re.test(h)) {
        map[col] = i;
        return;
      }
    }
  });
  return map;
}

function pickDiagram($: cheerio.CheerioAPI, pageUrl: string): string | undefined {
  const abs = (src?: string) => (src ? new URL(src, pageUrl).toString() : undefined);
  // 1. An image driving an image map (clickable diagram hotspots).
  const mapped = $('img[usemap]').first().attr('src');
  if (mapped) return abs(mapped);
  // 2. An image whose src/id/class/alt says diagram/schema/exploded.
  const hint = /diagram|schema|schematic|explod|zeichnung|drawing|fiche/i;
  const hinted = $('img')
    .filter((_, el) => {
      const $el = $(el);
      return [$el.attr('src'), $el.attr('id'), $el.attr('class'), $el.attr('alt')].some((v) => v && hint.test(v));
    })
    .first()
    .attr('src');
  return abs(hinted);
}

/** Assembly page → diagram image + parts rows. */
export function parseAssemblyPage(html: string, pageUrl: string): ParsedAssembly {
  const $ = cheerio.load(html);
  const parts: ParsedPart[] = [];

  $('table').each((_, table) => {
    const $t = $(table);
    const headerCells = $t.find('thead tr').first().find('th,td').toArray();
    const headerRow = headerCells.length ? headerCells : $t.find('tr').first().find('th').toArray();
    const cols = headerMap(headerRow.map((c) => clean($(c).text())));

    $t.find('tr').each((_, tr) => {
      const cells = $(tr).find('td').toArray();
      if (!cells.length) return;
      const texts = cells.map((c) => clean($(c).text()));

      const partNoIdx = cols.partNo ?? texts.findIndex((t) => PART_NO_RE.test(t));
      const partNo = texts[partNoIdx]?.match(PART_NO_RE)?.[0];
      if (!partNo) return;

      const at = (c: Column) => (cols[c] !== undefined ? texts[cols[c]!] : undefined);
      // Without headers: ref is the first short leading cell, description the
      // longest non-part-number text, price the first cell with a currency.
      const ref =
        at('ref') ??
        (partNoIdx > 0 && /^\d{1,3}[A-Z]?$/.test(texts[0]) ? texts[0] : '');
      const description =
        at('description') ??
        texts
          .filter((t, i) => i !== partNoIdx && /[A-Za-z]{3}/.test(t) && !/[€£$]/.test(t))
          .sort((a, b) => b.length - a.length)[0] ??
        '';
      const qtyText = at('qty') ?? texts.find((t, i) => i > partNoIdx && /^\d{1,3}$/.test(t) && t !== ref);
      const priceText = at('price') ?? texts.find((t) => /[€£$]|EUR/.test(t));

      const link = $(tr)
        .find('a[href]')
        .toArray()
        .map((a) => $(a).attr('href')!)
        .find((h) => !h.startsWith('#') && !h.startsWith('javascript:'));

      parts.push({
        ref: ref.replace(/\.$/, ''),
        partNo,
        description,
        qty: qtyText ? Number(qtyText.match(/\d+/)?.[0] ?? 1) : 1,
        price: priceText ? parsePrice(priceText) : undefined,
        buyUrl: link ? new URL(link, pageUrl).toString() : undefined,
      });
    });
  });

  return { diagramUrl: pickDiagram($, pageUrl), parts };
}
