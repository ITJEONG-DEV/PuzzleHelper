import { type Puzzle, layoutOf } from './board';
import { rate } from './logic';
import { solveCount } from './solver';

/** 판 크기와 줄·영역마다 별 수 */
export const SIZES = [
  { id: 's5', n: 5, k: 1 },
  { id: 's6', n: 6, k: 1 },
  { id: 's8', n: 8, k: 1 },
  { id: 's9', n: 9, k: 1 },
] as const;
export type SizeId = (typeof SIZES)[number]['id'];
export const sizeOf = (id: SizeId) => SIZES.find((s) => s.id === id)!;
export const sizeLabel = (id: SizeId) => {
  const s = sizeOf(id);
  return `${s.n}×${s.n}`;
};

export type Level = 'easy' | 'medium' | 'hard';

export const LEVELS: { id: Level; label: string; desc: string }[] = [
  { id: 'easy', label: '하', desc: '별 주변·다 찬 줄·한 줄에 갇힌 영역으로 풀려요' },
  { id: 'medium', label: '중', desc: '별을 두면 다른 줄이 못 채워지는 칸을 찾아야 해요' },
  { id: 'hard', label: '상', desc: '여러 영역·줄을 묶어 세거나, 별을 넣어 보고 모순을 찾아야 해요' },
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

/** 행·열마다 별 k개, 서로 닿지 않는 별 배치 */
export function randomStars(n: number, k: number, rnd: Random): number[] | null {
  const colCount = new Array<number>(n).fill(0);
  const stars: number[] = [];
  const isStar = new Set<number>();
  let steps = 0;
  const touches = (i: number) => {
    const r = Math.floor(i / n);
    const c = i % n;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && r + dr >= 0 && r + dr < n && c + dc >= 0 && c + dc < n && isStar.has((r + dr) * n + c + dc)) return true;
    return false;
  };
  // 행마다 열 조합을 고른다
  const rec = (r: number): boolean => {
    if (r === n) return colCount.every((x) => x === k);
    if (++steps > 20000) return false;
    const choose = (start: number, picked: number[]): boolean => {
      if (picked.length === k) {
        for (const c of picked) {
          colCount[c]++;
          isStar.add(r * n + c);
          stars.push(r * n + c);
        }
        const ok = rec(r + 1);
        if (!ok) {
          for (const c of picked) {
            colCount[c]--;
            isStar.delete(r * n + c);
            stars.pop();
          }
        }
        return ok;
      }
      for (const c of shuffle(Array.from({ length: n - start }, (_, x) => x + start), rnd)) {
        if (picked.some((p) => Math.abs(p - c) < 2) || colCount[c] >= k || touches(r * n + c)) continue;
        // 남은 행으로 이 열을 다 채울 수 있는지 간단히 본다
        if (choose(c + 1, [...picked, c].sort((a, b) => a - b))) return true;
      }
      return false;
    };
    return choose(0, []);
  };
  return rec(0) ? stars : null;
}

/** 별을 씨앗으로 영역을 무작위로 키운다. k=2면 가까운 별 둘을 길로 이어 한 영역으로 시작한다 */
export function randomRegions(n: number, k: number, stars: number[], rnd: Random): number[] | null {
  const region = new Array<number>(n * n).fill(-1);
  const nb4 = (i: number) => {
    const r = Math.floor(i / n);
    const c = i % n;
    return [r > 0 ? i - n : -1, r < n - 1 ? i + n : -1, c > 0 ? i - 1 : -1, c < n - 1 ? i + 1 : -1].filter((x) => x >= 0);
  };
  const starSet = new Set(stars);
  if (k === 1) stars.forEach((s, g) => (region[s] = g));
  else {
    // 가까운 별끼리 짝을 지어 별이 아닌 칸으로 잇는다
    const left = shuffle(stars, rnd);
    let g = 0;
    while (left.length) {
      const a = left.pop()!;
      const dist = (b: number) => Math.abs(Math.floor(a / n) - Math.floor(b / n)) + Math.abs((a % n) - (b % n));
      left.sort((x, y) => dist(y) - dist(x));
      const b = left.pop();
      if (b === undefined) return null;
      // a에서 b까지, 다른 별과 이미 정한 영역을 피해 가는 길
      const prev = new Map<number, number>([[a, -1]]);
      const queue = [a];
      while (queue.length && !prev.has(b)) {
        const x = queue.shift()!;
        for (const y of shuffle(nb4(x), rnd)) {
          if (prev.has(y) || region[y] >= 0 || (starSet.has(y) && y !== b)) continue;
          prev.set(y, x);
          queue.push(y);
        }
      }
      if (!prev.has(b)) return null;
      for (let x = b; x >= 0; x = prev.get(x)!) region[x] = g;
      g++;
    }
  }
  // 빈 칸을 이웃 영역에 하나씩 붙인다
  for (let guard = 0; guard < n * n * 50 && region.includes(-1); guard++) {
    const frontier: [number, number][] = [];
    region.forEach((g, i) => {
      if (g >= 0) return;
      for (const j of nb4(i)) if (region[j] >= 0) frontier.push([i, region[j]]);
    });
    if (!frontier.length) return null;
    const [i, g] = frontier[Math.floor(rnd() * frontier.length)];
    region[i] = g;
  }
  return region.includes(-1) ? null : region;
}

