import { type Cell, GRASS, type Layout, TENT, UNKNOWN, cellName, lineName, lineTarget } from './board';
import { type Deduction, broken, nextDeduction } from './logic';

export type HintKind = 'wrong-tent' | 'wrong-grass' | 'broken' | Deduction['kind'] | 'reveal';

export interface Hint {
  kind: HintKind;
  name: string;
  /** 1단계: 어디를 볼지 / 2단계: 무엇을 찾을지 / 3단계: 칸과 이유 */
  steps: [string, string, string];
  focus: number[];
  tents: number[];
  grass: number[];
  clear?: number;
}

const DIGIT_BATCHIM: Record<string, boolean> = { '0': true, '1': true, '2': false, '3': true, '4': false, '5': false, '6': true, '7': true, '8': true, '9': false };
const josa = (word: string, a: string, b: string) => {
  const last = word[word.length - 1];
  const code = last.charCodeAt(0) - 0xac00;
  const batchim = last in DIGIT_BATCHIM ? DIGIT_BATCHIM[last] : code >= 0 && code <= 11171 && code % 28 !== 0;
  return word + (batchim ? a : b);
};

function cellsText(n: number, cells: number[]): string {
  const sorted = cells.slice().sort((a, b) => a - b);
  return sorted.length === 1 ? cellName(n, sorted[0]) : `${cellName(n, sorted[0])} 외 ${sorted.length - 1}칸`;
}

function fromDeduction(lay: Layout, d: Deduction): Hint {
  const { n } = lay.p;
  const result = [d.tents.length ? `${cellsText(n, d.tents)}: 텐트` : '', d.grass.length ? `${cellsText(n, d.grass)}: 잔디` : ''].filter(Boolean).join(' / ');
  const base = { tents: d.tents, grass: d.grass };
  const line = d.line !== undefined ? lay.lines[d.line] : [];
  switch (d.kind) {
    case 'no-tree':
      return {
        ...base,
        kind: d.kind,
        name: '나무와 닿지 않은 칸',
        steps: ['나무 상하좌우에 붙지 않은 칸을 보세요.', '텐트는 짝이 되는 나무의 상하좌우에만 놓을 수 있어요.', `${result}. 나무와 닿지 않은 칸에는 텐트가 올 수 없어요.`],
        focus: d.grass,
      };
    case 'tent-around': {
      const c = d.cell!;
      return {
        ...base,
        kind: d.kind,
        name: '텐트 주변',
        steps: [`${cellName(n, c)}의 텐트를 보세요.`, '텐트끼리는 가로·세로·대각선 어느 쪽으로도 닿을 수 없어요.', `${result}. 텐트 주변 8칸에는 텐트가 올 수 없어요.`],
        focus: [c, ...lay.around[c]],
      };
    }
    case 'line-full':
      return {
        ...base,
        kind: d.kind,
        name: '텐트를 다 놓은 줄',
        steps: [`${josa(lineName(n, d.line!), '을', '를')} 보세요.`, `${lineName(n, d.line!)}의 텐트 수는 ${lineTarget(lay.p, d.line!)}개예요. 지금 놓인 텐트를 세어 보세요.`, `텐트를 이미 다 놓았어요. ${result}.`],
        focus: line,
      };
    case 'line-fill':
      return {
        ...base,
        kind: d.kind,
        name: '남은 칸이 모두 텐트',
        steps: [`${josa(lineName(n, d.line!), '을', '를')} 보세요.`, `${lineName(n, d.line!)}에 남은 빈칸 수와 더 놓아야 할 텐트 수를 비교해 보세요.`, `남은 칸이 필요한 텐트 수와 같아요. ${result}.`],
        focus: line,
      };
    case 'tree-one-spot': {
      const t = d.cell!;
      return {
        ...base,
        kind: d.kind,
        name: '텐트 자리가 하나뿐인 나무',
        steps: [`${cellName(n, t)}의 나무를 보세요.`, '이 나무 상하좌우에서 텐트를 둘 수 있는 칸을 세어 보세요.', `이 나무의 텐트가 갈 수 있는 칸은 하나뿐이에요. ${result}.`],
        focus: [t, ...lay.orth[t]],
      };
    }
    case 'kill': {
      const c = d.cell!;
      return {
        ...base,
        kind: d.kind,
        name: '텐트를 두면 막히는 칸',
        steps: [
          `${josa(cellName(n, c), '을', '를')} 보세요.`,
          '이 칸에 텐트를 둔다고 해 보세요. 주변 칸이 잔디가 되면 텐트 수를 못 맞추는 줄이 생겨요.',
          `${cellName(n, c)}에 텐트를 두면 ${lineName(n, d.line!)}의 텐트 수(${lineTarget(lay.p, d.line!)}개)를 맞출 수 없어요. ${result}.`,
        ],
        focus: [c, ...lay.lines[d.line!]],
      };
    }
    case 'probe': {
      const c = d.cell!;
      const asTent = d.grass.includes(c);
      return {
        ...base,
        kind: d.kind,
        name: '넣어 보고 모순 찾기',
        steps: [
          `${josa(cellName(n, c), '을', '를')} 보세요. 여기서부터는 줄 하나·나무 하나만 봐서는 더 정해지는 칸이 없어요.`,
          `${cellName(n, c)}${asTent ? '에 텐트를 둔다고' : '을 잔디로 둔다고'} 하고 이어서 풀어 보세요.`,
          `어느 줄의 텐트 수를 못 맞추거나, 짝이 없는 나무·텐트가 생겨요. ${result}.`,
        ],
        focus: [c],
      };
    }
  }
}

