// Shardline geometry: daily shape generation, cutting and scoring.
// Pure functions, shared by client (preview/animation) and server (authoritative score).

export type Pt = { x: number; y: number };
export type Cut = { a: Pt; b: Pt };

export type Puzzle = {
  day: number;
  pieces: number;
  cuts: number;
  shape: Pt[]; // simple polygon in the unit square
  name: string;
};

export type Piece = {
  key: number; // bitmask of which side of each cut
  area: number; // fraction of total shape area, 0..1
  cx: number; // centroid in unit coords
  cy: number;
};

export type CutResult = {
  pieces: Piece[]; // sorted by area, largest first
  score: number; // 0..100, one decimal
};

// Day 1 is 2026-11-13 (UTC).
const EPOCH_UTC = Date.UTC(2026, 10, 13);
const DAY_MS = 86_400_000;

export const dayNumber = (now: number): number =>
  Math.floor((now - EPOCH_UTC) / DAY_MS) + 1;

export const dayStartMs = (day: number): number => EPOCH_UTC + (day - 1) * DAY_MS;

// mulberry32: small, fast, deterministic PRNG.
export const rng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Weekly difficulty rhythm (index by UTC weekday, 0 = Sunday).
const RHYTHM: { pieces: number; cuts: number }[] = [
  { pieces: 6, cuts: 3 }, // Sun
  { pieces: 2, cuts: 1 }, // Mon
  { pieces: 3, cuts: 2 }, // Tue
  { pieces: 4, cuts: 2 }, // Wed
  { pieces: 3, cuts: 2 }, // Thu
  { pieces: 4, cuts: 3 }, // Fri
  { pieces: 5, cuts: 3 }, // Sat
];

const ADJ = ['Quiet', 'Amber', 'Broken', 'Hollow', 'Velvet', 'Crooked', 'Lucky', 'Salt', 'Paper', 'Iron', 'Feral', 'Pale', 'Restless', 'Gilded', 'Sunken', 'Tidal'];
const NOUN = ['Moth', 'Island', 'Lantern', 'Comet', 'Fern', 'Harbor', 'Crown', 'Kite', 'Pebble', 'Thistle', 'Anchor', 'Ember', 'Glacier', 'Orchid', 'Reef', 'Spire'];

export const puzzleForDay = (day: number): Puzzle => {
  const r = rng(day * 7919 + 17);
  const weekday = new Date(dayStartMs(day)).getUTCDay();
  const { pieces, cuts } = RHYTHM[weekday]!;
  const name = `${ADJ[Math.floor(r() * ADJ.length)]} ${NOUN[Math.floor(r() * NOUN.length)]}`;
  const family = SHAPE_FAMILIES[day % SHAPE_FAMILIES.length]!;
  return { day, pieces, cuts, shape: makeShape(r, family), name };
};

// Shapes are star-shaped radial polygons (always simple, often concave), in
// three families so the week does not feel samey:
//  - shard: few sharp facets, like a broken tile
//  - blob: smooth with strong lobes
//  - bite: a smooth body with one or two deep notches
export const SHAPE_FAMILIES = ['shard', 'blob', 'bite'] as const;

const makeShape = (r: () => number, family: (typeof SHAPE_FAMILIES)[number]): Pt[] => {
  const raw: Pt[] = [];
  const squash = 0.7 + r() * 0.6;
  const tilt = r() * Math.PI;
  if (family === 'shard') {
    const n = 5 + Math.floor(r() * 5);
    const angles = Array.from({ length: n }, (_, i) => ((i + 0.15 + r() * 0.7) / n) * Math.PI * 2);
    for (const t of angles) {
      const rad = 0.45 + r() * 0.55;
      raw.push({ x: Math.cos(t) * rad * squash, y: Math.sin(t) * rad });
    }
  } else {
    const n = 60;
    const strength = family === 'blob' ? 0.38 : 0.16;
    const harmonics = [2, 3, 4, 5, 7].map((k) => ({ k, amp: (r() * strength) / Math.sqrt(k), phase: r() * Math.PI * 2 }));
    const bites =
      family === 'bite'
        ? Array.from({ length: 1 + Math.floor(r() * 2) }, () => ({ at: r() * Math.PI * 2, depth: 0.45 + r() * 0.25, width: 0.18 + r() * 0.15 }))
        : [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      let rad = 1;
      for (const h of harmonics) rad += h.amp * Math.sin(h.k * t + h.phase);
      for (const b of bites) {
        const d = Math.atan2(Math.sin(t - b.at), Math.cos(t - b.at));
        rad -= b.depth * Math.exp(-(d * d) / (2 * b.width * b.width));
      }
      rad = Math.max(0.3, rad);
      raw.push({ x: Math.cos(t) * rad * squash, y: Math.sin(t) * rad });
    }
  }
  return fitUnit(
    raw.map((p) => ({ x: p.x * Math.cos(tilt) - p.y * Math.sin(tilt), y: p.x * Math.sin(tilt) + p.y * Math.cos(tilt) })),
    0.08
  );
};

const fitUnit = (pts: Pt[], margin: number): Pt[] => {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX;
  const h = Math.max(...ys) - minY;
  const s = (1 - 2 * margin) / Math.max(w, h);
  const ox = (1 - w * s) / 2;
  const oy = (1 - h * s) / 2;
  return pts.map((p) => ({
    x: round4((p.x - minX) * s + ox),
    y: round4((p.y - minY) * s + oy),
  }));
};

