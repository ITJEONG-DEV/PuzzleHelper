import { type Puzzle, layoutOf } from './board';
import { rate } from './logic';

export const SIZES = [6, 8, 10, 12] as const;
export type Size = (typeof SIZES)[number];

export type Level = 'easy' | 'medium' | 'hard';

export const LEVELS: { id: Level; label: string; desc: string }[] = [
  { id: 'easy', label: '하', desc: '나무와 먼 칸·텐트 주변·다 찬 줄·놓을 곳이 하나인 나무로 풀려요' },
  { id: 'medium', label: '중', desc: '텐트를 두면 줄이 막히는 칸을 찾아야 해요' },
  { id: 'hard', label: '상', desc: '텐트를 넣어 보고 모순을 찾아야 풀려요' },
];

export const levelLabel = (level: Level) => LEVELS.find((l) => l.id === level)!.label;

export type Random = () => number;

/** 텐트를 서로 닿지 않게 놓고, 텐트마다 상하좌우 빈칸 하나에 나무를 둔다 */
export function randomForest(n: number, rnd: Random, density = 0.17): { trees: number[]; tents: number[] } {
  const N = n * n;
  const used = new Array<number>(N).fill(0); // 0 빈칸, 1 텐트, 2 나무
  const tents: number[] = [];
  const trees: number[] = [];
  const order = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const want = Math.round(N * density);
  for (const c of order) {
    if (tents.length >= want) break;
    if (used[c]) continue;
    const r = Math.floor(c / n);
    const cc = c % n;
    let touch = false;
    for (let dr = -1; dr <= 1 && !touch; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && r + dr >= 0 && r + dr < n && cc + dc >= 0 && cc + dc < n && used[(r + dr) * n + cc + dc] === 1) touch = true;
    if (touch) continue;
    const spots = [r > 0 ? c - n : -1, r < n - 1 ? c + n : -1, cc > 0 ? c - 1 : -1, cc < n - 1 ? c + 1 : -1].filter((j) => j >= 0 && !used[j]);
    if (!spots.length) continue;
    // 나무가 들어갈 칸이 다른 텐트와 닿지 않아도 되므로 그대로 둔다
    const t = spots[Math.floor(rnd() * spots.length)];
    used[c] = 1;
    used[t] = 2;
    tents.push(c);
    trees.push(t);
  }
  return { trees: trees.sort((a, b) => a - b), tents: tents.sort((a, b) => a - b) };
}

export interface Generated {
  puzzle: Puzzle;
  /** 텐트 칸 */
  solution: number[];
  size: Size;
  level: Level;
  approximate: boolean;
}

/** 원하는 난이도의 문제를 만든다. 기법으로 끝까지 풀리는 문제만 내므로 답은 하나다 */
export function generate(size: Size, level: Level, rnd: Random = Math.random, budgetMs = 6000): Generated {
  const n = size;
  const want = LEVELS.findIndex((l) => l.id === level) + 1;
  const start = Date.now();
  let best: { puzzle: Puzzle; solution: number[]; gap: number } | null = null;
  do {
    const { trees, tents } = randomForest(n, rnd, 0.15 + rnd() * 0.05);
    const rows = Array.from({ length: n }, (_, r) => tents.filter((t) => Math.floor(t / n) === r).length);
    const cols = Array.from({ length: n }, (_, c) => tents.filter((t) => t % n === c).length);
    const puzzle: Puzzle = { n, trees, rows, cols };
    const { tier, state } = rate(layoutOf(puzzle), want);
    if (tier > want) continue;
    // 기법으로 끝까지 풀었으면 답은 하나이고, 그 답이 텐트 배치다
    const solved = state.flatMap((s, i) => (s === 1 ? [i] : []));
    if (tier === want) return { puzzle, solution: solved, size, level, approximate: false };
    if (!best || want - tier < best.gap) best = { puzzle, solution: solved, gap: want - tier };
  } while (Date.now() - start < budgetMs || !best);
  return { ...best, size, level, approximate: true };
}
