/**
 * 숫자 견본 맞추기: 기기 글꼴로 0~9를 그려 둔 견본과 잘라낸 글자를 비교해 가장 닮은 숫자를 고른다.
 * 단서는 0~9뿐이라 글자 인식 엔진보다 빠르고 정확하며, 내려받을 데이터가 없다.
 */
import type { Gray, Rect } from './image';

const N = 20;

/** 글자 영역을 N×N 상자 가운데에 비율을 지켜 넣은 잉크 농도(0~1) 벡터 */
export function features(img: Gray, r: Rect): Float32Array {
  const bw = r.x1 - r.x0 + 1;
  const bh = r.y1 - r.y0 + 1;
  let lo = 255;
  let hi = 0;
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      const v = img.data[y * img.width + x];
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  const range = Math.max(1, hi - lo);
  const scale = (N - 2) / Math.max(bw, bh);
  const gw = bw * scale;
  const gh = bh * scale;
  const ox = (N - gw) / 2;
  const oy = (N - gh) / 2;
  const out = new Float32Array(N * N);
  const cnt = new Float32Array(N * N);
  // 원본 픽셀을 상자 칸에 나눠 담아 평균한다 (작은 글자도 부드럽게)
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const ink = (hi - img.data[(r.y0 + y) * img.width + r.x0 + x]) / range;
      const tx = Math.min(N - 1, Math.floor(ox + (x + 0.5) * scale));
      const ty = Math.min(N - 1, Math.floor(oy + (y + 0.5) * scale));
      out[ty * N + tx] += ink;
      cnt[ty * N + tx]++;
    }
  }
  for (let i = 0; i < out.length; i++) if (cnt[i]) out[i] /= cnt[i];
  // 작게 찍힌 글자는 상자 칸이 비므로 이웃 평균으로 채우고 살짝 번지게 한다
  const blurred = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let s = 0;
      let wsum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
          const wgt = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
          if (!cnt[yy * N + xx] && !(dx === 0 && dy === 0)) continue;
          s += out[yy * N + xx] * wgt;
          wsum += wgt;
        }
      }
      blurred[y * N + x] = wsum ? s / wsum : 0;
    }
  }
  // 정규화: 평균 0, 길이 1 (상관계수로 비교)
  let mean = 0;
  for (const v of blurred) mean += v;
  mean /= blurred.length;
  let norm = 0;
  for (let i = 0; i < blurred.length; i++) {
    blurred[i] -= mean;
    norm += blurred[i] * blurred[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < blurred.length; i++) blurred[i] /= norm;
  return blurred;
}

const FONTS = [
  'sans-serif',
  'serif',
  'monospace',
  'Arial',
  'Helvetica',
  'Roboto',
  'Segoe UI',
  'Verdana',
  'Tahoma',
  'Calibri',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Consolas',
  'Malgun Gothic',
  'Apple SD Gothic Neo',
  'Noto Sans KR',
  'Noto Sans',
];

interface Template {
  digit: number;
  vec: Float32Array;
  aspect: number;
}

let cache: Template[] | null = null;

/** 기기에 있는 글꼴로 0~9 견본을 만든다 (없는 글꼴은 기본 글꼴로 대체되어 겹쳐도 무방) */
function templates(): Template[] {
  if (cache) return cache;
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const out: Template[] = [];
  for (const font of FONTS) {
    for (const weight of ['400', '700']) {
      for (let d = 0; d <= 9; d++) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#000';
        ctx.font = `${weight} 64px "${font}"`;
        if (font === 'sans-serif' || font === 'serif' || font === 'monospace') ctx.font = `${weight} 64px ${font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(d), size / 2, size / 2);
        const data = ctx.getImageData(0, 0, size, size).data;
        const g: Gray = { width: size, height: size, data: new Uint8ClampedArray(size * size) };
        let x0 = size, y0 = size, x1 = -1, y1 = -1;
        for (let i = 0; i < size * size; i++) {
          const v = data[i * 4];
          g.data[i] = v;
          if (v < 128) {
            const x = i % size;
            const y = (i - x) / size;
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
          }
        }
        if (x1 < 0) continue;
        const r = { x0, y0, x1, y1 };
        out.push({ digit: d, vec: features(g, r), aspect: (x1 - x0 + 1) / (y1 - y0 + 1) });
      }
    }
  }
  cache = out;
  return out;
}

export interface DigitGuess {
  digit: number;
  /** 가장 닮은 견본과의 상관 (1에 가까울수록 닮음) */
  score: number;
  /** 다른 숫자 중 가장 닮은 것과의 차이 */
  margin: number;
}

/** 잘라낸 글자 하나를 0~9 중 하나로 맞춘다 */
export function classifyDigit(img: Gray, r: Rect): DigitGuess {
  const vec = features(img, r);
  const aspect = (r.x1 - r.x0 + 1) / (r.y1 - r.y0 + 1);
  const best = new Array<number>(10).fill(-Infinity);
  for (const t of templates()) {
    let s = 0;
    for (let i = 0; i < vec.length; i++) s += vec[i] * t.vec[i];
    // 폭/높이 비율이 크게 다르면 깎는다 (1과 7, 1과 4 구분에 도움)
    s -= Math.abs(Math.log(aspect / t.aspect)) * 0.15;
    if (s > best[t.digit]) best[t.digit] = s;
  }
  const order = best.map((s, d) => ({ s, d })).sort((a, b) => b.s - a.s);
  return { digit: order[0].d, score: order[0].s, margin: order[0].s - order[1].s };
}