const round4 = (v: number) => Math.round(v * 10000) / 10000;

export const polygonArea = (poly: Pt[]): number => {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j]!.x + poly[i]!.x) * (poly[j]!.y - poly[i]!.y);
  }
  return Math.abs(a) / 2;
};

// Which side of the (infinite) line through cut.a and cut.b a point lies on.
const side = (c: Cut, x: number, y: number): number =>
  (c.b.x - c.a.x) * (y - c.a.y) - (c.b.y - c.a.y) * (x - c.a.x) > 0 ? 1 : 0;

export const validCut = (c: Cut): boolean =>
  [c.a.x, c.a.y, c.b.x, c.b.y].every((v) => Number.isFinite(v) && v >= -1 && v <= 2) &&
  Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y) > 0.01;

// Rasterise the shape on an N x N grid, label each inside cell by its side
// pattern, then split into connected components. Robust for concave shapes.
export const cutShape = (puzzle: Puzzle, cuts: Cut[], N = 480): CutResult => {
  const poly = puzzle.shape;
  const label = new Int16Array(N * N).fill(-1);
  let inside = 0;
  for (let row = 0; row < N; row++) {
    const y = (row + 0.5) / N;
    const xs: number[] = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const p = poly[i]!;
      const q = poly[j]!;
      if (p.y > y !== q.y > y) xs.push(p.x + ((y - p.y) / (q.y - p.y)) * (q.x - p.x));
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil(xs[k]! * N - 0.5));
      const c1 = Math.min(N - 1, Math.floor(xs[k + 1]! * N - 0.5));
      for (let col = c0; col <= c1; col++) {
        const x = (col + 0.5) / N;
        let key = 0;
        for (let ci = 0; ci < cuts.length; ci++) key |= side(cuts[ci]!, x, y) << ci;
        label[row * N + col] = key;
        inside++;
      }
    }
  }

  const comp = new Int32Array(N * N).fill(-1);
  const pieces: Piece[] = [];
  const stack: number[] = [];
  for (let start = 0; start < N * N; start++) {
    if (label[start]! < 0 || comp[start]! >= 0) continue;
    const key = label[start]!;
    const id = pieces.length;
    let count = 0;
    let sx = 0;
    let sy = 0;
    comp[start] = id;
    stack.push(start);
    while (stack.length) {
      const cell = stack.pop()!;
      const row = (cell / N) | 0;
      const col = cell - row * N;
      count++;
      sx += col;
      sy += row;
      const nbrs = [
        col > 0 ? cell - 1 : -1,
        col < N - 1 ? cell + 1 : -1,
        row > 0 ? cell - N : -1,
        row < N - 1 ? cell + N : -1,
      ];
      for (const nb of nbrs) {
        if (nb >= 0 && comp[nb]! < 0 && label[nb] === key) {
          comp[nb] = id;
          stack.push(nb);
        }
      }
    }
    pieces.push({ key, area: count / inside, cx: (sx / count + 0.5) / N, cy: (sy / count + 0.5) / N });
  }
  pieces.sort((p, q) => q.area - p.area);
  return { pieces, score: scorePieces(pieces.map((p) => p.area), puzzle.pieces) };
};

// Accuracy: the P largest pieces are compared to the ideal 1/P share; any area
// in extra crumbs, or missing pieces, counts as error. 100 = perfect.
export const scorePieces = (areas: number[], target: number): number => {
  const sorted = [...areas].sort((a, b) => b - a);
  const ideal = 1 / target;
  let err = 0;
  for (let i = 0; i < target; i++) err += Math.abs((sorted[i] ?? 0) - ideal);
  for (let i = target; i < sorted.length; i++) err += sorted[i]!;
  return Math.max(0, Math.round((100 - err * 100) * 10) / 10);
};

// Extend a cut to the edges of the unit square (for drawing).
export const extendToBox = (c: Cut, lo = -0.05, hi = 1.05): [Pt, Pt] => {
  const dx = c.b.x - c.a.x;
  const dy = c.b.y - c.a.y;
  const ts: number[] = [];
  const add = (t: number) => {
    const x = c.a.x + dx * t;
    const y = c.a.y + dy * t;
    if (x >= lo - 1e-9 && x <= hi + 1e-9 && y >= lo - 1e-9 && y <= hi + 1e-9) ts.push(t);
  };
  if (dx !== 0) {
    add((lo - c.a.x) / dx);
    add((hi - c.a.x) / dx);
  }
  if (dy !== 0) {
    add((lo - c.a.y) / dy);
    add((hi - c.a.y) / dy);
  }
  if (ts.length < 2) return [c.a, c.b];
  const t0 = Math.min(...ts);
  const t1 = Math.max(...ts);
  return [
    { x: c.a.x + dx * t0, y: c.a.y + dy * t0 },
    { x: c.a.x + dx * t1, y: c.a.y + dy * t1 },
  ];
};

export const HIST_BUCKETS = 20; // 5-point buckets over 0..100
export const bucketOf = (score: number): number => Math.min(HIST_BUCKETS - 1, Math.floor(score / 5));
