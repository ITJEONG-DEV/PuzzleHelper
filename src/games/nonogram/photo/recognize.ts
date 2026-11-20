import type { Cell } from '../nonogram/line';
import type { LineRef } from '../nonogram/puzzle';
import { classifyDigit } from './digits';
import { type Gray, type Quad, type Rect, estimateCount, findBoardQuad, findClueNumbers, gridToImage, readCellStates, regionInside, sampleRegion, toGray } from './image';

const MAX_SIDE = 1400;
const PPC = 40;
/** 견본과의 상관이 이보다 낮거나, 두 번째 후보와 차이가 이보다 작으면 불확실 */
const SCORE_MIN = 0.7;
const MARGIN_MIN = 0.06;

export async function loadImage(file: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return ctx.getImageData(0, 0, w, h);
}

export const detectQuad = (img: ImageData): Quad => findBoardQuad(toGray(img));

/** 판 안쪽 격자선 간격으로 가로·세로 칸 수를 추정한다 */
export function detectSize(img: ImageData, quad: Quad): { cols: number; rows: number } {
  const board = sampleRegion(toGray(img), gridToImage(quad, 1, 1), { x0: 0, y0: 0, x1: 1, y1: 1 }, 600);
  return { cols: estimateCount(board, 'x'), rows: estimateCount(board, 'y') };
}

export function readState(img: ImageData, quad: Quad, cols: number, rows: number) {
  const H = gridToImage(quad, cols, rows);
  const board = sampleRegion(toGray(img), H, { x0: 0, y0: 0, x1: cols, y1: rows }, PPC);
  return readCellStates(board, cols, rows, PPC);
}

export interface ClueResult {
  rows: number[][];
  cols: number[][];
  /** 숫자 읽기가 불확실한 줄 */
  uncertain: LineRef[];
}

/** 판 바깥(위·왼쪽)으로 사진 안에 들어가는 가장 넓은 단서 영역 */
function clueRegion(g: Gray, H: number[], kind: 'col' | 'row', cols: number, rows: number): Rect | null {
  const cap = kind === 'col' ? Math.ceil(rows / 2) + 2 : Math.ceil(cols / 2) + 3;
  // 판 테두리선 부스러기가 들어오지 않게 테두리에서 칸의 10%만큼 떨어진 곳까지만 자른다
  const edge = -0.1;
  for (let k = cap; k >= 1; k -= 0.5) {
    const r = kind === 'col' ? { x0: 0, y0: -k, x1: cols, y1: edge } : { x0: -k, y0: 0, x1: edge, y1: rows };
    if (regionInside(g, H, r)) return r;
  }
  return null;
}

/**
 * 위쪽(열 단서)·왼쪽(행 단서) 영역에서 숫자를 찾아 읽는다.
 * 글자 하나하나를 0~9 견본과 비교해 맞춘다.
 */
export async function readClues(
  img: ImageData,
  quad: Quad,
  cols: number,
  rows: number,
  onProgress?: (done: number, total: number) => void,
): Promise<ClueResult> {
  const g = toGray(img);
  const H = gridToImage(quad, cols, rows);
  const result: ClueResult = { rows: Array.from({ length: rows }, () => []), cols: Array.from({ length: cols }, () => []), uncertain: [] };
  const total = rows + cols;
  let done = 0;
  onProgress?.(0, total);

  for (const kind of ['row', 'col'] as const) {
    const count = kind === 'row' ? rows : cols;
    const list = kind === 'row' ? result.rows : result.cols;
    const r = clueRegion(g, H, kind, cols, rows);
    if (!r) {
      for (let index = 0; index < count; index++) result.uncertain.push({ kind, index });
      continue;
    }
    const region = sampleRegion(g, H, r, PPC);
    const lines = findClueNumbers(region, kind, count, PPC);
    for (let index = 0; index < count; index++) {
      let unsure = false;
      const clue: number[] = [];
      for (const num of lines[index]) {
        let text = '';
        for (const d of num.digits) {
          if (d.one) {
            text += '1';
            continue;
          }
          const guess = classifyDigit(region, d);
          if (guess.score < SCORE_MIN || guess.margin < MARGIN_MIN) unsure = true;
          text += String(guess.digit);
        }
        const n = Number(text);
        if (n > 0) clue.push(n);
      }
      list[index] = clue;
      if (unsure) result.uncertain.push({ kind, index });
      onProgress?.(++done, total);
      // 화면이 멈추지 않도록 가끔 쉬어 간다
      if (done % 8 === 0) await new Promise((res) => setTimeout(res, 0));
    }
  }

  // 줄 길이를 넘는 단서는 잘못 읽은 것
  for (const kind of ['row', 'col'] as const) {
    const list = kind === 'row' ? result.rows : result.cols;
    const len = kind === 'row' ? cols : rows;
    list.forEach((clue, index) => {
      const need = clue.reduce((a, b) => a + b, 0) + Math.max(0, clue.length - 1);
      if (need > len && !result.uncertain.some((u) => u.kind === kind && u.index === index)) result.uncertain.push({ kind, index });
    });
  }
  return result;
}

export interface PhotoResult {
  cols: number;
  rows: number;
  clues?: ClueResult;
  state?: { states: Cell[]; uncertain: number[] };
}
