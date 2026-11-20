/**
 * 라틴 방진 계열 퍼즐(칼큐도쿠·킬러 스도쿠·후토시키·스카이스크래퍼) 공용 추론 엔진.
 * 칸마다 후보(비트마스크)를 두고, 묶음(행·열·박스)마다 숫자 1~n이 한 번씩 들어간다.
 * 상자 단서와 게임별 규칙(부등호·빌딩)을 덧붙일 수 있다.
 */

export type Op = '+' | '-' | '×' | '÷' | '=';

export interface Cage {
  cells: number[];
  op: Op;
  target: number;
}

export interface Deduction {
  kind: string;
  tier: number;
  place?: { cell: number; digit: number };
  eliminate: { cell: number; digit: number }[];
  /** 근거가 된 상자 */
  cage?: number;
  /** 근거가 된 묶음(행·열·박스) 번호 */
  line?: number;
  digit?: number;
  /** 근거가 된 칸 */
  cells?: number[];
}

/** 게임별 규칙: 그 단계에서 쓸 추론과 모순 검사 */
export interface Rule {
  tier: number;
  find(g: Grid, values: number[], cand: number[]): Deduction | null;
  broken?(g: Grid, values: number[], cand: number[]): boolean;
}

export interface Grid {
  n: number;
  /** 숫자가 한 번씩 들어가는 묶음: 행 n개, 열 n개, (박스) */
  units: number[][];
  unitsOf: number[][];
  peers: number[][];
  cages: Cage[];
  /** 칸마다 상자 번호, 없으면 -1 */
  cageOf: number[];
  /** 상자 안 숫자가 모두 달라야 하는가(킬러 스도쿠). 아니면 같은 묶음 안에서만 다르면 된다 */
  cageAllDistinct: boolean;
  /** 처음부터 주어진 숫자 (0은 빈칸) */
  givens: number[];
  rules: Rule[];
}

export const bit = (d: number) => 1 << d;
export const fullMask = (n: number) => ((1 << (n + 1)) - 1) & ~1;
export const has = (m: number, d: number) => (m & bit(d)) !== 0;
export function popcount(m: number): number {
  let k = 0;
  while (m) {
    m &= m - 1;
    k++;
  }
  return k;
}
export function digitsOf(m: number): number[] {
  const out: number[] = [];
  for (let d = 1; d < 16; d++) if (m & bit(d)) out.push(d);
  return out;
}
export const onlyDigit = (m: number) => 31 - Math.clz32(m);

/** 행·열(·박스) 묶음과 칸 관계를 만든다. box가 있으면 box×box 박스도 묶음에 넣는다 */
export function makeUnits(n: number, box?: number): { units: number[][]; unitsOf: number[][]; peers: number[][] } {
  const units: number[][] = [];
  for (let r = 0; r < n; r++) units.push(Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) units.push(Array.from({ length: n }, (_, r) => r * n + c));
  if (box) {
    for (let br = 0; br < n; br += box) {
      for (let bc = 0; bc < n; bc += box) {
        const cells: number[] = [];
        for (let r = br; r < br + box; r++) for (let c = bc; c < bc + box; c++) cells.push(r * n + c);
        units.push(cells);
      }
    }
  }
  const unitsOf = Array.from({ length: n * n }, () => [] as number[]);
  units.forEach((u, k) => u.forEach((i) => unitsOf[i].push(k)));
  const peers = unitsOf.map((us, i) => [...new Set(us.flatMap((k) => units[k]))].filter((j) => j !== i));
  return { units, unitsOf, peers };
}

/** 상자 숫자들이 단서를 만족하는가 */
export function cageHolds(c: Cage, digits: number[]): boolean {
  switch (c.op) {
    case '=':
      return digits[0] === c.target;
    case '+':
      return digits.reduce((a, b) => a + b, 0) === c.target;
    case '×':
      return digits.reduce((a, b) => a * b, 1) === c.target;
    case '-':
      return Math.abs(digits[0] - digits[1]) === c.target;
    case '÷': {
      const [a, b] = digits[0] > digits[1] ? digits : [digits[1], digits[0]];
      return a === b * c.target;
    }
  }
}

/**
 * 상자에 들어갈 수 있는 숫자: 칸 후보 안에서 단서를 만족하고 같은 묶음(또는 상자 전체)에 같은 숫자가 없는 배치를 모두 본다.
 * 칸마다 가능한 숫자와, 묶음마다 모든 배치에 들어 있는 숫자를 돌려준다. 배치가 없으면 null.
 */
