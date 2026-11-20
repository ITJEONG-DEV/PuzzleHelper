import './styles.css';
import { type Grid, cellName, unitName } from '../latin/engine';
import { type BoardProps, CellContent, LatinApp, type LatinGame, cellClasses } from '../latin/LatinApp';
import { type ExplainRule, baseConflicts, elimText, eul } from '../latin/hints';
import { type Puzzle, gridOf } from './killer/board';
import { LEVELS, SIZES, type Generated, type Level, type Size, generate } from './killer/generate';

/** 45 규칙 설명 */
const explainRule: ExplainRule = (g, d) => {
  if (d.kind !== 'rule45-in' && d.kind !== 'rule45-out') return null;
  const u = unitName(g, d.line!);
  const cells = d.cells!;
  const where = cells.length === 1 ? cellName(g.n, cells[0]) : `${cellName(g.n, cells[0])} 외 ${cells.length - 1}칸`;
  const inside = d.kind === 'rule45-in';
  return {
    name: inside ? '45 규칙 (안쪽 칸)' : '45 규칙 (바깥 칸)',
    steps: [
      `${eul(u)} 보세요. ${u}의 숫자를 모두 더하면 45예요.`,
      inside ? `${u} 안에 완전히 든 상자들의 합을 45에서 빼 보세요. 남은 칸들의 합이 나와요.` : `${u}에 걸친 상자들의 합에서 45를 빼 보세요. ${u} 밖으로 삐져나온 칸들의 합이 나와요.`,
      `${where}의 합은 ${d.digit}이에요. 이 합을 만들 수 없는 숫자가 있어요. ${elimText(g.n, d.eliminate)}.`,
    ],
    focus: [...new Set([...g.units[d.line!], ...cells])],
    keyCells: cells,
  };
};

function KillerBoard(p: BoardProps<Grid>) {
  const { g, values, marks, hint, hintLevel, onSelect } = p;
  const { n, cageOf, cages } = g;
  const labelAt = new Map(cages.map((c, k) => [Math.min(...c.cells), k]));
  const selCage = p.selected !== null ? cageOf[p.selected] : -1;
  return (
    <div className="killer-board" role="grid" aria-label="킬러 스도쿠 판">
      {values.map((v, i) => {
        const r = Math.floor(i / n);
        const c = i % n;
        const k = cageOf[i];
        const cls = ['kcell', ...cellClasses(i, n, p)];
        if (c % 3 === 2 && c < n - 1) cls.push('box-r');
        if (r % 3 === 2 && r < n - 1) cls.push('box-b');
        if (k === selCage && !cls.includes('selected')) cls.push('same-cage');
        // 상자 경계: 이웃이 다른 상자면 그쪽에 점선
        const edges = [r === 0 || cageOf[i - n] !== k ? 'ct' : '', c === n - 1 || cageOf[i + 1] !== k ? 'cr' : '', r === n - 1 || cageOf[i + n] !== k ? 'cb' : '', c === 0 || cageOf[i - 1] !== k ? 'cl' : ''].filter(Boolean);
        const label = labelAt.get(i);
        return (
          <button key={i} type="button" role="gridcell" className={cls.join(' ')} onClick={() => onSelect(i)} aria-label={`${r + 1}행 ${c + 1}열 ${v || '빈칸'}${label !== undefined ? ` 상자 합 ${cages[label].target}` : ''}`}>
            <span className={`cage-edge ${edges.join(' ')}`} aria-hidden="true" />
            {label !== undefined && <span className="cage-label">{cages[label].target}</span>}
            <CellContent value={v} given={!!g.givens[i]} marks={marks[i]} n={n} hint={hint} hintLevel={hintLevel} cell={i} />
          </button>
        );
      })}
    </div>
  );
}

/** 고른 칸의 상자 합과 칸 수 */
function KillerInfo({ g, cell }: { g: Grid; cell: number }) {
  const cage = g.cages[g.cageOf[cell]];
  if (!cage) return null;
  return (
    <section className="combo-info" aria-label="상자 도움말">
      <div className="combo-row">
        <span className="combo-name">상자 합 {cage.target}</span>
        <span className="combo-list">{cage.cells.length}칸 · 상자 안 숫자는 모두 달라요</span>
      </div>
    </section>
  );
}

const game: LatinGame<Puzzle, Grid, Size, Level> = {
  id: 'killer',
  title: '킬러 스도쿠',
  lead: '스도쿠처럼 행·열·3×3 박스마다 1~9를 한 번씩 넣어요. 점선 상자의 숫자를 더하면 왼쪽 위 합이 나와야 하고, 한 상자 안에는 같은 숫자를 쓸 수 없어요.',
  storageKey: 'killer-helper:v1',
  sizes: SIZES,
  levels: LEVELS,
  defaultPick: { size: 'k9', level: 'easy' },
  sizeNote: () => '9×9',
  gridOf,
  makeWorker: () => new Worker(new URL('./killer/generate.worker.ts', import.meta.url), { type: 'module' }),
  generate: (size, level) => generate(size, level) as Generated,
  Board: KillerBoard,
  conflicts: baseConflicts,
  cageName: (g, k) => `합 ${g.cages[k].target} 상자`,
  explainRule,
  Info: KillerInfo,
};

export default function App() {
  return <LatinApp game={game} />;
}
