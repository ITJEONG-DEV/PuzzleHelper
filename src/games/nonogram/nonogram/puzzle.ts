import { type Cell, EMPTY, FILLED, UNKNOWN, lineDeductions, runsOf } from './line';

export interface Puzzle {
  /** 행 단서 (위에서 아래로) */
  rows: number[][];
  /** 열 단서 (왼쪽에서 오른쪽으로) */
  cols: number[][];
}

export type LineKind = 'row' | 'col';
export interface LineRef {
  kind: LineKind;
  index: number;
}

export const MAX_SIZE = 40;

export const width = (p: Puzzle) => p.cols.length;
export const height = (p: Puzzle) => p.rows.length;

export function lineIndices(p: Puzzle, ref: LineRef): number[] {
  const w = width(p);
  if (ref.kind === 'row') return Array.from({ length: w }, (_, c) => ref.index * w + c);
  return Array.from({ length: height(p) }, (_, r) => r * w + ref.index);
}

export const clueOf = (p: Puzzle, ref: LineRef) => (ref.kind === 'row' ? p.rows[ref.index] : p.cols[ref.index]);
export const lineName = (ref: LineRef) => `${ref.index + 1}${ref.kind === 'row' ? '행' : '열'}`;

export function allLines(p: Puzzle): LineRef[] {
  return [
    ...p.rows.map((_, index) => ({ kind: 'row' as const, index })),
    ...p.cols.map((_, index) => ({ kind: 'col' as const, index })),
  ];
}

/** 한 줄에 한 행(또는 열). 숫자는 공백·쉼표로 나눈다. 빈 줄은 0 또는 -로 쓴다. */
export function parseClues(text: string): number[][] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => (l.match(/\d+/g) ?? []).map(Number).filter((n) => n > 0));
}

export const formatClue = (clue: number[]) => (clue.length ? clue.join(' ') : '0');

/** 문제가 성립하지 않으면 이유를, 괜찮으면 null을 돌려준다 */
export function validatePuzzle(p: Puzzle): string | null {
  const w = width(p);
  const h = height(p);
  if (!w || !h) return '가로 단서와 세로 단서를 모두 입력하세요.';
  if (w > MAX_SIZE || h > MAX_SIZE) return `가로·세로는 ${MAX_SIZE}칸까지예요.`;
  for (const ref of allLines(p)) {
    const clue = clueOf(p, ref);
    const need = clue.reduce((a, b) => a + b, 0) + Math.max(0, clue.length - 1);
    const len = ref.kind === 'row' ? w : h;
    if (need > len) return `${lineName(ref)} 단서(${formatClue(clue)})는 최소 ${need}칸이 필요한데 ${len}칸뿐이에요.`;
  }
  const rowSum = p.rows.flat().reduce((a, b) => a + b, 0);
  const colSum = p.cols.flat().reduce((a, b) => a + b, 0);
  if (rowSum !== colSum) return `가로 단서 합(${rowSum})과 세로 단서 합(${colSum})이 달라요. 빠지거나 잘못 적은 단서가 있어요.`;
  return null;
}

/**
 * 줄 단위 추론을 더 나올 게 없을 때까지 반복한다. 모순이면 null.
 * changed를 주면 그 칸이 지나는 행·열부터 본다(나머지 줄은 이미 더 나올 게 없는 판일 때).
 */
export function propagate(p: Puzzle, grid: Cell[], changed?: number): Cell[] | null {
  const g = grid.slice();
  const lines = allLines(p);
  const w = width(p);
  const start = changed === undefined ? lines.map((_, i) => i) : [Math.floor(changed / w), p.rows.length + (changed % w)];
  const queued = new Set(start);
  const queue = start.slice();
  while (queue.length) {
    const li = queue.shift()!;
    queued.delete(li);
    const ref = lines[li];
    const idx = lineIndices(p, ref);
    const ded = lineDeductions(clueOf(p, ref), idx.map((i) => g[i]));
    if (!ded) return null;
    for (const { index, value } of ded) {
      const cell = idx[index];
      g[cell] = value;
      const cross = ref.kind === 'row' ? p.rows.length + (cell % w) : Math.floor(cell / w);
      if (!queued.has(cross)) {
        queued.add(cross);
        queue.push(cross);
      }
    }
  }
  return g;
}

export interface SolveResult {
  count: number;
  solution: Cell[] | null;
}

/** 줄 추론 + 백트래킹으로 해를 limit개까지 센다 */
export function solve(p: Puzzle, limit = 2, grid?: Cell[]): SolveResult {
  let count = 0;
  let solution: Cell[] | null = null;
  const start = grid ?? new Array<Cell>(width(p) * height(p)).fill(UNKNOWN);
  const rec = (g0: Cell[]): boolean => {
    const g = propagate(p, g0);
    if (!g) return false;
    const u = g.indexOf(UNKNOWN);
    if (u < 0) {
      count++;
      if (!solution) solution = g;
      return count >= limit;
    }
    for (const v of [FILLED, EMPTY] as const) {
      const next = g.slice();
      next[u] = v;
      if (rec(next)) return true;
    }
    return false;
  };
  rec(start);
  return { count, solution };
}

/** 정답 그림에서 단서를 만든다 (테스트·예제용) */
export function cluesFromSolution(rows: string[]): Puzzle {
  const grid = rows.map((r) => [...r].map((ch) => (ch === '#' ? FILLED : EMPTY)) as Cell[]);
  const w = grid[0].length;
  return {
    rows: grid.map((r) => runsOf(r)),
    cols: Array.from({ length: w }, (_, c) => runsOf(grid.map((r) => r[c]))),
  };
}
