import './styles.css';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppNav } from '../../shared/AppNav';
import { SolvedToast } from '../../shared/SolvedToast';
import { Board } from './components/Board';
import { HintPanel } from './components/HintPanel';
import { type Layout, type Puzzle, bit, combosWith, comboText, computeCandidates, conflictCells, layoutOf, placedOf, runName } from './kakuro/board';
import { applyHint, findHint, placeDigit, type Hint } from './kakuro/hints';
import { LEVELS, SIZES, generate, levelLabel, type Generated, type Level, type Size } from './kakuro/generate';

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
  | { type: 'message'; tone: 'info' | 'error'; text: string }
  | { type: 'dismiss' };

const STORAGE_KEY = 'kakuro-helper:v1';

/** 같은 문제의 줄 정보는 한 번만 만든다 */
const layouts = new WeakMap<Puzzle, Layout>();
function layoutFor(p: Puzzle): Layout {
  let lay = layouts.get(p);
  if (!lay) {
    lay = layoutOf(p);
    layouts.set(p, lay);
  }
  return lay;
}

const firstWhite = (p: Puzzle) => p.white.indexOf(true);

function loadState(): State {
  const base: State = {
    game: null,
    history: [],
    selected: null,
    mode: 'value',
    autoClean: true,
    hint: null,
    hintLevel: 0,
    message: null,
    pick: { size: 8, level: 'easy' },
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as { game?: Game | null; autoClean?: boolean; pick?: Pick };
    const pick =
      saved.pick && (SIZES as readonly number[]).includes(saved.pick.size) && LEVELS.some((l) => l.id === saved.pick!.level) ? saved.pick : base.pick;
    const g = saved.game;
    const valid = g && g.puzzle && g.values?.length === g.puzzle.w * g.puzzle.h && g.marks?.length === g.values.length && g.solution?.length === g.values.length;
    return { ...base, game: valid ? g : null, selected: valid ? firstWhite(g.puzzle) : null, autoClean: saved.autoClean ?? true, pick };
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
      const zeros = puzzle.white.map(() => 0);
      const next: Game = { puzzle, solution, values: zeros, marks: zeros.slice(), size, level };
      const msg = approximate ? `${levelLabel(level)} 난이도 문제를 시간 안에 찾지 못해 가장 가까운 난이도의 문제를 냈어요.` : null;
      return {
        ...state,
        game: next,
        history: [],
        selected: firstWhite(puzzle),
        hint: null,
        hintLevel: 0,
        message: msg ? { tone: 'info', text: msg } : null,
      };
    }
    case 'quit':
      return { ...state, game: null, history: [], hint: null, hintLevel: 0, message: null };
    case 'autoClean':
      return { ...state, autoClean: action.on };
    case 'message':
      return { ...state, message: { tone: action.tone, text: action.text } };
    case 'dismiss':
      return { ...state, message: null };
    case 'toggleMode':
      return { ...state, mode: state.mode === 'value' ? 'mark' : 'value' };
    case 'hintClose':
      return { ...state, hint: null, hintLevel: 0 };
  }
  if (!game) return state;
  const lay = layoutFor(game.puzzle);
  const { w, h, white } = game.puzzle;

  switch (action.type) {
    case 'select':
      return white[action.cell] ? { ...state, selected: action.cell } : state;
    case 'move': {
      // 검은 칸은 건너뛰고 그 방향의 다음 흰 칸으로 간다
      let r = Math.floor((selected ?? 0) / w);
      let c = (selected ?? 0) % w;
      for (let k = 0; k < Math.max(w, h); k++) {
        r = (r + action.dr + h) % h;
        c = (c + action.dc + w) % w;
        if (white[r * w + c]) return { ...state, selected: r * w + c };
      }
      return state;
    }
    case 'step': {
      const n = white.length;
      let i = selected ?? -1;
      for (let k = 0; k < n; k++) {
        i = (i + action.delta + n) % n;
        if (white[i]) return { ...state, selected: i };
      }
      return state;
    }
    case 'input': {
      if (selected === null || !white[selected]) return state;
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
      if (selected === null || !white[selected]) return state;
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
      const computed = computeCandidates(lay, game.values);
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

/** 고른 칸이 지나는 가로·세로 줄의 조합 */
function ComboInfo({ lay, values, cell }: { lay: Layout; values: number[]; cell: number }) {
  const runs = lay.cellRuns[cell].filter((k) => k >= 0).map((k) => lay.runs[k]);
  return (
    <section className="combo-info" aria-label="조합 도움말">
      {runs.map((run) => {
        const pl = placedOf(run, values);
        const combos = combosWith(run, pl.mask);
        return (
          <div key={`${run.dir}${run.head}`} className="combo-row">
            <span className="combo-name">{runName(run)}</span>
            <span className="combo-list">
              {combos.length ? combos.slice(0, 8).map(comboText).join(' · ') + (combos.length > 8 ? ` 외 ${combos.length - 8}개` : '') : '맞는 조합 없음'}
            </span>
          </div>
        );
      })}
    </section>
  );
}

const SIZE_NOTE: Record<Size, string> = {
  6: '6×6: 입문, 몇 분이면 끝나요',
  8: '8×8: 기본 크기',
  10: '10×10: 넉넉한 한 판',
  12: '12×12: 긴 한 판. 휴대폰에서는 칸이 작아요',
};

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const [generating, setGenerating] = useState(false);
  const worker = useRef<Worker | null>(null);
  const { game, selected, mode, hint, hintLevel, message, pick } = state;
  const lay = useMemo(() => (game ? layoutFor(game.puzzle) : null), [game?.puzzle]);

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
      const w = new Worker(new URL('./kakuro/generate.worker.ts', import.meta.url), { type: 'module' });
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
  const solved = !!game && game.puzzle.white.every((w, i) => !w || game.values[i] === game.solution[i]);

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
        // 한글 입력 상태에서는 e.key가 'ㅜ'·'Process'가 되므로 물리 키(e.code)로 본다
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
        <h1>가쿠로 도우미</h1>
        <span className={`phase-badge ${game ? 'solve' : 'setup'}`}>{game ? `푸는 중 · ${game.size}×${game.size} ${levelLabel(game.level)}` : '문제 고르기'}</span>
        <AppNav current="kakuro" />
      </header>

      {!game && (
        <>
          <p className="lead">
            가로·세로로 이어진 흰 칸에 1~9를 넣어 단서의 합을 맞추는 퍼즐이에요. 한 줄 안에는 같은 숫자를 두 번 쓸 수 없어요. 단서는 검은 칸의 대각선 위쪽이 오른쪽으로 이어진 칸의 합, 아래쪽이 아래로 이어진 칸의 합이에요.
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
              {SIZE_NOTE[pick.size]} · {levelDesc}. 모든 문제는 답이 하나예요.
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
            <Board
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
            selected !== null && game.puzzle.white[selected] && <ComboInfo lay={lay} values={game.values} cell={selected} />
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

          <div className={`numpad one-row ${mode === 'mark' ? 'mark-mode' : ''}`}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
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
              숫자를 넣으면 같은 줄의 후보에서 자동으로 지우기
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

          <p className="keys">키보드: 1~9 입력 · Shift+숫자 후보 · Space 숫자/후보 전환 · 방향키 이동 · Tab 다음 칸 · Shift+Tab 이전 칸 · Backspace 지우기 · H 힌트 · Ctrl+Z 실행 취소</p>
        </>
      )}
    </div>
  );
}
