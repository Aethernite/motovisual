// Sanity-checks every bike file in public/data/bikes. Exits non-zero on issues.
import { readdir, readFile } from 'node:fs/promises';
import type { Bike } from '../../shared/types';
import { validateBike } from './build';

const dir = new URL('../../public/data/bikes/', import.meta.url).pathname;
let failed = false;
for (const file of (await readdir(dir)).filter((f) => f.endsWith('.json'))) {
  const bike: Bike = JSON.parse(await readFile(dir + file, 'utf8'));
  const issues = validateBike(bike);
  const parts = bike.assemblies.reduce((n, a) => n + a.parts.length, 0);
  console.log(`${file}: ${bike.assemblies.length} assemblies, ${parts} parts, ${issues.length} issues`);
  issues.slice(0, 20).forEach((i) => console.log('  ' + i));
  if (issues.length) failed = true;
}
process.exit(failed ? 1 : 0);
