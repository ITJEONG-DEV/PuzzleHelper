import { type Cage, rate } from '../../latin/engine';
import { randomSolution } from '../../sudoku/sudoku/generate';
import { type Puzzle, gridOf } from './board';

export type Size = 'k9';
export const SIZES: { id: Size; label: string }[] = [{ id: 'k9', label: '9×9' }];

export type Level = 'easy' | 'medium' | 'hard';

export const LEVELS: { id: Level; label: string; desc: string }[] = [
  { id: 'easy', label: '하', desc: '상자 합 조합과 하나뿐인 후보로 풀려요' },
  { id: 'medium', label: '중', desc: '상자가 줄·박스에 꼭 넣는 숫자·숫자 쌍이 필요해요' },
  { id: 'hard', label: '상', desc: '숫자를 넣어 보고 모순을 찾아야 풀려요' },
];

export type Random = () => number;

/** 막힐 때 줄 수 있는 숫자 개수 */
const MAX_GIVENS = 8;

/** 정답에서 숫자가 겹치지 않게 칸을 묶어 2~5칸 상자를 만든다 */
export function randomCages(sol: number[], rnd: Random): Cage[] {
  const n = 9;
  const owner = new Array<number>(n * n).fill(-1);
  const cages: Cage[] = [];
  const order = Array.from({ length: n * n }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const start of order) {
    if (owner[start] >= 0) continue;
    const r = rnd();
    const want = r < 0.35 ? 2 : r < 0.7 ? 3 : r < 0.9 ? 4 : 5;
    const cells = [start];
    owner[start] = cages.length;
    const used = new Set([sol[start]]);
    while (cells.length < want) {
      const front = cells.flatMap((i) => {
        const rr = Math.floor(i / n);
        const cc = i % n;
        return [rr > 0 ? i - n : -1, rr < n - 1 ? i + n : -1, cc > 0 ? i - 1 : -1, cc < n - 1 ? i + 1 : -1].filter((j) => j >= 0 && owner[j] < 0 && !used.has(sol[j]));
      });
      if (!front.length) break;
      const j = front[Math.floor(rnd() * front.length)];
      owner[j] = cages.length;
      cells.push(j);
      used.add(sol[j]);
    }
    cages.push({ cells, op: '+', target: cells.reduce((a, i) => a + sol[i], 0) });
  }
  // 한 칸짜리 상자는 이웃 상자에 붙일 수 있으면 붙인다 (숫자가 겹치지 않을 때)
  for (let k = 0; k < cages.length; k++) {
    const c = cages[k];
    if (c.cells.length !== 1) continue;
    const i = c.cells[0];
    const rr = Math.floor(i / n);
    const cc = i % n;
    for (const j of [rr > 0 ? i - n : -1, rr < n - 1 ? i + n : -1, cc > 0 ? i - 1 : -1, cc < n - 1 ? i + 1 : -1]) {
      if (j < 0) continue;
      const other = cages[owner[j]];
      if (other === c || other.cells.length >= 5 || other.cells.some((x) => sol[x] === sol[i])) continue;
      other.cells.push(i);
      other.target += sol[i];
      owner[i] = owner[j];
      c.cells = [];
      break;
    }
  }
  return cages.filter((c) => c.cells.length).map((c) => (c.cells.length === 1 ? { ...c, op: '=' as const } : c));
}

export interface Generated {
  puzzle: Puzzle;
  solution: number[];
  size: Size;
  level: Level;
  approximate: boolean;
}

/** 원하는 난이도의 문제를 만든다. 기법으로 끝까지 풀리는 문제만 내므로 답은 하나다 */
export function generate(size: Size, level: Level, rnd: Random = Math.random, budgetMs = 8000): Generated {
  const want = LEVELS.findIndex((l) => l.id === level) + 1;
  const start = Date.now();
  let best: { puzzle: Puzzle; solution: number[]; gap: number } | null = null;
  do {
    const solution = randomSolution(rnd);
    const cages = randomCages(solution, rnd);
    const givens = new Array<number>(81).fill(0);
    // 정한 단계 기법으로 막히면 막힌 칸 하나에 숫자를 주고 다시 풀어 본다 (몇 개까지만)
    for (let t = 0; t <= MAX_GIVENS; t++) {
      const puzzle: Puzzle = { cages, givens: givens.slice() };
      const r = rate(gridOf(puzzle), want);
      if (r.tier <= want) {
        if (r.tier === want) return { puzzle, solution, size, level, approximate: false };
        if (!best || want - r.tier < best.gap) best = { puzzle, solution, gap: want - r.tier };
        break;
      }
      const open = r.values.flatMap((v, i) => (v ? [] : [i]));
      if (!open.length) break;
      const i = open[Math.floor(rnd() * open.length)];
      givens[i] = solution[i];
    }
  } while (Date.now() - start < budgetMs || !best);
  return { ...best, size, level, approximate: true };
}
