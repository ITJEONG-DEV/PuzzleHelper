import { Fragment, useEffect, useRef, useState } from 'react';
import { type Cell, EMPTY, FILLED, UNKNOWN, doneClues, lineSatisfied } from '../nonogram/line';
import { type LineRef, type Puzzle, lineIndices } from '../nonogram/puzzle';
import type { Hint } from '../nonogram/hints';

export type Tool = 'fill' | 'cross';

interface Props {
  puzzle: Puzzle;
  grid: Cell[];
  cursor: number | null;
  tool: Tool;
  hint: Hint | null;
  hintLevel: number;
  /** 한 번 누르고 끄는 동안의 칠하기. first가 true면 새 획 */
  onPaint: (cells: number[], value: Cell, first: boolean) => void;
  onCursor: (cell: number) => void;
  /** 행·열 단서 머리칸을 눌렀을 때 */
  onClue: (ref: LineRef) => void;
}

function useCellSize(puzzle: Puzzle) {
  const calc = () => {
    const w = puzzle.cols.length;
    const clueCols = Math.max(1, ...puzzle.rows.map((r) => r.length));
    const avail = Math.min(window.innerWidth, 760) - 32;
    // 행 단서 칸은 숫자 하나당 셀 폭의 0.6배 정도
    const size = Math.floor(avail / (w + clueCols * 0.6));
    return Math.max(14, Math.min(34, size));
  };
  const [size, setSize] = useState(calc);
  useEffect(() => {
    setSize(calc());
    const onResize = () => setSize(calc());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [puzzle]);
  return size;
}

export function NonogramBoard({ puzzle, grid, cursor, tool, hint, hintLevel, onPaint, onCursor, onClue }: Props) {
  const w = puzzle.cols.length;
  const h = puzzle.rows.length;
  const size = useCellSize(puzzle);
  /** 진행 중인 획. axis는 Shift로 직선을 그릴 때 정해진 방향 */
  const stroke = useRef<{ value: Cell; seen: Set<number>; start: number; axis: 'row' | 'col' | null } | null>(null);

  const focus = new Set(hint && hintLevel >= 1 && hint.line ? lineIndices(puzzle, hint.line) : []);
  const preview = new Map<number, Cell>(hint && hintLevel >= 3 ? hint.changes.map((c) => [c.cell, c.value]) : []);
  const rowCells = puzzle.rows.map((_, r) => grid.slice(r * w, r * w + w));
  const colCells = puzzle.cols.map((_, c) => Array.from({ length: h }, (_, r) => grid[r * w + c]));
  const rowDone = puzzle.rows.map((clue, r) => lineSatisfied(clue, rowCells[r]));
  const colDone = puzzle.cols.map((clue, c) => lineSatisfied(clue, colCells[c]));
  /** 단서 숫자 하나씩: 위치가 확실한 칠한 덩어리를 다 칠한 숫자 */
  const rowNumDone = puzzle.rows.map((clue, r) => doneClues(clue, rowCells[r]));
  const colNumDone = puzzle.cols.map((clue, c) => doneClues(clue, colCells[c]));
  const focusRow = hint && hintLevel >= 1 && hint.line?.kind === 'row' ? hint.line.index : -1;
  const focusCol = hint && hintLevel >= 1 && hint.line?.kind === 'col' ? hint.line.index : -1;
  const curR = cursor !== null ? Math.floor(cursor / w) : -1;
  const curC = cursor !== null ? cursor % w : -1;

  const cellAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-cell]');
    return el ? Number(el.getAttribute('data-cell')) : null;
  };

  const start = (e: React.PointerEvent, i: number) => {
    e.preventDefault();
    const useTool: Tool = e.button === 2 ? 'cross' : tool;
    const target = useTool === 'fill' ? FILLED : EMPTY;
    const value: Cell = grid[i] === target ? UNKNOWN : target;
    stroke.current = { value, seen: new Set([i]), start: i, axis: null };
    onCursor(i);
    onPaint([i], value, true);
  };

  const move = (e: React.PointerEvent) => {
    const s = stroke.current;
    if (!s) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null) return;
    if (!e.shiftKey) {
      if (s.seen.has(i)) return;
      s.seen.add(i);
      onPaint([i], s.value, false);
      return;
    }
    // Shift: 시작 칸의 행이나 열로만 그린다. 방향은 처음 더 많이 움직인 쪽으로 정한다
    const r0 = Math.floor(s.start / w);
    const c0 = s.start % w;
    const r = Math.floor(i / w);
    const c = i % w;
    if (!s.axis) {
      if (r === r0 && c === c0) return;
      s.axis = Math.abs(c - c0) >= Math.abs(r - r0) ? 'row' : 'col';
    }
    const line: number[] = [];
    if (s.axis === 'row') for (let k = Math.min(c0, c); k <= Math.max(c0, c); k++) line.push(r0 * w + k);
    else for (let k = Math.min(r0, r); k <= Math.max(r0, r); k++) line.push(k * w + c0);
    const fresh = line.filter((x) => !s.seen.has(x));
    if (!fresh.length) return;
    fresh.forEach((x) => s.seen.add(x));
    onPaint(fresh, s.value, false);
  };

  useEffect(() => {
    const end = () => (stroke.current = null);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, []);

  const clueFont = Math.max(10, Math.round(size * 0.48));

  return (
    <div className="nono-scroll">
      <div
        className="nono"
        style={{
          gridTemplateColumns: `auto repeat(${w}, ${size}px)`,
          gridTemplateRows: `auto repeat(${h}, ${size}px)`,
          fontSize: clueFont,
        }}
        onPointerMove={move}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="nono-corner" />
        {puzzle.cols.map((clue, c) => (
          <div
            key={`c${c}`}
            className={['nono-col-clue', colDone[c] ? 'done' : '', c === focusCol ? 'focus' : '', c === curC ? 'cursor-line' : '', c % 5 === 4 && c !== w - 1 ? 'edge-r' : ''].join(' ')}
            role="button"
            title={colDone[c] ? '눌러서 남은 칸을 X로 채우기' : undefined}
            onClick={() => onClue({ kind: 'col', index: c })}
          >
            {(clue.length ? clue : [0]).map((n, k) => (
              <span key={k} className={colNumDone[c][k] ? 'done' : undefined}>
                {n}
              </span>
            ))}
          </div>
        ))}
        {puzzle.rows.map((clue, r) => (
          <Fragment key={r}>
            <div
              className={['nono-row-clue', rowDone[r] ? 'done' : '', r === focusRow ? 'focus' : '', r === curR ? 'cursor-line' : '', r % 5 === 4 && r !== h - 1 ? 'edge-b' : ''].join(' ')}
              role="button"
              title={rowDone[r] ? '눌러서 남은 칸을 X로 채우기' : undefined}
              onClick={() => onClue({ kind: 'row', index: r })}
            >
              {(clue.length ? clue : [0]).map((n, k) => (
                <span key={k} className={rowNumDone[r][k] ? 'done' : undefined}>
                  {n}
                </span>
              ))}
            </div>
            {Array.from({ length: w }, (_, c) => {
              const i = r * w + c;
              const v = grid[i];
              const pv = preview.get(i);
              const cls = ['nono-cell'];
              if (v === FILLED) cls.push('filled');
              if (v === EMPTY) cls.push('crossed');
              if (focus.has(i)) cls.push('focus');
              if (pv !== undefined) cls.push(pv === FILLED ? 'will-fill' : pv === EMPTY ? 'will-cross' : 'will-clear');
              if (i === cursor) cls.push('cursor');
              if (c % 5 === 4 && c !== w - 1) cls.push('edge-r');
              if (r % 5 === 4 && r !== h - 1) cls.push('edge-b');
              return (
                <div
                  key={i}
                  data-cell={i}
                  className={cls.join(' ')}
                  role="gridcell"
                  aria-label={`${r + 1}행 ${c + 1}열 ${v === FILLED ? '칠함' : v === EMPTY ? 'X' : '빈칸'}`}
                  onPointerDown={(e) => start(e, i)}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

