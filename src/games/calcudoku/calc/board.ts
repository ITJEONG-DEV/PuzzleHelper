/** 칼큐도쿠(켄켄과 같은 규칙): N×N 라틴 방진 + 상자마다 사칙연산 결과 */
import { type Cage, type Grid, cageHolds, makeUnits } from '../../latin/engine';

export { type Cage, type Op, bit, cageHolds, cellName, digitsOf, fullMask, has, onlyDigit, popcount } from '../../latin/engine';

export interface Puzzle {
  n: number;
  cages: Cage[];
}

/** 공용 엔진 판에 이 게임의 문제(p)와 행·열(lines)을 붙인 것 */
export interface Layout extends Grid {
  p: Puzzle;
  lines: number[][];
}

const layouts = new WeakMap<Puzzle, Layout>();

export function layoutOf(p: Puzzle): Layout {
  const cached = layouts.get(p);
  if (cached) return cached;
  const { n } = p;
  const { units, unitsOf, peers } = makeUnits(n);
  const cageOf = new Array<number>(n * n).fill(-1);
  p.cages.forEach((c, k) => c.cells.forEach((i) => (cageOf[i] = k)));
  const lay: Layout = { p, n, units, lines: units, unitsOf, peers, cages: p.cages, cageOf, cageAllDistinct: false, givens: new Array(n * n).fill(0), rules: [] };
  layouts.set(p, lay);
  return lay;
}

export const lineName = (n: number, li: number) => (li < n ? `${li + 1}행` : `${li - n + 1}열`);
export const cageText = (c: Cage) => (c.op === '=' ? `${c.target}` : `${c.target}${c.op}`);

/** 같은 행·열의 같은 숫자, 다 채운 상자의 틀린 계산 */
export function conflictCells(lay: Layout, values: number[]): Set<number> {
  const out = new Set<number>();
  for (const line of lay.lines) {
    for (const i of line) if (values[i] && line.some((j) => j !== i && values[j] === values[i])) out.add(i);
  }
  for (const c of lay.p.cages) {
    const ds = c.cells.map((i) => values[i]);
    if (ds.every(Boolean) && !cageHolds(c, ds)) for (const i of c.cells) out.add(i);
  }
  return out;
}
