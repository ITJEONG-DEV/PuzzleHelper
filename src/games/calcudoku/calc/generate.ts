import { type Cage, type Op, type Puzzle, layoutOf } from './board';
import { rate } from './logic';

export const SIZES = [4, 5, 6, 7] as const;
export type Size = (typeof SIZES)[number];

export type Level = 'easy' | 'medium' | 'hard';

export const LEVELS: { id: Level; label: string; desc: string }[] = [
  { id: 'easy', label: '하', desc: '상자 계산과 줄의 하나뿐인 후보로 풀려요' },
  { id: 'medium', label: '중', desc: '상자가 한 줄에 꼭 넣는 숫자·숫자 쌍이 필요해요' },
  { id: 'hard', label: '상', desc: '숫자를 넣어 보고 모순을 찾아야 풀려요' },
];

export const levelLabel = (level: Level) => LEVELS.find((l) => l.id === level)!.label;

export type Random = () => number;

function shuffle<T>(items: T[], rnd: Random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 무작위 라틴 방진: 순환 방진의 행·열·숫자를 섞는다 */
export function randomLatin(n: number, rnd: Random): number[] {
  const rows = shuffle([...Array(n).keys()], rnd);
  const cols = shuffle([...Array(n).keys()], rnd);
  const sym = shuffle([...Array(n).keys()].map((x) => x + 1), rnd);
  const g = new Array<number>(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) g[r * n + c] = sym[(rows[r] + cols[c]) % n];
  return g;
}

/** 칸을 1~4칸 상자로 나눈다. 한 칸 상자는 드물게 둔다 */
export function randomCages(n: number, rnd: Random, singleRate = 0.08): number[][] {
  const owner = new Array<number>(n * n).fill(-1);
  const cages: number[][] = [];
  for (const start of shuffle([...Array(n * n).keys()], rnd)) {
    if (owner[start] >= 0) continue;
    const r = rnd();
    const want = r < singleRate ? 1 : r < 0.55 ? 2 : r < 0.85 ? 3 : 4;
    const cells = [start];
    owner[start] = cages.length;
    while (cells.length < want) {
      const front = cells.flatMap((i) => {
        const rr = Math.floor(i / n);
        const cc = i % n;
        return [rr > 0 ? i - n : -1, rr < n - 1 ? i + n : -1, cc > 0 ? i - 1 : -1, cc < n - 1 ? i + 1 : -1].filter((j) => j >= 0 && owner[j] < 0);
      });
      if (!front.length) break;
      const j = front[Math.floor(rnd() * front.length)];
      owner[j] = cages.length;
      cells.push(j);
    }
    cages.push(cells);
  }
  // 혼자 남은 한 칸 상자가 너무 많으면 이웃 2칸 상자에 붙인다
  return cages;
}

/** 상자에 연산과 결과를 정한다 */
function makeCage(cells: number[], sol: number[], rnd: Random): Cage {
  const ds = cells.map((i) => sol[i]);
  if (cells.length === 1) return { cells, op: '=', target: ds[0] };
  if (cells.length === 2) {
    const [a, b] = ds[0] > ds[1] ? ds : [ds[1], ds[0]];
    const ops: Op[] = [];
    if (a % b === 0 && rnd() < 0.7) ops.push('÷');
    if (rnd() < 0.5) ops.push('-');
    ops.push(rnd() < 0.5 ? '+' : '×');
    const op = ops[0];
    const target = op === '÷' ? a / b : op === '-' ? a - b : op === '+' ? a + b : a * b;
    return { cells, op, target };
  }
  const op: Op = rnd() < 0.5 ? '+' : '×';
  return { cells, op, target: op === '+' ? ds.reduce((x, y) => x + y, 0) : ds.reduce((x, y) => x * y, 1) };
}

export interface Generated {
  puzzle: Puzzle;
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
    const solution = randomLatin(n, rnd);
    const groups = randomCages(n, rnd);
    for (let t = 0; t < 6; t++) {
      // 같은 상자 나눔에 연산만 바꿔 여러 번 본다
      const puzzle: Puzzle = { n, cages: groups.map((cells) => makeCage(cells, solution, rnd)) };
      const { tier } = rate(layoutOf(puzzle), want);
      if (tier === want) return { puzzle, solution, size, level, approximate: false };
      if (tier < want && (!best || want - tier < best.gap)) best = { puzzle, solution, gap: want - tier };
    }
  } while (Date.now() - start < budgetMs || !best);
  return { ...best, size, level, approximate: true };
}
