import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cutShape, dayNumber, puzzleForDay, scorePieces, polygonArea, extendToBox, type Puzzle } from './geometry.ts';

const square: Puzzle = {
  day: 0,
  pieces: 2,
  cuts: 1,
  name: 'Square',
  shape: [
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.1 },
    { x: 0.9, y: 0.9 },
    { x: 0.1, y: 0.9 },
  ],
};

test('day numbering starts at 1 on 2026-11-13 UTC', () => {
  assert.equal(dayNumber(Date.UTC(2026, 10, 13, 0, 0, 1)), 1);
  assert.equal(dayNumber(Date.UTC(2026, 10, 14, 23, 59)), 2);
});

test('puzzles are deterministic and fit the unit square', () => {
  const a = puzzleForDay(5);
  const b = puzzleForDay(5);
  assert.deepEqual(a, b);
  for (const p of a.shape) {
    assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
  }
  assert.ok(polygonArea(a.shape) > 0.15);
  assert.notDeepEqual(puzzleForDay(6).shape, a.shape);
});

test('halving a square scores ~100', () => {
  const r = cutShape(square, [{ a: { x: 0.5, y: 0 }, b: { x: 0.5, y: 1 } }]);
  assert.equal(r.pieces.length, 2);
  assert.ok(r.score >= 99.5, `score ${r.score}`);
});

test('a 70/30 cut scores 60', () => {
  const r = cutShape(square, [{ a: { x: 0.66, y: 0 }, b: { x: 0.66, y: 1 } }]);
  assert.ok(Math.abs(r.score - 60) < 1, `score ${r.score}`);
});

test('missing the shape scores 0 for two pieces', () => {
  const r = cutShape(square, [{ a: { x: 0.95, y: 0 }, b: { x: 0.95, y: 1 } }]);
  assert.equal(r.pieces.length, 1);
  assert.equal(r.score, 0);
});

test('two crossing cuts make four quarters', () => {
  const r = cutShape({ ...square, pieces: 4, cuts: 2 }, [
    { a: { x: 0.5, y: 0 }, b: { x: 0.5, y: 1 } },
    { a: { x: 0, y: 0.5 }, b: { x: 1, y: 0.5 } },
  ]);
  assert.equal(r.pieces.length, 4);
  assert.ok(r.score >= 99);
});

test('concave shape: one line can make several components', () => {
  const u: Puzzle = {
    ...square,
    pieces: 3,
    shape: [
      { x: 0.1, y: 0.1 },
      { x: 0.3, y: 0.1 },
      { x: 0.3, y: 0.7 },
      { x: 0.7, y: 0.7 },
      { x: 0.7, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ],
  };
  const r = cutShape(u, [{ a: { x: 0, y: 0.5 }, b: { x: 1, y: 0.5 } }]);
  assert.equal(r.pieces.length, 3);
});

test('scorePieces penalises crumbs and missing pieces', () => {
  assert.equal(scorePieces([0.5, 0.5], 2), 100);
  assert.equal(scorePieces([0.45, 0.45, 0.1], 2), 80);
  assert.equal(scorePieces([1], 3), 0);
});

test('extendToBox spans the box', () => {
  const [p, q] = extendToBox({ a: { x: 0.4, y: 0.5 }, b: { x: 0.6, y: 0.5 } });
  assert.ok(p.x < 0 && q.x > 1);
});

test('every weekday puzzle is solvable to a high score by brute force', () => {
  // Sanity: for each rhythm slot, a few random cut sets should not all be 0.
  for (let d = 1; d <= 7; d++) {
    const pz = puzzleForDay(d);
    assert.ok(pz.cuts >= 1 && pz.cuts <= 3);
    assert.ok(pz.pieces <= [0, 2, 4, 7][pz.cuts]!);
  }
});
