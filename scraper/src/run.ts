// Usage:
//   npm run scrape -- <model-url> [--id yamaha-r7-2022] [--make Yamaha]
//                     [--model R7] [--year 2022] [--code YZF690] [--refresh]
//
// For bike-parts-yam.ie style URLs (…/<year>/<model>/<code>/<id>) the
// metadata is inferred from the path, so the URL alone is usually enough.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import type { BikeSummary } from '../../shared/types';
import { buildBike, slug, upsertIndex, validateBike, type BikeMeta } from './build';
import { fetchPage, isAllowedByRobots } from './fetch';
import { parseAssemblyPage, parseModelPage } from './parse';

const DATA_DIR = new URL('../../public/data/', import.meta.url).pathname;

function inferMeta(url: string): Partial<BikeMeta> {
  const segs = new URL(url).pathname.split('/').filter(Boolean);
  const yearIdx = segs.findIndex((s) => /^(19|20)\d{2}$/.test(s));
  if (yearIdx < 0) return {};
  const make = segs[0]?.match(/^([a-z]+)-/i)?.[1];
  return {
    make: make ? make[0].toUpperCase() + make.slice(1) : undefined,
    year: Number(segs[yearIdx]),
    model: segs[yearIdx + 1],
    code: segs[yearIdx + 2],
  };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      id: { type: 'string' },
      make: { type: 'string' },
      model: { type: 'string' },
      year: { type: 'string' },
      code: { type: 'string' },
      refresh: { type: 'boolean', default: false },
    },
  });
  const modelUrl = positionals[0];
  if (!modelUrl) throw new Error('usage: npm run scrape -- <model-url> [options]');

  const inferred = inferMeta(modelUrl);
  const make = values.make ?? inferred.make;
  const model = values.model ?? inferred.model;
  const year = Number(values.year ?? inferred.year);
  const code = values.code ?? inferred.code ?? '';
  if (!make || !model || !year) throw new Error('could not infer make/model/year; pass --make/--model/--year');
  const meta: BikeMeta = { id: values.id ?? slug(`${make} ${model} ${year}`), make, model, year, code, sourceUrl: modelUrl };

  if (!(await isAllowedByRobots(modelUrl))) throw new Error(`robots.txt disallows ${modelUrl}`);
  const opts = { refresh: values.refresh };

  console.log(`Fetching model page ${modelUrl}`);
  const links = parseModelPage(await fetchPage(modelUrl, opts), modelUrl);
  console.log(`Found ${links.length} candidate assembly links`);

  const pages = [];
  for (const [i, link] of links.entries()) {
    const parsed = parseAssemblyPage(await fetchPage(link.url, opts), link.url);
    console.log(`[${i + 1}/${links.length}] ${link.name}: ${parsed.parts.length} parts`);
    pages.push({ link, parsed });
  }

  const bike = buildBike(meta, pages);
  const issues = validateBike(bike);
  if (issues.length) console.warn(`${issues.length} data issues:\n  ` + issues.slice(0, 20).join('\n  '));

  await mkdir(DATA_DIR + 'bikes', { recursive: true });
  await writeFile(`${DATA_DIR}bikes/${bike.id}.json`, JSON.stringify(bike, null, 2) + '\n');
  const indexFile = DATA_DIR + 'index.json';
  const index: BikeSummary[] = JSON.parse(await readFile(indexFile, 'utf8').catch(() => '[]'));
  await writeFile(indexFile, JSON.stringify(upsertIndex(index, bike), null, 2) + '\n');

  const partCount = bike.assemblies.reduce((n, a) => n + a.parts.length, 0);
  console.log(`Wrote ${bike.id}: ${bike.assemblies.length} assemblies, ${partCount} parts`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
