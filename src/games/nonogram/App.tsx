import './styles.css';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppNav } from '../../shared/AppNav';
import { SolvedToast } from '../../shared/SolvedToast';
import { HintPanel } from './components/HintPanel';
import { NonogramBoard, type Tool } from './components/NonogramBoard';
import { type Cell, EMPTY, FILLED, UNKNOWN, lineSatisfied } from './nonogram/line';
import {
  type LineRef,
  type Puzzle,
  clueOf,
  cluesFromSolution,
  formatClue,
  lineIndices,
  lineName,
  parseClues,
  solve,
  validatePuzzle,
} from './nonogram/puzzle';
import { applyHint, findHint, type Hint } from './nonogram/hints';
import { LEVELS, SIZES, generate, levelLabel, type Generated, type Level, type Size } from './nonogram/generate';
import { PhotoImport } from './components/PhotoImport';
import type { PhotoResult } from './photo/recognize';

type Phase = 'setup' | 'solve';

interface Game {
  phase: Phase;
  rowsText: string;
  colsText: string;
  puzzle: Puzzle | null;
  grid: Cell[];
  solution: Cell[] | null;
  /** 사진에서 읽은 판 상태. 풀기 시작할 때 크기가 맞으면 판에 넣는다 */
  pendingGrid?: { cols: number; rows: number; states: Cell[] } | null;
  /** 랜덤 문제의 크기·난이도 */
  random?: { size: Size; level: Level };
}

interface Pick {
  size: Size;
  level: Level;
}

interface State {
  game: Game;
  /** 랜덤 문제에서 고른 크기·난이도 */
  pick: Pick;
  history: Game[];
  cursor: number | null;
  tool: Tool;
  hint: Hint | null;
  hintLevel: number;
  message: { tone: 'info' | 'error'; text: string } | null;
}

type Action =
  | { type: 'text'; field: 'rowsText' | 'colsText'; value: string }
  | { type: 'example' }
  | { type: 'start' }
  | { type: 'paint'; cells: number[]; value: Cell; first: boolean }
  | { type: 'cursor'; cell: number }
  | { type: 'move'; dr: number; dc: number }
  | { type: 'step'; delta: number }
  | { type: 'mark'; value: Cell }
  | { type: 'tool'; tool: Tool }
  | { type: 'fillLine'; line: LineRef }
  | { type: 'undo' }
  | { type: 'clearGrid' }
  | { type: 'hint' }
  | { type: 'hintApply' }
  | { type: 'hintClose' }
  | { type: 'edit' }
  | { type: 'new' }
  | { type: 'dismiss' }
  | { type: 'photo'; result: PhotoResult }
  | { type: 'pick'; pick: Partial<Pick> }
  | { type: 'random'; result: Generated };

const STORAGE_KEY = 'nonogram-helper:v1';

const EXAMPLE = ['..##..##..', '.####.####', '##########', '##########', '.########.', '..######..', '...####...', '....##....'];

const SIZE_NOTE: Record<Size, string> = {
  5: '5×5: 처음 해 보거나 잠깐 풀기 좋아요',
  10: '10×10: 가볍게 한 판',
  15: '15×15: 조금 길게 한 판',
  20: '20×20: 오래 붙잡고 푸는 판',
};

const emptyGame = (): Game => ({ phase: 'setup', rowsText: '', colsText: '', puzzle: null, grid: [], solution: null });

const DEFAULT_PICK: Pick = { size: 10, level: 'easy' };

function loadState(): State {
  const base: State = { game: emptyGame(), pick: DEFAULT_PICK, history: [], cursor: null, tool: 'fill', hint: null, hintLevel: 0, message: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as { game: Game; pick?: Pick };
    const pick =
      saved.pick && SIZES.includes(saved.pick.size) && LEVELS.some((l) => l.id === saved.pick!.level) ? saved.pick : DEFAULT_PICK;
    if (!saved.game || typeof saved.game.rowsText !== 'string') return { ...base, pick };
    return { ...base, game: saved.game, pick };
  } catch {
    return base;
  }
}

function commit(state: State, game: Game): State {
  return { ...state, game, history: [...state.history.slice(-199), state.game], hint: null, hintLevel: 0, message: null };
}

