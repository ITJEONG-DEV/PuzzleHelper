import { type CellState, FLAG, OPEN, isClosed, neighborsOf } from './board';

/** 열린 숫자 칸 하나가 주는 조건: 닫힌 이웃 칸들 중 지뢰가 mines개 */
export interface Constraint {
  /** 숫자 칸 */
  at: number;
  cells: number[];
  mines: number;
}

/** 보이는 판: 크기, 칸 상태, 열린 칸의 숫자, 전체 지뢰 수 */
export interface View {
  w: number;
  h: number;
  state: CellState[];
  /** 열린 칸의 숫자 (닫힌 칸은 아무 값) */
  num: number[];
  total: number;
}

export type DeductionKind = 'all-safe' | 'all-mine' | 'pair' | 'enumerate' | 'count';

export interface Deduction {
  kind: DeductionKind;
  /** 기법 단계: 1 숫자 하나, 2 숫자 둘, 3 여러 숫자·남은 지뢰 수 */
  tier: number;
  safe: number[];
  mines: number[];
  /** 근거가 된 숫자 칸 */
  basis: number[];
  /** 'pair'에서 두 숫자가 겹치는 칸 */
  shared?: number[];
  /** 'enumerate'·'count'에서 따진 경우의 수 */
  cases?: number;
}

/** 열린 숫자 칸마다 조건을 만든다. 깃발은 지뢰로 본다 */
export function constraintsOf(v: View): Constraint[] {
  const nb = neighborsOf(v.w, v.h);
  const out: Constraint[] = [];
  v.state.forEach((s, i) => {
    if (s !== OPEN) return;
    let flags = 0;
    const cells: number[] = [];
    for (const j of nb[i]) {
      if (v.state[j] === FLAG) flags++;
      else if (isClosed(v.state[j])) cells.push(j);
    }
    if (!cells.length && flags === v.num[i]) return;
    out.push({ at: i, cells, mines: v.num[i] - flags });
  });
  return out;
}

/** 깃발 수와 맞지 않는 숫자 칸 (깃발이 너무 많거나, 닫힌 칸이 모자람) */
export function brokenConstraint(cons: Constraint[]): Constraint | null {
  return cons.find((c) => c.mines < 0 || c.mines > c.cells.length) ?? null;
}

/** 1단계: 숫자 하나만 보고 정해지는 칸 */
export function findBasic(cons: Constraint[]): Deduction | null {
  for (const c of cons) {
    if (!c.cells.length) continue;
    if (c.mines === 0) return { kind: 'all-safe', tier: 1, safe: c.cells, mines: [], basis: [c.at] };
    if (c.mines === c.cells.length) return { kind: 'all-mine', tier: 1, safe: [], mines: c.cells, basis: [c.at] };
  }
  return null;
}

