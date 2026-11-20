import { type Cell, EMPTY, type Layout, STAR, UNKNOWN, type Unit, lineCapacity, unitInfo } from './board';

export type DeductionKind = 'neighbors' | 'unit-full' | 'unit-fill' | 'confine' | 'kill' | 'pigeonhole' | 'probe';

export interface Deduction {
  kind: DeductionKind;
  /** 기법 단계 1~3 */
  tier: number;
  stars: number[];
  empties: number[];
  /** 근거가 된 묶음 번호 */
  units: number[];
  /** 근거가 된 칸 (별 주변·넣어 보기의 칸) */
  cell?: number;
  /** 'confine'·'pigeonhole'에서 좁혀진 쪽 묶음 */
  inside?: number[];
}

const need = (lay: Layout, u: Unit, state: Cell[]) => lay.p.k - unitInfo(u, state).stars;

/** 묶음에 별을 다 넣을 수 있는가 (행·열은 닿지 않게 놓을 수 있는 수까지 본다) */
function canFill(lay: Layout, u: Unit, state: Cell[]): boolean {
  const { stars, open } = unitInfo(u, state);
  const left = lay.p.k - stars;
  if (left < 0) return false;
  if (u.kind === 'region') return open.length >= left;
  return lineCapacity(u.cells, state) >= left;
}

/** 판이 이미 모순인가 (닿은 별, 별이 넘친 묶음, 별을 다 못 채우는 묶음) */
export function broken(lay: Layout, state: Cell[]): number {
  for (let i = 0; i < state.length; i++) {
    if (state[i] === STAR && lay.neighbors[i].some((j) => state[j] === STAR)) return lay.unitsOf[i][0];
  }
  return lay.units.findIndex((u) => !canFill(lay, u, state));
}

/** 1단계: 별 주변 */
function findNeighbors(lay: Layout, state: Cell[]): Deduction | null {
  for (let i = 0; i < state.length; i++) {
    if (state[i] !== STAR) continue;
    const empties = lay.neighbors[i].filter((j) => state[j] === UNKNOWN);
    if (empties.length) return { kind: 'neighbors', tier: 1, stars: [], empties, units: [], cell: i };
  }
  return null;
}

/** 1단계: 별을 다 넣은 묶음의 나머지 / 남은 칸이 필요한 별 수와 같은 묶음 */
function findUnit(lay: Layout, state: Cell[]): Deduction | null {
  for (let ui = 0; ui < lay.units.length; ui++) {
    const u = lay.units[ui];
    const { stars, open } = unitInfo(u, state);
    if (!open.length) continue;
    if (stars === lay.p.k) return { kind: 'unit-full', tier: 1, stars: [], empties: open, units: [ui] };
    const left = lay.p.k - stars;
    if (open.length === left) return { kind: 'unit-fill', tier: 1, stars: open, empties: [], units: [ui] };
  }
  return null;
}

/** 묶음 집합 A의 빈칸이 모두 묶음 집합 B 안에 있고 필요한 별 수가 같으면, B의 나머지 칸은 빈칸 */
function confineCheck(lay: Layout, state: Cell[], A: number[], B: number[]): number[] {
  const needA = A.reduce((s, ui) => s + need(lay, lay.units[ui], state), 0);
  const needB = B.reduce((s, ui) => s + need(lay, lay.units[ui], state), 0);
  if (needA !== needB || needA <= 0) return [];
  const inA = new Set(A.flatMap((ui) => unitInfo(lay.units[ui], state).open));
  return [...new Set(B.flatMap((ui) => unitInfo(lay.units[ui], state).open))].filter((i) => !inA.has(i));
}

/** 묶음 하나의 빈칸이 다른 종류 묶음 m개 안에 모두 들어 있는 경우 (m=1이면 1단계, 2 이상이면 3단계) */
function findConfine(lay: Layout, state: Cell[], m: number): Deduction | null {
  const { n } = lay.p;
  // 묶음 종류 쌍: 영역↔행, 영역↔열, 행↔영역, 열↔영역
  const groups: [number, number][] = [
    [2, 0],
    [2, 1],
    [0, 2],
    [1, 2],
  ];
  for (const [ga, gb] of groups) {
    const aUnits = Array.from({ length: n }, (_, k) => ga * n + k).filter((ui) => unitInfo(lay.units[ui], state).open.length);
    const pick = (start: number, acc: number[]): Deduction | null => {
      if (acc.length === m) {
        // A가 걸친 B 묶음들
        const B = [...new Set(acc.flatMap((ui) => unitInfo(lay.units[ui], state).open.map((i) => lay.unitsOf[i][gb])))];
        if (B.length !== m) return null;
        const empties = confineCheck(lay, state, acc, B);
        if (!empties.length) return null;
        return { kind: m === 1 ? 'confine' : 'pigeonhole', tier: m === 1 ? 1 : 3, stars: [], empties, units: B, inside: acc };
      }
      for (let k = start; k < aUnits.length; k++) {
        const d = pick(k + 1, [...acc, aUnits[k]]);
        if (d) return d;
      }
      return null;
    };
    const d = pick(0, []);
    if (d) return d;
  }
  return null;
}

