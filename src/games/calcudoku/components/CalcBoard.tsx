import { type Layout, cageText, has } from '../calc/board';
import type { Hint } from '../calc/hints';

interface Props {
  lay: Layout;
  values: number[];
  marks: number[];
  selected: number | null;
  conflicts: Set<number>;
  hint: Hint | null;
  hintLevel: number;
  onSelect: (i: number) => void;
}

export function CalcBoard({ lay, values, marks, selected, conflicts, hint, hintLevel, onSelect }: Props) {
  const { n, cages } = lay.p;
  const { cageOf } = lay;
  const sel = selected ?? -1;
  const selDigit = sel >= 0 ? values[sel] : 0;
  const selCage = sel >= 0 ? cageOf[sel] : -1;
  const focus = new Set(hint && hintLevel >= 1 ? hint.focus : []);
  const keys = new Set(hint && hintLevel >= 3 ? hint.keyCells : []);
  const showFix = hint && hintLevel >= 3;
  const elimMap = new Map<number, number>();
  if (showFix) for (const e of hint.eliminate ?? []) elimMap.set(e.cell, (elimMap.get(e.cell) ?? 0) | (1 << e.digit));
  // 상자 단서는 상자의 첫 칸(읽는 순서) 왼쪽 위에 적는다
  const labelAt = new Map(cages.map((c, k) => [Math.min(...c.cells), k]));
  const digits = Array.from({ length: n }, (_, d) => d + 1);

  return (
    <div className="calc-board" role="grid" aria-label="칼큐도쿠 판" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${n}, minmax(0, 1fr))` }}>
      {values.map((v, i) => {
        const r = Math.floor(i / n);
        const c = i % n;
        const cls = ['ccell'];
        if (c < n - 1 && cageOf[i + 1] !== cageOf[i]) cls.push('edge-r');
        if (r < n - 1 && cageOf[i + n] !== cageOf[i]) cls.push('edge-b');
        if (i === sel) cls.push('selected');
        else if (r === Math.floor(sel / n) || c === sel % n) cls.push('peer');
        else if (cageOf[i] === selCage) cls.push('same-cage');
        if (v && v === selDigit && i !== sel) cls.push('same');
        if (conflicts.has(i)) cls.push('conflict');
        if (focus.has(i)) cls.push('focus');
        if (keys.has(i)) cls.push('key');
        if (showFix && hint.place?.cell === i) cls.push('place');
        if (showFix && hint.clear === i) cls.push('clear');
        const elim = elimMap.get(i) ?? 0;
        const restore = showFix && hint.restore?.cell === i ? hint.restore.digit : 0;
        const shown = marks[i] | elim | (restore ? 1 << restore : 0);
        const label = labelAt.get(i);
        return (
          <button key={i} type="button" role="gridcell" className={cls.join(' ')} onClick={() => onSelect(i)} aria-label={`${r + 1}행 ${c + 1}열 ${v || '빈칸'}${label !== undefined ? ` 상자 ${cageText(cages[label])}` : ''}`}>
            {label !== undefined && <span className="cage-label">{cageText(cages[label])}</span>}
            {v ? (
              <span className="value">{v}</span>
            ) : showFix && hint.place?.cell === i ? (
              <span className="value ghost">{hint.place.digit}</span>
            ) : shown ? (
              <span className="marks" style={{ gridTemplateColumns: `repeat(${n <= 4 ? 2 : 3}, 1fr)` }}>
                {digits.map((d) => (
                  <span key={d} className={['mark', has(elim, d) ? 'elim' : '', d === restore ? 'restore' : ''].join(' ')}>
                    {has(shown, d) ? d : ''}
                  </span>
                ))}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
