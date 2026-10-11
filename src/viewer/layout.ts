import type { Assembly, Bike, Category, Part } from '../../shared/types';
import { shapeFor, shapeRadius, type Shape } from './shapes';

// Coordinate system: the bike faces +X, Y is up, Z points out of the
// right-hand side. Units are roughly decimetres (wheelbase ≈ 14).

export type Vec3 = [number, number, number];

interface CategoryPlacement {
  /** Where the category sits when assembled — a rough sports-bike silhouette. */
  anchor: Vec3;
  /**
   * Preferred direction (degrees, counter-clockwise from the front, 90 = up)
   * of the category's block when exploded. Blocks are spread evenly around
   * the bike in this order, so neighbours never overlap.
   */
  angle: number;
}

export const CATEGORY_LAYOUT: Record<Category, CategoryPlacement> = {
  'front-suspension': { anchor: [5.6, 5.4, 0], angle: 0 },
  controls: { anchor: [4.8, 8.6, 0], angle: 35 },
  intake: { anchor: [1.2, 6.6, 0], angle: 65 },
  bodywork: { anchor: [1.5, 6.5, 0], angle: 90 },
  fuel: { anchor: [-0.5, 8.2, 0], angle: 110 },
  frame: { anchor: [0.5, 6.2, 0], angle: 135 },
  electrical: { anchor: [-3.2, 7, 0], angle: 160 },
  'rear-suspension': { anchor: [-3.8, 3.8, 0], angle: 190 },
  exhaust: { anchor: [-2.5, 1.6, 1.2], angle: 220 },
  'wheels-brakes': { anchor: [0, 2.8, 0], angle: 250 },
  engine: { anchor: [0, 3.6, 0], angle: 285 },
  other: { anchor: [0, 11, 0], angle: 305 },
  cooling: { anchor: [3.4, 4.8, 0], angle: 330 },
};

/** Centre of the bike silhouette; exploded blocks orbit around it. */
export const BIKE_CENTER: Vec3 = [0, 5.5, 0];
/** Blocks never sit closer to the bike centre than this (clears the silhouette). */
const MIN_RING_RADIUS = 9;
/** The ring is an ellipse, wider than tall, to suit landscape screens. */
const RING_ASPECT = 1.45;
/** Gap between neighbouring assemblies inside a category block (exploded). */
const ASSEMBLY_GAP = 1.2;
/** Assembled clusters are the exploded layout shrunk by this factor. */
const ASSEMBLED_SCALE = 0.22;

export interface PartNode {
  /** Stable key: `${assemblyId}:${index}`. */
  key: string;
  index: number;
  assembly: Assembly;
  part: Part;
  shape: Shape;
  /** Position at explode = 0. */
  assembled: Vec3;
  /** Position at explode = 1. */
  exploded: Vec3;
}

export interface AssemblyNode {
  assembly: Assembly;
  /** Centre of the assembly cluster at explode = 1 (for camera framing / labels). */
  explodedCenter: Vec3;
  assembledCenter: Vec3;
  radius: number;
}

export interface Layout {
  parts: PartNode[];
  assemblies: AssemblyNode[];
  categories: { category: Category; explodedCenter: Vec3; assembledCenter: Vec3; radius: number }[];
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];

export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Natural sort for diagram refs: 2 < 10, 6 < 6A. */
const refKey = (ref: string) => {
  const m = ref.match(/^(\d+)(.*)$/);
  return m ? [Number(m[1]), m[2]] as const : [Number.MAX_SAFE_INTEGER, ref] as const;
};

/**
 * Lay out an assembly's parts on a square-ish grid in the XY plane (the side
 * view), centred on the origin. Returns local offsets and the cluster radius.
 */
function layoutAssembly(parts: Part[]): { offsets: Vec3[]; shapes: Shape[]; radius: number } {
  const order = parts
    .map((_, i) => i)
    .sort((a, b) => {
      const [na, sa] = refKey(parts[a].ref);
      const [nb, sb] = refKey(parts[b].ref);
      return na - nb || sa.localeCompare(sb);
    });
  const shapes = parts.map((p) => shapeFor(p.description));
  const cell = Math.max(0.5, ...shapes.map((s) => shapeRadius(s) * 2 + 0.25));
  // Big parts (wheels, discs) would force huge cells; cap the cell and let them overlap a bit.
  const cellSize = Math.min(cell, 1.6);
  const cols = Math.ceil(Math.sqrt(parts.length));
  const rows = Math.ceil(parts.length / cols);
  const offsets: Vec3[] = new Array(parts.length);
  order.forEach((partIdx, slot) => {
    const c = slot % cols;
    const r = Math.floor(slot / cols);
    offsets[partIdx] = [(c - (cols - 1) / 2) * cellSize, ((rows - 1) / 2 - r) * cellSize, 0];
  });
  const radius = (Math.max(cols, rows) * cellSize) / 2;
  return { offsets, shapes, radius };
}

