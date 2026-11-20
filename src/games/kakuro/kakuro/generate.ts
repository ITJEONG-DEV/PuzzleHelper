import { COMBOS, type Layout, type Puzzle, bit, cluesFrom, layoutOf, popcount } from './board';
import { propagate, startCandidates } from './solver';
import { applyHint, findHint, type HintKind } from './hints';

/** 판 크기 (단서 줄 포함 한 변의 칸 수) */
export const SIZES = [6, 8, 10, 12] as const;
export type Size = (typeof SIZES)[number];

export type Level = 'easy' | 'medium' | 'hard' | 'expert';

export const LEVELS: { id: Level; label: string; desc: string }[] = [
  { id: 'easy', label: '하', desc: '마지막 한 칸·가로세로 조합 겹치기만으로 풀려요' },
  { id: 'medium', label: '중', desc: '꼭 들어갈 숫자·조합 좁히기가 필요해요' },
  { id: 'hard', label: '상', desc: '숫자 쌍·칸마다 맞춰 보기가 필요해요' },
  { id: 'expert', label: '최상', desc: '숫자를 넣어 보고 모순을 찾아야 풀려요' },
];

export const levelLabel = (level: Level) => LEVELS.find((l) => l.id === level)!.label;

/** 기법 단계. 5는 이 앱의 기법으로 풀리지 않는 문제 */
const TIER: Partial<Record<HintKind, number>> = {
  'last-cell': 1,
  single: 1,
  'naked-single': 1,
  'run-hidden': 2,
  'combo-narrow': 2,
  'naked-subset': 3,
  matching: 3,
  probe: 4,
};

export type Random = () => number;

/**
 * 힌트 엔진으로 maxTier 단계 기법까지만 써서 풀어 본다.
 * 끝까지 풀리면 답이 하나라는 뜻이다(모든 기법이 확실한 추론만 하므로).
 * 쓴 기법 중 가장 어려운 단계와, 멈춘 때의 판을 돌려준다.
 */
export interface Analysis {
  solved: boolean;
  /** 쓴 기법 중 가장 어려운 단계. 못 풀었으면 5 */
  tier: number;
  /** 멈춘 때의 판과 후보 */
  values: number[];
  marks: number[];
}

export function analyze(lay: Layout, maxTier = 4, from?: Analysis): Analysis {
  let values = from ? from.values : lay.p.white.map(() => 0);
  let marks = from ? from.marks : values.slice();
  let tier = from && from.tier < 5 ? from.tier : 1;
  for (let step = 0; step < 5000; step++) {
    if (lay.p.white.every((w, i) => !w || values[i])) return { solved: true, tier, values, marks };
    const hint = findHint({ lay, values, marks, solution: null, maxTier });
    if (!hint || (TIER[hint.kind] ?? 5) > maxTier) break;
    tier = Math.max(tier, TIER[hint.kind]!);
    ({ values, marks } = applyHint(lay, hint, values, marks));
  }
  return { solved: false, tier: 5, values, marks };
}

/**
 * 가정(4단계)은 비싸므로 3단계까지로 먼저 풀고, 막힌 곳에서만 가정을 이어 쓴다.
 */
function analyzeStaged(lay: Layout, maxTier: number): Analysis {
  const easy = analyze(lay, Math.min(maxTier, 3));
  if (easy.solved || maxTier < 4) return easy;
  // 3단계까지로 막혔는데 가정으로 끝까지 풀리면 4단계 문제
  const hard = analyze(lay, 4, easy);
  return hard.solved ? { ...hard, tier: 4 } : hard;
}

/** 힌트 엔진으로 끝까지 풀어 보고 쓴 기법 중 가장 어려운 단계를 돌려준다. 못 풀면 5 */
export const rate = (lay: Layout) => analyzeStaged(lay, 4).tier;

/**
 * 문제 만들 때 쓰는 빠른 판정. 단계마다 그 단계 규칙을 줄 단위로 한꺼번에 적용한다.
 * 힌트 엔진으로 한 단계씩 푸는 것과 결과(풀리는지·필요한 단계)가 같고 훨씬 빠르다.
 * 못 풀면 tier 5와 멈춘 때의 후보를 돌려준다.
 */
