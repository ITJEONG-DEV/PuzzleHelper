/**
 * 사진에서 노노그램 판을 펼치고, 칸 상태(칠함·X)와 단서 숫자 위치를 찾는 순수 함수 모음.
 * 브라우저 API에 의존하지 않아 node 테스트에서도 돈다.
 */
import { type Cell, EMPTY, FILLED, UNKNOWN } from '../nonogram/line';

/** 회색조 이미지. 0 = 검정, 255 = 흰색 */
export interface Gray {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Point {
  x: number;
  y: number;
}

/** 왼쪽 위, 오른쪽 위, 오른쪽 아래, 왼쪽 아래 */
export type Quad = [Point, Point, Point, Point];

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function makeGray(width: number, height: number, fill = 255): Gray {
  return { width, height, data: new Uint8ClampedArray(width * height).fill(fill) };
}

export function toGray(img: { width: number; height: number; data: Uint8ClampedArray }): Gray {
  const out = makeGray(img.width, img.height);
  for (let i = 0, j = 0; i < out.data.length; i++, j += 4) {
    out.data[i] = (img.data[j] * 299 + img.data[j + 1] * 587 + img.data[j + 2] * 114) / 1000;
  }
  return out;
}

/** 주변 평균보다 c만큼 어두운 픽셀을 잉크(1)로 본다 */
export function adaptiveThreshold(g: Gray, radius: number, c: number): Uint8Array {
  const { width: w, height: h, data } = g;
  const W = w + 1;
  const sum = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += data[y * w + x];
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + row;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w, x + radius + 1);
      const s = sum[y1 * W + x1] - sum[y0 * W + x1] - sum[y1 * W + x0] + sum[y0 * W + x0];
      if (data[y * w + x] < s / ((x1 - x0) * (y1 - y0)) - c) out[y * w + x] = 1;
    }
  }
  return out;
}

export interface Component extends Rect {
  pixels: number[];
}

/** 잉크 픽셀의 8방향 연결 덩어리 */
export function components(bin: Uint8Array, w: number): Component[] {
  const h = bin.length / w;
  const seen = new Uint8Array(bin.length);
  const out: Component[] = [];
  const stack: number[] = [];
  for (let start = 0; start < bin.length; start++) {
    if (!bin[start] || seen[start]) continue;
    const sx = start % w;
    const comp: Component = { pixels: [], x0: sx, y0: (start - sx) / w, x1: sx, y1: (start - sx) / w };
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      const px = p % w;
      const py = (p - px) / w;
      comp.pixels.push(p);
      if (px < comp.x0) comp.x0 = px;
      if (px > comp.x1) comp.x1 = px;
      if (py < comp.y0) comp.y0 = py;
      if (py > comp.y1) comp.y1 = py;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx;
          if (nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (bin[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    out.push(comp);
  }
  return out;
}

const rw = (r: Rect) => r.x1 - r.x0 + 1;
const rh = (r: Rect) => r.y1 - r.y0 + 1;

/**
 * 판 모서리 추정. 격자선은 하나로 이어진 큰 덩어리다.
 * 종이 가장자리처럼 격자가 아닌 큰 덩어리도 있으므로, 큰 덩어리 몇 개를 펼쳐 보고
 * 격자선이 고른 간격으로 판 가장자리에 맞는 것을 고른다. 단서 영역까지 잡히면 화면에서 고치게 한다.
 */
export function findBoardQuad(g: Gray): Quad {
  const { width: w, height: h } = g;
  const bin = adaptiveThreshold(g, Math.max(7, Math.round(Math.min(w, h) / 50)), 8);
  const area = (c: Component) => rw(c) * rh(c);
  const candidates = components(bin, w)
    .filter((c) => c.pixels.length >= Math.min(w, h) && area(c) >= 0.03 * w * h)
    .sort((a, b) => area(b) - area(a))
    .slice(0, 6);
  let best: Quad | null = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const quad = extremeCorners(c, w);
    // 격자선은 진한 잉크, 종이 테두리 덩어리는 배경색이다. 진할수록 점수를 더 준다
    let sum = 0;
    for (const p of c.pixels) sum += g.data[p];
    const dark = 1 - sum / c.pixels.length / 255;
    const score = gridFitScore(g, quad) * dark * dark;
    if (score > bestScore) {
      best = quad;
      bestScore = score;
    }
  }
  if (best) return best;
  return [
    { x: w * 0.25, y: h * 0.25 },
    { x: w * 0.95, y: h * 0.25 },
    { x: w * 0.95, y: h * 0.95 },
    { x: w * 0.25, y: h * 0.95 },
  ];
}

/** quad를 펼쳤을 때 추정한 칸 수의 격자선 자리(가장자리 포함)에 잉크가 몰려 있는 정도 */
export function gridFitScore(g: Gray, quad: Quad): number {
  const size = 400;
  const board = sampleRegion(g, gridToImage(quad, 1, 1), { x0: 0, y0: 0, x1: 1, y1: 1 }, size);
  const bin = adaptiveThreshold(board, 4, 10);
  let score = 0;
  for (const axis of ['x', 'y'] as const) {
    const n = estimateCount(board, axis);
    const prof = new Float64Array(size);
    let total = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!bin[y * size + x]) continue;
        prof[axis === 'x' ? x : y]++;
        total++;
      }
    }
    const mean = total / (size * size);
    let s = 0;
    for (let k = 0; k <= n; k++) {
      let m = 0;
      for (let d = -3; d <= 3; d++) {
        const i = Math.min(size - 1, Math.max(0, Math.round((k * size) / n) + d));
        m = Math.max(m, prof[i] / size);
      }
      s += m;
    }
    score += s / (n + 1) - mean;
  }
  return score;
}

