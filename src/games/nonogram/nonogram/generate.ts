import { type Cell, EMPTY, FILLED, UNKNOWN, lineDeductions, runsOf } from './line';
import { type Puzzle, allLines, clueOf, lineIndices, propagate } from './puzzle';

export const SIZES = [5, 10, 15, 20] as const;
export type Size = (typeof SIZES)[number];

export type Level = 'easy' | 'medium' | 'hard' | 'expert';

/**
 * 쉬움·보통·어려움은 줄 추론만으로 끝까지 풀리는 문제이고, 빈 판에서 줄 하나씩 겹치기로
 * 바로 정해지는 칸의 비율로 나눈다. 많이 정해질수록 실마리가 많아 쉽다.
 * 최상은 줄 추론으로는 막히고, 한 칸을 가정해 줄 추론을 이어가다 모순을 찾아야 풀리는 문제다.
 * 어느 난이도든 모든 칸이 논리로 정해지므로 답은 하나다.
 */
export const LEVELS: { id: Level; label: string; desc: string; density: number; minOpen: number; maxOpen: number; probe: boolean }[] = [
  { id: 'easy', label: '쉬움', desc: '처음부터 정해지는 칸이 많아요', density: 0.65, minOpen: 0.6, maxOpen: 1, probe: false },
  { id: 'medium', label: '보통', desc: '가로·세로를 몇 번 오가야 해요', density: 0.55, minOpen: 0.3, maxOpen: 0.6, probe: false },
  { id: 'hard', label: '어려움', desc: '처음 실마리가 적고 오래 오가야 해요', density: 0.45, minOpen: 0, maxOpen: 0.3, probe: false },
  { id: 'expert', label: '최상', desc: '줄 하나로는 막혀서 칸을 가정해 보고 모순을 찾아야 해요', density: 0.5, minOpen: 0, maxOpen: 1, probe: true },
];

/**
 * 줄 하나로 더 정해지지 않을 때 쓰는 한 단계 가정:
 * 모르는 칸을 칠한다(또는 X)고 가정하고 줄 추론을 이어가 모순이 나면 반대가 답이다.
 * 확정되는 칸을 하나 찾으면 그 칸과 값, 가정한 값을 돌려준다.
 */
export function findProbe(p: Puzzle, grid: Cell[]): { cell: number; value: Cell; assumed: Cell } | null {
  for (let cell = 0; cell < grid.length; cell++) {
    if (grid[cell] !== UNKNOWN) continue;
    for (const assumed of [FILLED, EMPTY] as const) {
      const g = grid.slice();
      g[cell] = assumed;
      if (!propagate(p, g, cell)) return { cell, value: assumed === FILLED ? EMPTY : FILLED, assumed };
    }
  }
  return null;
}

/** 줄 추론과 한 단계 가정을 번갈아 써서 끝까지 풀어 본다. 풀리면 정답 판, 막히면 null */
export function solveWithProbing(p: Puzzle): { grid: Cell[]; probes: number } | null {
  let g = propagate(p, new Array<Cell>(p.rows.length * p.cols.length).fill(UNKNOWN));
  let probes = 0;
  while (g && g.includes(UNKNOWN)) {
    const found = findProbe(p, g);
    if (!found) return null;
    probes++;
    g[found.cell] = found.value;
    g = propagate(p, g, found.cell);
  }
  return g ? { grid: g, probes } : null;
}

export const levelLabel = (level: Level) => LEVELS.find((l) => l.id === level)!.label;

export type Random = () => number;

/** 무작위로 칠한 뒤 이웃 칸과 비슷하게 한 번 다듬어, 흩뿌린 점보다 덩어리진 그림을 만든다 */
export function randomGrid(w: number, h: number, density: number, rnd: Random = Math.random): Cell[] {
  const g: Cell[] = Array.from({ length: w * h }, () => (rnd() < density ? FILLED : EMPTY));
  const out = g.slice();
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      let filled = 0;
      let total = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= h || cc >= w) continue;
          total++;
          if (g[rr * w + cc] === FILLED) filled++;
        }
      }
      if (filled * 2 > total) out[r * w + c] = FILLED;
      else if (filled * 2 < total) out[r * w + c] = EMPTY;
    }
  }
  return out;
}