/** 2단계: 이웃한 숫자 두 개를 함께 보고 정해지는 칸 (1-2 무늬 등) */
export function findPair(cons: Constraint[]): Deduction | null {
  const byCell = new Map<number, Constraint[]>();
  for (const c of cons) for (const x of c.cells) byCell.set(x, [...(byCell.get(x) ?? []), c]);
  const seen = new Set<string>();
  for (const A of cons) {
    if (!A.cells.length) continue;
    const partners = new Set<Constraint>();
    for (const x of A.cells) for (const B of byCell.get(x) ?? []) if (B !== A) partners.add(B);
    for (const B of partners) {
      const key = A.at < B.at ? `${A.at}-${B.at}` : `${B.at}-${A.at}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const inB = new Set(B.cells);
      const shared = A.cells.filter((x) => inB.has(x));
      const onlyA = A.cells.filter((x) => !inB.has(x));
      const inA = new Set(A.cells);
      const onlyB = B.cells.filter((x) => !inA.has(x));
      // 겹치는 칸의 지뢰 수 x의 범위
      const lo = Math.max(0, A.mines - onlyA.length, B.mines - onlyB.length);
      const hi = Math.min(shared.length, A.mines, B.mines);
      if (lo > hi) continue;
      const safe: number[] = [];
      const mines: number[] = [];
      // A만의 칸 지뢰 수: A.mines - x (x는 lo..hi)
      if (onlyA.length && A.mines - hi === onlyA.length) mines.push(...onlyA);
      if (onlyA.length && A.mines - lo === 0) safe.push(...onlyA);
      if (onlyB.length && B.mines - hi === onlyB.length) mines.push(...onlyB);
      if (onlyB.length && B.mines - lo === 0) safe.push(...onlyB);
      if (lo === hi && lo === shared.length && shared.length) mines.push(...shared);
      if (lo === hi && lo === 0 && shared.length) safe.push(...shared);
      if (safe.length || mines.length) return { kind: 'pair', tier: 2, safe, mines, basis: [A.at, B.at], shared };
    }
  }
  return null;
}

/** 서로 칸을 나누는 조건끼리 묶는다 */
function components(cons: Constraint[]): { cons: Constraint[]; cells: number[] }[] {
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r)! !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const c of cons) for (const x of c.cells) if (!parent.has(x)) parent.set(x, x);
  for (const c of cons) for (let k = 1; k < c.cells.length; k++) parent.set(find(c.cells[k]), find(c.cells[0]));
  const groups = new Map<number, { cons: Constraint[]; cells: Set<number> }>();
  for (const c of cons) {
    if (!c.cells.length) continue;
    const root = find(c.cells[0]);
    const g = groups.get(root) ?? { cons: [], cells: new Set<number>() };
    g.cons.push(c);
    for (const x of c.cells) g.cells.add(x);
    groups.set(root, g);
  }
  return [...groups.values()].map((g) => ({ cons: g.cons, cells: [...g.cells] }));
}

interface Enumerated {
  cells: number[];
  cons: Constraint[];
  /** 지뢰 수 k → { 경우의 수, 칸별 지뢰인 경우의 수 } */
  byK: Map<number, { count: number; mineCount: number[] }>;
}

/** 한 묶음의 모든 배치를 센다. 칸이 너무 많으면 null */
function enumerate(comp: { cons: Constraint[]; cells: number[] }, limitCells = 28): Enumerated | null {
  const { cells, cons } = comp;
  if (cells.length > limitCells) return null;
  const idx = new Map(cells.map((x, k) => [x, k]));
  // 칸 순서대로 정할 때, 그 칸이 마지막 칸인 조건부터 검사한다
  const consCells = cons.map((c) => c.cells.map((x) => idx.get(x)!));
  const consOf: number[][] = cells.map(() => []);
  consCells.forEach((cs, ci) => cs.forEach((k) => consOf[k].push(ci)));
  const assign = new Int8Array(cells.length).fill(-1);
  const placed = new Int32Array(cons.length);
  const open = new Int32Array(cons.length);
  consCells.forEach((cs, ci) => (open[ci] = cs.length));
  const byK = new Map<number, { count: number; mineCount: number[] }>();
  let budget = 400000;
  let mines = 0;
  const rec = (k: number): boolean => {
    if (--budget < 0) return false;
    if (k === cells.length) {
      const e = byK.get(mines) ?? { count: 0, mineCount: new Array(cells.length).fill(0) };
      e.count++;
      for (let t = 0; t < cells.length; t++) if (assign[t] === 1) e.mineCount[t]++;
      byK.set(mines, e);
      return true;
    }
    for (const v of [0, 1]) {
      let ok = true;
      for (const ci of consOf[k]) {
        const p = placed[ci] + v;
        const left = open[ci] - 1;
        if (p > cons[ci].mines || p + left < cons[ci].mines) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      assign[k] = v;
      mines += v;
      for (const ci of consOf[k]) {
        placed[ci] += v;
        open[ci]--;
      }
      const fine = rec(k + 1);
      for (const ci of consOf[k]) {
        placed[ci] -= v;
        open[ci]++;
      }
      mines -= v;
      assign[k] = -1;
      if (!fine) return false;
    }
    return true;
  };
  if (!rec(0)) return null;
  return { cells, cons, byK };
}

/** 정수 집합들의 합으로 나올 수 있는 값 */
function sumSet(sets: number[][]): Set<number> {
  let acc = new Set([0]);
  for (const s of sets) {
    const next = new Set<number>();
    for (const a of acc) for (const b of s) next.add(a + b);
    acc = next;
  }
  return acc;
}

/**
 * 3단계: 이어진 숫자들을 모두 만족하는 배치를 따지고, 남은 지뢰 수까지 써서 정해지는 칸.
 * 어떤 배치에서도 지뢰가 아닌 칸은 안전, 모든 배치에서 지뢰인 칸은 지뢰.
 */
export function findEnumerate(v: View, cons: Constraint[]): Deduction | null {
  const comps = components(cons)
    .map((c) => enumerate(c))
    .filter((e): e is Enumerated => !!e);
  if (!comps.length) return null;
  const flags = v.state.filter((s) => s === FLAG).length;
  const remaining = v.total - flags;
  const frontier = new Set(cons.flatMap((c) => c.cells));
  const interior = v.state.flatMap((s, i) => (isClosed(s) && !frontier.has(i) ? [i] : []));
  // 다 따질 수 없는 묶음이 있으면 남은 지뢰 수는 쓰지 않는다
  const allEnumerated = comps.length === components(cons).length;
  const M = interior.length;

  for (let ci = 0; ci < comps.length; ci++) {
    const comp = comps[ci];
    let validK = [...comp.byK.keys()];
    let usedCount = false;
    if (allEnumerated) {
      const others = sumSet(comps.filter((_, k) => k !== ci).map((e) => [...e.byK.keys()]));
      const filtered = validK.filter((k) => [...others].some((s) => k + s <= remaining && k + s >= remaining - M));
      usedCount = filtered.length < validK.length;
      validK = filtered;
    }
    if (!validK.length) continue;
    let cases = 0;
    const mineIn = new Array(comp.cells.length).fill(0);
    for (const k of validK) {
      const e = comp.byK.get(k)!;
      cases += e.count;
      e.mineCount.forEach((n, t) => (mineIn[t] += n));
    }
    const safe = comp.cells.filter((_, t) => mineIn[t] === 0);
    const mines = comp.cells.filter((_, t) => mineIn[t] === cases);
    if (safe.length || mines.length) {
      return { kind: usedCount ? 'count' : 'enumerate', tier: 3, safe, mines, basis: comp.cons.map((c) => c.at), cases };
    }
  }

  // 숫자와 닿지 않은 칸: 남은 지뢰 수로 전부 안전하거나 전부 지뢰인지
  if (allEnumerated && M > 0) {
    const totals = [...sumSet(comps.map((e) => [...e.byK.keys()]))].filter((t) => t <= remaining && t >= remaining - M);
    if (totals.length && totals.every((t) => t === remaining)) return { kind: 'count', tier: 3, safe: interior, mines: [], basis: [] };
    if (totals.length && totals.every((t) => t === remaining - M)) return { kind: 'count', tier: 3, safe: [], mines: interior, basis: [] };
  }
  // 숫자가 하나도 없는 경우(전부 닫힘)는 따지지 않는다
  return null;
}

/** maxTier까지의 기법 중 가장 쉬운 것으로 다음 추론을 찾는다 */
export function nextDeduction(v: View, maxTier = 3): Deduction | null {
  const cons = constraintsOf(v);
  if (brokenConstraint(cons)) return null;
  return findBasic(cons) ?? (maxTier >= 2 ? findPair(cons) : null) ?? (maxTier >= 3 ? findEnumerate(v, cons) : null);
}
