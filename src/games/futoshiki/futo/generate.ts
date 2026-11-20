import { randomLatin, rate } from '../../latin/engine';
import { type Ineq, type Puzzle, gridOf } from './board';

export const SIZES: { id: 4 | 5 | 6 | 7; label: string }[] = [4, 5, 6, 7].map((n) => ({ id: n as 4 | 5 | 6 | 7, label: `${n}×${n}` }));
export type Size = 4 | 5 | 6 | 7;

export type Level = 'easy' | 'medium' | 'hard';

export const LEVELS: { id: Level; label: string; desc: string }[] = [
  { id: 'easy', label: '하', desc: '부등호와 하나뿐인 후보로 풀려요' },
  { id: 'medium', label: '중', desc: '숫자 쌍 같은 줄 추론이 필요해요' },
  { id: 'hard', label: '상', desc: '숫자를 넣어 보고 모순을 찾아야 풀려요' },
];

export type Random = () => number;

function shuffle<T>(items: T[], rnd: Random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 이웃한 칸 쌍 (가로·세로) */
function adjacentPairs(n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const i = r * n + c;
      if (c < n - 1) out.push([i, i + 1]);
      if (r < n - 1) out.push([i, i + n]);
    }
  }
  return out;
}

const toIneq = (a: number, b: number, sol: number[]): Ineq => (sol[a] < sol[b] ? { less: a, more: b } : { less: b, more: a });

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
  const pairs = adjacentPairs(n);
  do {
    const solution = randomLatin(n, rnd);
    // 부등호를 넉넉히 둔 쉬운 판에서 시작한다
    let ineqs = pairs.filter(() => rnd() < 0.55).map(([a, b]) => toIneq(a, b, solution));
    const givens = new Array<number>(n * n).fill(0);
    const make = (qs: Ineq[]): Puzzle => ({ n, ineqs: qs, givens: givens.slice() });
    // 정한 단계로도 막히면 막힌 칸 옆에 부등호를 더하고, 더할 곳이 없으면 숫자를 준다
    let r = rate(gridOf(make(ineqs)), want);
    for (let t = 0; t < n * 3 && r.tier > want; t++) {
      const open = r.values.flatMap((v, i) => (v ? [] : [i]));
      const i = open[Math.floor(rnd() * open.length)];
      const free = pairs.filter(([a, b]) => (a === i || b === i) && !ineqs.some((q) => (q.less === a && q.more === b) || (q.less === b && q.more === a)));
      if (free.length) {
        const [a, b] = free[Math.floor(rnd() * free.length)];
        ineqs = [...ineqs, toIneq(a, b, solution)];
      } else givens[i] = solution[i];
      r = rate(gridOf(make(ineqs)), want);
    }
    if (r.tier > want) continue;
    // 정한 단계로 계속 풀리는 동안 부등호를 하나씩 뺀다. 단서가 줄수록 어려워진다
    let tier = r.tier;
    for (const q of shuffle(ineqs, rnd)) {
      if (tier === want && rnd() < 0.15) break;
      // 큰 판에서 오래 걸리면 지금까지 뺀 것으로 마무리한다
      if (Date.now() - start > budgetMs * 0.8) break;
      const next = ineqs.filter((x) => x !== q);
      const t2 = rate(gridOf(make(next)), want).tier;
      if (t2 <= want) {
        ineqs = next;
        tier = t2;
      }
    }
    const puzzle = make(ineqs);
    if (tier === want) return { puzzle, solution, size, level, approximate: false };
    if (!best || want - tier < best.gap) best = { puzzle, solution, gap: want - tier };
  } while (Date.now() - start < budgetMs || !best);
  return { ...best, size, level, approximate: true };
}
