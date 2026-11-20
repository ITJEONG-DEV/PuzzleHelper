import { type Cell, EMPTY, type Layout, STAR, UNKNOWN, cellName, unitInfo, unitName } from './board';
import { type Deduction, broken, nextDeduction } from './logic';

export type HintKind = 'wrong-star' | 'wrong-mark' | 'broken' | Deduction['kind'] | 'reveal';

export interface Hint {
  kind: HintKind;
  name: string;
  /** 1단계: 어디를 볼지 / 2단계: 무엇을 찾을지 / 3단계: 칸과 이유 */
  steps: [string, string, string];
  /** 1단계부터 강조할 칸 */
  focus: number[];
  /** 3단계에서 별을 둘 칸 */
  stars: number[];
  /** 3단계에서 × 표시할 칸 */
  empties: number[];
  /** 지울 칸 */
  clear?: number;
}

/** 끝 글자 받침에 따라 조사를 고른다. 숫자는 읽는 소리로 본다 */
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

const join = (names: string[]) => names.join('·');

function fromDeduction(lay: Layout, d: Deduction): Hint {
  const { n, k } = lay.p;
  const unitCells = (uis: number[]) => [...new Set(uis.flatMap((ui) => lay.units[ui].cells))];
  const names = (uis: number[]) => join(uis.map((ui) => unitName(lay.units[ui])));
  const result = [d.stars.length ? `${cellsText(n, d.stars)}: 별` : '', d.empties.length ? `${cellsText(n, d.empties)}: ×` : ''].filter(Boolean).join(' / ');
  const base = { stars: d.stars, empties: d.empties };
  const kText = k === 1 ? '별 1개' : `별 ${k}개`;

  switch (d.kind) {
    case 'neighbors': {
      const c = d.cell!;
      return {
        ...base,
        kind: d.kind,
        name: '별 주변',
        steps: [`${cellName(n, c)}의 별을 보세요.`, '별끼리는 가로·세로·대각선 어느 쪽으로도 닿을 수 없어요.', `${result}. 별 주변 8칸에는 별이 올 수 없어요.`],
        focus: [c, ...lay.neighbors[c]],
      };
    }
    case 'unit-full': {
      const u = lay.units[d.units[0]];
      return {
        ...base,
        kind: d.kind,
        name: '별을 다 채운 줄·영역',
        steps: [`${josa(unitName(u), '을', '를')} 보세요.`, `${unitName(u)}에는 ${kText}가 들어가야 해요. 지금 몇 개 있는지 세어 보세요.`, `${unitName(u)}에는 이미 ${kText}가 있어요. ${result}.`],
        focus: u.cells,
      };
    }
    case 'unit-fill': {
      const u = lay.units[d.units[0]];
      return {
        ...base,
        kind: d.kind,
        name: '남은 칸이 모두 별',
        steps: [`${josa(unitName(u), '을', '를')} 보세요.`, `${unitName(u)}에 남은 빈칸 수와 더 필요한 별 수를 비교해 보세요.`, `남은 칸이 필요한 별 수와 같아요. ${result}.`],
        focus: u.cells,
      };
    }
    case 'confine':
    case 'pigeonhole': {
      const inside = d.inside ?? [];
      const many = inside.length > 1;
      return {
        ...base,
        kind: d.kind,
        name: many ? '여러 묶음 함께 세기' : '한 줄에 갇힌 별',
        steps: [
          `${josa(names(inside), '과', '와')} ${josa(names(d.units), '을', '를')} 함께 보세요.`,
          `${names(inside)}의 남은 칸이 모두 ${names(d.units)} 안에 있어요.`,
          `${names(inside)}에 들어갈 별이 모두 ${names(d.units)}에 놓이니, ${names(d.units)}의 별은 ${names(inside)}에서 다 나와요. ${result}.`,
        ],
        focus: unitCells([...inside, ...d.units]),
      };
    }
    case 'kill': {
      const c = d.cell!;
      const bad = d.units.length ? lay.units[d.units[0]] : null;
      return {
        ...base,
        kind: d.kind,
        name: '별을 두면 막히는 칸',
        steps: [
          `${josa(cellName(n, c), '을', '를')} 보세요.`,
          `이 칸에 별을 둔다고 해 보세요. 주변 칸이 지워지면 별을 다 못 채우는 줄이나 영역이 생겨요.`,
          bad
            ? `${cellName(n, c)}에 별을 두면 ${unitName(bad)}에 별을 놓을 칸이 모자라요. ${result}.`
            : `${cellName(n, c)}에 별을 두면 다른 별과 닿아요. ${result}.`,
        ],
        focus: bad ? [c, ...bad.cells] : [c],
      };
    }
    case 'probe': {
      const c = d.cell!;
      return {
        ...base,
        kind: d.kind,
        name: '넣어 보고 모순 찾기',
        steps: [
          `${josa(cellName(n, c), '을', '를')} 보세요. 여기서부터는 한두 묶음만 봐서는 더 정해지는 칸이 없어요.`,
          `${cellName(n, c)}에 별을 둔다고 하고 별 주변·다 찬 줄을 이어서 지워 보세요.`,
          `어느 줄이나 영역에 별을 놓을 자리가 없어지는 모순이 생겨요. ${result}.`,
        ],
        focus: [c],
      };
    }
  }
  return { ...base, kind: d.kind, name: '추론', steps: ['판을 보세요.', '정해지는 칸이 있어요.', `${result}.`], focus: [] };
}

