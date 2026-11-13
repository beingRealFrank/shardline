import { extendToBox, type Cut, type Piece, type Pt, type Puzzle } from '../shared/geometry';

export const COLORS = {
  ink: '#16151d',
  paper: '#f4ead5',
  paperEdge: '#d9c9a6',
  blade: '#ff5c4d',
  bladeSoft: 'rgba(255,92,77,0.35)',
  grid: 'rgba(244,234,213,0.05)',
};

// Muted jewel tones for revealed pieces.
export const PIECE_COLORS = ['#f2b84b', '#5fb3a1', '#e0735a', '#7d8fd8', '#c78bd1', '#9cc46a', '#e6a0b4'];

const shapePath = (ctx: CanvasRenderingContext2D, shape: Pt[], s: number) => {
  ctx.beginPath();
  shape.forEach((p, i) => (i ? ctx.lineTo(p.x * s, p.y * s) : ctx.moveTo(p.x * s, p.y * s)));
  ctx.closePath();
};

// Clip the context to the half-plane of `cut` on `sideBit`.
const clipHalf = (ctx: CanvasRenderingContext2D, cut: Cut, sideBit: number, s: number) => {
  const [p0, p1] = extendToBox(cut, -2, 3);
  const dx = cut.b.x - cut.a.x;
  const dy = cut.b.y - cut.a.y;
  const len = Math.hypot(dx, dy) || 1;
  const n = sideBit ? { x: -dy / len, y: dx / len } : { x: dy / len, y: -dx / len };
  ctx.beginPath();
  ctx.moveTo(p0.x * s, p0.y * s);
  ctx.lineTo(p1.x * s, p1.y * s);
  ctx.lineTo((p1.x + n.x * 10) * s, (p1.y + n.y * 10) * s);
  ctx.lineTo((p0.x + n.x * 10) * s, (p0.y + n.y * 10) * s);
  ctx.closePath();
  ctx.clip();
};

const backdrop = (ctx: CanvasRenderingContext2D, s: number) => {
  ctx.clearRect(0, 0, s, s);
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    ctx.beginPath();
    ctx.moveTo((i / 10) * s, 0);
    ctx.lineTo((i / 10) * s, s);
    ctx.moveTo(0, (i / 10) * s);
    ctx.lineTo(s, (i / 10) * s);
    ctx.stroke();
  }
};

export const drawPlay = (
  ctx: CanvasRenderingContext2D,
  s: number,
  puzzle: Puzzle,
  cuts: Cut[],
  active: number | null
) => {
  backdrop(ctx, s);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = s * 0.03;
  ctx.shadowOffsetY = s * 0.012;
  shapePath(ctx, puzzle.shape, s);
  ctx.fillStyle = COLORS.paper;
  ctx.fill();
  ctx.restore();
  shapePath(ctx, puzzle.shape, s);
  ctx.strokeStyle = COLORS.paperEdge;
  ctx.lineWidth = 2;
  ctx.stroke();

  cuts.forEach((c, i) => {
    const [p, q] = extendToBox(c);
    ctx.save();
    ctx.setLineDash([s * 0.018, s * 0.012]);
    ctx.strokeStyle = i === active ? COLORS.blade : COLORS.bladeSoft;
    ctx.lineWidth = i === active ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(p.x * s, p.y * s);
    ctx.lineTo(q.x * s, q.y * s);
    ctx.stroke();
    ctx.restore();
    // Solid blade between the handles.
    ctx.strokeStyle = COLORS.blade;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(c.a.x * s, c.a.y * s);
    ctx.lineTo(c.b.x * s, c.b.y * s);
    ctx.stroke();
    for (const h of [c.a, c.b]) {
      ctx.beginPath();
      ctx.arc(h.x * s, h.y * s, 9, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.ink;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = COLORS.blade;
      ctx.stroke();
    }
  });
};

// t: 0..1 animation progress of the pieces drifting apart.
export const drawReveal = (
  ctx: CanvasRenderingContext2D,
  s: number,
  puzzle: Puzzle,
  cuts: Cut[],
  pieces: Piece[],
  t: number
) => {
  backdrop(ctx, s);
  const ease = 1 - Math.pow(1 - Math.min(1, t), 3);
  const cx = pieces.reduce((a, p) => a + p.cx * p.area, 0);
  const cy = pieces.reduce((a, p) => a + p.cy * p.area, 0);
  // Group components by side-key; components sharing a key move together.
  const byKey = new Map<number, Piece[]>();
  pieces.forEach((p) => byKey.set(p.key, [...(byKey.get(p.key) ?? []), p]));
  const keys = [...byKey.keys()];
  const offsetFor = (key: number) => {
    const group = byKey.get(key)!;
    const area = group.reduce((a, p) => a + p.area, 0) || 1;
    const gx = group.reduce((a, p) => a + p.cx * p.area, 0) / area;
    const gy = group.reduce((a, p) => a + p.cy * p.area, 0) / area;
    const dx = gx - cx;
    const dy = gy - cy;
    const d = Math.hypot(dx, dy) || 1;
    return { x: (dx / d) * 0.035 * ease, y: (dy / d) * 0.035 * ease };
  };
  keys.forEach((key, idx) => {
    const off = offsetFor(key);
    ctx.save();
    ctx.translate(off.x * s, off.y * s);
    cuts.forEach((c, ci) => clipHalf(ctx, c, (key >> ci) & 1, s));
    shapePath(ctx, puzzle.shape, s);
    ctx.fillStyle = mix(COLORS.paper, PIECE_COLORS[idx % PIECE_COLORS.length]!, ease);
    ctx.fill();
    ctx.strokeStyle = 'rgba(22,21,29,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  });
  if (ease > 0.6) {
    ctx.globalAlpha = (ease - 0.6) / 0.4;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(s * 0.042)}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    pieces.forEach((p) => {
      if (p.area < 0.02) return;
      const off = offsetFor(p.key);
      const x = (p.cx + off.x) * s;
      const y = (p.cy + off.y) * s;
      const label = `${(p.area * 100).toFixed(1)}%`;
      ctx.shadowColor = 'rgba(255,250,240,0.55)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#16151d';
      ctx.fillText(label, x, y);
      ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1;
  }
};

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => {
  const A = hex(a);
  const B = hex(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i]! - v) * t)).join(',')})`;
};

export const shapeSvgPath = (shape: Pt[], s = 100): string =>
  shape.map((p, i) => `${i ? 'L' : 'M'}${(p.x * s).toFixed(1)} ${(p.y * s).toFixed(1)}`).join(' ') + 'Z';
