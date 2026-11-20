import { describe, expect, it } from 'vitest';
import { type Cell, EMPTY, FILLED, UNKNOWN, doneClues, lineDeductions, lineSatisfied, solveLine } from './line';
import { type Puzzle, cluesFromSolution, parseClues, solve, validatePuzzle } from './puzzle';
import { applyHint, findHint } from './hints';

const U = UNKNOWN;
const F = FILLED;
const E = EMPTY;
const blank = (n: number) => new Array<Cell>(n).fill(U);

/** 줄 추론만으로 풀리는 10x10 그림 (하트) */
const HEART = [
  '..##..##..',
  '.####.###.',
  '##########',
  '##########',
  '##########',
  '.########.',
  '..######..',
  '...####...',
  '....##....',
  '..........',
];

/** 줄 하나만으로는 막히는 문제 (답은 하나) */
const TRICKY = ['.#.#.#', '.#..#.', '....##', '..##..', '..#..#', '#..#.#'];

function runToEnd(p: Puzzle) {
  const { solution, count } = solve(p);
  expect(count).toBe(1);
  let grid = blank(p.rows.length * p.cols.length);
  const kinds: string[] = [];
  for (let step = 0; step < 500; step++) {
    const h = findHint(p, grid, solution);
    if (!h) break;
    kinds.push(h.kind);
    for (const c of h.changes) expect(c.value).toBe(solution![c.cell]);
    grid = applyHint(h, grid);
  }
  return { grid, solution, kinds };
}

describe('line', () => {
  it('빈 줄에서 겹치는 칸을 찾는다', () => {
    // 10칸에 8: 가운데 6칸이 확정
    const d = lineDeductions([8], blank(10))!;
    expect(d.map((x) => x.index)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(d.every((x) => x.value === F)).toBe(true);
  });

  it('칠한 칸에서 닿지 않는 칸은 X', () => {
    // 단서 2, 4번째 칸이 칠해져 있으면 2~5칸 밖은 X
    const cells = blank(8);
    cells[3] = F;
    const d = lineDeductions([2], cells)!;
    const empties = d.filter((x) => x.value === E).map((x) => x.index);
    expect(empties).toEqual([0, 1, 5, 6, 7]);
  });

  it('단서와 맞지 않으면 모순', () => {
    expect(solveLine([1, 1], [F, E, F, U, U]).ok).toBe(true);
    expect(solveLine([3], [F, E, F, U, U]).ok).toBe(false);
  });

  it('단서 0인 줄은 모두 X', () => {
    const d = lineDeductions([], blank(4))!;
    expect(d.every((x) => x.value === E)).toBe(true);
    expect(d.length).toBe(4);
  });

  it('모든 배치를 나열한 결과와 같다 (무작위 줄 3000개)', () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let t = 0; t < 3000; t++) {
      const n = 1 + Math.floor(rnd() * 10);
      const truth = Array.from({ length: n }, () => (rnd() < 0.5 ? F : E)) as Cell[];
      const clue: number[] = [];
      let run = 0;
      for (const c of truth) {
        if (c === F) run++;
        else if (run) {
          clue.push(run);
          run = 0;
        }
      }
      if (run) clue.push(run);
      // 단서를 가끔 틀리게 바꿔 모순도 시험한다
      if (rnd() < 0.2 && clue.length) clue[0]++;
      const cells = truth.map((c) => (rnd() < 0.3 ? c : U)) as Cell[];
      if (rnd() < 0.1) cells[Math.floor(rnd() * n)] = rnd() < 0.5 ? F : E;

      // 2^n 나열
      const canFill = new Array(n).fill(false);
      const canEmpty = new Array(n).fill(false);
      let ok = false;
      for (let m = 0; m < 1 << n; m++) {
        const arr = Array.from({ length: n }, (_, i) => ((m >> i) & 1 ? F : E)) as Cell[];
        if (arr.some((v, i) => cells[i] !== U && cells[i] !== v)) continue;
        if (!lineSatisfied(clue, arr)) continue;
        ok = true;
        arr.forEach((v, i) => (v === F ? (canFill[i] = true) : (canEmpty[i] = true)));
      }
      const r = solveLine(clue, cells);
      expect(r.ok).toBe(ok);
      if (!ok) continue;
      cells.forEach((c, i) => {
        if (c !== U) return;
        expect(r.canFill[i]).toBe(canFill[i]);
        expect(r.canEmpty[i]).toBe(canEmpty[i]);
      });
    }
  });

  it('다 칠했는지 판단한다', () => {
    expect(lineSatisfied([2, 1], [F, F, U, F, U])).toBe(true);
    expect(lineSatisfied([2, 1], [F, U, U, F, U])).toBe(false);
  });
});