/** 칸에 별을 둔다고 할 때 바로 빈칸이 되는 칸 (주변, 다 찬 묶음의 나머지) */
function afterStar(lay: Layout, state: Cell[], c: number): Cell[] {
  const s = state.slice();
  s[c] = STAR;
  for (const j of lay.neighbors[c]) if (s[j] === UNKNOWN) s[j] = EMPTY;
  for (const ui of lay.unitsOf[c]) {
    const u = lay.units[ui];
    if (unitInfo(u, s).stars === lay.p.k) for (const i of u.cells) if (s[i] === UNKNOWN) s[i] = EMPTY;
  }
  return s;
}

/** 2단계: 별을 두면 어떤 묶음이 별을 다 못 채우게 되는 칸 */
function findKill(lay: Layout, state: Cell[]): Deduction | null {
  for (let c = 0; c < state.length; c++) {
    if (state[c] !== UNKNOWN) continue;
    const s = afterStar(lay, state, c);
    if (lay.neighbors[c].some((j) => s[j] === STAR)) return { kind: 'kill', tier: 2, stars: [], empties: [c], units: [], cell: c };
    const bad = lay.units.findIndex((u) => !canFill(lay, u, s));
    if (bad >= 0) return { kind: 'kill', tier: 2, stars: [], empties: [c], units: [bad], cell: c };
  }
  return null;
}

/** 1·2단계 규칙만으로 끝까지 좁혀 본다. 모순이면 false */
function propagate(lay: Layout, state: Cell[]): boolean {
  for (let step = 0; step < 500; step++) {
    if (broken(lay, state) >= 0) return false;
    const d = findNeighbors(lay, state) ?? findUnit(lay, state) ?? findConfine(lay, state, 1);
    if (!d) return true;
    for (const i of d.stars) state[i] = STAR;
    for (const i of d.empties) state[i] = EMPTY;
  }
  return true;
}

/** 3단계: 별을 넣어 보고 이어서 풀면 모순이 나는 칸 */
function findProbe(lay: Layout, state: Cell[]): Deduction | null {
  for (let c = 0; c < state.length; c++) {
    if (state[c] !== UNKNOWN) continue;
    const s = afterStar(lay, state, c);
    if (!propagate(lay, s)) return { kind: 'probe', tier: 3, stars: [], empties: [c], units: [], cell: c };
  }
  return null;
}

/** maxTier까지의 기법 중 가장 쉬운 것으로 다음 추론을 찾는다 */
export function nextDeduction(lay: Layout, state: Cell[], maxTier = 3): Deduction | null {
  if (broken(lay, state) >= 0) return null;
  const easy = findNeighbors(lay, state) ?? findUnit(lay, state) ?? findConfine(lay, state, 1);
  if (easy || maxTier < 2) return easy;
  const mid = findKill(lay, state);
  if (mid || maxTier < 3) return mid;
  for (let m = 2; m <= Math.min(4, lay.p.n - 1); m++) {
    const d = findConfine(lay, state, m);
    if (d) return d;
  }
  return findProbe(lay, state);
}

/** maxTier 기법까지로 끝까지 풀어 본다. 풀리면 쓴 가장 어려운 단계, 막히면 4 */
export function rate(lay: Layout, maxTier = 3): { tier: number; state: Cell[] } {
  const state: Cell[] = lay.p.region.map(() => UNKNOWN);
  let tier = 1;
  for (let step = 0; step < 2000; step++) {
    if (state.every((s) => s !== UNKNOWN)) return { tier, state };
    const d = nextDeduction(lay, state, maxTier);
    if (!d) return { tier: 4, state };
    tier = Math.max(tier, d.tier);
    for (const i of d.stars) state[i] = STAR;
    for (const i of d.empties) state[i] = EMPTY;
  }
  return { tier: 4, state };
}
