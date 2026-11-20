import { type Cell, GRASS, type Layout, TENT, UNKNOWN, canPair, lineCapacity, lineInfo, lineTarget } from './board';

export type DeductionKind = 'no-tree' | 'tent-around' | 'line-full' | 'line-fill' | 'tree-one-spot' | 'kill' | 'probe';

export interface Deduction {
  kind: DeductionKind;
  tier: number;
  tents: number[];
  grass: number[];
  /** 근거가 된 줄 (0..n-1 행, n..2n-1 열) */
  line?: number;
  /** 근거가 된 칸 (텐트·나무·넣어 보기의 칸) */
  cell?: number;
}

/** 판이 모순인가: 닿은 텐트, 줄 텐트 수를 맞출 수 없음, 나무·텐트 짝을 지을 수 없음 */
export function broken(lay: Layout, state: Cell[]): boolean {
  for (let i = 0; i < state.length; i++) if (state[i] === TENT && lay.around[i].some((j) => state[j] === TENT)) return true;
  for (let li = 0; li < lay.lines.length; li++) {
    const { tents } = lineInfo(lay.lines[li], state);
    const left = lineTarget(lay.p, li) - tents;
    if (left < 0 || lineCapacity(lay.lines[li], state) < left) return true;
  }
  return !canPair(lay, state);
}

/** 1단계: 나무와 닿지 않은 칸은 텐트를 둘 수 없다 */
function findNoTree(lay: Layout, state: Cell[]): Deduction | null {
  const grass = state.flatMap((s, i) => (s === UNKNOWN && !lay.orth[i].some((j) => lay.isTree[j]) ? [i] : []));
  return grass.length ? { kind: 'no-tree', tier: 1, tents: [], grass } : null;
}

/** 1단계: 텐트 주변 8칸 */
function findAround(lay: Layout, state: Cell[]): Deduction | null {
  for (let i = 0; i < state.length; i++) {
    if (state[i] !== TENT) continue;
    const grass = lay.around[i].filter((j) => state[j] === UNKNOWN);
    if (grass.length) return { kind: 'tent-around', tier: 1, tents: [], grass, cell: i };
  }
  return null;
}

/** 1단계: 텐트를 다 놓은 줄 / 남은 칸이 필요한 텐트 수와 같은 줄 */
function findLine(lay: Layout, state: Cell[]): Deduction | null {
  for (let li = 0; li < lay.lines.length; li++) {
    const { tents, open } = lineInfo(lay.lines[li], state);
    if (!open.length) continue;
    const left = lineTarget(lay.p, li) - tents;
    if (left === 0) return { kind: 'line-full', tier: 1, tents: [], grass: open, line: li };
    if (open.length === left) return { kind: 'line-fill', tier: 1, tents: open, grass: [], line: li };
  }
  return null;
}

/** 1단계: 이웃에 텐트가 없고 텐트를 둘 수 있는 칸이 하나뿐인 나무 */
function findTreeOneSpot(lay: Layout, state: Cell[]): Deduction | null {
  for (const t of lay.p.trees) {
    if (lay.orth[t].some((j) => state[j] === TENT)) continue;
    const spots = lay.orth[t].filter((j) => state[j] === UNKNOWN);
    if (spots.length === 1) return { kind: 'tree-one-spot', tier: 1, tents: spots, grass: [], cell: t };
  }
  return null;
}

/** 칸에 텐트를 둔다고 할 때의 판 (주변은 잔디) */
function withTent(lay: Layout, state: Cell[], c: number): Cell[] {
  const s = state.slice();
  s[c] = TENT;
  for (const j of lay.around[c]) if (s[j] === UNKNOWN) s[j] = GRASS;
  return s;
}

/** 2단계: 텐트를 두면 어떤 줄의 텐트 수를 맞출 수 없게 되는 칸 */
function findKill(lay: Layout, state: Cell[]): Deduction | null {
  for (let c = 0; c < state.length; c++) {
    if (state[c] !== UNKNOWN) continue;
    const s = withTent(lay, state, c);
    for (let li = 0; li < lay.lines.length; li++) {
      const { tents } = lineInfo(lay.lines[li], s);
      const left = lineTarget(lay.p, li) - tents;
      if (left < 0 || lineCapacity(lay.lines[li], s) < left) return { kind: 'kill', tier: 2, tents: [], grass: [c], line: li, cell: c };
    }
  }
  return null;
}

const EASY = [findNoTree, findAround, findLine, findTreeOneSpot];

/** 1·2단계로 끝까지 좁힌다. 모순이면 false */
function propagate(lay: Layout, state: Cell[]): boolean {
  for (let step = 0; step < 600; step++) {
    if (broken(lay, state)) return false;
    let d: Deduction | null = null;
    for (const f of EASY) if ((d = f(lay, state))) break;
    if (!d) d = findKill(lay, state);
    if (!d) return true;
    for (const i of d.tents) state[i] = TENT;
    for (const i of d.grass) state[i] = GRASS;
  }
  return true;
}

/** 3단계: 텐트를 넣어 보고(또는 잔디로 두고) 이어서 풀면 모순이 나는 칸 */
function findProbe(lay: Layout, state: Cell[]): Deduction | null {
  for (let c = 0; c < state.length; c++) {
    if (state[c] !== UNKNOWN) continue;
    if (!propagate(lay, withTent(lay, state, c))) return { kind: 'probe', tier: 3, tents: [], grass: [c], cell: c };
    const g = state.slice();
    g[c] = GRASS;
    if (!propagate(lay, g)) return { kind: 'probe', tier: 3, tents: [c], grass: [], cell: c };
  }
  return null;
}

/** maxTier까지의 기법 중 가장 쉬운 것으로 다음 추론을 찾는다 */
export function nextDeduction(lay: Layout, state: Cell[], maxTier = 3): Deduction | null {
  if (broken(lay, state)) return null;
  for (const f of EASY) {
    const d = f(lay, state);
    if (d) return d;
  }
  if (maxTier < 2) return null;
  const mid = findKill(lay, state);
  if (mid || maxTier < 3) return mid;
  return findProbe(lay, state);
}

/** maxTier 기법까지로 빈 판부터 풀어 본다. 풀리면 쓴 가장 어려운 단계, 막히면 4 */
export function rate(lay: Layout, maxTier = 3): { tier: number; state: Cell[] } {
  const state = lay.isTree.map((t) => (t ? 3 : UNKNOWN)) as Cell[];
  let tier = 1;
  for (let step = 0; step < 3000; step++) {
    if (!state.includes(UNKNOWN)) return { tier: broken(lay, state) ? 4 : tier, state };
    const d = nextDeduction(lay, state, maxTier);
    if (!d) return { tier: 4, state };
    tier = Math.max(tier, d.tier);
    for (const i of d.tents) state[i] = TENT;
    for (const i of d.grass) state[i] = GRASS;
  }
  return { tier: 4, state };
}
