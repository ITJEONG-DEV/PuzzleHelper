/** 지뢰찾기 판 */
export interface Field {
  w: number;
  h: number;
  /** 지뢰가 있는 칸 */
  mine: boolean[];
  /** 주변 8칸의 지뢰 수 */
  num: number[];
}

/** 칸 상태: 닫힘 · 열림 · 깃발 */
export const HIDDEN = 0;
export const OPEN = 1;
export const FLAG = 2;
/** 물음표: 사용자가 헷갈리는 칸에 다는 표시. 추론에서는 닫힌 칸과 같다 */
export const QUESTION = 3;
export type CellState = typeof HIDDEN | typeof OPEN | typeof FLAG | typeof QUESTION;

/** 닫힌 칸(물음표 포함) */
export const isClosed = (s: CellState) => s === HIDDEN || s === QUESTION;

const neighborCache = new Map<string, number[][]>();

/** 칸마다 주변 8칸 목록 */
export function neighborsOf(w: number, h: number): number[][] {
  const key = `${w}x${h}`;
  let t = neighborCache.get(key);
  if (t) return t;
  t = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const out: number[] = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= 0 && rr < h && cc >= 0 && cc < w) out.push(rr * w + cc);
        }
      }
      t.push(out);
    }
  }
  neighborCache.set(key, t);
  return t;
}

export function makeField(w: number, h: number, mine: boolean[]): Field {
  const nb = neighborsOf(w, h);
  return { w, h, mine, num: mine.map((_, i) => nb[i].reduce((a, j) => a + (mine[j] ? 1 : 0), 0)) };
}

/**
 * 칸을 연다. 0인 칸이면 주변을 이어서 연다. 새로 연 칸 목록을 돌려준다.
 * 깃발 칸은 열지 않는다. 물음표 칸은 닫힌 칸처럼 연다.
 */
export function openCell(f: Field, state: CellState[], start: number): number[] {
  if (!isClosed(state[start])) return [];
  const nb = neighborsOf(f.w, f.h);
  const opened: number[] = [];
  const stack = [start];
  state[start] = OPEN;
  while (stack.length) {
    const i = stack.pop()!;
    opened.push(i);
    if (f.mine[i] || f.num[i] !== 0) continue;
    for (const j of nb[i]) {
      if (!isClosed(state[j])) continue;
      state[j] = OPEN;
      stack.push(j);
    }
  }
  return opened;
}

export const cellName = (w: number, i: number) => `${Math.floor(i / w) + 1}행 ${(i % w) + 1}열`;

/** 지뢰가 아닌 칸을 모두 열었는가 */
export const isCleared = (f: Field, state: CellState[]) => state.every((s, i) => f.mine[i] || s === OPEN);

/** 연 칸 중 지뢰 */
export const exploded = (f: Field, state: CellState[]) => state.findIndex((s, i) => s === OPEN && f.mine[i]);