function extremeCorners(best: Component, w: number): Quad {
  let tl = 0, tr = 0, br = 0, bl = 0;
  let sMin = Infinity, sMax = -Infinity, dMin = Infinity, dMax = -Infinity;
  for (const p of best.pixels) {
    const x = p % w;
    const y = (p - x) / w;
    if (x + y < sMin) { sMin = x + y; tl = p; }
    if (x + y > sMax) { sMax = x + y; br = p; }
    if (x - y > dMax) { dMax = x - y; tr = p; }
    if (x - y < dMin) { dMin = x - y; bl = p; }
  }
  const pt = (p: number): Point => ({ x: p % w, y: Math.floor(p / w) });
  return [pt(tl), pt(tr), pt(br), pt(bl)];
}

export function homography(src: Point[], dst: Point[]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let col = 0; col < 8; col++) {
    let piv = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let k = col; k < 9; k++) A[r][k] -= f * A[col][k];
    }
  }
  return [...A.map((row, i) => row[8] / row[i]), 1];
}

export function applyH(H: number[], p: Point): Point {
  const z = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / z, y: (H[3] * p.x + H[4] * p.y + H[5]) / z };
}

/** 칸 좌표(열 0..cols, 행 0..rows)를 사진 좌표로 보내는 변환 */
export function gridToImage(quad: Quad, cols: number, rows: number): number[] {
  return homography(
    [
      { x: 0, y: 0 },
      { x: cols, y: 0 },
      { x: cols, y: rows },
      { x: 0, y: rows },
    ],
    quad,
  );
}

/** 칸 좌표의 사각형 영역을 칸당 ppc 픽셀로 펼친다. 사진 밖은 흰색 */
export function sampleRegion(g: Gray, H: number[], r: Rect, ppc: number): Gray {
  const ow = Math.round((r.x1 - r.x0) * ppc);
  const oh = Math.round((r.y1 - r.y0) * ppc);
  const out = makeGray(ow, oh);
  const { width: w, height: h, data } = g;
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const s = applyH(H, { x: r.x0 + (x + 0.5) / ppc, y: r.y0 + (y + 0.5) / ppc });
      const sx = s.x - 0.5;
      const sy = s.y - 0.5;
      const ix = Math.floor(sx);
      const iy = Math.floor(sy);
      if (ix < 0 || iy < 0 || ix >= w - 1 || iy >= h - 1) continue;
      const fx = sx - ix;
      const fy = sy - iy;
      const i = iy * w + ix;
      out.data[y * ow + x] =
        data[i] * (1 - fx) * (1 - fy) + data[i + 1] * fx * (1 - fy) + data[i + w] * (1 - fx) * fy + data[i + w + 1] * fx * fy;
    }
  }
  return out;
}

/** 칸 좌표 영역이 사진 안에 들어가는가 */
export function regionInside(g: Gray, H: number[], r: Rect): boolean {
  return [
    { x: r.x0, y: r.y0 },
    { x: r.x1, y: r.y0 },
    { x: r.x1, y: r.y1 },
    { x: r.x0, y: r.y1 },
  ].every((p) => {
    const q = applyH(H, p);
    return q.x >= 0 && q.y >= 0 && q.x <= g.width && q.y <= g.height;
  });
}

