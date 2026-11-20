import { type Cage, type Deduction, type Grid, type Rule, bit, cageHolds, digitsOf, has, makeUnits } from '../../latin/engine';

/** 킬러 스도쿠: 9×9 스도쿠 + 점선 상자마다 합. 상자 안 숫자는 모두 다르다 */
export interface Puzzle {
  cages: Cage[];
  /** 처음부터 주어진 숫자(드물게, 0은 빈칸) */
  givens?: number[];
}

/**
 * 가상 상자: 칸들의 합이 target일 때 칸마다 가능한 숫자.
 * 같은 묶음(행·열·박스)의 칸끼리만 숫자가 달라야 한다.
 */
function virtualOptions(g: Grid, cells: number[], target: number, cand: number[]): number[] | null {
  const allowed = cells.map(() => 0);
  const pick: number[] = [];
  let any = false;
  let sum = 0;
  const rec = (t: number) => {
    if (t === cells.length) {
      if (sum !== target) return;
      any = true;
      pick.forEach((d, x) => (allowed[x] |= bit(d)));
      return;
    }
    const i = cells[t];
    for (const d of digitsOf(cand[i])) {
      if (sum + d > target || sum + d + (cells.length - t - 1) * 9 < target) continue;
      let ok = true;
      for (let x = 0; x < t; x++) {
        if (pick[x] === d && g.unitsOf[cells[x]].some((u) => g.unitsOf[i].includes(u))) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      pick.push(d);
      sum += d;
      rec(t + 1);
      sum -= d;
      pick.pop();
    }
  };
  rec(0);
  return any ? allowed : null;
}

/**
 * 45 규칙(2단계): 행·열·박스의 합은 45다.
 * - 안쪽 칸: 묶음 안에 완전히 든 상자의 합을 빼면, 남은 칸들의 합을 안다.
 * - 바깥 칸: 묶음에 걸친 상자들의 합에서 45를 빼면, 묶음 밖으로 삐져나온 칸들의 합을 안다.
 */
const rule45: Rule = {
  tier: 2,
  find(g, values, cand) {
    for (let u = 0; u < g.units.length; u++) {
      const unit = g.units[u];
      const inUnit = new Set(unit);
      const touching = [...new Set(unit.map((i) => g.cageOf[i]))];
      const inside = touching.filter((k) => g.cages[k].cells.every((i) => inUnit.has(i)));
      const covered = new Set(inside.flatMap((k) => g.cages[k].cells));
      const rest = unit.filter((i) => !covered.has(i));
      const tries: { cells: number[]; target: number; side: 'in' | 'out' }[] = [];
      if (rest.length >= 1 && rest.length <= 4) tries.push({ cells: rest, target: 45 - inside.reduce((s, k) => s + g.cages[k].target, 0), side: 'in' });
      const outside = touching.flatMap((k) => g.cages[k].cells.filter((i) => !inUnit.has(i)));
      if (outside.length >= 1 && outside.length <= 3) tries.push({ cells: outside, target: touching.reduce((s, k) => s + g.cages[k].target, 0) - 45, side: 'out' });
      for (const t of tries) {
        const open = t.cells.filter((i) => !values[i]);
        if (!open.length) continue;
        const allowed = virtualOptions(g, t.cells, t.target, cand);
        if (!allowed) continue;
        const elim = t.cells.flatMap((i, x) => (values[i] ? [] : digitsOf(cand[i] & ~allowed[x]).map((d) => ({ cell: i, digit: d }))));
        if (elim.length) return { kind: t.side === 'in' ? 'rule45-in' : 'rule45-out', tier: 2, eliminate: elim, line: u, cells: t.cells, digit: t.target } as Deduction;
      }
    }
    return null;
  },
};

const grids = new WeakMap<Puzzle, Grid>();

export function gridOf(p: Puzzle): Grid {
  const cached = grids.get(p);
  if (cached) return cached;
  const n = 9;
  const { units, unitsOf, peers } = makeUnits(n, 3);
  const cageOf = new Array<number>(n * n).fill(-1);
  p.cages.forEach((c, k) => c.cells.forEach((i) => (cageOf[i] = k)));
  const g: Grid = { n, units, unitsOf, peers, cages: p.cages, cageOf, cageAllDistinct: true, givens: p.givens ?? new Array(n * n).fill(0), rules: [rule45] };
  grids.set(p, g);
  return g;
}

/** 상자 합이 맞지 않거나 상자 안 숫자가 겹치는 칸 (다 채운 상자만) */
export function cageConflicts(g: Grid, values: number[]): number[] {
  const out: number[] = [];
  for (const c of g.cages) {
    const ds = c.cells.map((i) => values[i]);
    if (ds.every(Boolean) && (!cageHolds(c, ds) || new Set(ds).size !== ds.length)) out.push(...c.cells);
  }
  return out;
}

export { has };
