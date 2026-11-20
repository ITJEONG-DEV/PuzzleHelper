import { describe, expect, it } from 'vitest';
import { rate } from '../../latin/engine';
import { applyHint, baseConflicts, findHint } from '../../latin/hints';
import { gridOf, skyConflicts, visible } from './board';
import { LEVELS, SIZES, generate } from './generate';

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

describe('스카이스크래퍼', () => {
  it('보이는 빌딩 수', () => {
    expect(visible([1, 2, 3, 4])).toBe(4);
    expect(visible([4, 3, 2, 1])).toBe(1);
    expect(visible([2, 1, 4, 3])).toBe(2);
  });

  for (const s of SIZES) {
    LEVELS.forEach((l, k) => {
      it(`${s.label} ${l.label}: 정답이 단서와 맞고, 난이도가 맞으며, 힌트만 따라가도 끝난다`, () => {
        const r = generate(s.id, l.id, seeded(s.id * 10 + k), 20000);
        expect(r.approximate).toBe(false);
        const g = gridOf(r.puzzle);
        expect(baseConflicts(g, r.solution).size).toBe(0);
        expect(skyConflicts(g.sky, r.solution)).toHaveLength(0);
        const rated = rate(g, 3);
        expect(rated.tier).toBe(k + 1);
        expect(rated.values).toEqual(r.solution);
        let values = g.givens.slice();
        let marks = values.map(() => 0);
        const kinds = new Set<string>();
        for (let i = 0; i < 2000; i++) {
          const h = findHint({ g, values, marks, solution: r.solution, conflicts: baseConflicts(g, values) });
          if (!h) break;
          kinds.add(h.kind);
          ({ values, marks } = applyHint(g, h, values, marks));
        }
        expect(values).toEqual(r.solution);
        expect(kinds.has('reveal')).toBe(false);
      }, 30000);
    });
  }
});
