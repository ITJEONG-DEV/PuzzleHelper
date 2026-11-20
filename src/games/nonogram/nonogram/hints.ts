import { type Cell, EMPTY, FILLED, UNKNOWN, lineDeductions, lineSatisfied } from './line';
import { type LineRef, type Puzzle, allLines, clueOf, formatClue, lineIndices, lineName, width } from './puzzle';
import { findProbe } from './generate';

export type HintKind = 'wrong' | 'contradiction' | 'zero-line' | 'complete-line' | 'overlap' | 'line' | 'probe' | 'reveal';

export interface CellChange {
  cell: number;
  value: Cell;
}

export interface Hint {
  kind: HintKind;
  name: string;
  /** 1단계: 어디를 볼지 / 2단계: 무엇을 찾을지 / 3단계: 칸과 이유 */
  steps: [string, string, string];
  line?: LineRef;
  changes: CellChange[];
}

const posName = (ref: LineRef, i: number) => `${i + 1}${ref.kind === 'row' ? '열' : '행'}`;
const posList = (ref: LineRef, list: number[]) => list.map((i) => posName(ref, i)).join(', ');
const josaEul = (word: string) => {
  const last = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (last >= 0 && last <= 11171 && last % 28 !== 0 ? '을' : '를');
};

function findWrong(p: Puzzle, grid: Cell[], solution: Cell[] | null): Hint | null {
  if (!solution) return null;
  const w = width(p);
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === UNKNOWN || grid[i] === solution[i]) continue;
    const ref: LineRef = { kind: 'row', index: Math.floor(i / w) };
    const where = `${ref.index + 1}행 ${(i % w) + 1}열`;
    const what = grid[i] === FILLED ? '칠하면 안 되는 칸을 칠했어요' : 'X로 표시하면 안 되는 칸에 X를 했어요';
    return {
      kind: 'wrong',
      name: '잘못 표시한 칸',
      steps: [`${josaEul(lineName(ref))} 다시 확인해 보세요. 잘못 표시한 칸이 있어요.`, `${where}: ${what}.`, `${where}을 비우세요. 이 표시를 두고 계속 풀면 뒤에서 모순이 생겨요.`],
      line: ref,
      changes: [{ cell: i, value: UNKNOWN }],
    };
  }
  return null;
}

function findContradiction(p: Puzzle, grid: Cell[]): Hint | null {
  for (const ref of allLines(p)) {
    const idx = lineIndices(p, ref);
    if (lineDeductions(clueOf(p, ref), idx.map((i) => grid[i]))) continue;
    const name = lineName(ref);
    return {
      kind: 'contradiction',
      name: '단서와 맞지 않는 줄',
      steps: [`${josaEul(name)} 다시 확인해 보세요.`, `${name}에 칠한 칸이나 X가 단서(${formatClue(clueOf(p, ref))})와 맞지 않아요.`, `${name}의 표시 중 잘못된 것이 있어요. 단서와 비교해 고치세요.`],
      line: ref,
      changes: [],
    };
  }
  return null;
}

