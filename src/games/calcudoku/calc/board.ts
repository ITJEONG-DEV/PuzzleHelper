/** 칼큐도쿠(켄켄과 같은 규칙): N×N 라틴 방진 + 상자마다 사칙연산 결과 */
export type Op = '+' | '-' | '×' | '÷' | '=';

export interface Cage {
  cells: number[];
  op: Op;
  target: number;
}

export interface Puzzle {
  n: number;
  cages: Cage[];
}

export interface Layout {
  p: Puzzle;
  /** 칸마다 상자 번호 */
  cageOf: number[];
  /** 행 n개, 열 n개 */
  lines: number[][];
  /** 칸마다 같은 행·열의 다른 칸 */
  peers: number[][];
}

const layouts = new WeakMap<Puzzle, Layout>();

export function layoutOf(p: Puzzle): Layout {
  const cached = layouts.get(p);
  if (cached) return cached;
  const { n } = p;
  const cageOf = new Array<number>(n * n).fill(-1);
  p.cages.forEach((c, k) => c.cells.forEach((i) => (cageOf[i] = k)));
  const lines: number[][] = [];
  for (let r = 0; r < n; r++) lines.push(Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) lines.push(Array.from({ length: n }, (_, r) => r * n + c));
  const peers = cageOf.map((_, i) => {
    const r = Math.floor(i / n);
    const c = i % n;
    return [...lines[r], ...lines[n + c]].filter((j) => j !== i);
  });
  const lay = { p, cageOf, lines, peers };
  layouts.set(p, lay);
  return lay;
}

export const bit = (d: number) => 1 << d;
export const fullMask = (n: number) => ((1 << (n + 1)) - 1) & ~1;
export const has = (m: number, d: number) => (m & bit(d)) !== 0;
export function popcount(m: number): number {
  let k = 0;
  while (m) {
    m &= m - 1;
    k++;
  }
  return k;
}
export function digitsOf(m: number): number[] {
  const out: number[] = [];
  for (let d = 1; d < 16; d++) if (m & bit(d)) out.push(d);
  return out;
}
export const onlyDigit = (m: number) => 31 - Math.clz32(m);

export const cellName = (n: number, i: number) => `${Math.floor(i / n) + 1}행 ${(i % n) + 1}열`;
export const lineName = (n: number, li: number) => (li < n ? `${li + 1}행` : `${li - n + 1}열`);
export const cageText = (c: Cage) => (c.op === '=' ? `${c.target}` : `${c.target}${c.op}`);

/** 상자 숫자들이 단서를 만족하는가 */
export function cageHolds(c: Cage, digits: number[]): boolean {
  switch (c.op) {
    case '=':
      return digits[0] === c.target;
    case '+':
      return digits.reduce((a, b) => a + b, 0) === c.target;
    case '×':
      return digits.reduce((a, b) => a * b, 1) === c.target;
    case '-':
      return Math.abs(digits[0] - digits[1]) === c.target;
    case '÷': {
      const [a, b] = digits[0] > digits[1] ? digits : [digits[1], digits[0]];
      return a === b * c.target;
    }
  }
}

/** 같은 행·열의 같은 숫자, 다 채운 상자의 틀린 계산 */
export function conflictCells(lay: Layout, values: number[]): Set<number> {
  const out = new Set<number>();
  for (const line of lay.lines) {
    for (const i of line) if (values[i] && line.some((j) => j !== i && values[j] === values[i])) out.add(i);
  }
  for (const c of lay.p.cages) {
    const ds = c.cells.map((i) => values[i]);
    if (ds.every(Boolean) && !cageHolds(c, ds)) for (const i of c.cells) out.add(i);
  }
  return out;
}
