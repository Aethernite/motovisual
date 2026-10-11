// SYNTHETIC test data for the browser smoke test only. Part numbers start
// with "TST-" and prices are made up; this is never written to public/data.
import { categorize } from '../shared/categories';
import type { Bike } from '../shared/types';
import { summarize } from '../shared/types';

const ASSEMBLIES = [
  'CYLINDER HEAD', 'CYLINDER', 'CRANKSHAFT & PISTON', 'CAMSHAFT & CHAIN', 'CLUTCH', 'TRANSMISSION',
  'INTAKE', 'EXHAUST', 'RADIATOR & HOSE', 'FUEL TANK', 'FRONT FORK', 'REAR ARM & SUSPENSION',
  'FRONT WHEEL', 'REAR WHEEL', 'FRONT BRAKE CALIPER', 'FRAME', 'COWLING 1', 'SIDE COVER',
  'STEERING HANDLE & CABLE', 'ELECTRICAL 1', 'HEADLIGHT', 'METER', 'STAND & FOOTREST', 'SEAT',
];
const ITEMS = [
  'BOLT, FLANGE', 'NUT', 'WASHER, PLATE', 'O-RING', 'GEAR', 'SPRING', 'COVER', 'HOSE', 'BEARING',
  'COLLAR', 'BRACKET', 'SCREW', 'GASKET', 'SHAFT', 'CLIP', 'CAST WHEEL', 'DISC, BRAKE', 'PIPE',
];

export function syntheticBike(): Bike {
  let n = 0;
  return {
    id: 'test-bike-2022',
    make: 'Testmake',
    model: 'TX7',
    year: 2022,
    code: 'TST690',
    sourceUrl: 'https://example.test/tx7',
    scrapedAt: '2026-01-01T00:00:00Z',
    assemblies: ASSEMBLIES.map((name, ai) => {
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const count = 12 + ((ai * 7) % 25);
      return {
        id,
        name,
        category: categorize(name),
        sourceUrl: `https://example.test/tx7/${id}`,
        parts: Array.from({ length: count }, (_, i) => {
          n++;
          return {
            ref: String(i + 1),
            partNo: `TST-${String(n).padStart(5, '0')}-00`,
            description: i === 0 ? `${name} ASSY` : ITEMS[(i + ai) % ITEMS.length],
            qty: 1 + (i % 3),
            price: { amount: 2 + ((n * 37) % 400) + 0.5, currency: 'EUR' },
            buyUrl: `https://example.test/buy/${n}`,
          };
        }),
      };
    }),
  };
}

export const syntheticIndex = () => [summarize(syntheticBike())];
