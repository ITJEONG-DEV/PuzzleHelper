import './styles.css';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppNav } from '../../shared/AppNav';
import { SolvedToast } from '../../shared/SolvedToast';
import { HintPanel } from './components/HintPanel';
import { MineBoard } from './components/MineBoard';
import { type CellState, FLAG, HIDDEN, OPEN, QUESTION, type Field, exploded, isCleared, isClosed, makeField, neighborsOf, openCell } from './mines/board';
import { applyHint, findHint, type Hint } from './mines/hints';
import { LEVELS, SIZES, generate, levelLabel, sizeOf, type Generated, type Level, type SizeId } from './mines/generate';

interface Game {
  w: number;
  h: number;
  total: number;
  mine: boolean[];
  state: CellState[];
  size: SizeId;
  level: Level;
}

interface Pick {
  size: SizeId;
  level: Level;
}

/** 칸을 눌렀을 때 동작: 열기 · 깃발 · 물음표 */
type Tool = 'open' | 'flag' | 'question';
const TOOLS: { id: Tool; label: string }[] = [
  { id: 'open', label: '열기' },
  { id: 'flag', label: '🚩 깃발' },
  { id: 'question', label: '? 표시' },
];

interface State {
  game: Game | null;
  history: CellState[][];
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
  | { type: 'question'; cell: number }
  | { type: 'cursor'; cell: number }
  | { type: 'move'; dr: number; dc: number }
  | { type: 'tool'; tool: Tool }
  | { type: 'undo' }
  | { type: 'hint' }
  | { type: 'hintApply' }
  | { type: 'hintClose' }
  | { type: 'random'; result: Generated }
  | { type: 'quit' }
  | { type: 'pick'; pick: Pick }
  | { type: 'dismiss' };

const STORAGE_KEY = 'minesweeper-helper:v1';

/** 같은 판의 숫자는 한 번만 센다 */
const fields = new WeakMap<boolean[], Field>();
function fieldOf(g: Game): Field {
  let f = fields.get(g.mine);
  if (!f) {
    f = makeField(g.w, g.h, g.mine);
    fields.set(g.mine, f);
  }
  return f;
}

function loadState(): State {
  const base: State = { game: null, history: [], cursor: null, tool: 'open', hint: null, hintLevel: 0, message: null, pick: { size: 'beginner', level: 'easy' } };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as { game?: Game | null; history?: CellState[][]; pick?: Pick; tool?: Tool };
    const pick = saved.pick && SIZES.some((s) => s.id === saved.pick!.size) && LEVELS.some((l) => l.id === saved.pick!.level) ? saved.pick : base.pick;
    const g = saved.game;
    const valid = g && g.mine?.length === g.w * g.h && g.state?.length === g.mine.length;
    const history = valid && Array.isArray(saved.history) ? saved.history.filter((h) => h?.length === g.mine.length) : [];
    return { ...base, game: valid ? g : null, history, pick, tool: TOOLS.some((t) => t.id === saved.tool) ? saved.tool! : 'open' };
  } catch {
    return base;
  }
}

function withState(s: State, next: CellState[]): State {
  if (!s.game) return s;
  return { ...s, game: { ...s.game, state: next }, history: [...s.history.slice(-299), s.game.state], hint: null, hintLevel: 0, message: null };
}

