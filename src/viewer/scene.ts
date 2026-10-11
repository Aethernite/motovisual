import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { CATEGORY_LABELS } from '../../shared/categories';
import type { Category } from '../../shared/types';
import { lerp3, type Layout, type PartNode, type Vec3 } from './layout';
import { createGeometry, type ShapeKind } from './shapes';

export const CATEGORY_COLORS: Record<Category, string> = {
  engine: '#ff8a3d',
  intake: '#7fd1ff',
  fuel: '#ffd166',
  exhaust: '#ff5d73',
  cooling: '#4dd2c2',
  electrical: '#c792ea',
  frame: '#9aa7b8',
  'front-suspension': '#5b9dff',
  'rear-suspension': '#3fb6ff',
  'wheels-brakes': '#e0e6ee',
  bodywork: '#7ee081',
  controls: '#f78fb3',
  other: '#b0b0b0',
};

const BACKGROUND = '#0a1422';
const SELECTED = new THREE.Color('#ffffff');
const DIM = 0.12;
const FLIGHT_MS = 700;

interface Batch {
  kind: ShapeKind;
  nodes: PartNode[];
  fill: THREE.InstancedMesh;
  wire: THREE.InstancedMesh;
}

export interface SceneCallbacks {
  onHover?: (node: PartNode | null, clientX: number, clientY: number) => void;
  onSelect?: (node: PartNode | null) => void;
}

