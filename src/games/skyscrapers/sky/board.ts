import { type Deduction, type Grid, type Rule, bit, digitsOf, makeUnits } from '../../latin/engine';

/** 스카이스크래퍼: N×N 라틴 방진(빌딩 높이) + 판 바깥 숫자 = 그 방향에서 보이는 빌딩 수 (0은 단서 없음) */
export interface Puzzle {
  n: number;
  top: number[];
  bottom: number[];
  left: number[];
  right: number[];
  givens: number[];
}

/** 단서가 붙은 줄: 단서 쪽에서 본 칸 순서와 양쪽 단서 */
export interface SkyLine {
  cells: number[];
  front: number;
  back: number;
  /** 0..n-1 행, n..2n-1 열 (공용 엔진 묶음 번호와 같다) */
  unit: number;
}

/** 줄을 앞에서 볼 때 보이는 빌딩 수 */
export function visible(heights: number[]): number {
  let max = 0;
  let k = 0;
  for (const h of heights) {
    if (h > max) {
      max = h;
      k++;
    }
  }
  return k;
}

export function linesOf(p: Puzzle): SkyLine[] {
  const { n } = p;
  const out: SkyLine[] = [];
  for (let r = 0; r < n; r++) out.push({ cells: Array.from({ length: n }, (_, c) => r * n + c), front: p.left[r], back: p.right[r], unit: r });
  for (let c = 0; c < n; c++) out.push({ cells: Array.from({ length: n }, (_, r) => r * n + c), front: p.top[c], back: p.bottom[c], unit: n + c });
  return out.filter((l) => l.front || l.back);
}

/** 모든 순열 (n이 작아 미리 만들어 둔다) */
const permCache = new Map<number, number[][]>();
function perms(n: number): number[][] {
  let p = permCache.get(n);
  if (p) return p;
  p = [];
  const used = new Array<boolean>(n + 1).fill(false);
  const cur: number[] = [];
  const rec = () => {
    if (cur.length === n) {
      p!.push(cur.slice());
      return;
    }
    for (let d = 1; d <= n; d++) {
      if (used[d]) continue;
      used[d] = true;
      cur.push(d);
      rec();
      cur.pop();
      used[d] = false;
    }
  };
  rec();
  permCache.set(n, p);
  return p;
}

const fits = (l: SkyLine, perm: number[]) => (!l.front || visible(perm) === l.front) && (!l.back || visible([...perm].reverse()) === l.back);

/** 줄에 놓을 수 있는 배치들로 칸마다 가능한 높이. 배치가 없으면 null */
export function lineOptions(n: number, l: SkyLine, cand: number[]): number[] | null {
  // 같은 단서·같은 후보는 몇 번이고 다시 나오므로 결과를 기억해 둔다
  const cm = l.cells.map((i) => cand[i]);
  const key = `${n}:${l.front},${l.back}:${cm.join(',')}`;
  const hit = lineCache.get(key);
  if (hit !== undefined) return hit;
  const allowed = l.cells.map(() => 0);
  let any = false;
  for (const perm of perms(n)) {
    let ok = true;
    for (let x = 0; x < n; x++) {
      if (!(cm[x] & (1 << perm[x]))) {
        ok = false;
        break;
      }
    }
    if (!ok || !fits(l, perm)) continue;
    any = true;
    perm.forEach((h, x) => (allowed[x] |= bit(h)));
  }
  const res = any ? allowed : null;
  if (lineCache.size > 200000) lineCache.clear();
  lineCache.set(key, res);
  return res;
}

const lineCache = new Map<string, number[] | null>();

/**
 * 단서 거리 규칙(1단계): 단서가 c인 쪽에서 k번째(0부터) 칸은 n - c + 1 + k보다 높을 수 없다.
 * (단서 1이면 첫 칸이 가장 높은 빌딩, 단서 n이면 1부터 차례로 높아진다)
 */
function edgeRule(lines: SkyLine[]): Rule {
  return {
    tier: 1,
    find(g, values, cand) {
      const { n } = g;
      for (const l of lines) {
        for (const [clue, order] of [
          [l.front, l.cells],
          [l.back, [...l.cells].reverse()],
        ] as [number, number[]][]) {
          if (!clue) continue;
          const elim: { cell: number; digit: number }[] = [];
          order.forEach((i, k) => {
            if (values[i]) return;
            const cap = n - clue + 1 + k;
            for (const d of digitsOf(cand[i])) if (d > cap) elim.push({ cell: i, digit: d });
            // 단서 1이면 첫 칸은 n, 단서 n이면 k번째 칸은 k+1
            if (clue === n) for (const d of digitsOf(cand[i])) if (d !== k + 1 && !elim.some((e) => e.cell === i && e.digit === d)) elim.push({ cell: i, digit: d });
          });
          if (clue === 1 && !values[order[0]]) for (const d of digitsOf(cand[order[0]])) if (d !== n && !elim.some((e) => e.cell === order[0] && e.digit === d)) elim.push({ cell: order[0], digit: d });
          if (elim.length) return { kind: 'sky-edge', tier: 1, eliminate: elim, line: l.unit, digit: clue, cells: order } as Deduction;
        }
      }
      return null;
    },
  };
}

/** 줄 배치 규칙(2단계): 양쪽 단서를 모두 만족하는 배치만 남긴다 */
function lineRule(lines: SkyLine[]): Rule {
  return {
    tier: 2,
    find(g, values, cand) {
      for (const l of lines) {
        if (l.cells.every((i) => values[i])) continue;
        const allowed = lineOptions(g.n, l, cand);
        if (!allowed) continue;
        const elim = l.cells.flatMap((i, x) => (values[i] ? [] : digitsOf(cand[i] & ~allowed[x]).map((d) => ({ cell: i, digit: d }))));
        if (elim.length) return { kind: 'sky-line', tier: 2, eliminate: elim, line: l.unit, cells: l.cells } as Deduction;
      }
      return null;
    },
    broken(g, _values, cand) {
      return lines.some((l) => !lineOptions(g.n, l, cand));
    },
  };
}

const grids = new WeakMap<Puzzle, Grid & { sky: SkyLine[] }>();

export function gridOf(p: Puzzle): Grid & { sky: SkyLine[]; puzzle: Puzzle } {
  const cached = grids.get(p);
  if (cached) return cached as Grid & { sky: SkyLine[]; puzzle: Puzzle };
  const { n } = p;
  const { units, unitsOf, peers } = makeUnits(n);
  const sky = linesOf(p);
  const g = { n, units, unitsOf, peers, cages: [], cageOf: new Array(n * n).fill(-1), cageAllDistinct: false, givens: p.givens, rules: [edgeRule(sky), lineRule(sky)], sky, puzzle: p };
  grids.set(p, g);
  return g;
}

/** 다 채운 줄 중 단서와 보이는 수가 다른 줄의 칸 */
export function skyConflicts(lines: SkyLine[], values: number[]): number[] {
  return lines.filter((l) => l.cells.every((i) => values[i]) && !fits(l, l.cells.map((i) => values[i]))).flatMap((l) => l.cells);
}

/** 단서 상태: 줄을 다 채웠을 때 맞으면 'done', 틀리면 'over' */
export function clueState(cells: number[], values: number[], clue: number): '' | 'done' | 'over' {
  if (!clue || !cells.every((i) => values[i])) return '';
  return visible(cells.map((i) => values[i])) === clue ? 'done' : 'over';
}
