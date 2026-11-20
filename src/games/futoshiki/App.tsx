import './styles.css';
import { type Grid, cellName } from '../latin/engine';
import { type BoardProps, CellContent, LatinApp, type LatinGame, cellClasses } from '../latin/LatinApp';
import { type ExplainRule, baseConflicts, elimText } from '../latin/hints';
import { type Ineq, type Puzzle, gridOf, ineqConflicts } from './futo/board';
import { LEVELS, SIZES, type Generated, type Level, type Size, generate } from './futo/generate';

/** 부등호 규칙 설명 */
const explainRule: ExplainRule = (g, d) => {
  if (d.kind !== 'inequality') return null;
  const [a, b] = d.cells!;
  return {
    name: '부등호',
    steps: [
      `${cellName(g.n, a)}과 ${cellName(g.n, b)} 사이의 부등호를 보세요.`,
      '작은 쪽 칸은 큰 쪽 칸의 가장 큰 후보보다 작아야 하고, 큰 쪽 칸은 작은 쪽 칸의 가장 작은 후보보다 커야 해요.',
      `부등호를 지킬 수 없는 후보가 있어요. ${elimText(g.n, d.eliminate)}.`,
    ],
    focus: [a, b],
    keyCells: [a, b],
  };
};

type FGrid = Grid & { ineqs: Ineq[] };

function FutoBoard(p: BoardProps<FGrid>) {
  const { g, values, marks, hint, hintLevel, onSelect } = p;
  const { n, ineqs } = g;
  const track = Array.from({ length: n }, () => 'minmax(0, 1fr)').join(' minmax(0, 0.42fr) ');
  return (
    <div className="futo-board" role="grid" aria-label="후토시키 판" style={{ gridTemplateColumns: track, gridTemplateRows: track }}>
      {values.map((v, i) => {
        const r = Math.floor(i / n);
        const c = i % n;
        const cls = ['fcell', ...cellClasses(i, n, p)];
        if (g.givens[i]) cls.push('given');
        return (
          <button key={i} type="button" role="gridcell" className={cls.join(' ')} style={{ gridRow: 2 * r + 1, gridColumn: 2 * c + 1 }} onClick={() => onSelect(i)} aria-label={`${r + 1}행 ${c + 1}열 ${v || '빈칸'}`}>
            <CellContent value={v} given={!!g.givens[i]} marks={marks[i]} n={n} hint={hint} hintLevel={hintLevel} cell={i} />
          </button>
        );
      })}
      {ineqs.map((q, k) => {
        const a = Math.min(q.less, q.more);
        const b = Math.max(q.less, q.more);
        const r = Math.floor(a / n);
        const c = a % n;
        const horiz = b === a + 1;
        // 뾰족한 쪽이 작은 칸을 가리킨다
        const sign = horiz ? (q.less === a ? '<' : '>') : q.less === a ? '∧' : '∨';
        return (
          <span key={`q${k}`} className={`sign ${horiz ? 'h' : 'v'}`} style={horiz ? { gridRow: 2 * r + 1, gridColumn: 2 * c + 2 } : { gridRow: 2 * r + 2, gridColumn: 2 * c + 1 }} aria-label={`${cellName(n, q.less)}이 ${cellName(n, q.more)}보다 작음`}>
            {sign}
          </span>
        );
      })}
    </div>
  );
}

const game: LatinGame<Puzzle, FGrid, Size, Level> = {
  id: 'futoshiki',
  title: '후토시키',
  lead: '행·열마다 1부터 판 크기까지 숫자를 한 번씩 넣어요. 칸 사이 부등호(<, >, ∧, ∨)는 뾰족한 쪽이 작은 숫자예요.',
  storageKey: 'futoshiki-helper:v1',
  sizes: SIZES,
  levels: LEVELS,
  defaultPick: { size: 5, level: 'easy' },
  sizeNote: (s) => `${s}×${s}: 숫자 1~${s}`,
  gridOf,
  makeWorker: () => new Worker(new URL('./futo/generate.worker.ts', import.meta.url), { type: 'module' }),
  generate: (size, level) => generate(size, level) as Generated,
  Board: FutoBoard,
  conflicts: (g, values) => new Set([...baseConflicts(g, values), ...ineqConflicts(g.ineqs, values)]),
  explainRule,
};

export default function App() {
  return <LatinApp game={game} />;
}

