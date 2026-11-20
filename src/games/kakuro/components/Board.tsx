import { type Layout, has } from '../kakuro/board';
import type { Hint } from '../kakuro/hints';

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

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function Board({ lay, values, marks, selected, conflicts, hint, hintLevel, onSelect }: Props) {
  const { p } = lay;
  const sel = selected ?? -1;
  const selDigit = sel >= 0 ? values[sel] : 0;
  const peers = new Set(sel >= 0 ? lay.cellRuns[sel].filter((k) => k >= 0).flatMap((k) => lay.runs[k].cells) : []);
  const selHeads = new Set(sel >= 0 ? lay.cellRuns[sel].filter((k) => k >= 0).map((k) => lay.runs[k].head) : []);
  const focus = new Set(hint && hintLevel >= 1 ? hint.focus : []);
  const keys = new Set(hint && hintLevel >= 3 ? hint.keyCells : []);
  const showFix = hint && hintLevel >= 3;
  const elimMap = new Map<number, number>();
  if (showFix) for (const e of hint.eliminate ?? []) elimMap.set(e.cell, (elimMap.get(e.cell) ?? 0) | (1 << e.digit));

  return (
    <div className="board" role="grid" aria-label="가쿠로 판" style={{ gridTemplateColumns: `repeat(${p.w}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${p.h}, minmax(0, 1fr))` }}>
      {p.white.map((white, i) => {
        if (!white) {
          const a = p.across[i];
          const d = p.down[i];
          const cls = ['block'];
          if (a || d) cls.push('clue');
          if (selHeads.has(i)) cls.push('peer-head');
          return (
            <div key={i} className={cls.join(' ')} role="gridcell" aria-label={a || d ? `단서 ${a ? `가로 ${a}` : ''} ${d ? `세로 ${d}` : ''}` : '검은 칸'}>
              {a > 0 && <span className="sum-across">{a}</span>}
              {d > 0 && <span className="sum-down">{d}</span>}
            </div>
          );
        }
        const v = values[i];
        const cls = ['cell'];
        if (i === sel) cls.push('selected');
        else if (peers.has(i)) cls.push('peer');
        if (v && v === selDigit && i !== sel && peers.has(i)) cls.push('same');
        if (conflicts.has(i)) cls.push('conflict');
        if (focus.has(i)) cls.push('focus');
        if (keys.has(i)) cls.push('key');
        if (showFix && hint.place?.cell === i) cls.push('place');
        if (showFix && hint.clear === i) cls.push('clear');

        const elim = elimMap.get(i) ?? 0;
        const restore = showFix && hint.restore?.cell === i ? hint.restore.digit : 0;
        const shown = marks[i] | elim | (restore ? 1 << restore : 0);
        const label = `${Math.floor(i / p.w) + 1}행 ${(i % p.w) + 1}열 ${v ? v : '빈칸'}`;

        return (
          <button key={i} type="button" role="gridcell" className={cls.join(' ')} onClick={() => onSelect(i)} aria-label={label}>
            {v ? (
              <span className="value">{v}</span>
            ) : showFix && hint.place?.cell === i ? (
              <span className="value ghost">{hint.place.digit}</span>
            ) : shown ? (
              <span className="marks">
                {DIGITS.map((d) => (
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
