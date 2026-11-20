import { type Layout, bit, cageHolds, digitsOf, fullMask, has, onlyDigit, popcount } from './board';

/**
 * 추론은 칸마다 후보(비트마스크)로 한다. 숫자를 넣은 칸은 그 숫자 하나만 후보로 둔다.
 */
export type DeductionKind = 'single-cage' | 'naked-single' | 'hidden-single' | 'cage-narrow' | 'cage-line' | 'naked-pair' | 'probe';

export interface Deduction {
  kind: DeductionKind;
  tier: number;
  place?: { cell: number; digit: number };
  eliminate: { cell: number; digit: number }[];
  /** 근거가 된 상자 */
  cage?: number;
  /** 근거가 된 행·열 (0..n-1 행, n..2n-1 열) */
  line?: number;
  digit?: number;
  /** 'naked-pair'에서 쌍을 이루는 칸 */
  cells?: number[];
}

/**
 * 상자에 들어갈 수 있는 숫자: 칸 후보 안에서 단서를 만족하고 같은 행·열에 같은 숫자가 없는 배치를 모두 본다.
 * 칸마다 가능한 숫자와, 행·열마다 모든 배치에 들어 있는 숫자를 돌려준다. 배치가 없으면 null.
 */
export function cageOptions(lay: Layout, k: number, cand: number[]): { allowed: number[]; mustInLine: Map<number, number> } | null {
  const { n } = lay.p;
  const cage = lay.p.cages[k];
  const cells = cage.cells;
  const allowed = cells.map(() => 0);
  const lineIds = [...new Set(cells.flatMap((i) => [Math.floor(i / n), n + (i % n)]))];
  const must = new Map<number, number>(lineIds.map((l) => [l, ~0]));
  const pick: number[] = [];
  let any = false;
  const rec = (t: number) => {
    if (t === cells.length) {
      if (!cageHolds(cage, pick)) return;
      any = true;
      pick.forEach((d, x) => (allowed[x] |= bit(d)));
      for (const l of lineIds) {
        let m = 0;
        cells.forEach((i, x) => {
          if ((l < n ? Math.floor(i / n) : n + (i % n)) === l) m |= bit(pick[x]);
        });
        must.set(l, must.get(l)! & m);
      }
      return;
    }
    const i = cells[t];
    for (const d of digitsOf(cand[i])) {
      // 같은 상자 안에서도 같은 행·열이면 같은 숫자를 쓸 수 없다
      let ok = true;
      for (let x = 0; x < t; x++) {
        const j = cells[x];
        if (pick[x] === d && (Math.floor(j / n) === Math.floor(i / n) || j % n === i % n)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      pick.push(d);
      rec(t + 1);
      pick.pop();
    }
  };
  rec(0);
  if (!any) return null;
  for (const [l, m] of must) must.set(l, m === ~0 ? 0 : m);
  return { allowed, mustInLine: must };
}

/** 넣은 숫자와 같은 행·열의 숫자를 빼고, 상자 계산으로 걸러 낸 기본 후보 */
export function basicCandidates(lay: Layout, values: number[]): number[] {
  const { n } = lay.p;
  const cand = values.map((v, i) => {
    if (v) return bit(v);
    let m = fullMask(n);
    for (const j of lay.peers[i]) if (values[j]) m &= ~bit(values[j]);
    return m;
  });
  return cand;
}


/** 1단계: 한 칸 상자 */
function findSingleCage(lay: Layout, values: number[]): Deduction | null {
  for (let k = 0; k < lay.p.cages.length; k++) {
    const c = lay.p.cages[k];
    if (c.op === '=' && !values[c.cells[0]]) return { kind: 'single-cage', tier: 1, place: { cell: c.cells[0], digit: c.target }, eliminate: [], cage: k };
  }
  return null;
}

/** 1단계: 후보가 하나 남은 칸 */
function findNakedSingle(values: number[], cand: number[]): Deduction | null {
  for (let i = 0; i < cand.length; i++) {
    if (!values[i] && popcount(cand[i]) === 1) return { kind: 'naked-single', tier: 1, place: { cell: i, digit: onlyDigit(cand[i]) }, eliminate: [] };
  }
  return null;
}

/** 1단계: 행·열에서 숫자가 갈 곳이 하나뿐 */
function findHiddenSingle(lay: Layout, values: number[], cand: number[]): Deduction | null {
  const { n } = lay.p;
  for (let l = 0; l < lay.lines.length; l++) {
    const line = lay.lines[l];
    for (let d = 1; d <= n; d++) {
      if (line.some((i) => values[i] === d)) continue;
      const spots = line.filter((i) => !values[i] && has(cand[i], d));
      if (spots.length === 1) return { kind: 'hidden-single', tier: 1, place: { cell: spots[0], digit: d }, eliminate: [], line: l, digit: d };
    }
  }
  return null;
}

/** 1단계: 상자 계산으로 만들 수 없는 후보 */
function findCageNarrow(lay: Layout, values: number[], cand: number[]): Deduction | null {
  for (let k = 0; k < lay.p.cages.length; k++) {
    const cage = lay.p.cages[k];
    if (cage.cells.every((i) => values[i])) continue;
    const opt = cageOptions(lay, k, cand);
    if (!opt) continue;
    const elim = cage.cells.flatMap((i, x) => (values[i] ? [] : digitsOf(cand[i] & ~opt.allowed[x]).map((d) => ({ cell: i, digit: d }))));
    if (elim.length) return { kind: 'cage-narrow', tier: 1, eliminate: elim, cage: k };
  }
  return null;
}

/** 2단계: 상자가 한 줄 안에 꼭 넣는 숫자는 그 줄의 다른 칸에서 빠진다 */
function findCageLine(lay: Layout, values: number[], cand: number[]): Deduction | null {
  for (let k = 0; k < lay.p.cages.length; k++) {
    const cage = lay.p.cages[k];
    if (cage.cells.every((i) => values[i])) continue;
    const opt = cageOptions(lay, k, cand);
    if (!opt) continue;
    for (const [l, m] of opt.mustInLine) {
      for (const d of digitsOf(m)) {
        const elim = lay.lines[l].filter((i) => !cage.cells.includes(i) && !values[i] && has(cand[i], d)).map((i) => ({ cell: i, digit: d }));
        if (elim.length) return { kind: 'cage-line', tier: 2, eliminate: elim, cage: k, line: l, digit: d };
      }
    }
  }
  return null;
}

/** 2단계: 한 줄에서 두 칸이 같은 두 후보만 가지면 그 숫자는 다른 칸에서 빠진다 */
function findNakedPair(lay: Layout, values: number[], cand: number[]): Deduction | null {
  for (let l = 0; l < lay.lines.length; l++) {
    const open = lay.lines[l].filter((i) => !values[i]);
    for (let a = 0; a < open.length; a++) {
      if (popcount(cand[open[a]]) !== 2) continue;
      for (let b = a + 1; b < open.length; b++) {
        if (cand[open[b]] !== cand[open[a]]) continue;
        const m = cand[open[a]];
        const elim = open.filter((i) => i !== open[a] && i !== open[b]).flatMap((i) => digitsOf(cand[i] & m).map((d) => ({ cell: i, digit: d })));
        if (elim.length) return { kind: 'naked-pair', tier: 2, eliminate: elim, line: l, cells: [open[a], open[b]] };
      }
    }
  }
  return null;
}

/** 후보 배열에 추론을 적용한다 (숫자를 넣으면 같은 행·열 후보에서 뺀다) */
export function applyTo(lay: Layout, values: number[], cand: number[], d: Deduction) {
  if (d.place) {
    const { cell, digit } = d.place;
    values[cell] = digit;
    cand[cell] = bit(digit);
    for (const j of lay.peers[cell]) cand[j] &= ~bit(digit);
  }
  for (const e of d.eliminate) cand[e.cell] &= ~bit(e.digit);
}

/** 모순: 후보가 없는 칸, 같은 줄 같은 숫자, 배치가 없는 상자 */
export function contradiction(lay: Layout, values: number[], cand: number[]): boolean {
  if (cand.some((m, i) => !values[i] && !m)) return true;
  for (const line of lay.lines) {
    const seen = new Set<number>();
    for (const i of line) {
      if (!values[i]) continue;
      if (seen.has(values[i])) return true;
      seen.add(values[i]);
    }
  }
  return lay.p.cages.some((_, k) => !cageOptions(lay, k, cand));
}

/** maxTier 기법까지로 다음 추론을 찾는다 (쉬운 것부터) */
export function nextDeduction(lay: Layout, values: number[], cand: number[], maxTier = 3): Deduction | null {
  const easy = findSingleCage(lay, values) ?? findNakedSingle(values, cand) ?? findHiddenSingle(lay, values, cand) ?? findCageNarrow(lay, values, cand);
  if (easy || maxTier < 2) return easy;
  const mid = findCageLine(lay, values, cand) ?? findNakedPair(lay, values, cand);
  if (mid || maxTier < 3) return mid;
  return findProbe(lay, values, cand);
}

/** 1·2단계로 끝까지 좁힌다. 모순이면 false */
function propagate(lay: Layout, values: number[], cand: number[]): boolean {
  for (let step = 0; step < 400; step++) {
    if (contradiction(lay, values, cand)) return false;
    const d = nextDeduction(lay, values, cand, 2);
    if (!d) return true;
    applyTo(lay, values, cand, d);
  }
  return true;
}

/** 3단계: 숫자를 넣어 보고 이어서 풀면 모순이 나는 후보 */
export function findProbe(lay: Layout, values: number[], cand: number[]): Deduction | null {
  const order = cand.map((m, i) => ({ i, k: values[i] ? 0 : popcount(m) })).filter((x) => x.k > 1).sort((a, b) => a.k - b.k);
  for (const { i } of order) {
    for (const d of digitsOf(cand[i])) {
      const v = values.slice();
      const c = cand.slice();
      applyTo(lay, v, c, { kind: 'probe', tier: 3, place: { cell: i, digit: d }, eliminate: [] });
      if (!propagate(lay, v, c)) return { kind: 'probe', tier: 3, eliminate: [{ cell: i, digit: d }], digit: d };
    }
  }
  return null;
}

/** 빈 판부터 maxTier 기법까지로 풀어 본다. 풀리면 쓴 가장 어려운 단계, 막히면 4 */
export function rate(lay: Layout, maxTier = 3): { tier: number; values: number[]; cand: number[] } {
  const { n } = lay.p;
  const values = new Array<number>(n * n).fill(0);
  const cand = values.map(() => fullMask(n));
  let tier = 1;
  for (let step = 0; step < 3000; step++) {
    if (values.every(Boolean)) return { tier, values, cand };
    if (contradiction(lay, values, cand)) return { tier: 4, values, cand };
    const d = nextDeduction(lay, values, cand, maxTier);
    if (!d) return { tier: 4, values, cand };
    tier = Math.max(tier, d.tier);
    applyTo(lay, values, cand, d);
  }
  return { tier: 4, values, cand };
}
