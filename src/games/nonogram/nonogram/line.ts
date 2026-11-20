/** 노노그램 한 줄 풀이: 단서와 지금까지 정한 칸으로 확정되는 칸을 찾는다 */

export const UNKNOWN = 0;
export const FILLED = 1;
export const EMPTY = 2;
export type Cell = typeof UNKNOWN | typeof FILLED | typeof EMPTY;

export interface LineResult {
  /** 단서와 맞는 배치가 하나도 없으면 false */
  ok: boolean;
  /** 어떤 배치에서 칠해질 수 있는가 */
  canFill: boolean[];
  /** 어떤 배치에서 빌 수 있는가 */
  canEmpty: boolean[];
}

/**
 * 가능한 모든 배치를 앞뒤 동적 계획으로 훑는다.
 * pre[i][j]: 앞쪽 i칸에 블록 0..j-1을 다 놓을 수 있음 (마지막 블록 뒤 한 칸은 비움까지 포함)
 * suf[i][j]: i칸부터 끝까지 블록 j..k-1을 놓을 수 있음
 */
function tables(clue: number[], cells: Cell[]) {
  const n = cells.length;
  const blocks = clue.filter((b) => b > 0);
  const k = blocks.length;
  // noX[i]: i칸부터 몇 칸 연속으로 X가 아닌가
  const run = new Array<number>(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) run[i] = cells[i] === EMPTY ? 0 : run[i + 1] + 1;
  const fits = (s: number, len: number) => s + len <= n && run[s] >= len;

  const pre = Array.from({ length: n + 2 }, () => new Array<boolean>(k + 1).fill(false));
  pre[0][0] = true;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= k; j++) {
      if (!pre[i][j]) continue;
      if (cells[i] !== FILLED) pre[i + 1][j] = true;
      if (j < k && fits(i, blocks[j])) {
        const e = i + blocks[j];
        if (e === n) pre[n][j + 1] = true;
        else if (cells[e] !== FILLED) pre[e + 1][j + 1] = true;
      }
    }
  }

  const suf = Array.from({ length: n + 2 }, () => new Array<boolean>(k + 1).fill(false));
  suf[n][k] = true;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = 0; j <= k; j++) {
      let v = cells[i] !== FILLED && suf[i + 1][j];
      if (!v && j < k && fits(i, blocks[j])) {
        const e = i + blocks[j];
        v = e === n ? suf[n][j + 1] : cells[e] !== FILLED && suf[e + 1][j + 1];
      }
      suf[i][j] = v;
    }
  }
  return { n, blocks, k, fits, pre, suf };
}

export function solveLine(clue: number[], cells: Cell[]): LineResult {
  const { n, blocks, k, fits, pre, suf } = tables(clue, cells);
  const canFill = new Array<boolean>(n).fill(false);
  const canEmpty = new Array<boolean>(n).fill(false);
  if (!pre[n][k]) return { ok: false, canFill, canEmpty };

  for (let i = 0; i < n; i++) {
    if (cells[i] === FILLED) continue;
    for (let j = 0; j <= k; j++) {
      if (pre[i][j] && suf[i + 1][j]) {
        canEmpty[i] = true;
        break;
      }
    }
  }
  for (let j = 0; j < k; j++) {
    const len = blocks[j];
    for (let s = 0; s + len <= n; s++) {
      if (!pre[s][j] || !fits(s, len)) continue;
      const e = s + len;
      const after = e === n ? suf[n][j + 1] : cells[e] !== FILLED && suf[e + 1][j + 1];
      if (!after) continue;
      for (let t = s; t < e; t++) canFill[t] = true;
      // 블록 바로 뒤 구분 칸은 pre·suf의 단독 빈칸으로 잡히지 않으므로 여기서 표시한다
      if (e < n) canEmpty[e] = true;
    }
  }
  return { ok: true, canFill, canEmpty };
}

/**
 * 단서 숫자마다 완료 여부. 양쪽이 줄 끝이나 X로 막힌 칠한 덩어리가
 * 단서에 맞는 모든 배치에서 같은 단서 숫자일 때 그 숫자를 완료로 본다.
 * 반환 배열은 clue와 같은 순서다.
 */
export function doneClues(clue: number[], cells: Cell[]): boolean[] {
  const done = clue.map(() => false);
  const { n, blocks, k, pre, suf } = tables(clue, cells);
  if (!pre[n][k]) return done;
  // blocks 번호 → clue 번호 (0인 단서는 건너뛴다)
  const toClue = clue.flatMap((b, idx) => (b > 0 ? [idx] : []));
  let i = 0;
  while (i < n) {
    if (cells[i] !== FILLED) {
      i++;
      continue;
    }
    const s = i;
    while (i < n && cells[i] === FILLED) i++;
    const e = i;
    if ((s > 0 && cells[s - 1] !== EMPTY) || (e < n && cells[e] !== EMPTY)) continue;
    const which: number[] = [];
    for (let j = 0; j < k; j++) {
      if (blocks[j] !== e - s || !pre[s][j]) continue;
      if (e === n ? suf[n][j + 1] : suf[e + 1][j + 1]) which.push(j);
    }
    if (which.length === 1) done[toClue[which[0]]] = true;
  }
  return done;
}

/** 줄에서 새로 확정되는 칸. 모순이면 null */
export function lineDeductions(clue: number[], cells: Cell[]): { index: number; value: Cell }[] | null {
  const r = solveLine(clue, cells);
  if (!r.ok) return null;
  const out: { index: number; value: Cell }[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== UNKNOWN) continue;
    if (r.canFill[i] && !r.canEmpty[i]) out.push({ index: i, value: FILLED });
    else if (!r.canFill[i] && r.canEmpty[i]) out.push({ index: i, value: EMPTY });
    else if (!r.canFill[i] && !r.canEmpty[i]) return null;
  }
  return out;
}

/** 칠한 칸의 연속 길이 목록 */
export function runsOf(cells: Cell[]): number[] {
  const out: number[] = [];
  let n = 0;
  for (const c of cells) {
    if (c === FILLED) n++;
    else if (n) {
      out.push(n);
      n = 0;
    }
  }
  if (n) out.push(n);
  return out;
}

/** 칠한 칸이 단서와 정확히 같은가 */
export function lineSatisfied(clue: number[], cells: Cell[]): boolean {
  const runs = runsOf(cells);
  const blocks = clue.filter((b) => b > 0);
  return runs.length === blocks.length && runs.every((r, i) => r === blocks[i]);
}