// ---------- 칸 수 추정 ----------

/** 펼친 판에서 격자선 간격을 자기상관으로 찾아 칸 수를 추정한다 */
export function estimateCount(board: Gray, axis: 'x' | 'y'): number {
  const n = axis === 'x' ? board.width : board.height;
  const m = axis === 'x' ? board.height : board.width;
  const bin = adaptiveThreshold(board, 4, 10);
  const prof = new Float64Array(n);
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) if (bin[y * board.width + x]) prof[axis === 'x' ? x : y]++;
  }
  for (let i = 0; i < n; i++) prof[i] /= m;
  const mean = prof.reduce((a, b) => a + b, 0) / n;
  const minL = Math.max(3, Math.floor(n / 45));
  const maxL = Math.floor(n / 3);
  const ac = new Float64Array(maxL + 2);
  for (let L = minL; L <= maxL + 1; L++) {
    let s = 0;
    for (let i = 0; i + L < n; i++) s += (prof[i] - mean) * (prof[i + L] - mean);
    ac[L] = s / (n - L);
  }
  let best = 0;
  for (let L = minL; L <= maxL; L++) best = Math.max(best, ac[L]);
  // 배수 간격도 높게 나오므로, 충분히 높은 첫 봉우리를 칸 간격으로 본다
  for (let L = minL + 1; L <= maxL; L++) {
    if (ac[L] >= ac[L - 1] && ac[L] >= ac[L + 1] && ac[L] >= 0.6 * best) return Math.max(1, Math.round(n / L));
  }
  return 10;
}

// ---------- 칸 상태 ----------

export interface StateResult {
  states: Cell[];
  /** 칠함·X·빈칸 어느 쪽인지 애매한 칸 */
  uncertain: number[];
}

function percentile(values: number[], p: number): number {
  const s = values.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
}

/**
 * 펼친 판(칸당 ppc 픽셀)에서 칸마다 칠함·X를 판단한다.
 * - 칸 안쪽 평균이 종이와 잉크의 중간보다 어두우면 칠함
 * - 획이 대각선 띠에 몰려 있으면 X (X, /, \ 모두)
 * - 가운데 작은 점이면 X로 본다 (점으로 빈칸을 표시하는 앱)
 */
export function readCellStates(board: Gray, cols: number, rows: number, ppc: number): StateResult {
  const { width: w, data } = board;
  const margin = Math.round(ppc * 0.18);
  const n = ppc - margin * 2;
  const means: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let s = 0;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) s += data[(r * ppc + margin + y) * w + c * ppc + margin + x];
      means.push(s / (n * n));
    }
  }
  const all = Array.from(data);
  const paper = Math.max(percentile(means, 0.9), percentile(all, 0.9));
  const ink = percentile(all, 0.02);
  const span = Math.max(1, paper - ink);
  const fillT = paper - span * 0.5;
  const strokeT = paper - span * 0.3;

  const states: Cell[] = [];
  const uncertain: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (means[i] < fillT) {
        states.push(FILLED);
        if (means[i] > paper - span * 0.6) uncertain.push(i);
        continue;
      }
      let total = 0, diagA = 0, diagB = 0, sx = 0, sy = 0;
      let minX = n, minY = n, maxX = 0, maxY = 0;
      const band = n * 0.17;
      const coverA = new Uint8Array(n);
      const coverB = new Uint8Array(n);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if (data[(r * ppc + margin + y) * w + c * ppc + margin + x] >= strokeT) continue;
          total++;
          sx += x;
          sy += y;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          if (Math.abs(x - y) < band) {
            diagA++;
            coverA[Math.round((x + y) / 2)] = 1;
          }
          if (Math.abs(x + y - (n - 1)) < band) {
            diagB++;
            coverB[Math.round((x - y + n - 1) / 2)] = 1;
          }
        }
      }
      const ratio = total / (n * n);
      if (ratio < 0.02) {
        states.push(UNKNOWN);
        continue;
      }
      const lenA = coverA.reduce((a, b) => a + b, 0) / n;
      const lenB = coverB.reduce((a, b) => a + b, 0) / n;
      const onDiag = Math.max(diagA, diagB) / total;
      const bothDiag = (diagA + diagB) / total;
      const slash = (onDiag > 0.7 && Math.max(lenA, lenB) > 0.55) || (bothDiag > 0.8 && lenA > 0.45 && lenB > 0.45);
      if (slash && ratio < 0.6) {
        states.push(EMPTY);
        continue;
      }
      const cx = sx / total / n;
      const cy = sy / total / n;
      const small = maxX - minX < n * 0.45 && maxY - minY < n * 0.45;
      if (small && Math.abs(cx - 0.5) < 0.2 && Math.abs(cy - 0.5) < 0.2) {
        states.push(EMPTY);
        continue;
      }
      states.push(UNKNOWN);
      uncertain.push(i);
    }
  }
  return { states, uncertain };
}

