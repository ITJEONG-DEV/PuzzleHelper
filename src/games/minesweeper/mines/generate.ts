import { type CellState, FLAG, HIDDEN, type Field, isCleared, makeField, neighborsOf, openCell } from './board';
import { nextDeduction } from './logic';

/** 판 크기: 전통적인 세 단계. 고급은 휴대폰에서 보기 좋게 세로로 둔다 */
export const SIZES = [
  { id: 'beginner', label: '초급', w: 9, h: 9, mines: 10 },
  { id: 'intermediate', label: '중급', w: 16, h: 16, mines: 40 },
  { id: 'expert', label: '고급', w: 16, h: 30, mines: 99 },
] as const;
export type SizeId = (typeof SIZES)[number]['id'];
export const sizeOf = (id: SizeId) => SIZES.find((s) => s.id === id)!;

export type Level = 'easy' | 'medium' | 'hard';

export const LEVELS: { id: Level; label: string; desc: string }[] = [
  { id: 'easy', label: '하', desc: '숫자 하나만 보고 풀려요' },
  { id: 'medium', label: '중', desc: '이웃한 숫자 둘을 함께 봐야 해요' },
  { id: 'hard', label: '상', desc: '여러 숫자를 엮거나 남은 지뢰 수까지 써야 해요' },
];

export const levelLabel = (level: Level) => LEVELS.find((l) => l.id === level)!.label;

export type Random = () => number;

/**
 * 시작 칸부터 maxTier 기법까지로 풀어 본다. 끝까지 풀리면 찍을 필요가 없는 판이다.
 * 쓴 기법 중 가장 어려운 단계를 돌려준다. 막히면 4.
 */
export function rate(f: Field, total: number, start: number, maxTier = 3): number {
  return solveFrom(f, total, start, maxTier).tier;
}

/** rate와 같고, 막혔을 때의 칸 상태도 돌려준다 */
function solveFrom(f: Field, total: number, start: number, maxTier: number): { tier: number; state: CellState[] } {
  const state = new Array<CellState>(f.w * f.h).fill(HIDDEN);
  openCell(f, state, start);
  let tier = 1;
  for (let step = 0; step < 5000; step++) {
    if (isCleared(f, state)) return { tier, state };
    const d = nextDeduction({ w: f.w, h: f.h, state, num: f.num, total }, maxTier);
    if (!d) return { tier: 4, state };
    tier = Math.max(tier, d.tier);
    for (const i of d.mines) state[i] = FLAG;
    for (const i of d.safe) openCell(f, state, i);
  }
  return { tier: 4, state };
}

/**
 * 막힌 판을 고친다: 열린 칸과 닿은 닫힌 칸 중 지뢰 하나를 아직 아무 숫자와도 닿지 않은 칸으로 옮긴다.
 * 시작 칸 주변에는 지뢰를 두지 않는다.
 */
function repair(w: number, h: number, mine: boolean[], total: number, start: number, rnd: Random, maxTier: number, tries: number): { mine: boolean[]; tier: number } {
  const nb = neighborsOf(w, h);
  const keep = new Set([start, ...nb[start]]);
  const m = mine.slice();
  let res = solveFrom(makeField(w, h, m), total, start, maxTier);
  for (let t = 0; t < tries && res.tier > maxTier; t++) {
    const { state } = res;
    const touches = (i: number) => nb[i].some((j) => state[j] === 1);
    const frontierMines = m.flatMap((x, i) => (x && state[i] === HIDDEN && touches(i) ? [i] : []));
    const far = m.flatMap((x, i) => (!x && state[i] === HIDDEN && !touches(i) && !keep.has(i) ? [i] : []));
    if (!frontierMines.length || !far.length) break;
    const from = frontierMines[Math.floor(rnd() * frontierMines.length)];
    const to = far[Math.floor(rnd() * far.length)];
    m[from] = false;
    m[to] = true;
    res = solveFrom(makeField(w, h, m), total, start, maxTier);
  }
  return { mine: m, tier: res.tier };
}

/** 크기별로 막힌 판을 고쳐 보는 횟수 */
const REPAIR: Record<SizeId, number> = { beginner: 10, intermediate: 30, expert: 60 };

/** 시작 칸과 그 주변을 비우고 지뢰를 놓는다 */
function placeMines(w: number, h: number, mines: number, start: number, rnd: Random): boolean[] {
  const nb = neighborsOf(w, h);
  const keep = new Set([start, ...nb[start]]);
  const pool = Array.from({ length: w * h }, (_, i) => i).filter((i) => !keep.has(i));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const mine = new Array<boolean>(w * h).fill(false);
  for (let k = 0; k < mines; k++) mine[pool[k]] = true;
  return mine;
}

export interface Generated {
  mine: boolean[];
  w: number;
  h: number;
  total: number;
  /** 처음에 열어 둘 칸 */
  start: number;
  size: SizeId;
  level: Level;
  /** 원하는 난이도를 시간 안에 못 만들어 가장 가까운 판을 준 경우 */
  approximate: boolean;
}

/** 찍지 않고 풀리는 판을 만든다. 시간 안에 원하는 난이도를 못 찾으면 가장 가까운 판을 준다 */
export function generate(size: SizeId, level: Level, rnd: Random = Math.random, budgetMs = 6000): Generated {
  const { w, h, mines } = sizeOf(size);
  const want = LEVELS.findIndex((l) => l.id === level) + 1;
  const begin = Date.now();
  let best: { mine: boolean[]; start: number; gap: number } | null = null;
  do {
    // 시작 칸은 가운데 근처에서 고른다
    const r = Math.floor(h / 2 + (rnd() - 0.5) * h * 0.5);
    const c = Math.floor(w / 2 + (rnd() - 0.5) * w * 0.5);
    const start = r * w + c;
    const { mine, tier } = repair(w, h, placeMines(w, h, mines, start, rnd), mines, start, rnd, want, REPAIR[size]);
    if (tier === want) return { mine, w, h, total: mines, start, size, level, approximate: false };
    if (tier < want && (!best || want - tier < best.gap)) best = { mine, start, gap: want - tier };
  } while (Date.now() - begin < budgetMs || !best);
  return { mine: best.mine, w, h, total: mines, start: best.start, size, level, approximate: true };
}