/** 영역 g가 이어져 있는가 (칸 skip을 뺐을 때) */
function connected(n: number, region: number[], g: number, skip: number): boolean {
  const cells = region.flatMap((x, i) => (x === g && i !== skip ? [i] : []));
  if (!cells.length) return false;
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const i = stack.pop()!;
    const r = Math.floor(i / n);
    const c = i % n;
    for (const j of [r > 0 ? i - n : -1, r < n - 1 ? i + n : -1, c > 0 ? i - 1 : -1, c < n - 1 ? i + 1 : -1]) {
      if (j < 0 || j === skip || seen.has(j) || region[j] !== g) continue;
      seen.add(j);
      stack.push(j);
    }
  }
  return seen.size === cells.length;
}

/**
 * 답이 하나가 되게 영역 경계를 고친다: 다른 답에만 있는 별 칸 하나를 이웃 영역으로 옮기면
 * 그 답은 영역 별 수가 맞지 않아 깨지고, 진짜 답(그 칸에 별 없음)은 그대로 맞다.
 */
function makeUnique(n: number, k: number, stars: number[], region: number[], rnd: Random, tries: number): number[] | null {
  const reg = region.slice();
  const starSet = new Set(stars);
  for (let t = 0; t < tries; t++) {
    const sols = solveCount({ n, k, region: reg }, 2);
    if (sols.length === 1) return reg;
    const alt = sols.find((s) => s.some((i) => !starSet.has(i)));
    if (!alt) return null;
    let moved = false;
    for (const x of shuffle(alt.filter((i) => !starSet.has(i)), rnd)) {
      const r = Math.floor(x / n);
      const c = x % n;
      const others = [r > 0 ? x - n : -1, r < n - 1 ? x + n : -1, c > 0 ? x - 1 : -1, c < n - 1 ? x + 1 : -1].filter((j) => j >= 0 && reg[j] !== reg[x]);
      if (!others.length || !connected(n, reg, reg[x], x)) continue;
      reg[x] = reg[others[Math.floor(rnd() * others.length)]];
      moved = true;
      break;
    }
    if (!moved) return null;
  }
  return null;
}

/** 크기별로 영역 경계를 고쳐 보는 횟수 */
const REPAIR: Record<number, number> = { 5: 60, 6: 80, 8: 150, 9: 200 };

export interface Generated {
  puzzle: Puzzle;
  solution: number[];
  size: SizeId;
  level: Level;
  approximate: boolean;
}

/** 원하는 난이도의 문제를 만든다. 기법으로 끝까지 풀리는 문제만 내므로 답은 하나다 */
export function generate(size: SizeId, level: Level, rnd: Random = Math.random, budgetMs = 6000): Generated {
  const { n, k } = sizeOf(size);
  const want = LEVELS.findIndex((l) => l.id === level) + 1;
  const start = Date.now();
  let best: { puzzle: Puzzle; solution: number[]; gap: number } | null = null;
  do {
    const stars = randomStars(n, k, rnd);
    if (!stars) continue;
    for (let t = 0; t < 8; t++) {
      const raw = randomRegions(n, k, stars, rnd);
      // 답이 하나가 되게 경계를 고친 뒤, 정한 단계 기법으로 풀리는지 본다
      const region = raw && makeUnique(n, k, stars, raw, rnd, REPAIR[n] ?? 200);
      if (!region) continue;
      const puzzle: Puzzle = { n, k, region };
      const { tier } = rate(layoutOf(puzzle), want);
      if (tier === want) return { puzzle, solution: stars.slice().sort((a, b) => a - b), size, level, approximate: false };
      if (tier < want && (!best || want - tier < best.gap)) best = { puzzle, solution: stars.slice().sort((a, b) => a - b), gap: want - tier };
    }
  } while (Date.now() - start < budgetMs || !best);
  return { ...best, size, level, approximate: true };
}