// ---------- 단서 숫자 위치 ----------

/**
 * 칸 하나보다 긴 가로·세로 잉크 줄(격자선·판 테두리)을 지운다.
 * 숫자가 테두리선에 붙어 한 덩어리가 되는 것을 막고, 단서 영역에 그어진 칸 선도 없앤다.
 */
export function removeLongLines(bin: Uint8Array, w: number, minRun: number) {
  const h = bin.length / w;
  const kill = new Uint8Array(bin.length);
  for (let y = 0; y < h; y++) {
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const on = x < w && bin[y * w + x];
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        if (x - start >= minRun) for (let k = start; k < x; k++) kill[y * w + k] = 1;
        start = -1;
      }
    }
  }
  for (let x = 0; x < w; x++) {
    let start = -1;
    for (let y = 0; y <= h; y++) {
      const on = y < h && bin[y * w + x];
      if (on && start < 0) start = y;
      if (!on && start >= 0) {
        if (y - start >= minRun) for (let k = start; k < y; k++) kill[k * w + x] = 1;
        start = -1;
      }
    }
  }
  for (let i = 0; i < bin.length; i++) if (kill[i]) bin[i] = 0;
}

/** 글자 하나. one은 모양만으로 1이라고 판단한 경우 */
export interface DigitRect extends Rect {
  one: boolean;
}

/** 숫자 하나: 전체 영역과 글자(자리)별 영역 */
export interface ClueNumber extends Rect {
  digits: DigitRect[];
}

/**
 * 폭이 높이의 30%도 안 되는 글자는 1이다 (단서 숫자는 0~9뿐).
 * 밑받침·깃발이 있는 1은 글자 인식기에 맡긴다.
 */
export const looksLikeOne = (c: Rect) => rw(c) / rh(c) < 0.3;

/**
 * 흐린 사진에서 가는 획이 끊겨 한 글자가 여러 조각으로 나뉜 것을 다시 합친다.
 * 가로로 많이 겹치고 위아래 틈이 아주 좁은 조각끼리만 합친다 (위아래로 쌓인 다른 숫자는 틈이 넓다).
 */
export function mergeBroken(list: Component[], ppc: number): Component[] {
  const out = list.slice();
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < out.length && !changed; i++) {
      for (let j = i + 1; j < out.length && !changed; j++) {
        const a = out[i];
        const b = out[j];
        const xo = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1;
        const narrow = Math.min(rw(a), rw(b));
        const ygap = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1) - 1;
        const unionH = Math.max(a.y1, b.y1) - Math.min(a.y0, b.y0) + 1;
        if (xo >= narrow * 0.5 && ygap <= ppc * 0.12 && unionH <= ppc * 1.0) {
          out[i] = {
            pixels: a.pixels.concat(b.pixels),
            x0: Math.min(a.x0, b.x0),
            y0: Math.min(a.y0, b.y0),
            x1: Math.max(a.x1, b.x1),
            y1: Math.max(a.y1, b.y1),
          };
          out.splice(j, 1);
          changed = true;
        }
      }
    }
  }
  return out;
}

