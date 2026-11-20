/** 스타 배틀 판: n×n, 영역 n개. 행·열·영역마다 별 k개, 별끼리는 대각선까지 닿지 않는다 */
export interface Puzzle {
  n: number;
  /** 줄·영역마다 별 수 */
  k: number;
  /** 칸마다 영역 번호 0..n-1 */
  region: number[];
}

export const UNKNOWN = 0;
export const STAR = 1;
export const EMPTY = 2;
export type Cell = typeof UNKNOWN | typeof STAR | typeof EMPTY;

export type UnitKind = 'row' | 'col' | 'region';

/** 별 k개가 들어가야 하는 묶음: 행·열·영역 */
export interface Unit {
  kind: UnitKind;
  index: number;
  cells: number[];
}

export interface Layout {
  p: Puzzle;
  units: Unit[];
  /** 칸마다 속한 묶음 번호 [행, 열, 영역] */
  unitsOf: number[][];
  /** 칸마다 주변 8칸 */
  neighbors: number[][];
}

const layouts = new WeakMap<Puzzle, Layout>();

export function layoutOf(p: Puzzle): Layout {
  const cached = layouts.get(p);
  if (cached) return cached;
  const { n } = p;
  const units: Unit[] = [];
  for (let r = 0; r < n; r++) units.push({ kind: 'row', index: r, cells: Array.from({ length: n }, (_, c) => r * n + c) });
  for (let c = 0; c < n; c++) units.push({ kind: 'col', index: c, cells: Array.from({ length: n }, (_, r) => r * n + c) });
  for (let g = 0; g < n; g++) units.push({ kind: 'region', index: g, cells: p.region.flatMap((x, i) => (x === g ? [i] : [])) });
  const unitsOf = p.region.map((g, i) => [Math.floor(i / n), n + (i % n), 2 * n + g]);
  const neighbors = p.region.map((_, i) => {
    const r = Math.floor(i / n);
    const c = i % n;
    const out: number[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc);
      }
    }
    return out;
  });
  const lay = { p, units, unitsOf, neighbors };
  layouts.set(p, lay);
  return lay;
}

export const cellName = (n: number, i: number) => `${Math.floor(i / n) + 1}행 ${(i % n) + 1}열`;

/** 영역 이름: 가, 나, 다 … (색과 함께 보여 준다) */
export const REGION_NAMES = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타'];

export function unitName(u: Unit): string {
  if (u.kind === 'row') return `${u.index + 1}행`;
  if (u.kind === 'col') return `${u.index + 1}열`;
  return `${REGION_NAMES[u.index]} 영역`;
}

/** 행·열에서 서로 닿지 않게 놓을 수 있는 별의 최대 수 (이어진 빈칸 구간마다 절반 올림) */
export function lineCapacity(cells: number[], state: Cell[]): number {
  let cap = 0;
  let run = 0;
  for (const i of cells) {
    if (state[i] === UNKNOWN) run++;
    else {
      cap += Math.ceil(run / 2);
      run = 0;
    }
  }
  return cap + Math.ceil(run / 2);
}

/** 묶음의 별 수·빈칸 */
export function unitInfo(u: Unit, state: Cell[]): { stars: number; open: number[] } {
  let stars = 0;
  const open: number[] = [];
  for (const i of u.cells) {
    if (state[i] === STAR) stars++;
    else if (state[i] === UNKNOWN) open.push(i);
  }
  return { stars, open };
}

/** 규칙에 어긋난 칸: 닿은 별, 별이 너무 많은 묶음의 별 */
export function conflictCells(lay: Layout, state: Cell[]): Set<number> {
  const out = new Set<number>();
  state.forEach((s, i) => {
    if (s !== STAR) return;
    for (const j of lay.neighbors[i]) if (state[j] === STAR) out.add(i);
  });
  for (const u of lay.units) {
    const { stars } = unitInfo(u, state);
    if (stars > lay.p.k) for (const i of u.cells) if (state[i] === STAR) out.add(i);
  }
  return out;
}

/** 다 풀었는가: 모든 묶음에 별 k개, 닿은 별 없음 */
export function isSolved(lay: Layout, state: Cell[]): boolean {
  if (conflictCells(lay, state).size) return false;
  return lay.units.every((u) => unitInfo(u, state).stars === lay.p.k);
}