export interface HintInput {
  lay: Layout;
  state: Cell[];
  /** 텐트 칸 */
  solution: number[];
}

/** 다음 한 단계를 찾는다. 다 풀었으면 null */
export function findHint({ lay, state, solution }: HintInput): Hint | null {
  const { n } = lay.p;
  const sol = new Set(solution);
  const wrongTent = state.findIndex((s, i) => s === TENT && !sol.has(i));
  if (wrongTent >= 0) {
    return {
      kind: 'wrong-tent',
      name: '잘못 둔 텐트',
      steps: [`${josa(cellName(n, wrongTent), '을', '를')} 다시 보세요.`, '텐트가 올 수 없는 칸에 텐트를 두었어요.', `${cellName(n, wrongTent)}의 텐트를 지우세요.`],
      focus: [wrongTent],
      tents: [],
      grass: [],
      clear: wrongTent,
    };
  }
  const wrongGrass = state.findIndex((s, i) => s === GRASS && sol.has(i));
  if (wrongGrass >= 0) {
    return {
      kind: 'wrong-grass',
      name: '잘못 표시한 잔디',
      steps: [`${josa(cellName(n, wrongGrass), '을', '를')} 다시 보세요.`, '텐트가 와야 하는 칸을 잔디로 표시했어요.', `${cellName(n, wrongGrass)}의 표시를 지우세요.`],
      focus: [wrongGrass],
      tents: [],
      grass: [],
      clear: wrongGrass,
    };
  }
  if (solution.every((i) => state[i] === TENT)) return null;
  if (broken(lay, state)) return null;
  const d = nextDeduction(lay, state, 3);
  if (d) return fromDeduction(lay, d);
  const i = solution.find((x) => state[x] !== TENT)!;
  return {
    kind: 'reveal',
    name: '정답 공개',
    steps: ['여기서부터는 이 앱의 기법으로 더 정해지는 칸이 없어요.', '줄 텐트 수와 나무 짝을 함께 다시 따져 보세요.', `${cellName(n, i)}에 텐트가 와요.`],
    focus: [i],
    tents: [i],
    grass: [],
  };
}

/** 힌트를 판에 적용한 새 상태 */
export function applyHint(hint: Hint, state: Cell[]): Cell[] {
  const s = state.slice();
  if (hint.clear !== undefined) s[hint.clear] = UNKNOWN;
  for (const i of hint.tents) s[i] = TENT;
  for (const i of hint.grass) s[i] = GRASS;
  return s;
}
