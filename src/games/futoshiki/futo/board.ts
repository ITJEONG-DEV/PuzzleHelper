import { type Deduction, type Grid, type Rule, bit, digitsOf, makeUnits } from '../../latin/engine';

/** 후토시키: N×N 라틴 방진 + 이웃한 칸 사이 부등호. less는 값[less] < 값[more] */
export interface Ineq {
  less: number;
  more: number;
}

export interface Puzzle {
  n: number;
  ineqs: Ineq[];
  givens: number[];
}

const maxDigit = (m: number) => 31 - Math.clz32(m);
const minDigit = (m: number) => 31 - Math.clz32(m & -m);

/**
 * 부등호 규칙(1단계): 작은 쪽은 큰 쪽의 가장 큰 후보보다 작아야 하고,
 * 큰 쪽은 작은 쪽의 가장 작은 후보보다 커야 한다.
 */
function ineqRule(ineqs: Ineq[]): Rule {
  return {
    tier: 1,
    find(_g, values, cand) {
      for (const q of ineqs) {
        const hi = maxDigit(cand[q.more]);
        const lo = minDigit(cand[q.less]);
        const fromLess = values[q.less] ? [] : digitsOf(cand[q.less]).filter((d) => d >= hi).map((d) => ({ cell: q.less, digit: d }));
        const fromMore = values[q.more] ? [] : digitsOf(cand[q.more]).filter((d) => d <= lo).map((d) => ({ cell: q.more, digit: d }));
        const elim = [...fromLess, ...fromMore];
        if (elim.length) return { kind: 'inequality', tier: 1, eliminate: elim, cells: [q.less, q.more] } as Deduction;
      }
      return null;
    },
    broken(_g, values) {
      return ineqs.some((q) => values[q.less] && values[q.more] && values[q.less] >= values[q.more]);
    },
  };
}

const grids = new WeakMap<Puzzle, Grid & { ineqs: Ineq[] }>();

export function gridOf(p: Puzzle): Grid & { ineqs: Ineq[] } {
  const cached = grids.get(p);
  if (cached) return cached;
  const { n } = p;
  const { units, unitsOf, peers } = makeUnits(n);
  const g = { n, units, unitsOf, peers, cages: [], cageOf: new Array(n * n).fill(-1), cageAllDistinct: false, givens: p.givens, rules: [ineqRule(p.ineqs)], ineqs: p.ineqs };
  grids.set(p, g);
  return g;
}

/** 부등호를 어긴 칸 */
export function ineqConflicts(ineqs: Ineq[], values: number[]): number[] {
  return ineqs.filter((q) => values[q.less] && values[q.more] && values[q.less] >= values[q.more]).flatMap((q) => [q.less, q.more]);
}

export { bit };
