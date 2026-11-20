import { ALL, COMBOS, type Layout, type Run, bit, popcount } from './board';

/**
 * 줄 하나를 정확히 따진다: 조합마다 칸에 숫자를 하나씩 맞춰 볼 수 있는지 확인하고,
 * 칸마다 실제로 들어갈 수 있는 숫자만 돌려준다. 맞출 수 없으면 null.
 */
export function runFeasible(run: Run, cand: number[]): number[] | null {
  const n = run.cells.length;
  const cm = run.cells.map((i) => cand[i]);
  // 같은 줄·같은 후보는 몇 번이고 다시 나오므로 결과를 기억해 둔다
  const key = `${run.sum}:${cm.join(',')}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit && hit.slice();
  const res = feasible(n, run.sum, cm);
  if (cache.size > 300000) cache.clear();
  cache.set(key, res);
  return res && res.slice();
}

const cache = new Map<string, number[] | null>();

// 계산용 버퍼: 층(앞에서 몇 칸까지)마다 쓴 숫자 묶음 목록과, 묶음이 이미 들었는지 표시
const LAYER = 1024;
const fwdList = new Int32Array(10 * 512);
const fwdLen = new Int32Array(10);
const bwdList = new Int32Array(10 * 512);
const bwdLen = new Int32Array(10);
const fwdMark = new Uint32Array(10 * LAYER);
const bwdMark = new Uint32Array(10 * LAYER);
let stamp = 0;

function feasible(n: number, sum: number, cm: number[]): number[] | null {
  const out = new Array<number>(n).fill(0);
  let union = 0;
  for (const m of cm) union |= m;
  let fixed = 0;
  for (const m of cm) {
    if (popcount(m) !== 1) continue;
    if (fixed & m) return null;
    fixed |= m;
  }
  const cc = new Array<number>(n);
  let any = false;
  for (const combo of COMBOS[n][sum] ?? []) {
    if ((combo & fixed) !== fixed || (combo & union) !== combo) continue;
    let ok = true;
    for (let k = 0; k < n; k++) {
      cc[k] = cm[k] & combo;
      if (!cc[k]) ok = false;
    }
    if (!ok) continue;
    stamp = (stamp + 1) >>> 0;
    if (stamp === 0) {
      fwdMark.fill(0);
      bwdMark.fill(0);
      stamp = 1;
    }
    // 앞에서부터: k칸까지 쓸 수 있는 숫자 묶음
    fwdList[0] = 0;
    fwdLen[0] = 1;
    for (let k = 0; k < n; k++) {
      let len = 0;
      const base = (k + 1) * 512;
      for (let x = 0; x < fwdLen[k]; x++) {
        const used = fwdList[k * 512 + x];
        for (let rest = cc[k] & ~used; rest; rest &= rest - 1) {
          const m = used | (rest & -rest);
          const slot = (k + 1) * LAYER + m;
          if (fwdMark[slot] === stamp) continue;
          fwdMark[slot] = stamp;
          fwdList[base + len++] = m;
        }
      }
      fwdLen[k + 1] = len;
      if (!len) break;
    }
    if (!fwdLen[n]) continue;
    // 뒤에서부터: k칸부터 끝까지 쓸 수 있는 숫자 묶음
    bwdList[n * 512] = 0;
    bwdLen[n] = 1;
    bwdMark[n * LAYER] = stamp;
    for (let k = n - 1; k >= 0; k--) {
      let len = 0;
      const base = k * 512;
      for (let x = 0; x < bwdLen[k + 1]; x++) {
        const used = bwdList[(k + 1) * 512 + x];
        for (let rest = cc[k] & ~used; rest; rest &= rest - 1) {
          const m = used | (rest & -rest);
          const slot = k * LAYER + m;
          if (bwdMark[slot] === stamp) continue;
          bwdMark[slot] = stamp;
          bwdList[base + len++] = m;
        }
      }
      bwdLen[k] = len;
    }
    any = true;
    for (let k = 0; k < n; k++) {
      for (let x = 0; x < fwdLen[k]; x++) {
        const used = fwdList[k * 512 + x];
        for (let rest = cc[k] & ~used & ~out[k]; rest; rest &= rest - 1) {
          const b = rest & -rest;
          if (bwdMark[(k + 1) * LAYER + (combo ^ used ^ b)] === stamp) out[k] |= b;
        }
      }
    }
  }
  return any ? out : null;
}

/**
 * 후보를 줄 단위로 끝까지 좁힌다. 모순이면 모순이 난 줄 번호를, 아니면 -1을 돌려준다.
 * `start`가 있으면 그 줄들부터 다시 본다.
 */
export function propagate(lay: Layout, cand: number[], start?: number[], level: 1 | 2 | 3 = 3): number {
  const { runs, cellRuns } = lay;
  const rule = level === 3 ? runFeasible : level === 2 ? runWeak : runBasic;
  const queued = new Uint8Array(runs.length);
  const queue: number[] = start ? [...start] : runs.map((_, k) => k);
  for (const k of queue) queued[k] = 1;
  let head = 0;
  while (head < queue.length) {
    const k = queue[head++];
    queued[k] = 0;
    const run = runs[k];
    const allowed = rule(run, cand);
    if (!allowed) return k;
    run.cells.forEach((i, j) => {
      const next = cand[i] & allowed[j];
      if (next === cand[i]) return;
      cand[i] = next;
      for (const other of cellRuns[i]) {
        // 정확히 따지는 3단계는 같은 줄을 다시 볼 필요가 없지만, 1·2단계는 새로 정해진 칸으로 같은 줄이 더 좁혀질 수 있다
        if (other >= 0 && (other !== k || level < 3) && !queued[other]) {
          queued[other] = 1;
          queue.push(other);
        }
      }
    });
  }
  return -1;
}

/** 줄의 정해진 숫자(후보가 하나인 칸) */
function fixedOf(cm: number[]): number | null {
  let fixed = 0;
  for (const m of cm) {
    if (popcount(m) !== 1) continue;
    if (fixed & m) return null;
    fixed |= m;
  }
  return fixed;
}

/**
 * 1단계 규칙(힌트의 '마지막 한 칸'·'가로·세로 조합 겹치기'와 같다):
 * 정해진 숫자를 포함하는 조합의 숫자만 빈칸에 남긴다.
 */
export function runBasic(run: Run, cand: number[]): number[] | null {
  const cm = run.cells.map((i) => cand[i]);
  const fixed = fixedOf(cm);
  if (fixed === null) return null;
  let allowed = 0;
  for (const c of COMBOS[cm.length][run.sum] ?? []) if ((c & fixed) === fixed) allowed |= c;
  if (!allowed) return null;
  return cm.map((m) => (popcount(m) === 1 ? m : allowed & ~fixed));
}

/**
 * 2단계 규칙(힌트의 '꼭 들어갈 숫자'·'조합 좁히기'와 같다):
 * 지금 후보로 만들 수 있는 조합만 남기고, 모든 조합에 든 숫자가 갈 칸이 하나면 그 칸에 정한다.
 */
export function runWeak(run: Run, cand: number[]): number[] | null {
  const cm = run.cells.map((i) => cand[i]);
  const fixed = fixedOf(cm);
  if (fixed === null) return null;
  const open = cm.filter((m) => popcount(m) !== 1);
  let union = 0;
  for (const m of open) union |= m;
  let allowed = 0;
  let must = ~0;
  for (const c of COMBOS[cm.length][run.sum] ?? []) {
    if ((c & fixed) !== fixed) continue;
    const rest = c & ~fixed;
    if ((rest & union) !== rest || open.some((m) => !(m & rest))) continue;
    allowed |= c;
    must &= c;
  }
  if (!allowed) return null;
  const out = cm.map((m) => (popcount(m) === 1 ? m : m & allowed & ~fixed));
  for (let rest = must & ~fixed & ALL; rest; rest &= rest - 1) {
    const b = rest & -rest;
    // 이번에 후보가 하나로 줄어든 칸도 그 숫자를 가질 수 있으니 함께 센다
    const spots = out.flatMap((m, j) => (m & b ? [j] : []));
    if (spots.length === 1) out[spots[0]] = b;
  }
  return out;
}

/** 빈칸 후보로 시작하는 후보 배열 (넣은 숫자는 그 숫자 하나) */
export function startCandidates(lay: Layout, values: number[]): number[] {
  return lay.p.white.map((w, i) => (!w ? 0 : values[i] ? bit(values[i]) : ALL));
}

export interface SolveResult {
  count: number;
  solution: number[] | null;
  /** 두 번째로 찾은 답 (답이 여럿일 때) */
  other: number[] | null;
}

const toValues = (cand: number[]) => cand.map((m) => (m ? 31 - Math.clz32(m) : 0));

/** 답을 limit개까지 센다 */
export function solve(lay: Layout, values?: number[], limit = 2): SolveResult {
  const res: SolveResult = { count: 0, solution: null, other: null };
  const root = startCandidates(lay, values ?? lay.p.white.map(() => 0));
  if (propagate(lay, root) >= 0) return res;
  const rec = (cand: number[]) => {
    if (res.count >= limit) return;
    let best = -1;
    let bestN = 10;
    for (let i = 0; i < cand.length; i++) {
      const n = popcount(cand[i]);
      if (n > 1 && n < bestN) {
        best = i;
        bestN = n;
        if (n === 2) break;
      }
    }
    if (best < 0) {
      res.count++;
      if (res.count === 1) res.solution = toValues(cand);
      else if (res.count === 2) res.other = toValues(cand);
      return;
    }
    for (let rest = cand[best]; rest && res.count < limit; rest &= rest - 1) {
      const next = cand.slice();
      next[best] = rest & -rest;
      if (propagate(lay, next, lay.cellRuns[best].filter((k) => k >= 0)) < 0) rec(next);
    }
  };
  rec(root);
  return res;
}
