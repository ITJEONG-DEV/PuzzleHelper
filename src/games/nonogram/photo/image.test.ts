import { describe, expect, it } from 'vitest';
import { EMPTY, FILLED, UNKNOWN, type Cell } from '../nonogram/line';
import { type Gray, type Quad, estimateCount, findBoardQuad, findClueNumbers, gridToImage, makeGray, readCellStates, sampleRegion } from './image';

const COLS = 10;
const ROWS = 8;
const CELL = 30;
const OX = 150;
const OY = 120;

function rect(g: Gray, x: number, y: number, w: number, h: number, v = 25) {
  for (let yy = Math.round(y); yy < Math.round(y + h); yy++)
    for (let xx = Math.round(x); xx < Math.round(x + w); xx++) if (xx >= 0 && yy >= 0 && xx < g.width && yy < g.height) g.data[yy * g.width + xx] = v;
}

function line(g: Gray, x0: number, y0: number, x1: number, y1: number, t: number, v = 40) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
  for (let s = 0; s <= steps; s++) {
    const x = x0 + ((x1 - x0) * s) / steps;
    const y = y0 + ((y1 - y0) * s) / steps;
    rect(g, x - t / 2, y - t / 2, t, t, v);
  }
}

/** 칸 상태: # 칠함, x X, / 한 획, \ 한 획, o 점, . 빈칸 */
const STATE = ['##x.......', '#/\\o.....#', '..........', '###.......', '..x..##...', '..........', '.......x..', '#........#'];

function drawPuzzle(): Gray {
  const g = makeGray(560, 460, 240);
  rect(g, 20, 20, 520, 420, 252); // 종이
  for (let k = 0; k <= COLS; k++) rect(g, OX + k * CELL - 1, OY - 1, k % 5 === 0 ? 3 : 2, ROWS * CELL + 2);
  for (let k = 0; k <= ROWS; k++) rect(g, OX - 1, OY + k * CELL - 1, COLS * CELL + 2, k % 5 === 0 ? 3 : 2);
  STATE.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      const x = OX + c * CELL;
      const y = OY + r * CELL;
      if (ch === '#') rect(g, x + 2, y + 2, CELL - 3, CELL - 3, 30);
      if (ch === 'x' || ch === '\\') line(g, x + 7, y + 7, x + CELL - 7, y + CELL - 7, 2);
      if (ch === 'x' || ch === '/') line(g, x + CELL - 7, y + 7, x + 7, y + CELL - 7, 2);
      if (ch === 'o') rect(g, x + CELL / 2 - 3, y + CELL / 2 - 3, 6, 6, 40);
    }),
  );
  // 숫자 대신 세로 막대: 열 단서는 위로 쌓고, 행 단서는 왼쪽으로 늘어놓는다
  const digit = (x: number, y: number) => rect(g, x - 2, y - 8, 5, 17, 20);
  // 0열: "3" "1" 두 숫자, 2열: "12" 한 숫자(두 글자)
  digit(OX + 15, OY - 15);
  digit(OX + 15, OY - 45);
  digit(OX + 2 * CELL + 10, OY - 15);
  digit(OX + 2 * CELL + 19, OY - 15);
  // 0행: "2" "1" 두 숫자, 3행: "10" 한 숫자
  digit(OX - 15, OY + 15);
  digit(OX - 45, OY + 15);
  digit(OX - 20, OY + 3 * CELL + 15);
  digit(OX - 11, OY + 3 * CELL + 15);
  return g;
}

const QUAD: Quad = [
  { x: OX, y: OY },
  { x: OX + COLS * CELL, y: OY },
  { x: OX + COLS * CELL, y: OY + ROWS * CELL },
  { x: OX, y: OY + ROWS * CELL },
];

describe('nonogram photo', () => {
  it('판 모서리를 찾는다', () => {
    const q = findBoardQuad(drawPuzzle());
    q.forEach((p, k) => {
      expect(Math.abs(p.x - QUAD[k].x)).toBeLessThanOrEqual(3);
      expect(Math.abs(p.y - QUAD[k].y)).toBeLessThanOrEqual(3);
    });
  });

  it('종이 가장자리가 아니라 판을 잡는다 (어두운 책상 위 종이)', () => {
    const paper = drawPuzzle();
    const photo = makeGray(760, 660, 110);
    for (let y = 0; y < paper.height; y++) for (let x = 0; x < paper.width; x++) photo.data[(y + 100) * 760 + x + 100] = paper.data[y * paper.width + x];
    const q = findBoardQuad(photo);
    q.forEach((p, k) => {
      expect(Math.abs(p.x - (QUAD[k].x + 100))).toBeLessThanOrEqual(3);
      expect(Math.abs(p.y - (QUAD[k].y + 100))).toBeLessThanOrEqual(3);
    });
  });

  it('가로·세로 칸 수를 추정한다', () => {
    const g = drawPuzzle();
    const H = gridToImage(QUAD, 1, 1);
    const board = sampleRegion(g, H, { x0: 0, y0: 0, x1: 1, y1: 1 }, 600);
    expect(estimateCount(board, 'x')).toBe(COLS);
    expect(estimateCount(board, 'y')).toBe(ROWS);
  });

  it('칠한 칸과 X·/·\\·점을 구분한다', () => {
    const g = drawPuzzle();
    const H = gridToImage(QUAD, COLS, ROWS);
    const ppc = 32;
    const board = sampleRegion(g, H, { x0: 0, y0: 0, x1: COLS, y1: ROWS }, ppc);
    const { states, uncertain } = readCellStates(board, COLS, ROWS, ppc);
    const expected: Cell[] = STATE.flatMap((row) => [...row].map((ch) => (ch === '#' ? FILLED : ch === '.' ? UNKNOWN : EMPTY)));
    expect(states).toEqual(expected);
    expect(uncertain).toEqual([]);
  });

  it('단서 숫자를 줄별로 묶는다 (두 자리 숫자는 하나로)', () => {
    const g = drawPuzzle();
    const H = gridToImage(QUAD, COLS, ROWS);
    const ppc = 32;
    const top = sampleRegion(g, H, { x0: 0, y0: -3, x1: COLS, y1: 0 }, ppc);
    const cols = findClueNumbers(top, 'col', COLS, ppc);
    expect(cols.map((l) => l.length)).toEqual([2, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
    const left = sampleRegion(g, H, { x0: -3, y0: 0, x1: 0, y1: ROWS }, ppc);
    const rows = findClueNumbers(left, 'row', ROWS, ppc);
    expect(rows.map((l) => l.length)).toEqual([2, 0, 0, 1, 0, 0, 0, 0]);
  });
});
