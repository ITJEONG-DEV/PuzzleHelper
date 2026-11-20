import { describe, expect, it } from 'vitest';
import { type Layout, layoutOf } from './board';
import { LEVELS, SIZES, generate, rate } from './generate';
import { applyHint, findHint } from './hints';
import { solve } from './solver';

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

/** 힌트만 따라 끝까지 풀고, 쓴 힌트 종류를 돌려준다 */
function followHints(lay: Layout, solution: number[]) {
  let values = lay.p.white.map(() => 0);
  let marks = values.slice();
  const kinds = new Set<string>();
  for (let i = 0; i < 3000; i++) {
    const h = findHint({ lay, values, marks, solution });
    if (!h) break;
    kinds.add(h.kind);
    ({ values, marks } = applyHint(lay, h, values, marks));
  }
  return { values, kinds };
}

describe('랜덤 문제', () => {
  for (const size of SIZES) {
    LEVELS.forEach((spec, k) => {
      it(`${size}x${size} ${spec.label}: 답이 하나이고 힌트 엔진 판정이 난이도와 같다`, () => {
        const r = generate(size, spec.id, seeded(size * 10 + k), 30000);
        expect(r.approximate).toBe(false);
        const lay = layoutOf(r.puzzle);
        // 모든 흰 칸이 가로·세로 2칸 이상 줄에 속한다
        for (let i = 0; i < r.puzzle.white.length; i++) {
          if (!r.puzzle.white[i]) continue;
          for (const run of lay.cellRuns[i]) {
            expect(run).toBeGreaterThanOrEqual(0);
            expect(lay.runs[run].cells.length).toBeGreaterThanOrEqual(2);
          }
        }
        const res = solve(lay);
        expect(res.count).toBe(1);
        expect(res.solution).toEqual(r.solution);
        expect(rate(lay)).toBe(k + 1);
        const { values, kinds } = followHints(lay, r.solution);
        expect(values).toEqual(r.solution);
        expect(kinds.has('reveal')).toBe(false);
        if (spec.id === 'expert') expect(kinds.has('probe')).toBe(true);
      });
    });
  }
});