/** 두 글자가 붙어 폭이 넓은 덩어리는 잉크가 가장 적은 세로 줄에서 나눈다 */
export function splitWide(c: Component, w: number): Component[] {
  const bw = rw(c);
  const bh = rh(c);
  if (bw / bh < 0.95) return [c];
  const hist = new Array<number>(bw).fill(0);
  for (const p of c.pixels) hist[(p % w) - c.x0]++;
  let cut = -1;
  let min = Infinity;
  for (let x = Math.round(bw * 0.3); x <= Math.round(bw * 0.7); x++) {
    if (hist[x] < min) {
      min = hist[x];
      cut = x;
    }
  }
  const parts: Component[] = [];
  for (const side of [0, 1]) {
    const px = c.pixels.filter((p) => ((p % w) - c.x0 < cut) === (side === 0));
    if (!px.length) continue;
    const part: Component = { pixels: px, x0: Infinity, y0: Infinity, x1: -1, y1: -1 };
    for (const p of px) {
      const x = p % w;
      const y = (p - x) / w;
      part.x0 = Math.min(part.x0, x);
      part.x1 = Math.max(part.x1, x);
      part.y0 = Math.min(part.y0, y);
      part.y1 = Math.max(part.y1, y);
    }
    parts.push(part);
  }
  return parts.length === 2 ? parts : [c];
}

/** 단서 영역에서 줄마다 숫자 하나하나의 영역(펼친 영역의 픽셀 좌표)을 찾는다 */
export function findClueNumbers(region: Gray, kind: 'col' | 'row', count: number, ppc: number): ClueNumber[][] {
  const bin = adaptiveThreshold(region, Math.max(4, Math.round(ppc / 3)), 10);
  removeLongLines(bin, region.width, Math.round(ppc * 1.2));
  const glyphs = mergeBroken(components(bin, region.width), ppc).filter((c) => {
    const h = rh(c);
    const w = rw(c);
    // 판 쪽 가장자리에 닿은 작은 조각은 격자선이 남은 것이다 (흐린 사진에서 번진 숫자는 키가 커서 남긴다)
    const near = Math.round(ppc * 0.15);
    const touchesBoard = kind === 'col' ? c.y1 >= region.height - near : c.x1 >= region.width - near;
    const along = kind === 'col' ? h : w;
    if (touchesBoard && along < ppc * 0.12) return false;
    return h >= ppc * 0.22 && h <= ppc * 1.15 && w <= ppc * 1.0 && c.pixels.length >= ppc * ppc * 0.01;
  }).flatMap((c) => splitWide(c, region.width));
  const lines: Component[][] = Array.from({ length: count }, () => []);
  for (const g of glyphs) {
    const k = Math.floor(kind === 'col' ? (g.x0 + g.x1) / 2 / ppc : (g.y0 + g.y1) / 2 / ppc);
    if (k >= 0 && k < count) lines[k].push(g);
  }
  return lines.map((gs) => {
    // 같은 높이에 나란히 붙은 글자는 한 숫자(두 자리 이상)로 묶는다
    const sorted = gs.slice().sort((a, b) => (kind === 'col' ? a.y0 - b.y0 || a.x0 - b.x0 : a.x0 - b.x0));
    const numbers: ClueNumber[] = [];
    for (const g of sorted) {
      const digit: DigitRect = { x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1, one: looksLikeOne(g) };
      const last = numbers[numbers.length - 1];
      if (last) {
        const overlap = Math.min(last.y1, g.y1) - Math.max(last.y0, g.y0);
        const gap = g.x0 - last.x1;
        const hgt = Math.min(rh(last), rh(g));
        const tall = Math.max(rh(last), rh(g));
        if (overlap > hgt * 0.5 && gap < tall * 0.45 && gap > -hgt * 0.3) {
          last.x0 = Math.min(last.x0, g.x0);
          last.x1 = Math.max(last.x1, g.x1);
          last.y0 = Math.min(last.y0, g.y0);
          last.y1 = Math.max(last.y1, g.y1);
          last.digits.push(digit);
          continue;
        }
      }
      numbers.push({ ...digit, digits: [digit] });
    }
    // 판에서 가까운 쪽부터 이어진 숫자만 쓴다 (판 위 제목 같은 다른 글씨 제외)
    const ordered = kind === 'col' ? numbers.sort((a, b) => a.y0 - b.y0) : numbers.sort((a, b) => a.x0 - b.x0);
    const edge = kind === 'col' ? region.height : region.width;
    const keep: ClueNumber[] = [];
    let prev = edge;
    for (let i = ordered.length - 1; i >= 0; i--) {
      const r = ordered[i];
      const far = kind === 'col' ? prev - r.y1 : prev - r.x1;
      if (far > ppc * 1.8) break;
      keep.unshift(r);
      prev = kind === 'col' ? r.y0 : r.x0;
    }
    return keep;
  });
}

