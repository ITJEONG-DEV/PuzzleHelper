import { describe, expect, it } from 'vitest';
import { type Cell, EMPTY, STAR, UNKNOWN, isSolved, layoutOf } from './board';
import { LEVELS, SIZES, generate } from './generate';
import { applyHint, findHint } from './hints';
import { rate } from './logic';
import { solveCount } from './solver';

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

describe('스타 배틀 랜덤 문제', () => {
  for (const s of SIZES) {
    LEVELS.forEach((l, k) => {
      it(`${s.n}x${s.n} ${l.label}: 답이 하나이고 난이도가 맞으며, 힌트만 따라가도 끝난다`, () => {
        const g = generate(s.id, l.id, seeded(s.n * 10 + k), 20000);
        expect(g.approximate).toBe(false);
        const lay = layoutOf(g.puzzle);
        // 영역마다 칸이 이어져 있고 n개 영역이 모두 있다
        expect(new Set(g.puzzle.region).size).toBe(s.n);
        const sols = solveCount(g.puzzle, 2);
        expect(sols).toHaveLength(1);
        expect(sols[0]).toEqual(g.solution);
        expect(rate(lay, 3).tier).toBe(k + 1);
        let state: Cell[] = g.puzzle.region.map(() => UNKNOWN);
        const kinds = new Set<string>();
        for (let i = 0; i < 500; i++) {
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

  it('잘못 둔 별·×를 먼저 알려준다', () => {
    const g = generate('s6', 'easy', seeded(3));
    const lay = layoutOf(g.puzzle);
    const state: Cell[] = g.puzzle.region.map(() => UNKNOWN);
    const notStar = state.findIndex((_, i) => !g.solution.includes(i));
    state[notStar] = STAR;
    expect(findHint({ lay, state, solution: g.solution })?.kind).toBe('wrong-star');
    state[notStar] = UNKNOWN;
    state[g.solution[0]] = EMPTY;
    expect(findHint({ lay, state, solution: g.solution })?.kind).toBe('wrong-mark');
  });
});