function reducer(state: State, action: Action): State {
  const { game } = state;
  const w = game.puzzle?.cols.length ?? 0;
  const h = game.puzzle?.rows.length ?? 0;
  switch (action.type) {
    case 'text':
      return { ...state, game: { ...game, [action.field]: action.value }, message: null };
    case 'example': {
      const p = cluesFromSolution(EXAMPLE);
      return commit(state, { ...game, rowsText: p.rows.map(formatClue).join('\n'), colsText: p.cols.map(formatClue).join('\n') });
    }
    case 'start': {
      const puzzle: Puzzle = { rows: parseClues(game.rowsText), cols: parseClues(game.colsText) };
      const err = validatePuzzle(puzzle);
      if (err) return { ...state, message: { tone: 'error', text: err } };
      const res = solve(puzzle, 2);
      if (res.count === 0) return { ...state, message: { tone: 'error', text: '이 단서로는 그림을 만들 수 없어요. 단서를 다시 확인해 주세요.' } };
      const pg = game.pendingGrid;
      const fits = pg && pg.cols === puzzle.cols.length && pg.rows === puzzle.rows.length;
      const next: Game = {
        ...game,
        phase: 'solve',
        puzzle,
        grid: fits ? pg.states.slice() : new Array<Cell>(puzzle.rows.length * puzzle.cols.length).fill(UNKNOWN),
        solution: res.count === 1 ? res.solution : null,
        pendingGrid: null,
      };
      const s = { ...commit(state, next), cursor: 0 };
      if (res.count > 1) return { ...s, message: { tone: 'info', text: '답이 여러 개인 문제예요. 잘못 칠한 칸 알려주기와 정답 공개 힌트는 쓸 수 없어요.' } };
      return s;
    }
    case 'paint': {
      if (game.phase !== 'solve') return state;
      const grid = game.grid.slice();
      let changed = false;
      for (const c of action.cells) {
        if (grid[c] !== action.value) {
          grid[c] = action.value;
          changed = true;
        }
      }
      if (!changed) return state;
      if (action.first) return commit(state, { ...game, grid });
      return { ...state, game: { ...game, grid }, hint: null, hintLevel: 0 };
    }
    case 'cursor':
      return { ...state, cursor: action.cell };
    case 'move': {
      if (!w) return state;
      const cur = state.cursor ?? 0;
      const r = (Math.floor(cur / w) + action.dr + h) % h;
      const c = ((cur % w) + action.dc + w) % w;
      return { ...state, cursor: r * w + c };
    }
    case 'step': {
      if (!w) return state;
      const n = w * h;
      return { ...state, cursor: ((state.cursor ?? -action.delta) + action.delta + n) % n };
    }
    case 'mark': {
      if (game.phase !== 'solve' || state.cursor === null) return state;
      const grid = game.grid.slice();
      const cur = grid[state.cursor];
      grid[state.cursor] = action.value === UNKNOWN || cur === action.value ? UNKNOWN : action.value;
      if (grid[state.cursor] === cur) return state;
      return commit(state, { ...game, grid });
    }
    case 'tool':
      return { ...state, tool: action.tool };
    case 'fillLine': {
      if (game.phase !== 'solve' || !game.puzzle) return state;
      const idx = lineIndices(game.puzzle, action.line);
      const cells = idx.map((i) => game.grid[i]);
      // 아직 다 칠하지 않은 줄의 단서를 누르면 아무 일도 하지 않는다
      if (!lineSatisfied(clueOf(game.puzzle, action.line), cells)) return state;
      if (!cells.includes(UNKNOWN)) return state;
      const grid = game.grid.slice();
      for (const i of idx) if (grid[i] === UNKNOWN) grid[i] = EMPTY;
      return commit(state, { ...game, grid });
    }
    case 'undo': {
      const prev = state.history[state.history.length - 1];
      if (!prev) return state;
      return { ...state, game: prev, history: state.history.slice(0, -1), hint: null, hintLevel: 0, message: null };
    }
    case 'clearGrid':
      return commit(state, { ...game, grid: game.grid.map(() => UNKNOWN) });
    case 'hint': {
      if (!game.puzzle) return state;
      if (state.hint) return { ...state, hintLevel: Math.min(3, state.hintLevel + 1) };
      const hint = findHint(game.puzzle, game.grid, game.solution);
      if (!hint) return { ...state, message: { tone: 'info', text: '더 드릴 힌트가 없어요. 다 풀었거나, 답이 하나로 정해지지 않는 문제예요.' } };
      return { ...state, hint, hintLevel: 1, message: null };
    }
    case 'hintApply': {
      if (!state.hint) return state;
      const grid = applyHint(state.hint, game.grid);
      return { ...commit(state, { ...game, grid }), cursor: state.hint.changes[0]?.cell ?? state.cursor };
    }
    case 'hintClose':
      return { ...state, hint: null, hintLevel: 0 };
    case 'edit':
      return commit(state, { ...game, phase: 'setup', puzzle: null, grid: [], solution: null, random: undefined });
    case 'new':
      return { ...commit(state, emptyGame()), cursor: null };
    case 'dismiss':
      return { ...state, message: null };
    case 'pick':
      return { ...state, pick: { ...state.pick, ...action.pick } };
    case 'random': {
      const { puzzle, solution, size, level, approximate } = action.result;
      const next: Game = {
        phase: 'solve',
        rowsText: puzzle.rows.map(formatClue).join('\n'),
        colsText: puzzle.cols.map(formatClue).join('\n'),
        puzzle,
        grid: new Array<Cell>(solution.length).fill(UNKNOWN),
        solution,
        pendingGrid: null,
        random: { size, level },
      };
      const s = { ...commit(state, next), cursor: 0 };
      if (!approximate) return s;
      return { ...s, message: { tone: 'info', text: `${levelLabel(level)} 난이도 문제를 시간 안에 찾지 못해 가장 가까운 난이도의 문제를 냈어요.` } };
    }
    case 'photo': {
      const { result } = action;
      const parts: string[] = [];
      const st = result.state;
      const stateText = st
        ? `칠한 칸 ${st.states.filter((v) => v === FILLED).length}개·X ${st.states.filter((v) => v === EMPTY).length}개를 읽었어요.${st.uncertain.length ? ` 애매한 칸 ${st.uncertain.length}개는 비워 뒀어요.` : ''}`
        : '';
      if (game.phase === 'solve') {
        if (!st) return state;
        return { ...commit(state, { ...game, grid: st.states }), message: { tone: 'info', text: `${stateText} 사진과 비교해 보세요. 실행 취소로 읽기 전 판으로 돌아갈 수 있어요.` } };
      }
      let next: Game = { ...game };
      if (result.clues) {
        const c = result.clues;
        next = { ...next, rowsText: c.rows.map(formatClue).join('\n'), colsText: c.cols.map(formatClue).join('\n') };
        parts.push(`단서 ${result.rows}행·${result.cols}열을 읽었어요.`);
        if (c.uncertain.length) parts.push(`확인할 줄: ${c.uncertain.map(lineName).join(', ')}.`);
      }
      if (st) {
        const cleaned = st.states.map((v, i) => (st.uncertain.includes(i) ? UNKNOWN : v));
        next = { ...next, pendingGrid: { cols: result.cols, rows: result.rows, states: cleaned } };
        parts.push(`${stateText} 풀기 시작하면 판에 들어가요.`);
      }
      parts.push('사진과 비교해 틀린 단서를 고친 뒤 풀기 시작을 누르세요.');
      return { ...commit(state, next), message: { tone: 'info', text: parts.join(' ') } };
    }
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const { game, hint, hintLevel, message, tool } = state;
  const puzzle = game.puzzle;
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pickPhoto = () => fileInput.current?.click();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ game, pick: state.pick }));
    } catch {
      /* 저장할 수 없는 환경이면 그냥 넘어간다 */
    }
  }, [game, state.pick]);

  const [generating, setGenerating] = useState(false);
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);

  const startRandom = (size: Size, level: Level) => {
    worker.current?.terminate();
    setGenerating(true);
    const done = (result: Generated) => {
      worker.current?.terminate();
      worker.current = null;
      setGenerating(false);
      dispatch({ type: 'random', result });
    };
    try {
      const w = new Worker(new URL('./nonogram/generate.worker.ts', import.meta.url), { type: 'module' });
      worker.current = w;
      w.onmessage = (e: MessageEvent<Generated>) => done(e.data);
      w.onerror = () => done(generate(size, level));
      w.postMessage({ size, level });
    } catch {
      // 워커를 못 쓰는 환경이면 화면에서 바로 만든다
      setTimeout(() => done(generate(size, level)), 30);
    }
  };

  const solved = useMemo(() => {
    if (!puzzle || game.phase !== 'solve') return false;
    const w = puzzle.cols.length;
    return (
      puzzle.rows.every((clue, r) => lineSatisfied(clue, game.grid.slice(r * w, r * w + w))) &&
      puzzle.cols.every((clue, c) => lineSatisfied(clue, puzzle.rows.map((_, r) => game.grid[r * w + c])))
    );
  }, [puzzle, game.grid, game.phase]);

  const preview = useMemo(() => {
    const rows = parseClues(game.rowsText);
    const cols = parseClues(game.colsText);
    return { rows: rows.length, cols: cols.length };
  }, [game.rowsText, game.colsText]);

  useEffect(() => {
    if (game.phase !== 'solve') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') return;
      if (document.querySelector('.photo-sheet')) return;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        dispatch({ type: 'undo' });
        e.preventDefault();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (e.key in moves) {
        const [dr, dc] = moves[e.key];
        dispatch({ type: 'move', dr, dc });
      } else if (e.key === 'Tab') {
        dispatch({ type: 'step', delta: e.shiftKey ? -1 : 1 });
      } else if (e.code === 'Space' || e.code === 'KeyF' || e.key === 'Enter') {
        dispatch({ type: 'mark', value: FILLED });
      } else if (e.code === 'KeyX') {
        dispatch({ type: 'mark', value: EMPTY });
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        dispatch({ type: 'mark', value: UNKNOWN });
      } else if (e.code === 'KeyH') {
        dispatch({ type: 'hint' });
      } else if (e.code === 'KeyT') {
        dispatch({ type: 'tool', tool: state.tool === 'fill' ? 'cross' : 'fill' });
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game.phase, state.tool]);

  const isSetup = game.phase === 'setup';

  return (
    <div className="app">
      <header className="app-header">
        <h1>노노그램 도우미</h1>
        <span className="phase-badge">
          {isSetup ? '문제 입력' : game.random ? `푸는 중 · ${game.random.size}×${game.random.size} ${levelLabel(game.random.level)}` : '푸는 중'}
        </span>
        <AppNav current="nonogram" />
      </header>

      {message && (
        <div className={`message ${message.tone}`} role="status">
          <span>{message.text}</span>
          <button type="button" className="link" onClick={() => dispatch({ type: 'dismiss' })} aria-label="메시지 닫기">
            ✕
          </button>
        </div>
      )}

      {isSetup && (
        <>
          <section className="random" aria-label="랜덤 문제">
            <span className="random-title">랜덤 문제</span>
            <div className="random-row" role="radiogroup" aria-label="판 크기">
              <span className="random-label">크기</span>
              {SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  role="radio"
                  aria-checked={state.pick.size === size}
                  className={state.pick.size === size ? 'on' : ''}
                  onClick={() => dispatch({ type: 'pick', pick: { size } })}
                >
                  {size}×{size}
                </button>
              ))}
            </div>
            <div className="random-row" role="radiogroup" aria-label="난이도">
              <span className="random-label">난이도</span>
              {LEVELS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={state.pick.level === l.id}
                  className={state.pick.level === l.id ? 'on' : ''}
                  onClick={() => dispatch({ type: 'pick', pick: { level: l.id } })}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <p className="random-desc">
              {SIZE_NOTE[state.pick.size]} · {LEVELS.find((l) => l.id === state.pick.level)!.desc}. 모든 문제는 답이 하나예요.
            </p>
            <button type="button" className="primary random-go" onClick={() => startRandom(state.pick.size, state.pick.level)} disabled={generating}>
              {generating ? '만드는 중…' : '랜덤 문제 풀기'}
            </button>
          </section>
          <p className="lead">
            단서를 한 줄에 하나씩 적으세요. 단서끼리는 띄어 쓰고, 칠할 칸이 없으면 <strong>0</strong>으로 입력해요.
          </p>
          <div className="clue-inputs">
            <label>
              <span>
                가로 단서 <small>(위에서 아래로, {preview.rows}행)</small>
              </span>
              <textarea
                value={game.rowsText}
                onChange={(e) => dispatch({ type: 'text', field: 'rowsText', value: e.target.value })}
                rows={12}
                spellCheck={false}
                placeholder={'2 2\n4 4\n10\n...'}
              />
            </label>
            <label>
              <span>
                세로 단서 <small>(왼쪽에서 오른쪽으로, {preview.cols}열)</small>
              </span>
              <textarea
                value={game.colsText}
                onChange={(e) => dispatch({ type: 'text', field: 'colsText', value: e.target.value })}
                rows={12}
                spellCheck={false}
                placeholder={'2\n4\n6\n...'}
              />
            </label>
          </div>
          <div className="toolbar">
            <button type="button" onClick={pickPhoto}>
              사진으로 입력
            </button>
            <button type="button" onClick={() => dispatch({ type: 'example' })}>
              예제 불러오기
            </button>
            <button type="button" onClick={() => dispatch({ type: 'new' })} disabled={!game.rowsText && !game.colsText}>
              모두 지우기
            </button>
            <button type="button" className="primary" onClick={() => dispatch({ type: 'start' })}>
              풀기 시작
            </button>
          </div>
        </>
      )}

      {!isSetup && puzzle && (
        <>
          <div className="board-wrap">
            <NonogramBoard
              puzzle={puzzle}
              grid={game.grid}
              cursor={state.cursor}
              tool={tool}
              hint={hint}
              hintLevel={hintLevel}
              onPaint={(cells, value, first) => dispatch({ type: 'paint', cells, value, first })}
              onCursor={(cell) => dispatch({ type: 'cursor', cell })}
              onClue={(line) => dispatch({ type: 'fillLine', line })}
            />
            <SolvedToast show={solved} text="다 풀었어요! 모든 줄이 단서와 맞아요." />
          </div>

          {hint && (
            <HintPanel
              hint={hint}
              level={hintLevel}
              onMore={() => dispatch({ type: 'hint' })}
              onApply={() => dispatch({ type: 'hintApply' })}
              onClose={() => dispatch({ type: 'hintClose' })}
            />
          )}

          <div className="mode-switch" role="radiogroup" aria-label="표시 도구">
            <button type="button" role="radio" aria-checked={tool === 'fill'} className={tool === 'fill' ? 'on' : ''} onClick={() => dispatch({ type: 'tool', tool: 'fill' })}>
              ■ 칠하기
            </button>
            <button type="button" role="radio" aria-checked={tool === 'cross'} className={tool === 'cross' ? 'on' : ''} onClick={() => dispatch({ type: 'tool', tool: 'cross' })}>
              ✕ X 표시
            </button>
            <span className="mode-key">T로 전환 · 마우스 오른쪽 버튼은 X</span>
          </div>

          <div className="toolbar">
            <button type="button" onClick={() => dispatch({ type: 'undo' })} disabled={!state.history.length}>
              실행 취소
            </button>
            <button type="button" onClick={() => dispatch({ type: 'clearGrid' })} disabled={!game.grid.some((v) => v !== UNKNOWN)}>
              판 비우기
            </button>
            <button type="button" onClick={pickPhoto}>
              사진으로 판 읽기
            </button>
            <button type="button" className="primary" onClick={() => dispatch({ type: 'hint' })} disabled={solved}>
              {hint && hintLevel < 3 ? '다음 힌트' : '힌트'}
            </button>
          </div>

          <div className="footer-actions">
            <button type="button" className="link" onClick={() => dispatch({ type: 'edit' })}>
              단서 고치기
            </button>
            <button type="button" className="link" onClick={() => dispatch({ type: 'new' })}>
              새 게임
            </button>
            {game.random && (
              <button type="button" className="link" onClick={() => startRandom(game.random!.size, game.random!.level)} disabled={generating}>
                {generating ? '만드는 중…' : '같은 조건으로 다시'}
              </button>
            )}
          </div>

          <p className="keys">
            칸을 누르거나 끌어서 여러 칸을 한 번에 칠해요. Shift를 누른 채 끌면 가로나 세로 직선으로만 칠해요. 다 칠한 줄의 단서를 누르면 남은 칸이 X로 채워져요. 키보드: 방향키·Tab 이동 · Space/F 칠하기 · X 표시 · Backspace 지우기 · T 도구 전환 · H 힌트 · Ctrl+Z 실행 취소
          </p>
        </>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setPhotoFile(f);
          e.target.value = '';
        }}
      />
      {photoFile && (
        <PhotoImport
          file={photoFile}
          mode={isSetup ? 'full' : 'state'}
          fixedSize={!isSetup && puzzle ? { cols: puzzle.cols.length, rows: puzzle.rows.length } : undefined}
          onDone={(result) => {
            setPhotoFile(null);
            dispatch({ type: 'photo', result });
          }}
          onCancel={() => setPhotoFile(null)}
          onPickAgain={pickPhoto}
        />
      )}
    </div>
  );
}
