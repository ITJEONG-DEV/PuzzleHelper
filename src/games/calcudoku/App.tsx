import './styles.css';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppNav } from '../../shared/AppNav';
import { SolvedToast } from '../../shared/SolvedToast';
import { CalcBoard } from './components/CalcBoard';
import { HintPanel } from './components/HintPanel';
import { type Puzzle, bit, cageText, conflictCells, layoutOf } from './calc/board';
import { applyHint, cageHelp, findHint, placeDigit, workingCandidates, type Hint } from './calc/hints';
import { LEVELS, SIZES, generate, levelLabel, type Generated, type Level, type Size } from './calc/generate';

interface Game {
  puzzle: Puzzle;
  solution: number[];
  values: number[];
  marks: number[];
  size: Size;
  level: Level;
}

interface Pick {
  size: Size;
  level: Level;
}

interface State {
  game: Game | null;
  history: Game[];
  selected: number | null;
  mode: 'value' | 'mark';
  autoClean: boolean;
  hint: Hint | null;
  hintLevel: number;
  message: { tone: 'info' | 'error'; text: string } | null;
  pick: Pick;
}

type Action =
  | { type: 'select'; cell: number }
  | { type: 'move'; dr: number; dc: number }
  | { type: 'step'; delta: number }
  | { type: 'input'; digit: number; asMark?: boolean }
  | { type: 'erase' }
  | { type: 'undo' }
  | { type: 'toggleMode' }
  | { type: 'fillMarks' }
  | { type: 'clearMarks' }
  | { type: 'hint' }
  | { type: 'hintApply' }
  | { type: 'hintClose' }
  | { type: 'random'; result: Generated }
  | { type: 'quit' }
  | { type: 'pick'; pick: Pick }
  | { type: 'autoClean'; on: boolean }
  | { type: 'dismiss' };

const STORAGE_KEY = 'calcudoku-helper:v1';

function loadState(): State {
  const base: State = { game: null, history: [], selected: null, mode: 'value', autoClean: true, hint: null, hintLevel: 0, message: null, pick: { size: 5, level: 'easy' } };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as { game?: Game | null; autoClean?: boolean; pick?: Pick };
    const pick = saved.pick && (SIZES as readonly number[]).includes(saved.pick.size) && LEVELS.some((l) => l.id === saved.pick!.level) ? saved.pick : base.pick;
    const g = saved.game;
    const valid = !!g && g.puzzle?.cages?.length && g.values?.length === g.puzzle.n * g.puzzle.n && g.marks?.length === g.values.length;
    return { ...base, game: valid ? g! : null, selected: valid ? 0 : null, autoClean: saved.autoClean ?? true, pick };
  } catch {
    return base;
  }
}

function commit(state: State, game: Game): State {
  return { ...state, game, history: [...state.history.slice(-199), state.game!], hint: null, hintLevel: 0, message: null };
}

