import { describe, expect, it } from 'vitest';
import { type Cell, GRASS, TENT, UNKNOWN, canPair, isSolved, layoutOf, startState } from './board';
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

describe('텐트와 나무', () => {
  it('나무·텐트 짝: 한 텐트를 두 나무가 나눠 쓸 수 없다', () => {
    // 1행: 나무 텐트 나무 → 텐트 하나에 나무 둘
    const lay = layoutOf({ n: 3, trees: [0, 2], rows: [1, 0, 0], cols: [0, 1, 0] });
    const s = startState(lay);
    s[1] = TENT;
    for (let i = 3; i < 9; i++) s[i] = GRASS;
    expect(canPair(lay, s)).toBe(false);
  });

  for (const n of SIZES) {
    LEVELS.forEach((l, k) => {
      it(`${n}x${n} ${l.label}: 단서가 맞고 난이도가 맞으며, 힌트만 따라가도 끝난다`, () => {
        const g = generate(n, l.id, seeded(n * 10 + k), 20000);
        expect(g.approximate).toBe(false);
        const lay = layoutOf(g.puzzle);
        expect(g.solution).toHaveLength(g.puzzle.trees.length);
        const final: Cell[] = startState(lay).map((s, i) => (s === UNKNOWN ? (g.solution.includes(i) ? TENT : GRASS) : s)) as Cell[];
        expect(isSolved(lay, final)).toBe(true);
        expect(rate(lay, 3).tier).toBe(k + 1);
        let state = startState(lay);
        const kinds = new Set<string>();
        for (let i = 0; i < 2000; i++) {
          const h = findHint({ lay, state, solution: g.solution });
          if (!h) break;
          kinds.add(h.kind);
          state = applyHint(h, state);
        }
        expect(isSolved(lay, state)).toBe(true);
        expect(kinds.has('reveal')).toBe(false);
      });
    });
  }
});
