import './styles.css';
import { type Grid, unitName } from '../latin/engine';
import { type BoardProps, CellContent, LatinApp, type LatinGame, cellClasses } from '../latin/LatinApp';
import { type ExplainRule, baseConflicts, elimText, eul } from '../latin/hints';
import { type Puzzle, type SkyLine, clueState, gridOf, skyConflicts } from './sky/board';
import { LEVELS, SIZES, type Generated, type Level, type Size, generate } from './sky/generate';

type SGrid = Grid & { sky: SkyLine[]; puzzle: Puzzle };

/** 빌딩 규칙 설명 */
const explainRule: ExplainRule = (g, d) => {
  const u = unitName(g, d.line!);
  if (d.kind === 'sky-edge') {
    return {
      name: '단서와 거리',
      steps: [
        `${eul(u)} 보세요. 바깥 숫자 ${d.digit}의 쪽에서 보이는 빌딩 수예요.`,
        `단서가 c이면 그쪽에서 k번째 칸(첫 칸이 0번째)은 판 크기 − c + 1 + k보다 높을 수 없어요. 단서 1이면 첫 칸이 가장 높고, 단서가 판 크기면 1부터 차례로 높아져요.`,
        `이 규칙으로 안 되는 높이가 있어요. ${elimText(g.n, d.eliminate)}.`,
      ],
      focus: g.units[d.line!],
      keyCells: d.eliminate.map((e) => e.cell),
    };
  }
  if (d.kind === 'sky-line') {
    return {
      name: '줄 배치 따지기',
      steps: [
        `${eul(u)} 보세요.`,
        '이 줄에 놓을 수 있는 높이 배치를 모두 따져, 양쪽 단서의 보이는 수를 모두 맞추는 배치만 남겨 보세요.',
        `남은 배치 어디에도 쓰이지 않는 높이가 있어요. ${elimText(g.n, d.eliminate)}.`,
      ],
      focus: g.units[d.line!],
      keyCells: d.eliminate.map((e) => e.cell),
    };
  }
  return null;
};

function SkyBoard(p: BoardProps<SGrid>) {
  const { g, values, marks, hint, hintLevel, onSelect } = p;
  const { n, puzzle } = g;
  const col = (c: number) => Array.from({ length: n }, (_, r) => r * n + c);
  const row = (r: number) => Array.from({ length: n }, (_, c) => r * n + c);
  const clue = (v: number, cells: number[], key: string, gridRow: number, gridColumn: number, label: string) => (
    <span key={key} className={`sclue ${clueState(cells, values, v)}`} style={{ gridRow, gridColumn }} aria-label={v ? `${label} 보이는 빌딩 ${v}개` : undefined}>
      {v || ''}
    </span>
  );
  return (
    <div className="sky-board" role="grid" aria-label="스카이스크래퍼 판" style={{ gridTemplateColumns: `0.6fr repeat(${n}, minmax(0, 1fr)) 0.6fr`, gridTemplateRows: `0.6fr repeat(${n}, minmax(0, 1fr)) 0.6fr` }}>
      {puzzle.top.map((v, c) => clue(v, col(c), `t${c}`, 1, c + 2, `${c + 1}열 위`))}
      {puzzle.bottom.map((v, c) => clue(v, col(c).reverse(), `b${c}`, n + 2, c + 2, `${c + 1}열 아래`))}
      {puzzle.left.map((v, r) => clue(v, row(r), `l${r}`, r + 2, 1, `${r + 1}행 왼쪽`))}
      {puzzle.right.map((v, r) => clue(v, row(r).reverse(), `r${r}`, r + 2, n + 2, `${r + 1}행 오른쪽`))}
      {values.map((v, i) => {
        const r = Math.floor(i / n);
        const c = i % n;
        const cls = ['scell', ...cellClasses(i, n, p)];
        return (
          <button key={i} type="button" role="gridcell" className={cls.join(' ')} style={{ gridRow: r + 2, gridColumn: c + 2 }} onClick={() => onSelect(i)} aria-label={`${r + 1}행 ${c + 1}열 ${v || '빈칸'}`}>
            <CellContent value={v} given={!!g.givens[i]} marks={marks[i]} n={n} hint={hint} hintLevel={hintLevel} cell={i} />
          </button>
        );
      })}
    </div>
  );
}

const game: LatinGame<Puzzle, SGrid, Size, Level> = {
  id: 'skyscrapers',
  title: '스카이스크래퍼',
  lead: '행·열마다 높이 1부터 판 크기까지의 빌딩을 하나씩 세워요. 판 바깥 숫자는 그 방향에서 보이는 빌딩 수예요. 높은 빌딩 뒤의 낮은 빌딩은 가려져요.',
  storageKey: 'skyscrapers-helper:v1',
  sizes: SIZES,
  levels: LEVELS,
  defaultPick: { size: 4, level: 'easy' },
  sizeNote: (s) => `${s}×${s}: 높이 1~${s}`,
  gridOf: gridOf as (p: Puzzle) => SGrid,
  makeWorker: () => new Worker(new URL('./sky/generate.worker.ts', import.meta.url), { type: 'module' }),
  generate: (size, level) => generate(size, level) as Generated,
  Board: SkyBoard,
  conflicts: (g, values) => new Set([...baseConflicts(g, values), ...skyConflicts(g.sky, values)]),
  explainRule,
};

export default function App() {
  return <LatinApp game={game} />;
}
