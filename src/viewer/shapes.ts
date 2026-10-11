import * as THREE from 'three';

// Maps a catalog part description to a schematic primitive. Geometries are
// unit-sized and shared; each part instance scales its kind by `size`.

export type ShapeKind =
  | 'bolt'
  | 'nut'
  | 'ring'
  | 'gear'
  | 'spring'
  | 'panel'
  | 'tube'
  | 'bearing'
  | 'disc'
  | 'wheel'
  | 'cylinder'
  | 'box';

export interface Shape {
  kind: ShapeKind;
  /** Scale applied to the unit geometry (x, y, z). */
  size: [number, number, number];
}

// First match wins; order specific → generic.
const RULES: [RegExp, Shape][] = [
  [/\bTIRE\b|\bTYRE\b|CAST WHEEL|\bWHEEL\b(?!.*(BOLT|COLLAR|SENSOR|DAMPER))/, { kind: 'wheel', size: [2.6, 2.6, 0.9] }],
  [/BRAKE DISC|\bDISC\b|\bROTOR\b/, { kind: 'disc', size: [1.6, 1.6, 0.08] }],
  [/BEARING/, { kind: 'bearing', size: [0.45, 0.45, 0.18] }],
  [/\bGEAR\b|SPROCKET|PINION|\bWHEEL GEAR\b/, { kind: 'gear', size: [0.8, 0.8, 0.18] }],
  [/SPRING/, { kind: 'spring', size: [0.35, 0.9, 0.35] }],
  [/\bBOLT\b|\bSCREW\b|\bSTUD\b|\bPIN\b|\bRIVET\b/, { kind: 'bolt', size: [0.1, 0.45, 0.1] }],
  [/\bNUT\b/, { kind: 'nut', size: [0.2, 0.12, 0.2] }],
  [/WASHER|COLLAR|O-RING|\bSEAL\b|GASKET|CIRCLIP|\bCLIP\b|GROMMET|\bRING\b|SPACER|BUSH/, { kind: 'ring', size: [0.3, 0.3, 0.3] }],
  [/HOSE|PIPE|CABLE|\bLEAD\b|\bWIRE\b|HARNESS|\bTUBE\b|\bLINE\b/, { kind: 'tube', size: [1.3, 0.7, 0.7] }],
  [/COWLING|PANEL|COVER|FENDER|GUARD|\bSEAT\b|SCREEN|WINDSHIELD|PLATE|BRACKET|STAY|EMBLEM|GRAPHIC|LABEL|DECAL/, { kind: 'panel', size: [1.1, 0.75, 0.08] }],
  [/PISTON|CYLINDER|SHAFT|AXLE|ROD|\bFORK\b|DAMPER|SHOCK|CAMSHAFT|INJECTOR|PLUG|MOTOR|PUMP|BATTERY/, { kind: 'cylinder', size: [0.35, 0.9, 0.35] }],
];

const DEFAULT: Shape = { kind: 'box', size: [0.45, 0.35, 0.35] };

export function shapeFor(description: string): Shape {
  const d = description.toUpperCase();
  for (const [re, shape] of RULES) if (re.test(d)) return shape;
  // Assemblies ("… ASSY", "… COMP.") are bigger than loose items.
  if (/\bASSY\b|\bCOMP\b|ASSEMBLY/.test(d)) return { kind: 'box', size: [0.8, 0.6, 0.5] };
  return DEFAULT;
}

/** Radius of the bounding sphere of a shape — used for layout spacing. */
export function shapeRadius(shape: Shape): number {
  const [x, y, z] = shape.size;
  return Math.max(x, y, z) / 2;
}

function gearGeometry(teeth = 14): THREE.BufferGeometry {
  const outline = new THREE.Shape();
  const rOuter = 0.5;
  const rInner = 0.42;
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? rOuter : rInner;
    if (i === 0) outline.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
    else outline.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
    outline.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.14, 0, Math.PI * 2, true);
  outline.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(outline, { depth: 1, bevelEnabled: false });
  geo.translate(0, 0, -0.5);
  return geo;
}

function springGeometry(): THREE.BufferGeometry {
  const turns = 6;
  const pts = Array.from({ length: turns * 16 + 1 }, (_, i) => {
    const t = i / (turns * 16);
    const a = t * Math.PI * 2 * turns;
    return new THREE.Vector3(Math.cos(a) * 0.4, t - 0.5, Math.sin(a) * 0.4);
  });
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.05, 5, false);
}

function tubeGeometry(): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.5, -0.3, 0),
    new THREE.Vector3(-0.15, 0.3, 0),
    new THREE.Vector3(0.2, -0.1, 0),
    new THREE.Vector3(0.5, 0.35, 0),
  ]);
  return new THREE.TubeGeometry(curve, 24, 0.09, 6, false);
}

function bearingGeometry(): THREE.BufferGeometry {
  // Two concentric rings merged into one geometry.
  const outer = new THREE.TorusGeometry(0.42, 0.08, 6, 20);
  const inner = new THREE.TorusGeometry(0.22, 0.06, 6, 16);
  const merged = new THREE.BufferGeometry();
  const pos = [...outer.attributes.position.array, ...inner.attributes.position.array];
  const nrm = [...outer.attributes.normal.array, ...inner.attributes.normal.array];
  const offset = outer.attributes.position.count;
  const idx = [...outer.index!.array, ...[...inner.index!.array].map((i) => i + offset)];
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  merged.setIndex(idx);
  outer.dispose();
  inner.dispose();
  return merged;
}

/** Unit geometry per kind, roughly fitting a 1×1×1 box, axis = Y for round parts. */
export function createGeometry(kind: ShapeKind): THREE.BufferGeometry {
  switch (kind) {
    case 'bolt':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    case 'nut':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
    case 'ring':
      return new THREE.TorusGeometry(0.38, 0.12, 6, 18);
    case 'gear':
      return gearGeometry();
    case 'spring':
      return springGeometry();
    case 'panel':
      return new THREE.BoxGeometry(1, 1, 1, 2, 2, 1);
    case 'tube':
      return tubeGeometry();
    case 'bearing':
      return bearingGeometry();
    case 'disc':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 28).rotateX(Math.PI / 2);
    case 'wheel':
      return new THREE.TorusGeometry(0.42, 0.08, 8, 36);
    case 'cylinder':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
    case 'box':
      return new THREE.BoxGeometry(1, 1, 1);
  }
}
