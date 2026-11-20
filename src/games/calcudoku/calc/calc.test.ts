import { describe, expect, it } from 'vitest';
import { cageHolds, layoutOf } from './board';
import { LEVELS, SIZES, generate } from './generate';
import { applyHint, findHint } from './hints';
import { rate } from './logic';

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

describe('칼큐도쿠', () => {
  it('상자 계산', () => {
    expect(cageHolds({ cells: [0, 1], op: '÷', target: 3 }, [2, 6])).toBe(true);
    expect(cageHolds({ cells: [0, 1], op: '-', target: 2 }, [1, 3])).toBe(true);
    expect(cageHolds({ cells: [0, 1, 2], op: '×', target: 12 }, [1, 3, 4])).toBe(true);
    expect(cageHolds({ cells: [0, 1, 2], op: '+', target: 7 }, [1, 2, 3])).toBe(false);
  });

  for (const n of SIZES) {
    LEVELS.forEach((l, k) => {
      it(`${n}x${n} ${l.label}: 라틴 방진·상자 단서가 맞고, 난이도가 맞으며, 힌트만 따라가도 끝난다`, () => {
        const g = generate(n, l.id, seeded(n * 10 + k), 20000);
        expect(g.approximate).toBe(false);
        const { solution, puzzle } = g;
        for (let r = 0; r < n; r++) expect(new Set(solution.slice(r * n, r * n + n)).size).toBe(n);
        for (let c = 0; c < n; c++) expect(new Set(Array.from({ length: n }, (_, r) => solution[r * n + c])).size).toBe(n);
        for (const cage of puzzle.cages) expect(cageHolds(cage, cage.cells.map((i) => solution[i]))).toBe(true);
        expect(puzzle.cages.flatMap((c) => c.cells).sort((a, b) => a - b)).toEqual([...Array(n * n).keys()]);
        const lay = layoutOf(puzzle);
        const r = rate(lay, 3);
        expect(r.tier).toBe(k + 1);
        // 기법으로 끝까지 풀었으니 답은 하나이고 그 답이 정답이다
        expect(r.values).toEqual(solution);
        let values = new Array<number>(n * n).fill(0);
        let marks = values.slice();
        const kinds = new Set<string>();
        for (let i = 0; i < 2000; i++) {
          const h = findHint({ lay, values, marks, solution });
          if (!h) break;
          kinds.add(h.kind);
          ({ values, marks } = applyHint(lay, h, values, marks));
        }
        expect(values).toEqual(solution);
        expect(kinds.has('reveal')).toBe(false);
      });
    });
  }
});