export function fastTier(lay: Layout, maxTier: number): { tier: number; cand: number[] } {
  const cand = startCandidates(lay, lay.p.white.map(() => 0));
  const done = () => cand.every((m) => !m || popcount(m) === 1);
  for (const level of [1, 2, 3] as const) {
    if (level > maxTier) break;
    if (propagate(lay, cand, undefined, level) >= 0) return { tier: 5, cand };
    if (done()) return { tier: level, cand };
  }
  if (maxTier < 4) return { tier: 5, cand };
  // 4단계: 후보 하나를 넣어 보고 3단계 규칙으로 모순이 나면 지운다
  let progress = true;
  while (progress && !done()) {
    progress = false;
    const order = cand.flatMap((m, i) => (popcount(m) > 1 ? [i] : [])).sort((a, b) => popcount(cand[a]) - popcount(cand[b]));
    for (const i of order) {
      for (let rest = cand[i]; rest; rest &= rest - 1) {
        const b = rest & -rest;
        const trial = cand.slice();
        trial[i] = b;
        if (propagate(lay, trial, lay.cellRuns[i].filter((k) => k >= 0)) < 0) continue;
        cand[i] &= ~b;
        if (propagate(lay, cand, lay.cellRuns[i].filter((k) => k >= 0)) >= 0) return { tier: 5, cand };
        progress = true;
        break;
      }
      if (progress) break;
    }
  }
  return { tier: done() ? 4 : 5, cand };
}

/**
 * 흰 칸 배치를 만든다. 맨 윗줄·맨 왼쪽 줄은 단서 칸이고, 안쪽은 점대칭으로 검은 칸을 놓는다.
 * 모든 흰 칸은 가로·세로 모두 2칸 이상 줄에 속하고, 흰 칸끼리 이어져 있다.
 */