export function cageOptions(g: Grid, k: number, cand: number[]): { allowed: number[]; mustInLine: Map<number, number> } | null {
  const cage = g.cages[k];
  const cells = cage.cells;
  const allowed = cells.map(() => 0);
  const lineIds = [...new Set(cells.flatMap((i) => g.unitsOf[i]))];
  const must = new Map<number, number>(lineIds.map((l) => [l, ~0]));
  const pick: number[] = [];
  let any = false;
  // 합 상자는 남은 칸으로 만들 수 있는 합의 범위로 미리 가지친다
  const isSum = cage.op === '+';
  let sum = 0;
  const rec = (t: number) => {
    if (t === cells.length) {
      if (!cageHolds(cage, pick)) return;
      any = true;
      pick.forEach((d, x) => (allowed[x] |= bit(d)));
      for (const l of lineIds) {
        let m = 0;
        cells.forEach((i, x) => {
          if (g.unitsOf[i].includes(l)) m |= bit(pick[x]);
        });
        must.set(l, must.get(l)! & m);
      }
      return;
    }
    const i = cells[t];
    for (const d of digitsOf(cand[i])) {
      if (isSum && (sum + d > cage.target || sum + d + (cells.length - t - 1) * g.n < cage.target)) continue;
      let ok = true;
      for (let x = 0; x < t; x++) {
        if (pick[x] !== d) continue;
        const j = cells[x];
        if (g.cageAllDistinct || g.unitsOf[j].some((u) => g.unitsOf[i].includes(u))) {
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
  if (!any) return null;
  for (const [l, m] of must) must.set(l, m === ~0 ? 0 : m);
  return { allowed, mustInLine: must };
}

/** 넣은 숫자와 같은 묶음의 숫자를 뺀 기본 후보 */
export function basicCandidates(g: Grid, values: number[]): number[] {
  return values.map((v, i) => {
    if (v) return bit(v);
    let m = fullMask(g.n);
    for (const j of g.peers[i]) if (values[j]) m &= ~bit(values[j]);
    return m;
  });
}

/** 1단계: 주어진 숫자 */
function findGiven(g: Grid, values: number[]): Deduction | null {
  const i = g.givens.findIndex((v, k) => v && !values[k]);
  return i >= 0 ? { kind: 'given', tier: 1, place: { cell: i, digit: g.givens[i] }, eliminate: [] } : null;
}

/** 1단계: 한 칸 상자 */
function findSingleCage(g: Grid, values: number[]): Deduction | null {
  for (let k = 0; k < g.cages.length; k++) {
    const c = g.cages[k];
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

/** 1단계: 묶음에서 숫자가 갈 곳이 하나뿐 */
function findHiddenSingle(g: Grid, values: number[], cand: number[]): Deduction | null {
  for (let l = 0; l < g.units.length; l++) {
    const line = g.units[l];
    for (let d = 1; d <= g.n; d++) {
      if (line.some((i) => values[i] === d)) continue;
      const spots = line.filter((i) => !values[i] && has(cand[i], d));
      if (spots.length === 1) return { kind: 'hidden-single', tier: 1, place: { cell: spots[0], digit: d }, eliminate: [], line: l, digit: d };
    }
  }
  return null;
}

/** 1단계: 상자 계산으로 만들 수 없는 후보 */
function findCageNarrow(g: Grid, values: number[], cand: number[]): Deduction | null {
  for (let k = 0; k < g.cages.length; k++) {
    const cage = g.cages[k];
    if (cage.cells.every((i) => values[i])) continue;
    const opt = cageOptions(g, k, cand);
    if (!opt) continue;
    const elim = cage.cells.flatMap((i, x) => (values[i] ? [] : digitsOf(cand[i] & ~opt.allowed[x]).map((d) => ({ cell: i, digit: d }))));
    if (elim.length) return { kind: 'cage-narrow', tier: 1, eliminate: elim, cage: k };
  }
  return null;
}

/** 2단계: 상자가 한 묶음 안에 꼭 넣는 숫자는 그 묶음의 다른 칸에서 빠진다 */
function findCageLine(g: Grid, values: number[], cand: number[]): Deduction | null {
  for (let k = 0; k < g.cages.length; k++) {
    const cage = g.cages[k];
    if (cage.cells.every((i) => values[i])) continue;
    const opt = cageOptions(g, k, cand);
    if (!opt) continue;
    for (const [l, m] of opt.mustInLine) {
      for (const d of digitsOf(m)) {
        const elim = g.units[l].filter((i) => !cage.cells.includes(i) && !values[i] && has(cand[i], d)).map((i) => ({ cell: i, digit: d }));
        if (elim.length) return { kind: 'cage-line', tier: 2, eliminate: elim, cage: k, line: l, digit: d };
      }
    }
  }
  return null;
}

/** 2단계: 한 묶음에서 두 칸이 같은 두 후보만 가지면 그 숫자는 다른 칸에서 빠진다 */
function findNakedPair(g: Grid, values: number[], cand: number[]): Deduction | null {
  for (let l = 0; l < g.units.length; l++) {
    const open = g.units[l].filter((i) => !values[i]);
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

/** 후보 배열에 추론을 적용한다 (숫자를 넣으면 같은 묶음 후보에서 뺀다) */
export function applyTo(g: Grid, values: number[], cand: number[], d: Deduction) {
  if (d.place) {
    const { cell, digit } = d.place;
    values[cell] = digit;
    cand[cell] = bit(digit);
    for (const j of g.peers[cell]) cand[j] &= ~bit(digit);
  }
  for (const e of d.eliminate) cand[e.cell] &= ~bit(e.digit);
}

/** 모순: 후보가 없는 칸, 같은 묶음 같은 숫자, 배치가 없는 상자, 규칙 위반 */
export function contradiction(g: Grid, values: number[], cand: number[]): boolean {
  if (cand.some((m, i) => !values[i] && !m)) return true;
  for (const line of g.units) {
    const seen = new Set<number>();
    for (const i of line) {
      if (!values[i]) continue;
      if (seen.has(values[i])) return true;
      seen.add(values[i]);
    }
  }
  if (g.cages.some((_, k) => !cageOptions(g, k, cand))) return true;
  return g.rules.some((r) => r.broken?.(g, values, cand));
}

const rulesAt = (g: Grid, tier: number, values: number[], cand: number[]) => {
  for (const r of g.rules) {
    if (r.tier !== tier) continue;
    const d = r.find(g, values, cand);
    if (d) return d;
  }
  return null;
};

/** maxTier 기법까지로 다음 추론을 찾는다 (쉬운 것부터) */
export function nextDeduction(g: Grid, values: number[], cand: number[], maxTier = 3): Deduction | null {
  const easy =
    findGiven(g, values) ??
    findSingleCage(g, values) ??
    findNakedSingle(values, cand) ??
    findHiddenSingle(g, values, cand) ??
    findCageNarrow(g, values, cand) ??
    rulesAt(g, 1, values, cand);
  if (easy || maxTier < 2) return easy;
  const mid = findCageLine(g, values, cand) ?? findNakedPair(g, values, cand) ?? rulesAt(g, 2, values, cand);
  if (mid || maxTier < 3) return mid;
  return findProbe(g, values, cand);
}

/** 1·2단계로 끝까지 좁힌다. 모순이면 false */
function propagate(g: Grid, values: number[], cand: number[]): boolean {
  for (let step = 0; step < 600; step++) {
    if (contradiction(g, values, cand)) return false;
    const d = nextDeduction(g, values, cand, 2);
    if (!d) return true;
    applyTo(g, values, cand, d);
  }
  return true;
}

/** 3단계: 숫자를 넣어 보고 이어서 풀면 모순이 나는 후보 */
export function findProbe(g: Grid, values: number[], cand: number[]): Deduction | null {
  const order = cand.map((m, i) => ({ i, k: values[i] ? 0 : popcount(m) })).filter((x) => x.k > 1).sort((a, b) => a.k - b.k);
  for (const { i } of order) {
    for (const d of digitsOf(cand[i])) {
      const v = values.slice();
      const c = cand.slice();
      applyTo(g, v, c, { kind: 'probe', tier: 3, place: { cell: i, digit: d }, eliminate: [] });
      if (!propagate(g, v, c)) return { kind: 'probe', tier: 3, eliminate: [{ cell: i, digit: d }], digit: d };
    }
  }
  return null;
}

/** 빈 판부터 maxTier 기법까지로 풀어 본다. 풀리면 쓴 가장 어려운 단계, 막히면 4 */
export function rate(g: Grid, maxTier = 3): { tier: number; values: number[]; cand: number[] } {
  const values = new Array<number>(g.n * g.n).fill(0);
  const cand = values.map(() => fullMask(g.n));
  let tier = 1;
  for (let step = 0; step < 4000; step++) {
    if (values.every(Boolean)) return { tier: contradiction(g, values, cand) ? 4 : tier, values, cand };
    if (contradiction(g, values, cand)) return { tier: 4, values, cand };
    const d = nextDeduction(g, values, cand, maxTier);
    if (!d) return { tier: 4, values, cand };
    tier = Math.max(tier, d.tier);
    applyTo(g, values, cand, d);
  }
  return { tier: 4, values, cand };
}

/** 무작위 라틴 방진: 순환 방진의 행·열·숫자를 섞는다 */
export function randomLatin(n: number, rnd: () => number): number[] {
  const shuffle = <T,>(a: T[]) => {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  };
  const rows = shuffle([...Array(n).keys()]);
  const cols = shuffle([...Array(n).keys()]);
  const sym = shuffle([...Array(n).keys()].map((x) => x + 1));
  const out = new Array<number>(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) out[r * n + c] = sym[(rows[r] + cols[c]) % n];
  return out;
}

/** 묶음 이름: 행·열·박스 */
export function unitName(g: Grid, k: number): string {
  if (k < g.n) return `${k + 1}행`;
  if (k < 2 * g.n) return `${k - g.n + 1}열`;
  return `${k - 2 * g.n + 1}번 박스`;
}

export const cellName = (n: number, i: number) => `${Math.floor(i / n) + 1}행 ${(i % n) + 1}열`;