function lineHint(p: Puzzle, grid: Cell[]): Hint | null {
  let best: { ref: LineRef; ded: { index: number; value: Cell }[]; cells: Cell[]; score: number } | null = null;
  for (const ref of allLines(p)) {
    const idx = lineIndices(p, ref);
    const cells = idx.map((i) => grid[i]);
    const ded = lineDeductions(clueOf(p, ref), cells);
    if (!ded || !ded.length) continue;
    // 다 칠한 줄의 나머지 X 정리를 가장 먼저, 그다음 많이 확정되는 줄
    const complete = lineSatisfied(clueOf(p, ref), cells) && ded.every((d) => d.value === EMPTY);
    const score = (complete ? 1000 : 0) + ded.length;
    if (!best || score > best.score) best = { ref, ded, cells, score };
  }
  if (!best) return null;

  const { ref, ded, cells } = best;
  const name = lineName(ref);
  const clue = formatClue(clueOf(p, ref));
  const idx = lineIndices(p, ref);
  const fills = ded.filter((d) => d.value === FILLED).map((d) => d.index);
  const empties = ded.filter((d) => d.value === EMPTY).map((d) => d.index);
  const changes = ded.map((d) => ({ cell: idx[d.index], value: d.value }));
  const list = [fills.length ? `칠할 칸: ${posList(ref, fills)}` : '', empties.length ? `X 칸: ${posList(ref, empties)}` : ''].filter(Boolean).join(' / ');
  const count = [fills.length ? `칠할 칸 ${fills.length}개` : '', empties.length ? `X 칸 ${empties.length}개` : ''].filter(Boolean).join(', ');
  const [first, last] = ref.kind === 'row' ? ['왼쪽', '오른쪽'] : ['위쪽', '아래쪽'];

  if (!clueOf(p, ref).length) {
    return {
      kind: 'zero-line',
      name: '단서 0인 줄',
      steps: [`${josaEul(name)} 보세요.`, `${name}의 단서는 0이에요.`, `${name}에는 칠할 칸이 없어요. 모든 칸을 X로 표시하세요.`],
      line: ref,
      changes,
    };
  }
  if (lineSatisfied(clueOf(p, ref), cells) && !fills.length) {
    return {
      kind: 'complete-line',
      name: '다 칠한 줄 정리',
      steps: [`${josaEul(name)} 보세요.`, `${name}은 단서(${clue})만큼 이미 다 칠했어요.`, `${list}. 단서를 다 채웠으니 남은 칸은 모두 X예요.`],
      line: ref,
      changes,
    };
  }
  if (cells.every((c) => c === UNKNOWN)) {
    return {
      kind: 'overlap',
      name: '겹치기',
      steps: [
        `${josaEul(name)} 보세요.`,
        `${name} 단서(${clue})를 가장 ${first}으로 몰았을 때와 가장 ${last}으로 몰았을 때 겹치는 칸이 있어요. (${count})`,
        `${list}. 블록을 어느 쪽으로 밀어도 이 칸들은 늘 칠해져요.`,
      ],
      line: ref,
      changes,
    };
  }
  return {
    kind: 'line',
    name: '줄 추론',
    steps: [
      `${josaEul(name)} 보세요.`,
      `${name} 단서(${clue})와 지금까지 칠한 칸·X를 함께 보면 확정되는 칸이 있어요. (${count})`,
      `${list}. 단서에 맞는 모든 배치에서 늘 칠해지는 칸은 칠하고, 어떤 배치에서도 칠해지지 않는 칸은 X예요.`,
    ],
    line: ref,
    changes,
  };
}

/** 줄 하나로 막혔을 때: 한 칸을 가정해 모순이 나는 곳을 찾는다 */
function probeHint(p: Puzzle, grid: Cell[]): Hint | null {
  const found = findProbe(p, grid);
  if (!found) return null;
  const w = width(p);
  const { cell, value, assumed } = found;
  const r = Math.floor(cell / w);
  const where = `${r + 1}행 ${(cell % w) + 1}열`;
  const assumedText = assumed === FILLED ? '칠한다' : 'X라';
  return {
    kind: 'probe',
    name: '가정해 보고 모순 찾기',
    steps: [
      `${josaEul(`${r + 1}행`)} 보세요. 여기서부터는 줄 하나만 봐서는 더 정해지는 칸이 없어요.`,
      `${where}을 ${assumedText}고 가정하고 가로·세로 줄 추론을 이어가 보세요. 어느 줄에서 단서와 맞지 않게 돼요.`,
      `${where}을 ${assumedText}고 두면 모순이 생기니, 이 칸은 ${value === FILLED ? '칠하는 칸' : 'X 칸'}이에요.`,
    ],
    line: { kind: 'row', index: r },
    changes: [{ cell, value }],
  };
}

function reveal(p: Puzzle, grid: Cell[], solution: Cell[] | null): Hint | null {
  if (!solution) return null;
  const w = width(p);
  let cell = grid.findIndex((v, i) => v === UNKNOWN && solution[i] === FILLED);
  if (cell < 0) cell = grid.indexOf(UNKNOWN);
  if (cell < 0) return null;
  const where = `${Math.floor(cell / w) + 1}행 ${(cell % w) + 1}열`;
  const value = solution[cell];
  return {
    kind: 'reveal',
    name: '두 줄 이상 함께 따지기',
    steps: [
      '여기서부터는 줄 하나만 봐서는 더 정해지는 칸이 없어요.',
      `${where}을 칠한다고 가정하고 따라가 보세요. 어느 줄에서 모순이 생기면 반대가 답이에요.`,
      `${where}은 ${value === FILLED ? '칠하는 칸' : 'X 칸'}이에요.`,
    ],
    line: { kind: 'row', index: Math.floor(cell / w) },
    changes: [{ cell, value }],
  };
}

/** 다음 한 단계를 찾는다. 다 풀렸으면 null */
export function findHint(p: Puzzle, grid: Cell[], solution: Cell[] | null): Hint | null {
  const wrong = findWrong(p, grid, solution) ?? findContradiction(p, grid);
  if (wrong) return wrong;
  if (!grid.includes(UNKNOWN)) return null;
  return lineHint(p, grid) ?? probeHint(p, grid) ?? reveal(p, grid, solution);
}

export function applyHint(hint: Hint, grid: Cell[]): Cell[] {
  const g = grid.slice();
  for (const { cell, value } of hint.changes) g[cell] = value;
  return g;
}
