import { type ReactNode, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppNav } from '../../shared/AppNav';
import { SolvedToast } from '../../shared/SolvedToast';
import type { GameId } from '../../shared/catalog';
import { type Grid, bit, has } from './engine';
import { type ExplainRule, type Hint, applyHint, findHint, placeDigit, workingCandidates } from './hints';

/** 라틴 방진 계열 게임(킬러 스도쿠·후토시키·스카이스크래퍼)이 함께 쓰는 화면 */

export interface Generated<P, S extends string | number, L extends string> {
  puzzle: P;
  solution: number[];
  size: S;
  level: L;
  approximate: boolean;
}

export interface BoardProps<G extends Grid> {
  g: G;
  values: number[];
  marks: number[];
  selected: number | null;
  conflicts: Set<number>;
  hint: Hint | null;
  hintLevel: number;
  onSelect: (i: number) => void;
}

export interface LatinGame<P, G extends Grid, S extends string | number, L extends string> {
  id: GameId;
  title: string;
  lead: ReactNode;
  storageKey: string;
  sizes: { id: S; label: string }[];
  levels: { id: L; label: string; desc: string }[];
  defaultPick: { size: S; level: L };
  sizeNote: (s: S) => string;
  gridOf: (p: P) => G;
  makeWorker: () => Worker;
  generate: (size: S, level: L) => Generated<P, S, L>;
  Board: (props: BoardProps<G>) => ReactNode;
  conflicts: (g: G, values: number[]) => Set<number>;
  cageName?: (g: G, k: number) => string;
  explainRule?: ExplainRule;
  /** 고른 칸 아래에 보여 줄 도움말 */
  Info?: (props: { g: G; values: number[]; marks: number[]; cell: number }) => ReactNode;
}

interface Game<P, S, L> {
  puzzle: P;
  solution: number[];
  values: number[];
  marks: number[];
  size: S;
  level: L;
}

interface State<P, S, L> {
  game: Game<P, S, L> | null;
  history: Game<P, S, L>[];
  selected: number | null;
  mode: 'value' | 'mark';
  autoClean: boolean;
  hint: Hint | null;
  hintLevel: number;
  message: { tone: 'info' | 'error'; text: string } | null;
  pick: { size: S; level: L };
}

