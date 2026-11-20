import { Fragment, useEffect, useRef } from 'react';
import { type Cell, GRASS, type Layout, TENT, TREE, UNKNOWN, lineInfo, lineTarget } from '../tents/board';
import type { Hint } from '../tents/hints';

export type Tool = 'grass' | 'tent';

interface Props {
  lay: Layout;
  state: Cell[];
  cursor: number | null;
  conflicts: Set<number>;
  hint: Hint | null;
  hintLevel: number;
  tool: Tool;
  onPrimary: (i: number) => void;
  onSecondary: (i: number) => void;
  /** 잔디 모드에서 끌어 여러 칸 표시. first면 새 획 */
  onPaint: (cells: number[], value: Cell, first: boolean) => void;
}

const LONG_PRESS_MS = 380;

export function TentBoard({ lay, state, cursor, conflicts, hint, hintLevel, tool, onPrimary, onSecondary, onPaint }: Props) {
  const { n } = lay.p;
  const press = useRef<{ start: number; timer: number; long: boolean; dragged: boolean; value: Cell; seen: Set<number> } | null>(null);
  const focus = new Set(hint && hintLevel >= 1 ? hint.focus : []);
  const willTent = new Set(hint && hintLevel >= 3 ? hint.tents : []);
  const willGrass = new Set(hint && hintLevel >= 3 ? hint.grass : []);
  const clear = hint && hintLevel >= 3 ? hint.clear : undefined;

  const cellAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-cell]');
    return el ? Number(el.getAttribute('data-cell')) : null;
  };

  const down = (e: React.PointerEvent, i: number) => {
    if (state[i] === TREE) return;
    if (e.button === 2) {
      onSecondary(i);
      return;
    }
    e.preventDefault();
    const timer = window.setTimeout(() => {
      const p = press.current;
      if (!p || p.dragged) return;
      p.long = true;
      navigator.vibrate?.(20);
      onSecondary(i);
    }, LONG_PRESS_MS);
    const value: Cell = state[i] === GRASS ? UNKNOWN : GRASS;
    press.current = { start: i, timer, long: false, dragged: false, value, seen: new Set([i]) };
  };

  const move = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p || p.long || tool !== 'grass') return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null || p.seen.has(i)) return;
    if (!p.dragged) {
      p.dragged = true;
      clearTimeout(p.timer);
      if (state[p.start] === UNKNOWN || state[p.start] === GRASS) onPaint([p.start], p.value, true);
    }
    p.seen.add(i);
    if (state[i] === UNKNOWN || state[i] === GRASS) onPaint([i], p.value, false);
  };

  useEffect(() => {
    const end = () => {
      const p = press.current;
      press.current = null;
      if (!p) return;
      clearTimeout(p.timer);
      if (!p.long && !p.dragged) onPrimary(p.start);
    };
    const cancel = () => {
      if (press.current) clearTimeout(press.current.timer);
      press.current = null;
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [onPrimary]);

  const clueClass = (li: number) => {
    const { tents, open } = lineInfo(lay.lines[li], state);
    const target = lineTarget(lay.p, li);
    if (tents > target) return 'over';
    if (tents === target && !open.length) return 'done';
    return '';
  };

  return (
    <div
      className="tent-board"
      role="grid"
      aria-label="텐트와 나무 판"
      style={{ gridTemplateColumns: `0.7fr repeat(${n}, minmax(0, 1fr))`, gridTemplateRows: `0.7fr repeat(${n}, minmax(0, 1fr))` }}
      onPointerMove={move}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="tclue corner" />
      {lay.p.cols.map((v, c) => (
        <div key={`c${c}`} className={`tclue col ${clueClass(n + c)}`} aria-label={`${c + 1}열 텐트 ${v}개`}>
          {v}
        </div>
      ))}
      {Array.from({ length: n }, (_, r) => (
        <Fragment key={r}>
          <div className={`tclue row ${clueClass(r)}`} aria-label={`${r + 1}행 텐트 ${lay.p.rows[r]}개`}>
            {lay.p.rows[r]}
          </div>
          {Array.from({ length: n }, (_, c) => {
            const i = r * n + c;
            const s = state[i];
            const cls = ['tcell'];
            if (s === TREE) cls.push('tree');
            if (s === GRASS) cls.push('grass');
            if (focus.has(i)) cls.push('focus');
            if (willTent.has(i)) cls.push('will-tent');
            if (willGrass.has(i)) cls.push('will-grass');
            if (clear === i) cls.push('will-clear');
            if (conflicts.has(i)) cls.push('conflict');
            if (i === cursor) cls.push('cursor');
            return (
              <div key={i} data-cell={i} className={cls.join(' ')} role="gridcell" aria-label={`${r + 1}행 ${c + 1}열 ${s === TREE ? '나무' : s === TENT ? '텐트' : s === GRASS ? '잔디' : '빈칸'}`} onPointerDown={(e) => down(e, i)}>
                {s === TREE ? '🌳' : s === TENT ? '⛺' : null}
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
