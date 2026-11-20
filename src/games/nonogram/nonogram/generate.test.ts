import { describe, expect, it } from 'vitest';
import { LEVELS, SIZES, cluesOf, generate, rate, solveWithProbing } from './generate';
import { applyHint, findHint } from './hints';
import { type Cell, UNKNOWN } from './line';
import { solve, validatePuzzle } from './puzzle';

/** 매번 같은 결과가 나오는 난수 */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('랜덤 문제', () => {
  for (const size of SIZES) {
    for (const spec of LEVELS) {
      it(`${size}x${size} ${spec.label}: 답이 하나이고 줄 추론으로 풀리며 난이도 구간에 든다`, () => {
        const r = generate(size, spec.id, seeded(size * 10 + spec.label.length), 20000);
        expect(r.approximate).toBe(false);
        expect(r.puzzle.rows).toHaveLength(size);
        expect(r.puzzle.cols).toHaveLength(size);
        expect(validatePuzzle(r.puzzle)).toBeNull();
        expect(cluesOf(r.solution, size, size)).toEqual(r.puzzle);
        const res = solve(r.puzzle, 2);
        expect(res.count).toBe(1);
        expect(res.solution).toEqual(r.solution);
        const rating = rate(r.puzzle);
        if (spec.probe) {
          // 최상: 줄 추론으로는 막히고, 한 단계 가정으로 정답까지 간다
          expect(rating.solved).toBe(false);
          expect(solveWithProbing(r.puzzle)?.grid).toEqual(r.solution);
          return;
        }
        expect(rating.solved).toBe(true);
        expect(rating.open).toBeGreaterThanOrEqual(spec.minOpen);
        expect(rating.open).toBeLessThan(spec.maxOpen);
      });
    }
  }

  it('최상 문제는 힌트만 따라가도 정답까지 가고, 칸 공개 없이 가정 힌트로 푼다', () => {
    const r = generate(10, 'expert', seeded(77), 20000);
    let grid: Cell[] = new Array<Cell>(100).fill(UNKNOWN);
    const kinds = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const h = findHint(r.puzzle, grid, r.solution);
      if (!h) break;
      kinds.add(h.kind);
      grid = applyHint(h, grid);
    }
    expect(grid).toEqual(r.solution);
    expect(kinds.has('probe')).toBe(true);
    expect(kinds.has('reveal')).toBe(false);
  });
});
