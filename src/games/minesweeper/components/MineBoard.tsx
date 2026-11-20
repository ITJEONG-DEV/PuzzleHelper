import { useLayoutEffect, useRef, useState } from 'react';
import { type CellState, FLAG, OPEN, QUESTION, type Field } from '../mines/board';
import type { Hint } from '../mines/hints';

interface Props {
  field: Field;
  state: CellState[];
  cursor: number | null;
  /** 지뢰를 밟았으면 'boom'(지뢰 위치 표시), 다 풀었으면 'win'(남은 지뢰를 깃발로 표시) */
  reveal: 'boom' | 'win' | null;
  hint: Hint | null;
  hintLevel: number;
  /** 누름(짧게) */
  onPrimary: (i: number) => void;
  /** 오른쪽 버튼·길게 누름 */
  onSecondary: (i: number) => void;
}

/** 길게 누르면 반대 동작(깃발) */
const LONG_PRESS_MS = 380;
/** 판 테두리(양쪽 합) */
const BORDER = 4;
/** .app의 최대 폭과 좌우 여백 합 (styles.css와 같게) */
const APP_MAX = 520;
const APP_PAD = 32;

/**
 * 판 폭에 맞는 칸 크기. 화면 실제 픽셀(devicePixelRatio) 단위의 정수로 맞춰
 * 모든 칸과 간격이 같은 픽셀 수로 그려지게 한다.
 */
function useCellSize(w: number) {
  const [size, setSize] = useState<{ cell: number; gap: number } | null>(null);
  useLayoutEffect(() => {
    const calc = () => {
      // 판을 감싼 칸의 폭은 판 자신 때문에 늘어날 수 있어, 화면 폭에서 앱 여백을 빼서 쓴다
      const avail = Math.min(document.documentElement.clientWidth, APP_MAX) - APP_PAD;
      const dpr = window.devicePixelRatio || 1;
      const gapDev = Math.max(1, Math.round(dpr));
      const availDev = Math.floor((avail - BORDER) * dpr) - gapDev * (w + 1);
      const cellDev = Math.floor(availDev / w);
      if (cellDev <= 0) return;
      const next = { cell: cellDev / dpr, gap: gapDev / dpr };
      setSize((prev) => (prev && prev.cell === next.cell && prev.gap === next.gap ? prev : next));
    };
    calc();
    window.addEventListener('resize', calc);
    // 화면 회전·창 크기 변화를 놓치지 않게 문서 폭 변화도 본다
    const ro = new ResizeObserver(calc);
    ro.observe(document.documentElement);
    return () => {
      window.removeEventListener('resize', calc);
      ro.disconnect();
    };
  }, [w]);
  return size;
}

export function MineBoard({ field, state, cursor, reveal, hint, hintLevel, onPrimary, onSecondary }: Props) {
  const { w, h, num, mine } = field;
  const press = useRef<{ i: number; timer: number; long: boolean } | null>(null);
  const focus = new Set(hint && hintLevel >= 1 ? hint.focus : []);
  const willOpen = new Set(hint && hintLevel >= 3 ? hint.open : []);
  const willFlag = new Set(hint && hintLevel >= 3 ? hint.flag : []);
  const unflag = hint && hintLevel >= 3 ? hint.unflag : undefined;

  const down = (e: React.PointerEvent, i: number) => {
    if (e.button === 2) return;
    e.preventDefault();
    const timer = window.setTimeout(() => {
      if (press.current?.i !== i) return;
      press.current.long = true;
      navigator.vibrate?.(20);
      onSecondary(i);
    }, LONG_PRESS_MS);
    press.current = { i, timer, long: false };
  };
  const up = (i: number) => {
    const p = press.current;
    press.current = null;
    if (!p || p.i !== i) return;
    clearTimeout(p.timer);
    if (!p.long) onPrimary(i);
  };
  const cancel = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };

  const size = useCellSize(w);
  // 칸·간격을 화면 픽셀에 딱 맞는 크기로 둔다. 판 폭을 칸 수로 나눈 소수점 크기를 쓰면
  // 휴대폰이 칸마다 다르게 반올림해 칸 크기가 제각각으로 보였다(중급 16칸 등)
  const grid = size
    ? { gridTemplateColumns: `repeat(${w}, ${size.cell}px)`, gridTemplateRows: `repeat(${h}, ${size.cell}px)`, gap: `${size.gap}px`, padding: `${size.gap}px` }
    : { gridTemplateColumns: `repeat(${w}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${h}, minmax(0, 1fr))`, aspectRatio: `${w} / ${h}`, width: '100%' };

  return (
    <div className="mine-wrap">
    <div className="mine-board" role="grid" aria-label="지뢰찾기 판" style={grid} onContextMenu={(e) => e.preventDefault()}>
      {state.map((s, i) => {
        const cls = ['mcell'];
        let content: string | null = null;
        let label = `${Math.floor(i / w) + 1}행 ${(i % w) + 1}열 `;
        if (s === OPEN) {
          cls.push('open');
          if (mine[i]) {
            cls.push('boom');
            content = '💣';
            label += '지뢰';
          } else if (num[i]) {
            cls.push(`n${num[i]}`);
            content = String(num[i]);
            label += String(num[i]);
          } else label += '빈 칸';
        } else if (s === FLAG) {
          cls.push('flag');
          if (reveal && !mine[i]) cls.push('wrong');
          content = '🚩';
          label += '깃발';
        } else if (s === QUESTION && !(reveal && mine[i])) {
          cls.push('question');
          content = '?';
          label += '물음표';
        } else if (reveal === 'win' && mine[i]) {
          cls.push('flag');
          content = '🚩';
          label += '깃발';
        } else {
          if (reveal === 'boom' && mine[i]) {
            cls.push('mine-shown');
            content = '💣';
          }
          label += '닫힘';
        }
        if (focus.has(i)) cls.push('focus');
        if (willOpen.has(i)) cls.push('will-open');
        if (willFlag.has(i)) cls.push('will-flag');
        if (unflag === i) cls.push('will-unflag');
        if (i === cursor) cls.push('cursor');
        return (
          <button
            key={i}
            type="button"
            role="gridcell"
            className={cls.join(' ')}
            aria-label={label}
            onPointerDown={(e) => down(e, i)}
            onPointerUp={() => up(i)}
            onPointerLeave={cancel}
            onPointerCancel={cancel}
            onMouseDown={(e) => {
              if (e.button === 2) onSecondary(i);
            }}
            onKeyDown={(e) => {
              // 칸에 초점이 있을 때 Enter·Space는 App의 키 처리로 넘긴다
              if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
            }}
          >
            {content}
          </button>
        );
      })}
    </div>
    </div>
  );
}