const BOOM = '지뢰를 밟았어요. 실행 취소를 누르면 밟기 전으로 돌아가요.';

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
      const { mine, w, h, total, start, size, level, approximate } = a.result;
      const f = makeField(w, h, mine);
      const state = new Array<CellState>(w * h).fill(HIDDEN);
      openCell(f, state, start);
      fields.set(mine, f);
      return {
        ...s,
        game: { w, h, total, mine, state, size, level },
        history: [],
        cursor: start,
        hint: null,
        hintLevel: 0,
        message: approximate ? { tone: 'info', text: `${levelLabel(level)} 난이도 판을 시간 안에 찾지 못해 가장 가까운 난이도의 판을 냈어요.` } : null,
      };
    }
  }
  const g = s.game;
  if (!g) return s;
  const f = fieldOf(g);
  const over = exploded(f, g.state) >= 0 || isCleared(f, g.state);

  switch (a.type) {
    case 'cursor':
      return { ...s, cursor: a.cell };
    case 'move': {
      const cur = s.cursor ?? 0;
      const r = (Math.floor(cur / g.w) + a.dr + g.h) % g.h;
      const c = ((cur % g.w) + a.dc + g.w) % g.w;
      return { ...s, cursor: r * g.w + c };
    }
    case 'undo': {
      const prev = s.history[s.history.length - 1];
      if (!prev) return s;
      return { ...s, game: { ...g, state: prev }, history: s.history.slice(0, -1), hint: null, hintLevel: 0, message: null };
    }
    case 'primary':
    case 'secondary': {
      if (over) return { ...s, cursor: a.cell };
      const i = a.cell;
      // 누름은 고른 동작, 길게 누름·오른쪽 버튼은 깃발(깃발 모드일 때는 열기)
      const act: Tool = a.type === 'primary' ? s.tool : s.tool === 'flag' ? 'open' : 'flag';
      const next = g.state.slice();
      if (g.state[i] === OPEN) {
        // 숫자 칸: 주변 깃발이 숫자와 같으면 남은 칸을 한꺼번에 연다
        if (!f.num[i]) return { ...s, cursor: i };
        const nb = neighborsOf(g.w, g.h)[i];
        if (nb.filter((j) => g.state[j] === FLAG).length !== f.num[i]) return { ...s, cursor: i };
        const hidden = nb.filter((j) => isClosed(g.state[j]));
        if (!hidden.length) return { ...s, cursor: i };
        for (const j of hidden) openCell(f, next, j);
      } else if (act === 'flag') {
        next[i] = g.state[i] === FLAG ? HIDDEN : FLAG;
      } else if (act === 'question') {
        next[i] = g.state[i] === QUESTION ? HIDDEN : QUESTION;
      } else {
        if (g.state[i] === FLAG) return { ...s, cursor: i };
        openCell(f, next, i);
      }
      const ns = { ...withState(s, next), cursor: i };
      return ns;
    }
    case 'question': {
      // 키보드 Q: 고른 동작과 상관없이 닫힌 칸에 ?를 달거나 뗀다
      if (over || !isClosed(g.state[a.cell])) return s;
      const next = g.state.slice();
      next[a.cell] = g.state[a.cell] === QUESTION ? HIDDEN : QUESTION;
      return { ...withState(s, next), cursor: a.cell };
    }
    case 'hint': {
      if (exploded(f, g.state) >= 0) return s;
      if (s.hint) return { ...s, hintLevel: Math.min(3, s.hintLevel + 1) };
      const hint = findHint({ field: f, state: g.state, total: g.total });
      if (!hint) return { ...s, message: { tone: 'info', text: '더 드릴 힌트가 없어요. 다 찾았어요.' } };
      return { ...s, hint, hintLevel: 1, message: null };
    }
    case 'hintApply': {
      if (!s.hint) return s;
      const target = s.hint.open[0] ?? s.hint.flag[0] ?? s.hint.unflag ?? s.cursor;
      return { ...withState(s, applyHint(f, s.hint, g.state)), cursor: target };
    }
  }
  return s;
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const [generating, setGenerating] = useState(false);
  const worker = useRef<Worker | null>(null);
  const { game, hint, hintLevel, message, pick, tool } = state;
  const field = useMemo(() => (game ? fieldOf(game) : null), [game?.mine]);

  useEffect(() => () => worker.current?.terminate(), []);

  useEffect(() => {
    try {
      // 새로고침 뒤에도 지뢰를 밟기 전으로 돌아갈 수 있게 최근 기록 몇 개를 함께 둔다
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ game, history: state.history.slice(-30), pick, tool }));
    } catch {
      /* 저장할 수 없는 환경이면 그냥 넘어간다 */
    }
  }, [game, state.history, pick, tool]);

  const startRandom = (size: SizeId, level: Level) => {
    worker.current?.terminate();
    setGenerating(true);
    const done = (result: Generated) => {
      worker.current?.terminate();
      worker.current = null;
      setGenerating(false);
      dispatch({ type: 'random', result });
    };
    try {
      const w = new Worker(new URL('./mines/generate.worker.ts', import.meta.url), { type: 'module' });
      worker.current = w;
      w.onmessage = (e: MessageEvent<Generated>) => done(e.data);
      w.onerror = () => done(generate(size, level));
      w.postMessage({ size, level });
    } catch {
      // 워커를 못 쓰는 환경이면 화면에서 바로 만든다
      setTimeout(() => done(generate(size, level)), 0);
    }
  };

  const boom = !!(game && field && exploded(field, game.state) >= 0);
  const cleared = !!(game && field && isCleared(field, game.state));
  const flags = game ? game.state.filter((x) => x === FLAG).length : 0;

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
      } else if (e.code === 'KeyF' && state.cursor !== null) {
        dispatch({ type: 'secondary', cell: state.cursor });
      } else if (e.code === 'KeyQ' && state.cursor !== null) {
        dispatch({ type: 'question', cell: state.cursor });
      } else if (e.code === 'KeyT') {
        const k = TOOLS.findIndex((x) => x.id === tool);
        dispatch({ type: 'tool', tool: TOOLS[(k + 1) % TOOLS.length].id });
      } else if (e.code === 'KeyH') {
        dispatch({ type: 'hint' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [!!game, state.cursor, tool]);

  const sizeSpec = sizeOf(pick.size);
  const levelDesc = LEVELS.find((l) => l.id === pick.level)!.desc;

  return (
    <div className="app">
      <header className="app-header">
        <h1>지뢰찾기 도우미</h1>
        <span className="phase-badge">{game ? `${sizeOf(game.size).label} ${levelLabel(game.level)}` : '판 고르기'}</span>
        <AppNav current="minesweeper" />
      </header>

      {!game && (
        <>
          <p className="lead">숫자는 주변 8칸에 있는 지뢰 수예요. 지뢰가 아닌 칸을 모두 열면 끝나요. 모든 판은 찍지 않고 논리만으로 끝까지 풀 수 있어요.</p>
          <section className="random" aria-label="새 판">
            <div className="random-row" role="radiogroup" aria-label="판 크기">
              <span className="random-label">크기</span>
              {SIZES.map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={pick.size === s.id} className={pick.size === s.id ? 'on' : ''} onClick={() => dispatch({ type: 'pick', pick: { ...pick, size: s.id } })}>
                  {s.label}
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
              {sizeSpec.label}: {sizeSpec.w}×{sizeSpec.h}, 지뢰 {sizeSpec.mines}개 · {levelDesc}.
            </p>
            <button type="button" className="random-go" onClick={() => startRandom(pick.size, pick.level)} disabled={generating}>
              {generating ? '만드는 중…' : '새 판 시작'}
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

      {game && field && (
        <>
          <div className="mine-status">
            <span>
              남은 지뢰 <strong>{cleared ? 0 : game.total - flags}</strong>
            </span>
          </div>

          <div className="board-wrap">
            <MineBoard
              field={field}
              state={game.state}
              cursor={state.cursor}
              reveal={boom ? 'boom' : cleared ? 'win' : null}
              hint={hint}
              hintLevel={hintLevel}
              onPrimary={(cell) => dispatch({ type: 'primary', cell })}
              onSecondary={(cell) => dispatch({ type: 'secondary', cell })}
            />
            <SolvedToast show={cleared} text={`다 찾았어요! 지뢰 ${game.total}개를 모두 피했어요.`} />
            <SolvedToast show={boom} tone="error" text={BOOM} />
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

          {/* 다른 퍼즐 도우미처럼 판 아래에서 누를 때 동작을 고른다 */}
          <div className="mode-switch tools" role="radiogroup" aria-label="누를 때 동작">
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
            <button type="button" className="primary" onClick={() => dispatch({ type: 'hint' })} disabled={cleared}>
              {hint && hintLevel < 3 ? '다음 힌트' : '힌트'}
            </button>
          </div>

          <p className="help">
            {tool === 'open' ? '눌러서 열기, 길게 눌러서 깃발.' : tool === 'flag' ? '눌러서 깃발, 길게 눌러서 열기.' : '눌러서 ? 표시, 길게 눌러서 깃발.'} 주변의 지뢰를 모두 찾은 숫자를 다시 탭할 경우, 남은 칸을 한번에 열어요.
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

          <p className="keys">키보드: 방향키 이동 · Space/Enter 누르기 · F 깃발 · Q ? 표시 · T 열기/깃발/? 전환 · H 힌트 · Ctrl+Z 실행 취소 · 마우스 오른쪽 버튼은 깃발</p>
        </>
      )}
    </div>
  );
}
