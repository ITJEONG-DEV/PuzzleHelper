import { useEffect, useRef } from 'react';
import { type Cell, EMPTY, type Layout, STAR, UNKNOWN } from '../stars/board';
import type { Hint } from '../stars/hints';

export type Tool = 'mark' | 'star';

interface Props {
  lay: Layout;
  state: Cell[];
  cursor: number | null;
  conflicts: Set<number>;
  hint: Hint | null;
  hintLevel: number;
  /** 짧게 누름: 고른 도구로 바꾸기 */
  onPrimary: (i: number) => void;
  /** 길게 누름: 반대 도구 */
  onSecondary: (i: number) => void;
  /** × 모드에서 끌어 여러 칸 표시. first면 새 획 */
  onPaint: (cells: number[], value: Cell, first: boolean) => void;
  tool: Tool;
}

const LONG_PRESS_MS = 380;

export function StarBoard({ lay, state, cursor, conflicts, hint, hintLevel, onPrimary, onSecondary, onPaint, tool }: Props) {
  const { n, region } = lay.p;
  const press = useRef<{ start: number; timer: number; long: boolean; dragged: boolean; value: Cell; seen: Set<number> } | null>(null);
  const focus = new Set(hint && hintLevel >= 1 ? hint.focus : []);
  const willStar = new Set(hint && hintLevel >= 3 ? hint.stars : []);
  const willX = new Set(hint && hintLevel >= 3 ? hint.empties : []);
  const clear = hint && hintLevel >= 3 ? hint.clear : undefined;

  const cellAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-cell]');
    return el ? Number(el.getAttribute('data-cell')) : null;
  };

  const down = (e: React.PointerEvent, i: number) => {
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
    // × 모드에서 끌면 첫 칸과 같은 값으로 칠한다
    const value: Cell = state[i] === EMPTY ? UNKNOWN : EMPTY;
    press.current = { start: i, timer, long: false, dragged: false, value, seen: new Set([i]) };
  };

  const move = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p || p.long || tool !== 'mark') return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null || p.seen.has(i)) return;
    if (!p.dragged) {
      p.dragged = true;
      clearTimeout(p.timer);
      if (state[p.start] !== STAR) onPaint([p.start], p.value, true);
    }
    p.seen.add(i);
    if (state[i] !== STAR) onPaint([i], p.value, false);
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

  return (
    <div
      className="star-board"
      role="grid"
      aria-label="스타 배틀 판"
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${n}, minmax(0, 1fr))` }}
      onPointerMove={move}
      onContextMenu={(e) => e.preventDefault()}
    >
      {state.map((s, i) => {
        const r = Math.floor(i / n);
        const c = i % n;
        const cls = ['scell', `rg${region[i] % 10}`];
        if (c < n - 1 && region[i + 1] !== region[i]) cls.push('edge-r');
        if (r < n - 1 && region[i + n] !== region[i]) cls.push('edge-b');
        if (focus.has(i)) cls.push('focus');
        if (willStar.has(i)) cls.push('will-star');
        if (willX.has(i)) cls.push('will-x');
        if (clear === i) cls.push('will-clear');
        if (conflicts.has(i)) cls.push('conflict');
        if (i === cursor) cls.push('cursor');
        return (
          <div key={i} data-cell={i} className={cls.join(' ')} role="gridcell" aria-label={`${r + 1}행 ${c + 1}열 ${s === STAR ? '별' : s === EMPTY ? '×' : '빈칸'}`} onPointerDown={(e) => down(e, i)}>
            {s === STAR ? <span className="star">★</span> : s === EMPTY ? <span className="mark">×</span> : null}
          </div>
        );
      })}
    </div>
  );
}
