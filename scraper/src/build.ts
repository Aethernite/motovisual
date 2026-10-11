import { categorize } from '../../shared/categories';
import type { Assembly, Bike, BikeSummary } from '../../shared/types';
import { summarize } from '../../shared/types';
import type { AssemblyLink, ParsedAssembly } from './parse';

export interface BikeMeta {
  id: string;
  make: string;
  model: string;
  year: number;
  code: string;
  sourceUrl: string;
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Combine scraped pages into a Bike, dropping assemblies with no parts. */
export function buildBike(
  meta: BikeMeta,
  pages: { link: AssemblyLink; parsed: ParsedAssembly }[],
  scrapedAt = new Date().toISOString(),
): Bike {
  const used = new Set<string>();
  const assemblies: Assembly[] = [];
  for (const { link, parsed } of pages) {
    if (!parsed.parts.length) continue;
    let id = slug(link.name) || 'assembly';
    for (let n = 2; used.has(id); n++) id = `${slug(link.name)}-${n}`;
    used.add(id);
    assemblies.push({
      id,
      name: link.name,
      category: categorize(link.name),
      diagramUrl: parsed.diagramUrl,
      sourceUrl: link.url,
      parts: parsed.parts.map((p) => ({ ...p, buyUrl: p.buyUrl ?? link.url })),
    });
  }
  return { ...meta, scrapedAt, assemblies };
}

/** Insert or replace a bike in the search index, keeping it sorted. */
export function upsertIndex(index: BikeSummary[], bike: Bike): BikeSummary[] {
  return [...index.filter((b) => b.id !== bike.id), summarize(bike)].sort(
    (a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model) || a.year - b.year,
  );
}

/** Problems that make a bike file unusable or suspicious. */
export function validateBike(bike: Bike): string[] {
  const issues: string[] = [];
  if (!bike.assemblies.length) issues.push('no assemblies');
  for (const a of bike.assemblies) {
    if (!a.parts.length) issues.push(`${a.name}: no parts`);
    a.parts.forEach((p, i) => {
      if (!p.partNo) issues.push(`${a.name} row ${i + 1}: missing part number`);
      if (!p.description) issues.push(`${a.name} ${p.partNo}: missing description`);
    });
  }
  return issues;
}