export function computeLayout(bike: Bike): Layout {
  const byCategory = new Map<Category, Assembly[]>();
  for (const a of bike.assemblies) {
    const list = byCategory.get(a.category) ?? [];
    list.push(a);
    byCategory.set(a.category, list);
  }

  // Pack each category's assemblies into a grid block, centred on the origin.
  const blocks = [...byCategory.entries()]
    .sort((a, b) => CATEGORY_LAYOUT[a[0]].angle - CATEGORY_LAYOUT[b[0]].angle)
    .map(([category, list]) => {
      const laid = list.map((a) => ({ a, ...layoutAssembly(a.parts) }));
      const cols = Math.ceil(Math.sqrt(laid.length));
      const rows = Math.ceil(laid.length / cols);
      const cell = Math.max(...laid.map((l) => l.radius * 2)) + ASSEMBLY_GAP;
      const offsets = laid.map((_, i): Vec3 => [
        ((i % cols) - (cols - 1) / 2) * cell,
        ((rows - 1) / 2 - Math.floor(i / cols)) * cell,
        0,
      ]);
      const radius = (Math.max(cols, rows) * cell) / 2;
      return { category, laid, offsets, radius };
    });

  // Spread blocks evenly around an ellipse, growing it until neighbouring
  // blocks no longer overlap.
  const n = blocks.length;
  const step = (Math.PI * 2) / Math.max(n, 1);
  const start = n ? (CATEGORY_LAYOUT[blocks[0].category].angle * Math.PI) / 180 : 0;
  const at = (i: number, r: number): [number, number] => [
    Math.cos(start + i * step) * r * RING_ASPECT,
    Math.sin(start + i * step) * r,
  ];
  let ring = MIN_RING_RADIUS + Math.max(0, ...blocks.map((b) => b.radius)) * 0.5;
  const overlaps = (r: number) =>
    blocks.some((b, i) => {
      if (n < 2) return false;
      const j = (i + 1) % n;
      const [x1, y1] = at(i, r);
      const [x2, y2] = at(j, r);
      return Math.hypot(x2 - x1, y2 - y1) < b.radius + blocks[j].radius + ASSEMBLY_GAP;
    });
  while (overlaps(ring)) ring += 0.5;

  const parts: PartNode[] = [];
  const assemblies: AssemblyNode[] = [];
  const categories: Layout['categories'] = [];

  blocks.forEach(({ category, laid, offsets, radius }, bi) => {
    const anchor = CATEGORY_LAYOUT[category].anchor;
    const [dx, dy] = at(bi, ring);
    const blockCenter: Vec3 = [BIKE_CENTER[0] + dx, BIKE_CENTER[1] + dy, 0];

    laid.forEach((l, i) => {
      const explodedCenter = add(blockCenter, offsets[i]);
      const assembledCenter = add(anchor, scale(offsets[i], ASSEMBLED_SCALE * 0.5));
      assemblies.push({ assembly: l.a, explodedCenter, assembledCenter, radius: l.radius });

      l.a.parts.forEach((part, idx) => {
        const local = l.offsets[idx];
        parts.push({
          key: `${l.a.id}:${idx}`,
          index: idx,
          assembly: l.a,
          part,
          shape: l.shapes[idx],
          assembled: add(assembledCenter, scale(local, ASSEMBLED_SCALE)),
          exploded: add(explodedCenter, local),
        });
      });
    });

    categories.push({ category, explodedCenter: blockCenter, assembledCenter: anchor, radius });
  });

  // Keep part order stable (bike file order) regardless of category sorting.
  const order = new Map(bike.assemblies.map((a, i) => [a.id, i]));
  parts.sort((a, b) => order.get(a.assembly.id)! - order.get(b.assembly.id)! || a.index - b.index);
  return { parts, assemblies, categories };
}
