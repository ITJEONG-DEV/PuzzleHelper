/** 텐트와 나무: n×n, 나무마다 상하좌우로 붙은 텐트 하나와 짝, 텐트끼리는 대각선까지 닿지 않음, 행·열 텐트 수 단서 */
export interface Puzzle {
  n: number;
  trees: number[];
  rows: number[];
  cols: number[];
}

export const UNKNOWN = 0;
export const TENT = 1;
export const GRASS = 2;
export const TREE = 3;
export type Cell = typeof UNKNOWN | typeof TENT | typeof GRASS | typeof TREE;

export interface Layout {
  p: Puzzle;
  isTree: boolean[];
  /** 상하좌우 이웃 */
  orth: number[][];
  /** 주변 8칸 */
  around: number[][];
  /** 행 n개, 열 n개 */
  lines: number[][];
}

const layouts = new WeakMap<Puzzle, Layout>();

export function layoutOf(p: Puzzle): Layout {
  const cached = layouts.get(p);
  if (cached) return cached;
  const { n } = p;
  const isTree = new Array<boolean>(n * n).fill(false);
  for (const t of p.trees) isTree[t] = true;
  const orth: number[][] = [];
  const around: number[][] = [];
  for (let i = 0; i < n * n; i++) {
    const r = Math.floor(i / n);
    const c = i % n;
    const o: number[] = [];
    const a: number[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue;
        a.push(rr * n + cc);
        if (!dr || !dc) o.push(rr * n + cc);
      }
    }
    orth.push(o);
    around.push(a);
  }
  const lines: number[][] = [];
  for (let r = 0; r < n; r++) lines.push(Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) lines.push(Array.from({ length: n }, (_, r) => r * n + c));
  const lay = { p, isTree, orth, around, lines };
  layouts.set(p, lay);
  return lay;
}

/** 빈 판 상태: 나무 칸만 나무 */
export const startState = (lay: Layout): Cell[] => lay.isTree.map((t) => (t ? TREE : UNKNOWN));

export const lineTarget = (p: Puzzle, li: number) => (li < p.n ? p.rows[li] : p.cols[li - p.n]);
export const cellName = (n: number, i: number) => `${Math.floor(i / n) + 1}행 ${(i % n) + 1}열`;
export const lineName = (n: number, li: number) => (li < n ? `${li + 1}행` : `${li - n + 1}열`);

/** 줄에서 서로 닿지 않게 더 놓을 수 있는 텐트 수 (이어진 빈칸 구간마다 절반 올림) */
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

export function lineInfo(cells: number[], state: Cell[]): { tents: number; open: number[] } {
  let tents = 0;
  const open: number[] = [];
  for (const i of cells) {
    if (state[i] === TENT) tents++;
    else if (state[i] === UNKNOWN) open.push(i);
  }
  return { tents, open };
}

/**
 * 나무와 텐트를 짝지을 수 있는가: 나무마다 서로 다른 이웃 칸(텐트 또는 빈칸)을 하나씩 고르고,
 * 놓인 텐트는 모두 어떤 나무와 짝이 되어야 한다. 이분 매칭으로 확인한다.
 */
export function canPair(lay: Layout, state: Cell[]): boolean {
  // 나무 쪽을 모두 덮는 짝과 텐트 쪽을 모두 덮는 짝이 각각 있으면, 둘 다 덮는 짝도 있다(멘델존-덜메이지 정리)
  const usable = (c: number) => state[c] === TENT || state[c] === UNKNOWN;
  const coverAll = (from: number[], next: (x: number) => number[]): boolean => {
    const match = new Map<number, number>();
    const tryOne = (x: number, seen: Set<number>): boolean => {
      for (const y of next(x)) {
        if (seen.has(y)) continue;
        seen.add(y);
        const owner = match.get(y);
        if (owner === undefined || tryOne(owner, seen)) {
          match.set(y, x);
          return true;
        }
      }
      return false;
    };
    return from.every((x) => tryOne(x, new Set()));
  };
  const trees = lay.p.trees;
  const tents = state.flatMap((s, i) => (s === TENT ? [i] : []));
  return coverAll(trees, (t) => lay.orth[t].filter(usable)) && coverAll(tents, (c) => lay.orth[c].filter((j) => lay.isTree[j]));
}

/** 규칙에 어긋난 칸: 닿은 텐트, 줄 텐트 수 초과 */
export function conflictCells(lay: Layout, state: Cell[]): Set<number> {
  const out = new Set<number>();
  state.forEach((s, i) => {
    if (s === TENT && lay.around[i].some((j) => state[j] === TENT)) out.add(i);
  });
  lay.lines.forEach((cells, li) => {
    if (lineInfo(cells, state).tents > lineTarget(lay.p, li)) for (const i of cells) if (state[i] === TENT) out.add(i);
  });
  return out;
}

/** 다 풀었는가: 줄 텐트 수가 맞고, 닿은 텐트가 없고, 텐트가 나무 수만큼 있고 모두 짝지어짐 */
export function isSolved(lay: Layout, state: Cell[]): boolean {
  if (conflictCells(lay, state).size) return false;
  if (!lay.lines.every((cells, li) => lineInfo(cells, state).tents === lineTarget(lay.p, li))) return false;
  const tents = state.filter((s) => s === TENT).length;
  if (tents !== lay.p.trees.length) return false;
  const rest = state.map((s) => (s === UNKNOWN ? GRASS : s)) as Cell[];
  return canPair(lay, rest);
}