export function cluesOf(grid: Cell[], w: number, h: number): Puzzle {
  return {
    rows: Array.from({ length: h }, (_, r) => runsOf(grid.slice(r * w, r * w + w))),
    cols: Array.from({ length: w }, (_, c) => runsOf(Array.from({ length: h }, (_, r) => grid[r * w + c]))),
  };
}

export interface Rating {
  /** 줄 추론만으로 다 풀리는가 */
  solved: boolean;
  /** 빈 판에서 첫 바퀴에 정해지는 칸 비율 */
  open: number;
  /** 모든 줄을 한 번씩 보는 바퀴를 몇 번 돌아야 끝나는가 */
  rounds: number;
}

/** 모든 줄을 바퀴 단위로 동시에 추론해 본다 */
export function rate(p: Puzzle): Rating {
  const g: Cell[] = new Array<Cell>(p.rows.length * p.cols.length).fill(UNKNOWN);
  let rounds = 0;
  let open = 0;
  for (;;) {
    const snap = g.slice();
    let changed = false;
    for (const ref of allLines(p)) {
      const idx = lineIndices(p, ref);
      const ded = lineDeductions(clueOf(p, ref), idx.map((i) => snap[i]));
      if (!ded) return { solved: false, open, rounds };
      for (const { index, value } of ded) {
        if (g[idx[index]] !== UNKNOWN) continue;
        g[idx[index]] = value;
        changed = true;
      }
    }
    if (!changed) break;
    rounds++;
    if (rounds === 1) open = g.filter((v) => v !== UNKNOWN).length / g.length;
  }
  return { solved: !g.includes(UNKNOWN), open, rounds };
}

export interface Generated {
  puzzle: Puzzle;
  solution: Cell[];
  size: Size;
  level: Level;
  /** 원하는 난이도를 시간 안에 못 만들어 가장 가까운 문제를 준 경우 */
  approximate: boolean;
}

/** 원하는 크기·난이도의 문제를 만든다. 시간 안에 못 찾으면 줄 추론으로 풀리는 문제 중 가장 가까운 것을 준다 */
export function generate(size: Size, level: Level, rnd: Random = Math.random, budgetMs = 6000): Generated {
  const spec = LEVELS.find((l) => l.id === level)!;
  const start = Date.now();
  let best: { puzzle: Puzzle; solution: Cell[]; gap: number } | null = null;
  let tries = 0;
  for (;;) {
    tries++;
    // 밀도를 조금씩 흔들어 같은 난이도 안에서도 모양이 다양하게 나오게 한다
    const density = Math.min(0.85, Math.max(0.2, spec.density + (rnd() - 0.5) * 0.1));
    const solution = randomGrid(size, size, density, rnd);
    if (!solution.includes(FILLED)) continue;
    const puzzle = cluesOf(solution, size, size);
    const r = rate(puzzle);
    if (spec.probe) {
      // 줄 추론으로 막히고, 한 단계 가정으로는 끝까지 풀리는 문제만 쓴다
      if (!r.solved && solveWithProbing(puzzle)) return { puzzle, solution, size, level, approximate: false };
      if (r.solved && !best) best = { puzzle, solution, gap: 1 };
    } else if (r.solved) {
      if (r.open >= spec.minOpen && r.open < spec.maxOpen) return { puzzle, solution, size, level, approximate: false };
      const gap = r.open < spec.minOpen ? spec.minOpen - r.open : r.open - spec.maxOpen;
      if (!best || gap < best.gap) best = { puzzle, solution, gap };
    }
    if (best && Date.now() - start > budgetMs) return { ...best, size, level, approximate: true };
    if (tries > 1e6) throw new Error('문제를 만들지 못했어요');
  }
}