export interface HintInput {
  lay: Layout;
  state: Cell[];
  /** 별이 있는 칸 */
  solution: number[];
}

/** 다음 한 단계를 찾는다. 다 풀었으면 null */
export function findHint({ lay, state, solution }: HintInput): Hint | null {
  const { n } = lay.p;
  const sol = new Set(solution);
  const wrongStar = state.findIndex((s, i) => s === STAR && !sol.has(i));
  if (wrongStar >= 0) {
    return {
      kind: 'wrong-star',
      name: '잘못 둔 별',
      steps: [`${josa(cellName(n, wrongStar), '을', '를')} 다시 보세요.`, '별이 올 수 없는 칸에 별을 두었어요.', `${cellName(n, wrongStar)}의 별을 지우세요. 이 별을 두고 계속 풀면 뒤에서 모순이 생겨요.`],
      focus: [wrongStar],
      stars: [],
      empties: [],
      clear: wrongStar,
    };
  }
  const wrongMark = state.findIndex((s, i) => s === EMPTY && sol.has(i));
  if (wrongMark >= 0) {
    return {
      kind: 'wrong-mark',
      name: '잘못 친 ×',
      steps: [`${josa(cellName(n, wrongMark), '을', '를')} 다시 보세요.`, '별이 와야 하는 칸에 ×를 쳤어요.', `${cellName(n, wrongMark)}의 ×를 지우세요.`],
      focus: [wrongMark],
      stars: [],
      empties: [],
      clear: wrongMark,
    };
  }
  if (lay.units.every((u) => unitInfo(u, state).stars === lay.p.k)) return null;
  if (broken(lay, state) >= 0) return null;
  const d = nextDeduction(lay, state, 3);
  if (d) return fromDeduction(lay, d);
  const i = solution.find((x) => state[x] === UNKNOWN);
  if (i === undefined) return null;
  return {
    kind: 'reveal',
    name: '정답 공개',
    steps: ['여기서부터는 이 앱의 기법으로 더 정해지는 칸이 없어요.', '여러 줄과 영역을 함께 다시 따져 보세요.', `${cellName(n, i)}에 별이 와요.`],
    focus: [i],
    stars: [i],
    empties: [],
  };
}

/** 힌트를 판에 적용한 새 상태 */
export function applyHint(hint: Hint, state: Cell[]): Cell[] {
  const s = state.slice();
  if (hint.clear !== undefined) s[hint.clear] = UNKNOWN;
  for (const i of hint.stars) s[i] = STAR;
  for (const i of hint.empties) s[i] = EMPTY;
  return s;
}