export function randomWhite(n: number, rnd: Random, density = 0.3, MAX_RUN = 9): boolean[] | null {
  const white = new Array<boolean>(n * n).fill(false);
  for (let r = 1; r < n; r++) for (let c = 1; c < n; c++) white[r * n + c] = true;
  const partner = (i: number) => (n - Math.floor(i / n)) * n + (n - (i % n));
  const block = (i: number) => {
    white[i] = false;
    white[partner(i)] = false;
  };
  for (let r = 1; r < n; r++) for (let c = 1; c < n; c++) if (rnd() < density / 2) block(r * n + c);

  for (let pass = 0; pass < 50; pass++) {
    let changed = false;
    for (const horiz of [true, false]) {
      for (let a = 1; a < n; a++) {
        let b = 1;
        while (b < n) {
          const at = (k: number) => (horiz ? a * n + k : k * n + a);
          if (!white[at(b)]) {
            b++;
            continue;
          }
          let e = b;
          while (e < n && white[at(e)]) e++;
          const len = e - b;
          if (len === 1) {
            block(at(b));
            changed = true;
          } else if (len > MAX_RUN) {
            // 양쪽에 2칸 이상 남게 자른다
            block(at(b + 2 + Math.floor(rnd() * (len - 4))));
            changed = true;
          }
          b = e;
        }
      }
    }
    if (!changed) break;
  }

  const cells = white.flatMap((w, i) => (w ? [i] : []));
  if (cells.length < (n - 1) * (n - 1) * 0.55) return null;
  // 흰 칸이 모두 이어져 있는지
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const i = stack.pop()!;
    for (const j of [i - 1, i + 1, i - n, i + n]) {
      if (j >= 0 && j < n * n && white[j] && !seen.has(j) && (j === i - 1 || j === i + 1 ? Math.floor(j / n) === Math.floor(i / n) : true)) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size === cells.length ? white : null;
}

/**
 * 줄 안에서 숫자가 겹치지 않게 흰 칸을 채운다.
 * 줄마다 '작은 수 쪽'·'큰 수 쪽'을 정해 두고 그쪽 숫자를 먼저 써서, 조합이 적은 합이 많이 나오게 한다.
 * bias가 0이면 아무 숫자나 고르고, 1에 가까울수록 한쪽으로 몰린다.
 */
function fillDigits(lay: Layout, rnd: Random, bias: number): number[] | null {
  const values = lay.p.white.map(() => 0);
  const cells = lay.p.white.flatMap((w, i) => (w ? [i] : []));
  const lean = lay.runs.map(() => (rnd() < 0.5 ? -1 : 1));
  let steps = 0;
  const rec = (k: number): boolean => {
    if (k === cells.length) return true;
    if (++steps > 20000) return false;
    const i = cells[k];
    let used = 0;
    let want = 0;
    for (const r of lay.cellRuns[i]) {
      if (r < 0) continue;
      want += lean[r];
      for (const j of lay.runs[r].cells) if (values[j]) used |= bit(values[j]);
    }
    // want: -2(둘 다 작은 쪽) ~ 2(둘 다 큰 쪽). 목표 숫자에 가까울수록 앞에 둔다
    const target = 5 + want * 2;
    const order = [1, 2, 3, 4, 5, 6, 7, 8, 9]
      .map((d) => ({ d, key: bias * Math.abs(d - target) + (1 - bias) * 9 * rnd() + rnd() }))
      .sort((a, b) => a.key - b.key)
      .map((x) => x.d);
    for (const d of order) {
      if (used & bit(d)) continue;
      values[i] = d;
      if (rec(k + 1)) return true;
    }
    values[i] = 0;
    return false;
  };
  return rec(0) ? values : null;
}

/** 칸의 두 줄이 만들 수 있는 조합 수의 곱. 작을수록 답을 좁히는 단서다 */
function comboCount(lay: Layout, sol: number[], i: number, d: number): number {
  let n = 1;
  for (const r of lay.cellRuns[i]) {
    if (r < 0) continue;
    const run = lay.runs[r];
    const sum = run.cells.reduce((a, j) => a + (j === i ? d : sol[j]), 0);
    n *= COMBOS[run.cells.length][sum].length;
  }
  return n;
}

export interface Made {
  p: Puzzle;
  solution: number[];
  /** 풀 때 쓴 가장 어려운 기법 단계 */
  tier: number;
}

/**
 * maxTier 단계 기법까지로 끝까지 풀리게 숫자를 고친다(끝까지 풀리면 답도 하나).
 * 막히면 아직 못 정한 칸 하나를 골라, 그 칸의 두 줄 조합이 가장 적어지는 숫자로 바꾸고 단서를 다시 만든다.
 */
function shapeUp(white: boolean[], n: number, solution: number[], rnd: Random, maxTier: number, tries: number): Made | null {
  const sol = solution.slice();
  for (let t = 0; t < tries; t++) {
    const p = cluesFrom(white, n, n, sol);
    const lay = layoutOf(p);
    const a = fastTier(lay, maxTier);
    if (a.tier <= maxTier) return { p, solution: sol, tier: a.tier };
    // 못 정한 칸 중 두 줄의 조합이 가장 많은(가장 애매한) 칸 몇 개에서 하나를 고른다
    const open = sol
      .flatMap((v, i) => (v && popcount(a.cand[i]) > 1 ? [{ i, s: comboCount(lay, sol, i, v) + rnd() }] : []))
      .sort((x, y) => y.s - x.s);
    const i = open[Math.floor(rnd() * Math.min(3, open.length))].i;
    let used = 0;
    for (const r of lay.cellRuns[i]) if (r >= 0) for (const j of lay.runs[r].cells) if (j !== i) used |= bit(sol[j]);
    const options = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !(used & bit(d)) && d !== sol[i]);
    if (!options.length) continue;
    const scored = options.map((d) => ({ d, s: comboCount(lay, sol, i, d) + rnd() }));
    scored.sort((a, b) => a.s - b.s);
    sol[i] = scored[0].d;
  }
  return null;
}

/**
 * 원하는 단계보다 쉽게 풀리는 문제를 조금씩 어렵게 다듬는다.
 * 칸 하나를 두 줄의 조합이 많아지는 숫자로 바꿔 보고, 원하는 단계를 넘어 안 풀리게 되면 되돌린다.
 */