function reducer(state: State, action: Action): State {
  const { game, selected } = state;
  switch (action.type) {
    case 'pick':
      return { ...state, pick: action.pick };
    case 'random': {
      const { puzzle, solution, size, level, approximate } = action.result;
      const zeros = new Array<number>(puzzle.n * puzzle.n).fill(0);
      return {
        ...state,
        game: { puzzle, solution, values: zeros, marks: zeros.slice(), size, level },
        history: [],
        selected: 0,
        hint: null,
        hintLevel: 0,
        message: approximate ? { tone: 'info', text: `${levelLabel(level)} 난이도 문제를 시간 안에 찾지 못해 가장 가까운 난이도의 문제를 냈어요.` } : null,
      };
    }
    case 'quit':
      return { ...state, game: null, history: [], hint: null, hintLevel: 0, message: null };
    case 'autoClean':
      return { ...state, autoClean: action.on };
    case 'dismiss':
      return { ...state, message: null };
    case 'toggleMode':
      return { ...state, mode: state.mode === 'value' ? 'mark' : 'value' };
    case 'hintClose':
      return { ...state, hint: null, hintLevel: 0 };
  }
  if (!game) return state;
  const lay = layoutOf(game.puzzle);
  const { n } = game.puzzle;

  switch (action.type) {
    case 'select':
      return { ...state, selected: action.cell };
    case 'move': {
      const cur = selected ?? 0;
      return { ...state, selected: ((Math.floor(cur / n) + action.dr + n) % n) * n + ((cur % n) + action.dc + n) % n };
    }
    case 'step':
      return { ...state, selected: ((selected ?? -action.delta) + action.delta + n * n) % (n * n) };
    case 'input': {
      if (selected === null || action.digit > n) return state;
      const d = action.digit;
      const asMark = action.asMark ?? state.mode === 'mark';
      if (asMark) {
        if (game.values[selected]) return state;
        const marks = game.marks.slice();
        marks[selected] ^= bit(d);
        return commit(state, { ...game, marks });
      }
      const values = game.values.slice();
      const marks = game.marks.slice();
      if (values[selected] === d) values[selected] = 0;
      else if (state.autoClean) placeDigit(lay, values, marks, selected, d);
      else values[selected] = d;
      return commit(state, { ...game, values, marks });
    }
    case 'erase': {
      if (selected === null) return state;
      if (game.values[selected]) {
        const values = game.values.slice();
        values[selected] = 0;
        return commit(state, { ...game, values });
      }
      if (!game.marks[selected]) return state;
      const marks = game.marks.slice();
      marks[selected] = 0;
      return commit(state, { ...game, marks });
    }
    case 'undo': {
      const prev = state.history[state.history.length - 1];
      if (!prev) return state;
      return { ...state, game: prev, history: state.history.slice(0, -1), hint: null, hintLevel: 0, message: null };
    }
    case 'fillMarks': {
      const computed = workingCandidates(lay, game.values, new Array(game.values.length).fill(0));
      return commit(state, { ...game, marks: game.marks.map((m, i) => (game.values[i] ? m : m || computed[i])) });
    }
    case 'clearMarks':
      return commit(state, { ...game, marks: game.marks.map(() => 0) });
    case 'hint': {
      if (state.hint) return { ...state, hintLevel: Math.min(3, state.hintLevel + 1) };
      const hint = findHint({ lay, values: game.values, marks: game.marks, solution: game.solution });
      if (!hint) return { ...state, message: { tone: 'info', text: '더 드릴 힌트가 없어요. 다 풀었어요.' } };
      return { ...state, hint, hintLevel: 1, message: null };
    }
    case 'hintApply': {
      if (!state.hint) return state;
      const next = applyHint(lay, state.hint, game.values, game.marks);
      const target = state.hint.place?.cell ?? state.hint.clear ?? state.hint.restore?.cell ?? state.hint.eliminate?.[0]?.cell ?? selected;
      return { ...commit(state, { ...game, ...next }), selected: target };
    }
  }
  return state;
}

