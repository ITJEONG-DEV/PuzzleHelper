import { describe, expect, it } from 'vitest';
import { rate } from '../../latin/engine';
import { applyHint, baseConflicts, findHint } from '../../latin/hints';
import { gridOf } from './board';
import { LEVELS, generate } from './generate';

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

describe('킬러 스도쿠', () => {
  LEVELS.forEach((l, k) => {
    it(`${l.label}: 상자 합·스도쿠 규칙이 맞고, 난이도가 맞으며, 힌트만 따라가도 끝난다`, () => {
      const r = generate('k9', l.id, seeded(90 + k), 30000);
      expect(r.approximate).toBe(false);
      const g = gridOf(r.puzzle);
      // 정답이 스도쿠 규칙과 상자 합을 모두 지킨다
      expect(baseConflicts(g, r.solution).size).toBe(0);
      expect(r.puzzle.cages.flatMap((c) => c.cells).sort((a, b) => a - b)).toEqual([...Array(81).keys()]);
      for (const c of r.puzzle.cages) expect(new Set(c.cells.map((i) => r.solution[i])).size).toBe(c.cells.length);
      const rated = rate(g, 3);
      expect(rated.tier).toBe(k + 1);
      expect(rated.values).toEqual(r.solution);
      let values = g.givens.slice();
      let marks = values.map(() => 0);
      const kinds = new Set<string>();
      for (let i = 0; i < 3000; i++) {
        const h = findHint({ g, values, marks, solution: r.solution, conflicts: baseConflicts(g, values) });
        if (!h) break;
        kinds.add(h.kind);
        ({ values, marks } = applyHint(g, h, values, marks));
      }
      expect(values).toEqual(r.solution);
      expect(kinds.has('reveal')).toBe(false);
    }, 60000);
  });
});
