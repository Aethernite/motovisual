import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { categorize } from '../../shared/categories';
import { buildBike, validateBike } from '../src/build';
import { robotsAllows } from '../src/fetch';
import { parseAssemblyPage, parseModelPage, parsePrice, PART_NO_RE } from '../src/parse';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const MODEL_URL = 'https://www.bike-parts-yam.ie/yamaha-motorcycle/700-MOTO/2022/R7/YZF690/86433';

describe('parseModelPage', () => {
  it('finds same-origin links below the model path, deduped, with names', () => {
    const links = parseModelPage(fixture('synthetic-model.html'), MODEL_URL);
    expect(links).toEqual([
      { name: 'CYLINDER HEAD', url: `${MODEL_URL}/cylinder-head/1001` },
      { name: 'FRONT FORK', url: `${MODEL_URL}/front-fork/1020` },
    ]);
  });
});

describe('parseAssemblyPage', () => {
  it('reads header-driven tables and image-map diagrams', () => {
    const url = `${MODEL_URL}/cylinder-head/1001`;
    const { diagramUrl, parts } = parseAssemblyPage(fixture('synthetic-assembly-headers.html'), url);
    expect(diagramUrl).toBe('https://www.bike-parts-yam.ie/diagrams/86433/1001.png');
    expect(parts).toEqual([
      {
        ref: '1',
        partNo: 'B7N-11102-00-00',
        description: 'CYLINDER HEAD ASSY',
        qty: 1,
        price: { amount: 1234.5, currency: 'EUR' },
        buyUrl: 'https://www.bike-parts-yam.ie/product/B7N-11102-00-00',
      },
      {
        ref: '2',
        partNo: '90109-06209-00',
        description: 'BOLT',
        qty: 12,
        price: { amount: 2.1, currency: 'EUR' },
        buyUrl: undefined,
      },
    ]);
  });

  it('falls back to content heuristics when there are no headers', () => {
    const { diagramUrl, parts } = parseAssemblyPage(fixture('synthetic-assembly-noheaders.html'), MODEL_URL);
    expect(diagramUrl).toBe('https://cdn.example/schema/1020.jpg');
    expect(parts.map((p) => [p.ref, p.partNo, p.description, p.qty, p.price?.amount])).toEqual([
      ['5', 'B7N-23102-00', 'INNER TUBE COMP.', 2, 189],
      ['6A', '93210-39627-00', 'O-RING', 2, 3.4],
    ]);
  });
});

describe('helpers', () => {
  it('parses prices in both decimal conventions', () => {
    expect(parsePrice('€12.34')).toEqual({ amount: 12.34, currency: 'EUR' });
    expect(parsePrice('1.234,56 €')).toEqual({ amount: 1234.56, currency: 'EUR' });
    expect(parsePrice('£1,099.00')).toEqual({ amount: 1099, currency: 'GBP' });
    expect(parsePrice('n/a')).toBeUndefined();
  });

  it('matches Yamaha part numbers', () => {
    for (const p of ['B7N-11102-00-00', '90109-06209-00', 'BN6-2510A-00']) expect(PART_NO_RE.test(p)).toBe(true);
    expect(PART_NO_RE.test('12-34')).toBe(false);
  });

  it('categorizes assembly names', () => {
    expect(categorize('CYLINDER HEAD')).toBe('engine');
    expect(categorize('MASTER CYLINDER')).toBe('wheels-brakes');
    expect(categorize('FUEL TANK')).toBe('fuel');
    expect(categorize('STEERING HANDLE & CABLE')).toBe('controls');
    expect(categorize('FRONT FORK')).toBe('front-suspension');
    expect(categorize('SIDE COVER')).toBe('bodywork');
    expect(categorize('CRANKCASE COVER 1')).toBe('engine');
    expect(categorize('SOMETHING ELSE')).toBe('other');
  });

  it('applies robots.txt disallow rules for *', () => {
    const robots = 'User-agent: badbot\nDisallow: /\n\nUser-agent: *\nDisallow: /cart\n';
    expect(robotsAllows(robots, '/yamaha-motorcycle/x')).toBe(true);
    expect(robotsAllows(robots, '/cart/add')).toBe(false);
  });
});

describe('buildBike', () => {
  it('drops empty assemblies, dedupes ids and falls back to the page as buy link', () => {
    const meta = { id: 'b', make: 'Yamaha', model: 'R7', year: 2022, code: 'YZF690', sourceUrl: MODEL_URL };
    const part = { ref: '1', partNo: 'B7N-11102-00-00', description: 'X', qty: 1 };
    const bike = buildBike(meta, [
      { link: { name: 'COVER', url: 'u1' }, parsed: { parts: [part] } },
      { link: { name: 'COVER', url: 'u2' }, parsed: { parts: [part] } },
      { link: { name: 'EMPTY', url: 'u3' }, parsed: { parts: [] } },
    ]);
    expect(bike.assemblies.map((a) => a.id)).toEqual(['cover', 'cover-2']);
    expect(bike.assemblies[1].parts[0].buyUrl).toBe('u2');
    expect(validateBike(bike)).toEqual([]);
  });
});