/** 고른 칸이 든 상자와 그 칸에 가능한 숫자 */
function CageInfo({ game, cell }: { game: Game; cell: number }) {
  const lay = layoutOf(game.puzzle);
  const help = cageHelp(lay, game.values, game.marks, cell);
  if (!help) return null;
  const cage = game.puzzle.cages[help.cage];
  return (
    <section className="combo-info" aria-label="상자 도움말">
      <div className="combo-row">
        <span className="combo-name">상자 {cageText(cage)}</span>
        <span className="combo-list">{cage.cells.length}칸 · 이 칸에 가능한 숫자 {help.digits.join(', ') || '없음'}</span>
      </div>
    </section>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const [generating, setGenerating] = useState(false);
  const worker = useRef<Worker | null>(null);
  const { game, selected, mode, hint, hintLevel, message, pick } = state;
  const lay = useMemo(() => (game ? layoutOf(game.puzzle) : null), [game?.puzzle]);
  const n = game?.puzzle.n ?? 0;

  useEffect(() => () => worker.current?.terminate(), []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ game, autoClean: state.autoClean, pick }));
    } catch {
      /* 저장할 수 없는 환경이면 그냥 넘어간다 */
    }
  }, [game, state.autoClean, pick]);

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
      const w = new Worker(new URL('./calc/generate.worker.ts', import.meta.url), { type: 'module' });
      worker.current = w;
      w.onmessage = (e: MessageEvent<Generated>) => done(e.data);
      w.onerror = () => done(generate(size, level));
      w.postMessage({ size, level });
    } catch {
      // 워커를 못 쓰는 환경이면 화면에서 바로 만든다
      setTimeout(() => done(generate(size, level)), 0);
    }
  };

  const conflicts = useMemo(() => (lay && game ? conflictCells(lay, game.values) : new Set<number>()), [lay, game?.values]);
  const solved = !!game && game.values.every((v, i) => v === game.solution[i]);

  useEffect(() => {
    if (!game) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') return;
      const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
      if (m && !e.ctrlKey && !e.metaKey && !e.altKey) {
        dispatch({ type: 'input', digit: Number(m[1]), asMark: e.shiftKey ? true : undefined });
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        dispatch({ type: 'undo' });
        e.preventDefault();
        return;
      }
      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        dispatch({ type: 'step', delta: e.shiftKey ? -1 : 1 });
        e.preventDefault();
        return;
      }
      const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (e.key in moves) {
        const [dr, dc] = moves[e.key];
        dispatch({ type: 'move', dr, dc });
        e.preventDefault();
      } else if (e.key === 'Backspace' || e.key === 'Delete' || e.code === 'Digit0' || e.code === 'Numpad0') {
        dispatch({ type: 'erase' });
        e.preventDefault();
      } else if (e.code === 'Space' || e.code === 'KeyN') {
        dispatch({ type: 'toggleMode' });
        e.preventDefault();
      } else if (e.code === 'KeyH') {
        dispatch({ type: 'hint' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [!!game]);

  const levelDesc = LEVELS.find((l) => l.id === pick.level)!.desc;

  return (
    <div className="app">
      <header className="app-header">
        <h1>칼큐도쿠</h1>
        <span className="phase-badge">{game ? `${n}×${n} ${levelLabel(game.level)}` : '문제 고르기'}</span>
        <AppNav current="calcudoku" />
      </header>

      {!game && (
        <>
          <p className="lead">
            켄켄과 같은 규칙이에요. 행·열마다 1부터 판 크기까지 숫자를 한 번씩 넣고, 굵은 선으로 묶인 상자의 숫자를 단서의 연산(+ − × ÷)으로 계산하면 단서 숫자가 나와야 해요. −와 ÷는 큰 수에서 작은 수로 계산해요.
          </p>
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
              {pick.size}×{pick.size}: 숫자 1~{pick.size} · {levelDesc}. 모든 문제는 답이 하나예요.
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
            <CalcBoard
              lay={lay}
              values={game.values}
              marks={game.marks}
              selected={selected}
              conflicts={conflicts}
              hint={hint}
              hintLevel={hintLevel}
              onSelect={(cell) => dispatch({ type: 'select', cell })}
            />
            <SolvedToast show={solved} text="다 풀었어요! 정답이에요." />
          </div>

          {hint ? (
            <HintPanel
              hint={hint}
              level={hintLevel}
              onMore={() => dispatch({ type: 'hint' })}
              onApply={() => dispatch({ type: 'hintApply' })}
              onClose={() => dispatch({ type: 'hintClose' })}
            />
          ) : (
            selected !== null && <CageInfo game={game} cell={selected} />
          )}

          {/* 휴대폰 한 화면에 판·입력·힌트가 다 들어오도록 자주 쓰는 것만 한 줄에 모은다 */}
          <div className="controls">
            <div className="mode-switch" role="radiogroup" aria-label="입력 방식">
              <button type="button" role="radio" aria-checked={mode === 'value'} className={mode === 'value' ? 'on' : ''} onClick={() => mode !== 'value' && dispatch({ type: 'toggleMode' })}>
                숫자
              </button>
              <button type="button" role="radio" aria-checked={mode === 'mark'} className={mode === 'mark' ? 'on' : ''} onClick={() => mode !== 'mark' && dispatch({ type: 'toggleMode' })}>
                후보수
              </button>
            </div>
            <button type="button" className="tool" onClick={() => dispatch({ type: 'undo' })} disabled={!state.history.length}>
              실행 취소
            </button>
            <button type="button" className="tool primary" onClick={() => dispatch({ type: 'hint' })} disabled={solved}>
              {hint && hintLevel < 3 ? '다음 힌트' : '힌트'}
            </button>
          </div>

          <div className={`numpad one-row ${mode === 'mark' ? 'mark-mode' : ''}`} style={{ gridTemplateColumns: `repeat(${n + 1}, minmax(0, 1fr))` }}>
            {Array.from({ length: n }, (_, k) => k + 1).map((d) => (
              <button key={d} type="button" className="num" onClick={() => dispatch({ type: 'input', digit: d })}>
                <span className="num-digit">{d}</span>
              </button>
            ))}
            <button type="button" className="num erase" aria-label="지우기" onClick={() => dispatch({ type: 'erase' })}>
              ⌫
            </button>
          </div>

          <div className="toolbar">
            <button type="button" onClick={() => dispatch({ type: 'fillMarks' })}>
              후보 채우기
            </button>
            <button type="button" onClick={() => dispatch({ type: 'clearMarks' })} disabled={!game.marks.some(Boolean)}>
              후보 비우기
            </button>
          </div>

          <div className="footer-row">
            <label className="check">
              <input type="checkbox" checked={state.autoClean} onChange={(e) => dispatch({ type: 'autoClean', on: e.target.checked })} />
              숫자를 넣으면 같은 행·열의 후보에서 자동으로 지우기
            </label>
            <div className="footer-actions">
              <button type="button" className="link" onClick={() => dispatch({ type: 'quit' })}>
                새 게임
              </button>
              <button type="button" className="link" onClick={() => startRandom(game.size, game.level)} disabled={generating}>
                {generating ? '만드는 중…' : '같은 조건으로 다시'}
              </button>
            </div>
          </div>

          <p className="keys">키보드: 숫자 입력 · Shift+숫자 후보 · Space 숫자/후보 전환 · 방향키 이동 · Tab 다음 칸 · Backspace 지우기 · H 힌트 · Ctrl+Z 실행 취소</p>
        </>
      )}
    </div>
  );
}
