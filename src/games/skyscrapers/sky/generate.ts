import { randomLatin, rate } from '../../latin/engine';
import { type Puzzle, gridOf, visible } from './board';

export type Size = 4 | 5 | 6;
export const SIZES: { id: Size; label: string }[] = [4, 5, 6].map((n) => ({ id: n as Size, label: `${n}×${n}` }));

export type Level = 'easy' | 'medium' | 'hard';

export const LEVELS: { id: Level; label: string; desc: string }[] = [
  { id: 'easy', label: '하', desc: '단서와 거리로 정해지는 최대 높이·하나뿐인 후보로 풀려요' },
  { id: 'medium', label: '중', desc: '한 줄에 놓을 수 있는 배치를 모두 따져야 해요' },
  { id: 'hard', label: '상', desc: '빌딩을 넣어 보고 모순을 찾아야 풀려요' },
];

export type Random = () => number;

export interface Generated {
  puzzle: Puzzle;
  solution: number[];
  size: Size;
  level: Level;
  approximate: boolean;
}

/** 단서 목록의 한 자리: 어느 쪽 몇 번째 */
type Slot = ['top' | 'bottom' | 'left' | 'right', number];

/** 원하는 난이도의 문제를 만든다. 기법으로 끝까지 풀리는 문제만 내므로 답은 하나다 */
export function generate(size: Size, level: Level, rnd: Random = Math.random, budgetMs = 6000): Generated {
  const n = size;
  const want = LEVELS.findIndex((l) => l.id === level) + 1;
  const start = Date.now();
  let best: { puzzle: Puzzle; solution: number[]; gap: number } | null = null;
  do {
    const solution = randomLatin(n, rnd);
    const row = (r: number) => solution.slice(r * n, r * n + n);
    const col = (c: number) => Array.from({ length: n }, (_, r) => solution[r * n + c]);
    // 단서를 모두 둔 판에서 시작한다
    const full: Puzzle = {
      n,
      top: Array.from({ length: n }, (_, c) => visible(col(c))),
      bottom: Array.from({ length: n }, (_, c) => visible(col(c).reverse())),
      left: Array.from({ length: n }, (_, r) => visible(row(r))),
      right: Array.from({ length: n }, (_, r) => visible(row(r).reverse())),
      givens: new Array(n * n).fill(0),
    };
    let cur = full;
    let r = rate(gridOf(cur), want);
    // 단서를 다 둬도 정한 단계로 막히면 막힌 칸에 높이를 하나씩 준다
    for (let t = 0; t < n * 2 && r.tier > want; t++) {
      const open = r.values.flatMap((v, i) => (v ? [] : [i]));
      const i = open[Math.floor(rnd() * open.length)];
      const givens = cur.givens.slice();
      givens[i] = solution[i];
      cur = { ...cur, givens };
      r = rate(gridOf(cur), want);
    }
    if (r.tier > want) continue;
    // 정한 단계로 계속 풀리는 동안 단서를 하나씩 뺀다. 단서가 줄수록 어려워진다
    let tier = r.tier;
    const slots: Slot[] = (['top', 'bottom', 'left', 'right'] as const).flatMap((side) => Array.from({ length: n }, (_, k) => [side, k] as Slot));
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    for (const [side, k] of slots) {
      if (tier === want && rnd() < 0.1) break;
      if (Date.now() - start > budgetMs * 0.8) break;
      const arr = cur[side].slice();
      arr[k] = 0;
      const next: Puzzle = { ...cur, [side]: arr };
      r = rate(gridOf(next), want);
      if (r.tier <= want) {
        cur = next;
        tier = r.tier;
      }
    }
    if (tier === want) return { puzzle: cur, solution, size, level, approximate: false };
    if (!best || want - tier < best.gap) best = { puzzle: cur, solution, gap: want - tier };
  } while (Date.now() - start < budgetMs || !best);
  return { ...best, size, level, approximate: true };
}