function harden(made: Made, n: number, rnd: Random, want: number, tries: number): Made {
  let best = made;
  const sol = made.solution.slice();
  const white = made.p.white;
  const cells = sol.flatMap((v, i) => (v ? [i] : []));
  for (let t = 0; t < tries && best.tier < want; t++) {
    const lay = layoutOf(best.p);
    const i = cells[Math.floor(rnd() * cells.length)];
    let used = 0;
    for (const r of lay.cellRuns[i]) if (r >= 0) for (const j of lay.runs[r].cells) if (j !== i) used |= bit(sol[j]);
    const options = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !(used & bit(d)) && d !== sol[i]);
    if (!options.length) continue;
    const scored = options.map((d) => ({ d, s: comboCount(lay, sol, i, d) * (0.5 + rnd()) })).sort((a, b) => b.s - a.s);
    const old = sol[i];
    sol[i] = scored[0].d;
    const p = cluesFrom(white, n, n, sol);
    const { tier } = fastTier(layoutOf(p), want);
    if (tier <= want && tier >= best.tier) best = { p, solution: sol.slice(), tier };
    else sol[i] = old;
  }
  return best;
}

/** 크기별 배치 설정: 검은 칸 비율, 가장 긴 줄 */
const SHAPE: Record<Size, { density: number; maxRun: number }> = {
  6: { density: 0.25, maxRun: 5 },
  8: { density: 0.3, maxRun: 5 },
  10: { density: 0.32, maxRun: 6 },
  12: { density: 0.34, maxRun: 6 },
};

/** 한 배치에서 숫자를 고쳐 보는 횟수. 큰 판은 배치를 새로 만들기보다 고치는 편이 빠르다 */
const TRIES: Record<Size, number> = { 6: 60, 8: 80, 10: 150, 12: 250 };

/** 난이도별 숫자 몰기 정도. 쉬울수록 조합이 하나뿐인 합이 많아진다 */
const BIAS: Record<Level, number> = { easy: 0.9, medium: 0.7, hard: 0.5, expert: 0.4 };

/** maxTier 단계 기법까지로 풀리는(그래서 답이 하나인) 문제 하나를 만든다. 실패하면 null */
export function makePuzzle(size: Size, rnd: Random, bias = 0.7, maxTier = 4): Made | null {
  const { density, maxRun } = SHAPE[size];
  const white = randomWhite(size, rnd, density, maxRun);
  if (!white) return null;
  const lay0 = layoutOf({ w: size, h: size, white, across: white.map(() => 0), down: white.map(() => 0) });
  const filled = fillDigits(lay0, rnd, bias);
  if (!filled) return null;
  const made = shapeUp(white, size, filled, rnd, maxTier, TRIES[size]);
  return made && made.tier < maxTier ? harden(made, size, rnd, maxTier, TRIES[size]) : made;
}

export interface Generated {
  puzzle: Puzzle;
  solution: number[];
  size: Size;
  level: Level;
  /** 원하는 난이도를 시간 안에 못 만들어 가장 가까운 문제를 준 경우 */
  approximate: boolean;
}

/** 크기·난이도에 맞는 문제를 만든다. 시간 안에 못 찾으면 가장 가까운 단계의 문제를 준다 */
export function generate(size: Size, level: Level, rnd: Random = Math.random, budgetMs = 6000): Generated {
  const want = LEVELS.findIndex((l) => l.id === level) + 1;
  const start = Date.now();
  let best: { puzzle: Puzzle; solution: number[]; gap: number } | null = null;
  do {
    const u = makePuzzle(size, rnd, BIAS[level], want);
    if (!u) continue;
    const { tier } = u;
    if (tier === want) return { puzzle: u.p, solution: u.solution, size, level, approximate: false };
    const gap = Math.abs(Math.min(tier, 4) - want) + (tier === 5 ? 0.5 : 0);
    if (!best || gap < best.gap) best = { puzzle: u.p, solution: u.solution, gap };
  } while (Date.now() - start < budgetMs || !best);
  return { puzzle: best.puzzle, solution: best.solution, size, level, approximate: true };
}