describe('puzzle', () => {
  it('단서 텍스트를 읽는다', () => {
    expect(parseClues('3 1\n0\n\n2,2\n-')).toEqual([[3, 1], [], [2, 2], []]);
  });

  it('단서 합이 다르면 알려준다', () => {
    const p = cluesFromSolution(HEART);
    expect(validatePuzzle(p)).toBeNull();
    expect(validatePuzzle({ ...p, rows: [[1], ...p.rows.slice(1)] })).toMatch(/합/);
  });

  it('줄이 짧으면 알려준다', () => {
    expect(validatePuzzle({ rows: [[3, 2]], cols: [[1], [1], [1], [1], [1]] })).toMatch(/1행/);
  });

  it('답을 찾는다', () => {
    const p = cluesFromSolution(HEART);
    const r = solve(p);
    expect(r.count).toBe(1);
    const pic = Array.from({ length: 10 }, (_, y) => r.solution!.slice(y * 10, y * 10 + 10).map((c) => (c === F ? '#' : '.')).join(''));
    expect(pic).toEqual(HEART);
  });

  it('답이 여러 개인 문제를 알아본다', () => {
    // 2x2 대각선 두 칸: 두 가지 답
    expect(solve({ rows: [[1], [1]], cols: [[1], [1]] }).count).toBe(2);
  });
});

describe('hints', () => {
  it('단서 0인 줄을 가장 먼저 X로 정리한다', () => {
    const p = cluesFromSolution(HEART);
    const h = findHint(p, blank(100), solve(p).solution)!;
    expect(h.kind).toBe('zero-line');
    expect(h.line).toEqual({ kind: 'row', index: 9 });
    expect(h.changes.every((c) => c.value === E)).toBe(true);
  });

  it('빈 줄이 없으면 첫 힌트는 겹치기', () => {
    const p = cluesFromSolution(HEART.slice(0, 9));
    const h = findHint(p, blank(90), solve(p).solution)!;
    expect(h.kind).toBe('overlap');
    expect(h.steps[0]).toMatch(/^\d+(행|열)을 보세요\.$/);
  });

  it('잘못 칠한 칸을 먼저 알려준다', () => {
    const p = cluesFromSolution(HEART);
    const g = blank(100);
    g[0] = F;
    const h = findHint(p, g, solve(p).solution)!;
    expect(h.kind).toBe('wrong');
    expect(h.changes).toEqual([{ cell: 0, value: U }]);
  });

  it('힌트만 따라가면 끝까지 풀린다', () => {
    const p = cluesFromSolution(HEART);
    const { grid, solution, kinds } = runToEnd(p);
    expect(grid).toEqual(solution);
    expect(kinds).not.toContain('reveal');
  });

  it('줄 하나로 막히면 칸을 공개하고 끝까지 간다', () => {
    const p = cluesFromSolution(TRICKY);
    const { grid, solution } = runToEnd(p);
    expect(grid).toEqual(solution);
  });
});

describe('단서 숫자 완료 표시', () => {
  const line = (s: string) => [...s].map((ch) => (ch === '#' ? F : ch === 'x' ? E : U)) as Cell[];

  it('1 12에서 12를 다 칠하고 양쪽이 끝·X로 막히면 12만 완료', () => {
    expect(doneClues([1, 12], line('...x############'))).toEqual([false, true]);
    expect(doneClues([1, 12], line('..x############x'))).toEqual([false, true]);
  });

  it('한쪽이 열려 있으면 완료가 아님', () => {
    expect(doneClues([1, 12], line('...############.'))).toEqual([false, false]);
  });

  it('같은 길이 숫자 중 어느 것인지 모르면 완료가 아님', () => {
    // 1 1 1에서 중간의 1칸: 첫째인지 둘째인지 정해지지 않는다
    expect(doneClues([1, 1, 1], line('..x#x....'))).toEqual([false, false, false]);
    // 맨 앞 1칸은 첫 번째 1
    expect(doneClues([1, 1, 1], line('#x.......'))).toEqual([true, false, false]);
  });

  it('단서와 맞지 않는 줄은 표시하지 않음', () => {
    expect(doneClues([2], line('#x#'))).toEqual([false]);
  });
});
