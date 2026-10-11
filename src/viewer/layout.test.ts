import { describe, expect, it } from 'vitest';
import type { Bike } from '../../shared/types';
import { computeLayout, lerp3 } from './layout';
import { shapeFor } from './shapes';

const bike: Bike = {
  id: 't',
  make: 'Test',
  model: 'T',
  year: 2022,
  code: 'X',
  sourceUrl: 'https://example.test',
  scrapedAt: '2026-01-01T00:00:00Z',
  assemblies: [
    {
      id: 'head',
      name: 'CYLINDER HEAD',
      category: 'engine',
      sourceUrl: 'https://example.test/head',
      parts: ['10', '2', '1', '6A', '6'].map((ref) => ({ ref, partNo: `P-${ref}`, description: 'BOLT', qty: 1 })),
    },
    {
      id: 'fork',
      name: 'FRONT FORK',
      category: 'front-suspension',
      sourceUrl: 'https://example.test/fork',
      parts: [{ ref: '1', partNo: 'F-1', description: 'INNER TUBE', qty: 2 }],
    },
  ],
};

describe('computeLayout', () => {
  const layout = computeLayout(bike);

  it('creates one node per part with stable keys', () => {
    expect(layout.parts.map((p) => p.key)).toEqual(['head:0', 'head:1', 'head:2', 'head:3', 'head:4', 'fork:0']);
  });

  it('orders parts on the grid by natural ref order', () => {
    const head = layout.parts.filter((p) => p.assembly.id === 'head');
    // Grid fills left→right, top→bottom; reading order should follow 1, 2, 6, 6A, 10.
    const reading = [...head].sort((a, b) => b.exploded[1] - a.exploded[1] || a.exploded[0] - b.exploded[0]);
    expect(reading.map((p) => p.part.ref)).toEqual(['1', '2', '6', '6A', '10']);
  });

  it('moves categories apart when exploded', () => {
    const dist = (t: number) => {
      const a = lerp3(layout.parts[0].assembled, layout.parts[0].exploded, t);
      const b = lerp3(layout.parts[5].assembled, layout.parts[5].exploded, t);
      return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    };
    expect(dist(1)).toBeGreaterThan(dist(0) * 1.5);
  });

  it('gives no two parts the same exploded position', () => {
    const seen = new Set(layout.parts.map((p) => p.exploded.map((v) => v.toFixed(3)).join(',')));
    expect(seen.size).toBe(layout.parts.length);
  });
});

describe('shapeFor', () => {
  it.each([
    ['BOLT, FLANGE', 'bolt'],
    ['NUT', 'nut'],
    ['WASHER, PLATE', 'ring'],
    ['O-RING', 'ring'],
    ['GEAR, 2ND PINION', 'gear'],
    ['SPRING, COMPRESSION', 'spring'],
    ['SIDE COVER 1', 'panel'],
    ['HOSE 2', 'tube'],
    ['BEARING', 'bearing'],
    ['DISC, BRAKE (RIGHT)', 'disc'],
    ['CAST WHEEL, FRONT', 'wheel'],
    ['TIRE (FRONT)', 'wheel'],
    ['PISTON', 'cylinder'],
    ['SOMETHING', 'box'],
  ])('%s → %s', (desc, kind) => {
    expect(shapeFor(desc).kind).toBe(kind);
  });
});