export class ExplodedScene {
  private renderer: THREE.WebGLRenderer;
  private labelRenderer: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private batches: Batch[] = [];
  private lookup = new Map<string, { batch: Batch; id: number }>();
  private leaders?: THREE.LineSegments;
  private labels: { obj: CSS2DObject; assembled: Vec3; exploded: Vec3 }[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private explode = 0.7;
  private selectedKey: string | null = null;
  private isolatedAssembly: string | null = null;
  private flight: { from: [THREE.Vector3, THREE.Vector3]; to: [THREE.Vector3, THREE.Vector3]; start: number } | null = null;
  private frame = 0;
  private resizeObserver: ResizeObserver;
  private disposers: (() => void)[] = [];

  constructor(
    private container: HTMLElement,
    private layout: Layout,
    private callbacks: SceneCallbacks = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(BACKGROUND);
    container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'label-layer';
    container.appendChild(this.labelRenderer.domElement);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.scene.add(new THREE.HemisphereLight('#cfe6ff', '#1a2433', 2.2));
    const sun = new THREE.DirectionalLight('#ffffff', 1.2);
    sun.position.set(10, 20, 15);
    this.scene.add(sun);
    this.addGuides();
    this.buildBatches();
    this.buildLabels();
    this.applyExplode();
    this.resetView(false);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.bindPointer();
    const loop = () => {
      this.frame = requestAnimationFrame(loop);
      this.tick();
    };
    loop();
  }

  /** Faint blueprint grid and a bike silhouette for orientation. */
  private addGuides() {
    const grid = new THREE.GridHelper(80, 80, '#1d3350', '#13243a');
    grid.position.y = -0.2;
    this.scene.add(grid);

    const mat = new THREE.LineBasicMaterial({ color: '#2f5680', transparent: true, opacity: 0.8 });
    const circle = (x: number) => {
      const pts = new THREE.EllipseCurve(x, 3, 3, 3).getPoints(64).map((p) => new THREE.Vector3(p.x, p.y, 0));
      return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
    };
    this.scene.add(circle(7), circle(-7));
    // [x1, y1, x2, y2]: swingarm, frame spar, fork, fairing nose, tank, seat/tail.
    const lines = [
      [-7, 3, -3.5, 4.2], [-3.5, 4.2, 0, 6.8], [0, 6.8, 4.8, 8], [4.8, 8, 7, 3],
      [4.8, 8, 6.5, 9.6], [0, 6.8, -2, 8.6], [-2, 8.6, -6, 8.2],
    ];
    const segs = lines.flatMap(([x1, y1, x2, y2]) => [new THREE.Vector3(x1, y1, 0), new THREE.Vector3(x2, y2, 0)]);
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segs), mat));
  }

  private buildBatches() {
    const byKind = new Map<ShapeKind, PartNode[]>();
    for (const node of this.layout.parts) {
      const list = byKind.get(node.shape.kind) ?? [];
      list.push(node);
      byKind.set(node.shape.kind, list);
    }
    for (const [kind, nodes] of byKind) {
      const geo = createGeometry(kind);
      const fill = new THREE.InstancedMesh(
        geo,
        new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }),
        nodes.length,
      );
      const wire = new THREE.InstancedMesh(
        geo,
        new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true, transparent: true, opacity: 0.9 }),
        nodes.length,
      );
      wire.raycast = () => {}; // picking happens on the fill mesh only
      const batch = { kind, nodes, fill, wire };
      nodes.forEach((n, id) => this.lookup.set(n.key, { batch, id }));
      this.batches.push(batch);
      this.scene.add(fill, wire);
    }
    this.applyColors();
  }

  private buildLabels() {
    for (const c of this.layout.categories) {
      const el = document.createElement('div');
      el.className = 'cat-label';
      el.textContent = CATEGORY_LABELS[c.category];
      el.style.color = CATEGORY_COLORS[c.category];
      const obj = new CSS2DObject(el);
      this.scene.add(obj);
      const above = (v: Vec3, dy: number): Vec3 => [v[0], v[1] + dy, v[2]];
      this.labels.push({ obj, assembled: above(c.assembledCenter, 1.5), exploded: above(c.explodedCenter, c.radius + 0.8) });
    }

    // Leader lines from each category's place on the bike to its exploded block.
    const pts = this.layout.categories.flatMap((c) => [new THREE.Vector3(...c.assembledCenter), new THREE.Vector3(...c.explodedCenter)]);
    this.leaders = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: '#4b6f99', dashSize: 0.5, gapSize: 0.35, transparent: true }),
    );
    this.leaders.computeLineDistances();
    this.scene.add(this.leaders);
  }

  private applyColors() {
    const c = new THREE.Color();
    for (const { nodes, fill, wire } of this.batches) {
      nodes.forEach((n, i) => {
        const selected = n.key === this.selectedKey;
        const dimmed = this.isolatedAssembly !== null && n.assembly.id !== this.isolatedAssembly;
        c.set(selected ? SELECTED : CATEGORY_COLORS[n.assembly.category]);
        if (dimmed) c.multiplyScalar(DIM);
        wire.setColorAt(i, c);
        c.multiplyScalar(selected ? 0.9 : 0.35);
        fill.setColorAt(i, c);
      });
      fill.instanceColor!.needsUpdate = true;
      wire.instanceColor!.needsUpdate = true;
    }
  }

  private applyExplode() {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (const { nodes, fill, wire } of this.batches) {
      nodes.forEach((n, i) => {
        p.fromArray(lerp3(n.assembled, n.exploded, this.explode));
        const grow = n.key === this.selectedKey ? 1.35 : 1;
        // Shrink parts a little when assembled so dense clusters stay readable.
        const k = (0.45 + 0.55 * this.explode) * grow;
        s.set(n.shape.size[0] * k, n.shape.size[1] * k, n.shape.size[2] * k);
        m.compose(p, q, s);
        fill.setMatrixAt(i, m);
        wire.setMatrixAt(i, m);
      });
      fill.instanceMatrix.needsUpdate = true;
      wire.instanceMatrix.needsUpdate = true;
      fill.computeBoundingSphere();
    }
    for (const l of this.labels) l.obj.position.fromArray(lerp3(l.assembled, l.exploded, this.explode));
    if (this.leaders) {
      const pos = this.leaders.geometry.attributes.position as THREE.BufferAttribute;
      this.layout.categories.forEach((c, i) => {
        pos.setXYZ(i * 2 + 1, ...lerp3(c.assembledCenter, c.explodedCenter, this.explode));
      });
      pos.needsUpdate = true;
      this.leaders.computeLineDistances();
      (this.leaders.material as THREE.LineDashedMaterial).opacity = Math.max(0, this.explode - 0.15) * 0.8;
    }
  }

  setExplode(t: number) {
    // Keep the selected part in view: shift the camera with it.
    const before = this.selectedKey ? this.partPosition(this.selectedKey) : null;
    this.explode = t;
    this.applyExplode();
    if (before) {
      const delta = this.partPosition(this.selectedKey!)!.sub(before);
      this.camera.position.add(delta);
      this.controls.target.add(delta);
      if (this.flight) for (const v of [...this.flight.from, ...this.flight.to]) v.add(delta);
    }
  }

  private partPosition(key: string): THREE.Vector3 | null {
    const hit = this.lookup.get(key);
    if (!hit) return null;
    const n = hit.batch.nodes[hit.id];
    return new THREE.Vector3(...lerp3(n.assembled, n.exploded, this.explode));
  }

  select(key: string | null, fly = true) {
    if (key !== null && !this.lookup.has(key)) key = null;
    this.selectedKey = key;
    this.applyColors();
    this.applyExplode();
    if (key && fly) this.focusPart(key);
  }

  isolate(assemblyId: string | null) {
    this.isolatedAssembly = assemblyId;
    this.applyColors();
    if (assemblyId) {
      const a = this.layout.assemblies.find((x) => x.assembly.id === assemblyId);
      if (a) this.flyTo(new THREE.Vector3(...lerp3(a.assembledCenter, a.explodedCenter, this.explode)), a.radius * 3.2 + 4);
    }
  }

  get isolated() {
    return this.isolatedAssembly;
  }

  focusPart(key: string) {
    const pos = this.partPosition(key);
    if (pos) this.flyTo(pos, 9);
  }

  resetView(animate = true) {
    const box = new THREE.Box3();
    for (const n of this.layout.parts) box.expandByPoint(new THREE.Vector3(...lerp3(n.assembled, n.exploded, this.explode)));
    if (box.isEmpty()) box.set(new THREE.Vector3(-8, 0, -2), new THREE.Vector3(8, 10, 2));
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    const dist = Math.max(25, size * 0.95);
    const eye = center.clone().add(new THREE.Vector3(0.12, 0.18, 1).normalize().multiplyScalar(dist));
    if (animate) this.startFlight(eye, center);
    else {
      this.camera.position.copy(eye);
      this.controls.target.copy(center);
    }
  }

  /** Keep the current viewing direction, move to `distance` from `target`. */
  private flyTo(target: THREE.Vector3, distance: number) {
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.startFlight(target.clone().add(dir.multiplyScalar(distance)), target);
  }

  private startFlight(eye: THREE.Vector3, target: THREE.Vector3) {
    this.flight = {
      from: [this.camera.position.clone(), this.controls.target.clone()],
      to: [eye, target],
      start: performance.now(),
    };
  }

  private tick() {
    if (this.flight) {
      const f = this.flight;
      const t = Math.min(1, (performance.now() - f.start) / FLIGHT_MS);
      const e = 1 - Math.pow(1 - t, 3);
      this.camera.position.lerpVectors(f.from[0], f.to[0], e);
      this.controls.target.lerpVectors(f.from[1], f.to[1], e);
      if (t >= 1) this.flight = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.labelRenderer.setSize(w, h);
  }

  private pick(clientX: number, clientY: number): PartNode | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.batches.map((b) => b.fill), false);
    for (const hit of hits) {
      const batch = this.batches.find((b) => b.fill === hit.object);
      const node = batch && hit.instanceId !== undefined ? batch.nodes[hit.instanceId] : undefined;
      // When an assembly is isolated, ignore the faded parts.
      if (node && (!this.isolatedAssembly || node.assembly.id === this.isolatedAssembly)) return node;
    }
    return null;
  }

  private bindPointer() {
    const el = this.renderer.domElement;
    let down: { x: number; y: number } | null = null;
    let hoverQueued = false;
    let last = { x: 0, y: 0 };

    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      el.addEventListener(type, fn);
      this.disposers.push(() => el.removeEventListener(type, fn));
    };

    on('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    on('pointerup', (e) => {
      const isClick = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) <= 5;
      down = null;
      if (!isClick) return;
      const node = this.pick(e.clientX, e.clientY);
      this.callbacks.onSelect?.(node);
    });
    on('dblclick', (e) => {
      const node = this.pick(e.clientX, e.clientY);
      this.isolate(node ? node.assembly.id : null);
    });
    on('pointermove', (e) => {
      last = { x: e.clientX, y: e.clientY };
      if (hoverQueued) return;
      hoverQueued = true;
      requestAnimationFrame(() => {
        hoverQueued = false;
        const node = this.pick(last.x, last.y);
        el.style.cursor = node ? 'pointer' : '';
        this.callbacks.onHover?.(node, last.x, last.y);
      });
    });
    on('pointerleave', () => this.callbacks.onHover?.(null, 0, 0));
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.disposers.forEach((d) => d());
    this.controls.dispose();
    for (const b of this.batches) {
      b.fill.geometry.dispose();
      (b.fill.material as THREE.Material).dispose();
      (b.wire.material as THREE.Material).dispose();
      b.fill.dispose();
      b.wire.dispose();
    }
    this.leaders?.geometry.dispose();
    (this.leaders?.material as THREE.Material | undefined)?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelRenderer.domElement.remove();
  }
}
