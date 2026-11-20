import './styles.css';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppNav } from '../../shared/AppNav';
import { SolvedToast } from '../../shared/SolvedToast';
import { HintPanel } from './components/HintPanel';
import { TentBoard, type Tool } from './components/TentBoard';
import { type Cell, GRASS, type Puzzle, TENT, TREE, UNKNOWN, conflictCells, isSolved, layoutOf, startState } from './tents/board';
import { applyHint, findHint, type Hint } from './tents/hints';
import { LEVELS, SIZES, generate, levelLabel, type Generated, type Level, type Size } from './tents/generate';

interface Game {
  puzzle: Puzzle;
  solution: number[];
  state: Cell[];
  size: Size;
  level: Level;
}

interface Pick {
  size: Size;
  level: Level;
}

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'grass', label: '잔디 표시' },
  { id: 'tent', label: '⛺ 텐트' },
];

interface State {
  game: Game | null;
  history: Cell[][];
  cursor: number | null;
  tool: Tool;
  hint: Hint | null;
  hintLevel: number;
  message: { tone: 'info' | 'error'; text: string } | null;
  pick: Pick;
}

type Action =
  | { type: 'primary'; cell: number }
  | { type: 'secondary'; cell: number }
  | { type: 'paint'; cells: number[]; value: Cell; first: boolean }
  | { type: 'move'; dr: number; dc: number }
  | { type: 'tool'; tool: Tool }
  | { type: 'undo' }
  | { type: 'clear' }
  | { type: 'hint' }
  | { type: 'hintApply' }
  | { type: 'hintClose' }
  | { type: 'random'; result: Generated }
  | { type: 'quit' }
  | { type: 'pick'; pick: Pick }
  | { type: 'dismiss' };

const STORAGE_KEY = 'tents-helper:v1';

function loadState(): State {
  const base: State = { game: null, history: [], cursor: null, tool: 'grass', hint: null, hintLevel: 0, message: null, pick: { size: 8, level: 'easy' } };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as { game?: Game | null; history?: Cell[][]; pick?: Pick; tool?: Tool };
    const pick = saved.pick && (SIZES as readonly number[]).includes(saved.pick.size) && LEVELS.some((l) => l.id === saved.pick!.level) ? saved.pick : base.pick;
    const g = saved.game;
    const valid = !!g && g.puzzle?.trees && g.state?.length === g.puzzle.n * g.puzzle.n;
    const history = valid && Array.isArray(saved.history) ? saved.history.filter((h) => h?.length === g!.state.length) : [];
    return { ...base, game: valid ? g! : null, history, pick, tool: saved.tool === 'tent' ? 'tent' : 'grass' };
  } catch {
    return base;
  }
}

