/** 가쿠로 판: 검은 칸(합 단서)과 흰 칸(숫자를 넣는 칸) */
export interface Puzzle {
  w: number;
  h: number;
  /** 숫자를 넣는 칸 */
  white: boolean[];
  /** 검은 칸 오른쪽으로 이어지는 흰 칸들의 합. 없으면 0 */
  across: number[];
  /** 검은 칸 아래로 이어지는 흰 칸들의 합. 없으면 0 */
  down: number[];
}

export type Dir = 'across' | 'down';

/** 합 단서 하나가 묶는 흰 칸들 */
export interface Run {
  dir: Dir;
  /** 단서가 적힌 검은 칸 */
  head: number;
  sum: number;
  cells: number[];
}

export interface Layout {
  p: Puzzle;
  runs: Run[];
  /** 칸마다 [가로 줄 번호, 세로 줄 번호]. 흰 칸이 아니면 -1 */
  cellRuns: [number, number][];
}

export const bit = (d: number) => 1 << d;
export const ALL = 0b1111111110;
export const has = (mask: number, d: number) => (mask & bit(d)) !== 0;

export function popcount(m: number): number {
  let n = 0;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
}

export function digitsOf(mask: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= 9; d++) if (mask & bit(d)) out.push(d);
  return out;
}

export const onlyDigit = (mask: number) => 31 - Math.clz32(mask);

/** COMBOS[칸 수][합] = 서로 다른 1~9 숫자로 그 합을 만드는 조합들(비트마스크) */
export const COMBOS: number[][][] = (() => {
  const t: number[][][] = Array.from({ length: 10 }, () => Array.from({ length: 46 }, () => [] as number[]));
  for (let m = 0; m < 512; m++) {
    const mask = m << 1;
    const ds = digitsOf(mask);
    t[ds.length][ds.reduce((a, b) => a + b, 0)].push(mask);
  }
  return t;
})();

export const comboText = (mask: number) => digitsOf(mask).join('+');
export const digitList = (mask: number) => digitsOf(mask).join(', ');

export function emptyPuzzle(w: number, h: number): Puzzle {
  const n = w * h;
  return { w, h, white: new Array(n).fill(false), across: new Array(n).fill(0), down: new Array(n).fill(0) };
}

/** 흰 칸 배치에서 줄(합 단서가 묶는 칸들)을 찾는다. 합은 puzzle의 단서를 쓴다 */
export function layoutOf(p: Puzzle): Layout {
  const { w, h, white } = p;
  const runs: Run[] = [];
  const cellRuns: [number, number][] = white.map(() => [-1, -1]);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = r * w + c;
      if (white[i]) continue;
      if (c + 1 < w && white[i + 1]) {
        const cells: number[] = [];
        for (let k = c + 1; k < w && white[r * w + k]; k++) cells.push(r * w + k);
        for (const x of cells) cellRuns[x][0] = runs.length;
        runs.push({ dir: 'across', head: i, sum: p.across[i], cells });
      }
      if (r + 1 < h && white[i + w]) {
        const cells: number[] = [];
        for (let k = r + 1; k < h && white[k * w + c]; k++) cells.push(k * w + c);
        for (const x of cells) cellRuns[x][1] = runs.length;
        runs.push({ dir: 'down', head: i, sum: p.down[i], cells });
      }
    }
  }
  return { p, runs, cellRuns };
}

/** 정답에서 합 단서를 만든다 */
export function cluesFrom(white: boolean[], w: number, h: number, solution: number[]): Puzzle {
  const p: Puzzle = { ...emptyPuzzle(w, h), white: white.slice() };
  const { runs } = layoutOf(p);
  for (const run of runs) {
    const s = run.cells.reduce((a, i) => a + solution[i], 0);
    if (run.dir === 'across') p.across[run.head] = s;
    else p.down[run.head] = s;
  }
  return p;
}

export const cellName = (p: Puzzle, i: number) => `${Math.floor(i / p.w) + 1}행 ${(i % p.w) + 1}열`;
export const runName = (run: Run) => `${run.dir === 'across' ? '가로' : '세로'} 합 ${run.sum}(${run.cells.length}칸)`;

/** 줄에 이미 넣은 숫자 */
export function placedOf(run: Run, values: number[]): { mask: number; sum: number; dup: boolean; empty: number[] } {
  let mask = 0;
  let sum = 0;
  let dup = false;
  const empty: number[] = [];
  for (const i of run.cells) {
    const v = values[i];
    if (!v) {
      empty.push(i);
      continue;
    }
    if (mask & bit(v)) dup = true;
    mask |= bit(v);
    sum += v;
  }
  return { mask, sum, dup, empty };
}

/** 이미 넣은 숫자를 포함하는 조합들 */
export function combosWith(run: Run, placed: number): number[] {
  return COMBOS[run.cells.length][run.sum].filter((c) => (c & placed) === placed);
}

/** 줄의 빈칸에 들어갈 수 있는 숫자: 넣은 숫자를 포함하는 조합에 든 나머지 숫자 */
export function runAllowed(run: Run, values: number[]): number {
  const pl = placedOf(run, values);
  if (pl.dup) return 0;
  let m = 0;
  for (const c of combosWith(run, pl.mask)) m |= c;
  return m & ~pl.mask;
}

/** 빈칸마다 가로·세로 줄의 조합으로 가능한 숫자 */
export function computeCandidates(lay: Layout, values: number[]): number[] {
  const allowed = lay.runs.map((run) => runAllowed(run, values));
  return values.map((v, i) => {
    if (!lay.p.white[i] || v) return 0;
    const [a, d] = lay.cellRuns[i];
    return (a >= 0 ? allowed[a] : ALL) & (d >= 0 ? allowed[d] : ALL);
  });
}

/** 같은 줄에 같은 숫자가 있거나, 다 채운 줄의 합이 틀리거나, 넣은 숫자의 합이 이미 넘친 칸 */
export function conflictCells(lay: Layout, values: number[]): Set<number> {
  const out = new Set<number>();
  for (const run of lay.runs) {
    const pl = placedOf(run, values);
    const bad = pl.dup || (pl.empty.length === 0 ? pl.sum !== run.sum : pl.sum >= run.sum);
    if (!bad) continue;
    if (pl.dup) {
      for (const i of run.cells) if (values[i] && run.cells.some((j) => j !== i && values[j] === values[i])) out.add(i);
    } else for (const i of run.cells) if (values[i]) out.add(i);
  }
  return out;
}

/** 조사: 숫자·한글 끝 받침에 따라 고른다 */
const DIGIT_HAS_BATCHIM: Record<string, boolean> = { '0': true, '1': true, '2': false, '3': true, '4': false, '5': false, '6': true, '7': true, '8': true, '9': false };
export function josa(word: string, withBatchim: string, withoutBatchim: string): string {
  // "가로 합 16(2칸)"처럼 끝의 괄호는 건너뛰고 읽는다
  const base = word.replace(/\([^)]*\)$/, '');
  const last = base[base.length - 1];
  let batchim: boolean;
  if (last in DIGIT_HAS_BATCHIM) batchim = DIGIT_HAS_BATCHIM[last];
  else {
    const code = last.charCodeAt(0) - 0xac00;
    batchim = code >= 0 && code <= 11171 ? code % 28 !== 0 : false;
  }
  return word + (batchim ? withBatchim : withoutBatchim);
}