export function LatinApp<P, G extends Grid, S extends string | number, L extends string>({ game: def }: { game: LatinGame<P, G, S, L> }) {
  type St = State<P, S, L>;
  type Gm = Game<P, S, L>;
  const levelLabel = (l: L) => def.levels.find((x) => x.id === l)?.label ?? '';
  const sizeLabel = (s: S) => def.sizes.find((x) => x.id === s)?.label ?? String(s);

  const load = (): St => {
    const base: St = { game: null, history: [], selected: null, mode: 'value', autoClean: true, hint: null, hintLevel: 0, message: null, pick: def.defaultPick };
    try {
      const raw = localStorage.getItem(def.storageKey);
      if (!raw) return base;
      const saved = JSON.parse(raw) as { game?: Gm | null; autoClean?: boolean; pick?: St['pick'] };
      const pick = saved.pick && def.sizes.some((s) => s.id === saved.pick!.size) && def.levels.some((l) => l.id === saved.pick!.level) ? saved.pick : base.pick;
      const g = saved.game;
      const valid = !!g && Array.isArray(g.values) && g.values.length === g.solution?.length && g.marks?.length === g.values.length;
      return { ...base, game: valid ? g! : null, selected: valid ? 0 : null, autoClean: saved.autoClean ?? true, pick };
    } catch {
      return base;
    }
  };

  const commit = (s: St, game: Gm): St => ({ ...s, game, history: [...s.history.slice(-199), s.game!], hint: null, hintLevel: 0, message: null });

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
    | { type: 'random'; result: Generated<P, S, L> }
    | { type: 'quit' }
    | { type: 'pick'; pick: St['pick'] }
    | { type: 'autoClean'; on: boolean }
    | { type: 'dismiss' };

  const reducer = (state: St, action: Action): St => {
    const { game, selected } = state;
    switch (action.type) {
      case 'pick':
        return { ...state, pick: action.pick };
      case 'random': {
        const { puzzle, solution, size, level, approximate } = action.result;
        // 주어진 숫자는 처음부터 판에 둔다 (고치거나 지울 수 없다)
        const values = def.gridOf(puzzle).givens.slice();
        return {
          ...state,
          game: { puzzle, solution, values, marks: solution.map(() => 0), size, level },
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
    const g = def.gridOf(game.puzzle);
    const { n } = g;
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
        if (g.givens[selected]) return state;
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
        else if (state.autoClean) placeDigit(g, values, marks, selected, d);
        else values[selected] = d;
        return commit(state, { ...game, values, marks });
      }
      case 'erase': {
        if (selected === null || g.givens[selected]) return state;
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
        const computed = workingCandidates(g, game.values, game.values.map(() => 0));
        return commit(state, { ...game, marks: game.marks.map((m, i) => (game.values[i] ? m : m || computed[i])) });
      }
      case 'clearMarks':
        return commit(state, { ...game, marks: game.marks.map(() => 0) });
      case 'hint': {
        if (state.hint) return { ...state, hintLevel: Math.min(3, state.hintLevel + 1) };
        const hint = findHint({
          g,
          values: game.values,
          marks: game.marks,
          solution: game.solution,
          conflicts: def.conflicts(g, game.values),
          cageName: def.cageName ? (k) => def.cageName!(g, k) : undefined,
          explainRule: def.explainRule,
        });
        if (!hint) return { ...state, message: { tone: 'info', text: '더 드릴 힌트가 없어요. 다 풀었어요.' } };
        return { ...state, hint, hintLevel: 1, message: null };
      }
      case 'hintApply': {
        if (!state.hint) return state;
        const next = applyHint(g, state.hint, game.values, game.marks);
        const target = state.hint.place?.cell ?? state.hint.clear ?? state.hint.restore?.cell ?? state.hint.eliminate?.[0]?.cell ?? selected;
        return { ...commit(state, { ...game, ...next }), selected: target };
      }
    }
    return state;
  };

  const [state, dispatch] = useReducer(reducer, undefined, load);
  const [generating, setGenerating] = useState(false);
  const worker = useRef<Worker | null>(null);
  const { game, selected, mode, hint, hintLevel, message, pick } = state;
  const g = useMemo(() => (game ? def.gridOf(game.puzzle) : null), [game?.puzzle]);
  const n = g?.n ?? 0;

  useEffect(() => () => worker.current?.terminate(), []);

  useEffect(() => {
    try {
      localStorage.setItem(def.storageKey, JSON.stringify({ game, autoClean: state.autoClean, pick }));
    } catch {
      /* 저장할 수 없는 환경이면 그냥 넘어간다 */
    }
  }, [game, state.autoClean, pick]);

  const startRandom = (size: S, level: L) => {
    worker.current?.terminate();
    setGenerating(true);
    const done = (result: Generated<P, S, L>) => {
      worker.current?.terminate();
      worker.current = null;
      setGenerating(false);
      dispatch({ type: 'random', result });
    };
    try {
      const w = def.makeWorker();
      worker.current = w;
      w.onmessage = (e: MessageEvent<Generated<P, S, L>>) => done(e.data);
      w.onerror = () => done(def.generate(size, level));
      w.postMessage({ size, level });
    } catch {
      setTimeout(() => done(def.generate(size, level)), 0);
    }
  };

  const shown = useMemo(() => game?.values ?? [], [game?.values]);
  const conflicts = useMemo(() => (g ? def.conflicts(g, shown) : new Set<number>()), [g, shown]);
  const solved = !!game && shown.every((v, i) => v === game.solution[i]);

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

  const levelDesc = def.levels.find((l) => l.id === pick.level)!.desc;
  const { Board, Info } = def;

  return (
    <div className="app">
      <header className="app-header">
        <h1>{def.title}</h1>
        <span className="phase-badge">{game ? `${sizeLabel(game.size)} ${levelLabel(game.level)}` : '문제 고르기'}</span>
        <AppNav current={def.id} />
      </header>

      {!game && (
        <>
          <p className="lead">{def.lead}</p>
          <section className="random" aria-label="랜덤 문제">
            <div className="random-row" role="radiogroup" aria-label="판 크기">
              <span className="random-label">크기</span>
              {def.sizes.map((s) => (
                <button key={String(s.id)} type="button" role="radio" aria-checked={pick.size === s.id} className={pick.size === s.id ? 'on' : ''} onClick={() => dispatch({ type: 'pick', pick: { ...pick, size: s.id } })}>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="random-row" role="radiogroup" aria-label="난이도">
              <span className="random-label">난이도</span>
              {def.levels.map((l) => (
                <button key={l.id} type="button" role="radio" aria-checked={pick.level === l.id} className={pick.level === l.id ? 'on' : ''} onClick={() => dispatch({ type: 'pick', pick: { ...pick, level: l.id } })}>
                  {l.label}
                </button>
              ))}
            </div>
            <p className="random-desc">
              {def.sizeNote(pick.size)} · {levelDesc}. 모든 문제는 답이 하나예요.
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

      {game && g && (
        <>
          <div className="board-wrap">
            <Board g={g} values={shown} marks={game.marks} selected={selected} conflicts={conflicts} hint={hint} hintLevel={hintLevel} onSelect={(cell) => dispatch({ type: 'select', cell })} />
            <SolvedToast show={solved} text="다 풀었어요! 정답이에요." />
          </div>

          {hint ? (
            <HintPanel hint={hint} level={hintLevel} onMore={() => dispatch({ type: 'hint' })} onApply={() => dispatch({ type: 'hintApply' })} onClose={() => dispatch({ type: 'hintClose' })} />
          ) : (
            selected !== null && Info && <Info g={g} values={shown} marks={game.marks} cell={selected} />
          )}

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

          <p className="keys">키보드: 숫자 입력 · Shift+숫자 후보 · Space 숫자/후보 전환 · 방향키 이동 · Tab 다음 칸 · Backspace 지우기 · H 힌트 · Ctrl+Z 실행 취소</p>
        </>
      )}
    </div>
  );
}

const LEVEL_LABEL = ['어디를 볼까', '무엇을 찾을까', '정답과 이유'];

function HintPanel({ hint, level, onMore, onApply, onClose }: { hint: Hint; level: number; onMore: () => void; onApply: () => void; onClose: () => void }) {
  return (
    <section className="hint-panel" aria-live="polite">
      <header>
        <strong>힌트 {level}/3</strong>
        {level >= 2 && <span className="technique">{hint.name}</span>}
      </header>
      <ol>
        {hint.steps.slice(0, level).map((s, k) => (
          <li key={k}>
            <span className="step-label">{LEVEL_LABEL[k]}</span>
            {s}
          </li>
        ))}
      </ol>
      <div className="hint-actions">
        {level < 3 ? (
          <button type="button" className="primary" onClick={onMore}>
            다음 힌트
          </button>
        ) : (
          <button type="button" className="primary" onClick={onApply}>
            판에 적용
          </button>
        )}
        <button type="button" onClick={onClose}>
          닫기
        </button>
      </div>
    </section>
  );
}

/** 값·후보수·힌트 표시를 그리는 칸 내용 (게임 판에서 함께 쓴다) */
export function CellContent({ value, given, marks, n, hint, hintLevel, cell }: { value: number; given: boolean; marks: number; n: number; hint: Hint | null; hintLevel: number; cell: number }) {
  const showFix = hint && hintLevel >= 3;
  let elim = 0;
  if (showFix) for (const e of hint.eliminate ?? []) if (e.cell === cell) elim |= 1 << e.digit;
  const restore = showFix && hint.restore?.cell === cell ? hint.restore.digit : 0;
  const shown = marks | elim | (restore ? 1 << restore : 0);
  if (value) return <span className={`value${given ? ' given' : ''}`}>{value}</span>;
  if (showFix && hint.place?.cell === cell) return <span className="value ghost">{hint.place.digit}</span>;
  if (!shown) return null;
  return (
    <span className="marks" style={{ gridTemplateColumns: `repeat(${n <= 4 ? 2 : 3}, 1fr)` }}>
      {Array.from({ length: n }, (_, k) => k + 1).map((d) => (
        <span key={d} className={['mark', has(elim, d) ? 'elim' : '', d === restore ? 'restore' : ''].join(' ')}>
          {has(shown, d) ? d : ''}
        </span>
      ))}
    </span>
  );
}

/** 칸 강조 class (선택·같은 숫자·충돌·힌트) */
export function cellClasses(i: number, n: number, p: BoardProps<Grid>): string[] {
  const { values, selected, conflicts, hint, hintLevel } = p;
  const sel = selected ?? -1;
  const cls: string[] = [];
  if (i === sel) cls.push('selected');
  else if (sel >= 0 && (Math.floor(i / n) === Math.floor(sel / n) || i % n === sel % n)) cls.push('peer');
  if (values[i] && sel >= 0 && values[i] === values[sel] && i !== sel) cls.push('same');
  if (conflicts.has(i)) cls.push('conflict');
  if (hint && hintLevel >= 1 && hint.focus.includes(i)) cls.push('focus');
  if (hint && hintLevel >= 3 && hint.keyCells.includes(i)) cls.push('key');
  if (hint && hintLevel >= 3 && hint.place?.cell === i) cls.push('place');
  if (hint && hintLevel >= 3 && hint.clear === i) cls.push('clear');
  return cls;
}