function withState(s: State, next: Cell[], newStep = true): State {
  if (!s.game) return s;
  const history = newStep ? [...s.history.slice(-299), s.game.state] : s.history;
  return { ...s, game: { ...s.game, state: next }, history, hint: null, hintLevel: 0, message: null };
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'pick':
      return { ...s, pick: a.pick };
    case 'tool':
      return { ...s, tool: a.tool };
    case 'dismiss':
      return { ...s, message: null };
    case 'hintClose':
      return { ...s, hint: null, hintLevel: 0 };
    case 'quit':
      return { ...s, game: null, history: [], hint: null, hintLevel: 0, message: null };
    case 'random': {
      const { puzzle, solution, size, level, approximate } = a.result;
      return {
        ...s,
        game: { puzzle, solution, state: startState(layoutOf(puzzle)), size, level },
        history: [],
        cursor: 0,
        hint: null,
        hintLevel: 0,
        message: approximate ? { tone: 'info', text: `${levelLabel(level)} 난이도 문제를 시간 안에 찾지 못해 가장 가까운 난이도의 문제를 냈어요.` } : null,
      };
    }
  }
  const g = s.game;
  if (!g) return s;
  const lay = layoutOf(g.puzzle);
  const done = isSolved(lay, g.state);

  switch (a.type) {
    case 'move': {
      const n = g.puzzle.n;
      const cur = s.cursor ?? 0;
      return { ...s, cursor: ((Math.floor(cur / n) + a.dr + n) % n) * n + ((cur % n) + a.dc + n) % n };
    }
    case 'undo': {
      const prev = s.history[s.history.length - 1];
      if (!prev) return s;
      return { ...s, game: { ...g, state: prev }, history: s.history.slice(0, -1), hint: null, hintLevel: 0, message: null };
    }
    case 'clear':
      return withState(s, g.state.map((x) => (x === TREE ? TREE : UNKNOWN)));
    case 'primary':
    case 'secondary': {
      if (done || g.state[a.cell] === TREE) return { ...s, cursor: a.cell };
      const act: Tool = a.type === 'primary' ? s.tool : s.tool === 'tent' ? 'grass' : 'tent';
      const next = g.state.slice();
      const want = act === 'tent' ? TENT : GRASS;
      next[a.cell] = g.state[a.cell] === want ? UNKNOWN : want;
      return { ...withState(s, next), cursor: a.cell };
    }
    case 'paint': {
      if (done) return s;
      const next = g.state.slice();
      for (const i of a.cells) if (next[i] === UNKNOWN || next[i] === GRASS) next[i] = a.value;
      return withState(s, next, a.first);
    }
    case 'hint': {
      if (s.hint) return { ...s, hintLevel: Math.min(3, s.hintLevel + 1) };
      const hint = findHint({ lay, state: g.state, solution: g.solution });
      if (!hint) return { ...s, message: { tone: 'info', text: '더 드릴 힌트가 없어요.' } };
      return { ...s, hint, hintLevel: 1, message: null };
    }
    case 'hintApply': {
      if (!s.hint) return s;
      const target = s.hint.tents[0] ?? s.hint.grass[0] ?? s.hint.clear ?? s.cursor;
      return { ...withState(s, applyHint(s.hint, g.state)), cursor: target };
    }
  }
  return s;
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const [generating, setGenerating] = useState(false);
  const worker = useRef<Worker | null>(null);
  const { game, hint, hintLevel, message, pick, tool } = state;
  const lay = useMemo(() => (game ? layoutOf(game.puzzle) : null), [game?.puzzle]);

  useEffect(() => () => worker.current?.terminate(), []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ game, history: state.history.slice(-30), pick, tool }));
    } catch {
      /* 저장할 수 없는 환경이면 그냥 넘어간다 */
    }
  }, [game, state.history, pick, tool]);

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
      const w = new Worker(new URL('./tents/generate.worker.ts', import.meta.url), { type: 'module' });
      worker.current = w;
      w.onmessage = (e: MessageEvent<Generated>) => done(e.data);
      w.onerror = () => done(generate(size, level));
      w.postMessage({ size, level });
    } catch {
      // 워커를 못 쓰는 환경이면 화면에서 바로 만든다
      setTimeout(() => done(generate(size, level)), 0);
    }
  };

  const conflicts = useMemo(() => (lay && game ? conflictCells(lay, game.state) : new Set<number>()), [lay, game?.state]);
  const solved = !!(lay && game && isSolved(lay, game.state));
  const onPrimary = useCallback((cell: number) => dispatch({ type: 'primary', cell }), []);

  useEffect(() => {
    if (!game) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') return;
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
        e.preventDefault();
      } else if ((e.code === 'Space' || e.key === 'Enter') && state.cursor !== null) {
        dispatch({ type: 'primary', cell: state.cursor });
        e.preventDefault();
      } else if (e.code === 'KeyA' && state.cursor !== null) {
        dispatch({ type: tool === 'tent' ? 'primary' : 'secondary', cell: state.cursor });
      } else if (e.code === 'KeyG' && state.cursor !== null) {
        dispatch({ type: tool === 'grass' ? 'primary' : 'secondary', cell: state.cursor });
      } else if (e.code === 'KeyT') {
        dispatch({ type: 'tool', tool: tool === 'grass' ? 'tent' : 'grass' });
      } else if (e.code === 'KeyH') {
        dispatch({ type: 'hint' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [!!game, state.cursor, tool]);

  const levelDesc = LEVELS.find((l) => l.id === pick.level)!.desc;

  return (
    <div className="app">
      <header className="app-header">
        <h1>텐트와 나무</h1>
        <span className="phase-badge">{game ? `${game.size}×${game.size} ${levelLabel(game.level)}` : '문제 고르기'}</span>
        <AppNav current="tents" />
      </header>

      {!game && (
        <>
          <p className="lead">나무마다 상하좌우로 붙은 텐트를 하나씩 짝지어 두세요. 텐트끼리는 대각선까지 닿으면 안 되고, 판 바깥 숫자는 그 행·열의 텐트 수예요.</p>
          <section className="random" aria-label="랜덤 문제">
            <div className="random-row" role="radiogroup" aria-label="판 크기">
              <span className="random-label">크기</span>
              {SIZES.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={pick.size === s} className={pick.size === s ? 'on' : ''} onClick={() => dispatch({ type: 'pick', pick: { ...pick, size: s } })}>
                  {s}×{s}
                </button>
              ))}
            </div>
            <div className="random-row" role="radiogroup" aria-label="난이도">
              <span className="random-label">난이도</span>
              {LEVELS.map((l) => (
                <button key={l.id} type="button" role="radio" aria-checked={pick.level === l.id} className={pick.level === l.id ? 'on' : ''} onClick={() => dispatch({ type: 'pick', pick: { ...pick, level: l.id } })}>
                  {l.label}
                </button>
              ))}
            </div>
            <p className="random-desc">
              {pick.size}×{pick.size} · {levelDesc}. 모든 문제는 답이 하나예요.
            </p>
            <button type="button" className="random-go" onClick={() => startRandom(pick.size, pick.level)} disabled={generating}>
              {generating ? '만드는 중…' : '랜덤 문제 풀기'}
            </button>
          </section>
        </>
      )}

      {message && (
        <div className={`message ${message.tone}`} role="status">
          <span>{message.text}</span>
          <button type="button" className="link" onClick={() => dispatch({ type: 'dismiss' })} aria-label="메시지 닫기">
            ✕
          </button>
        </div>
      )}

      {game && lay && (
        <>
          <div className="board-wrap">
            <TentBoard
              lay={lay}
              state={game.state}
              cursor={state.cursor}
              conflicts={conflicts}
              hint={hint}
              hintLevel={hintLevel}
              tool={tool}
              onPrimary={onPrimary}
              onSecondary={(cell) => dispatch({ type: 'secondary', cell })}
              onPaint={(cells, value, first) => dispatch({ type: 'paint', cells, value, first })}
            />
            <SolvedToast show={solved} text="다 풀었어요! 정답이에요." />
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

          <div className="mode-switch" role="radiogroup" aria-label="누를 때 동작">
            {TOOLS.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={tool === t.id} className={tool === t.id ? 'on' : ''} onClick={() => dispatch({ type: 'tool', tool: t.id })}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="toolbar">
            <button type="button" onClick={() => dispatch({ type: 'undo' })} disabled={!state.history.length}>
              실행 취소
            </button>
            <button type="button" onClick={() => dispatch({ type: 'clear' })} disabled={game.state.every((x) => x === UNKNOWN || x === TREE)}>
              판 비우기
            </button>
            <button type="button" className="primary" onClick={() => dispatch({ type: 'hint' })} disabled={solved}>
              {hint && hintLevel < 3 ? '다음 힌트' : '힌트'}
            </button>
          </div>

          <p className="help">
            {tool === 'grass' ? '눌러서 잔디, 길게 눌러서 텐트.' : '눌러서 텐트, 길게 눌러서 잔디.'} 잔디 모드에서 끌면 여러 칸에 한 번에 잔디를 표시해요.
          </p>

          <div className="footer-row">
            <div className="footer-actions">
              <button type="button" className="link" onClick={() => dispatch({ type: 'quit' })}>
                새 게임
              </button>
              <button type="button" className="link" onClick={() => startRandom(game.size, game.level)} disabled={generating}>
                {generating ? '만드는 중…' : '같은 조건으로 다시'}
              </button>
            </div>
          </div>

          <p className="keys">키보드: 방향키 이동 · Space/Enter 누르기 · A 텐트 · G 잔디 · T 도구 전환 · H 힌트 · Ctrl+Z 실행 취소 · 마우스 오른쪽 버튼은 반대 도구</p>
        </>
      )}
    </div>
  );
}
