import { type CellState, FLAG, HIDDEN, type Field, cellName, isClosed, neighborsOf, openCell } from './board';
import { type Deduction, brokenConstraint, constraintsOf, nextDeduction } from './logic';

export type HintKind = 'wrong-flag' | 'broken' | Deduction['kind'] | 'reveal';

export interface Hint {
  kind: HintKind;
  name: string;
  /** 1단계: 어디를 볼지 / 2단계: 무엇을 찾을지 / 3단계: 칸과 이유 */
  steps: [string, string, string];
  /** 1단계부터 강조할 숫자 칸 */
  focus: number[];
  /** 3단계에서 열 칸 */
  open: number[];
  /** 3단계에서 깃발을 꽂을 칸 */
  flag: number[];
  /** 깃발을 뽑을 칸 */
  unflag?: number;
}

export interface HintInput {
  field: Field;
  state: CellState[];
  total: number;
}

/** 끝 글자 받침에 따라 조사를 고른다. 숫자는 읽는 소리(일·이·삼…)로 본다 */
const DIGIT_BATCHIM: Record<string, boolean> = { '0': true, '1': true, '2': false, '3': true, '4': false, '5': false, '6': true, '7': true, '8': true, '9': false };
const josa = (word: string, a: string, b: string) => {
  const last = word[word.length - 1];
  const code = last.charCodeAt(0) - 0xac00;
  const batchim = last in DIGIT_BATCHIM ? DIGIT_BATCHIM[last] : code >= 0 && code <= 11171 && code % 28 !== 0;
  return word + (batchim ? a : b);
};

/** "3행 4열" / "3행 4열 외 2칸" */
function cellsText(w: number, cells: number[]): string {
  const sorted = cells.slice().sort((a, b) => a - b);
  const first = cellName(w, sorted[0]);
  return sorted.length === 1 ? first : `${first} 외 ${sorted.length - 1}칸`;
}

function numberText(f: Field, i: number) {
  return `${cellName(f.w, i)}의 ${f.num[i]}`;
}

function fromDeduction(input: HintInput, d: Deduction): Hint {
  const { field: f, state } = input;
  const nb = neighborsOf(f.w, f.h);
  const flagsAround = (i: number) => nb[i].filter((j) => state[j] === FLAG).length;
  const hiddenAround = (i: number) => nb[i].filter((j) => isClosed(state[j])).length;
  const result = [d.safe.length ? `${cellsText(f.w, d.safe)}: 안전해요. 열어도 돼요` : '', d.mines.length ? `${cellsText(f.w, d.mines)}: 지뢰예요. 깃발을 꽂으세요` : '']
    .filter(Boolean)
    .join(' / ');
  const base = { focus: d.basis, open: d.safe, flag: d.mines };

  if (d.kind === 'all-safe') {
    const i = d.basis[0];
    return {
      ...base,
      kind: d.kind,
      name: '지뢰를 다 찾은 숫자',
      steps: [
        `${josa(numberText(f, i), '을', '를')} 보세요.`,
        `이 숫자 주변에 깃발이 ${flagsAround(i)}개 있어요. 숫자만큼 지뢰를 이미 다 찾았어요.`,
        `${result}. 남은 닫힌 칸에는 지뢰가 더 없어요.`,
      ],
    };
  }
  if (d.kind === 'all-mine') {
    const i = d.basis[0];
    return {
      ...base,
      kind: d.kind,
      name: '닫힌 칸이 모두 지뢰인 숫자',
      steps: [
        `${josa(numberText(f, i), '을', '를')} 보세요.`,
        `이 숫자 주변의 닫힌 칸 수와 아직 못 찾은 지뢰 수를 비교해 보세요.`,
        `닫힌 칸 ${hiddenAround(i)}개, 남은 지뢰 ${f.num[i] - flagsAround(i)}개로 같아요. ${result}.`,
      ],
    };
  }
  if (d.kind === 'pair') {
    const [a, b] = d.basis;
    const ra = f.num[a] - flagsAround(a);
    const rb = f.num[b] - flagsAround(b);
    return {
      ...base,
      kind: d.kind,
      name: '이웃한 두 숫자',
      steps: [
        `${josa(numberText(f, a), '과', '와')} ${josa(numberText(f, b), '을', '를')} 함께 보세요.`,
        `두 숫자가 함께 닿은 칸(${d.shared?.length ?? 0}칸)에 지뢰가 몇 개까지 들어갈 수 있는지 따져 보세요.`,
        `${josa(cellName(f.w, a), '은', '는')} 남은 지뢰 ${ra}개, ${josa(cellName(f.w, b), '은', '는')} 남은 지뢰 ${rb}개예요. 함께 닿은 칸에 들어갈 수 있는 지뢰 수를 빼고 나면 ${result}.`,
      ],
    };
  }
  const total = input.total - state.filter((s) => s === FLAG).length;
  if (d.kind === 'count' && !d.basis.length) {
    return {
      ...base,
      kind: d.kind,
      name: '남은 지뢰 수',
      steps: [
        '아직 숫자와 닿지 않은 닫힌 칸들을 보세요.',
        `남은 지뢰는 ${total}개예요. 숫자와 닿은 칸에 들어가야 할 지뢰 수와 비교해 보세요.`,
        `${result}.`,
      ],
    };
  }
  return {
    ...base,
    kind: d.kind,
    name: d.kind === 'count' ? '여러 숫자 + 남은 지뢰 수' : '여러 숫자 엮기',
    steps: [
      `강조한 숫자 ${d.basis.length}개를 함께 보세요.`,
      `이 숫자들을 모두 만족하도록 지뢰를 놓는 방법을 하나씩 따져 보세요.${d.kind === 'count' ? ` 남은 지뢰 ${total}개도 맞아야 해요.` : ''}`,
      `가능한 배치는 ${d.cases}가지예요. 어느 배치에서나 ${result}.`,
    ],
  };
}

/** 다음 한 단계를 찾는다. 다 풀었거나 지뢰를 밟았으면 null */
export function findHint(input: HintInput): Hint | null {
  const { field: f, state, total } = input;
  // 잘못 꽂은 깃발
  const wrong = state.findIndex((s, i) => s === FLAG && !f.mine[i]);
  if (wrong >= 0) {
    return {
      kind: 'wrong-flag',
      name: '잘못 꽂은 깃발',
      steps: [`${cellName(f.w, wrong)}의 깃발을 다시 보세요.`, '지뢰가 아닌 칸에 깃발을 꽂았어요.', `${cellName(f.w, wrong)}의 깃발을 뽑으세요. 이 깃발을 두면 주변 숫자를 잘못 읽게 돼요.`],
      focus: [wrong],
      open: [],
      flag: [],
      unflag: wrong,
    };
  }
  const view = { w: f.w, h: f.h, state, num: f.num, total };
  const broken = brokenConstraint(constraintsOf(view));
  if (broken) {
    return {
      kind: 'broken',
      name: '숫자와 맞지 않는 깃발',
      steps: [`${josa(numberText(f, broken.at), '을', '를')} 보세요.`, '주변 깃발 수가 숫자보다 많아요.', '이 숫자 주변 깃발 중 하나를 뽑으세요.'],
      focus: [broken.at],
      open: [],
      flag: [],
    };
  }
  if (state.every((s, i) => f.mine[i] || s === 1)) return null;
  const d = nextDeduction(view, 3);
  if (d) return fromDeduction(input, d);
  // 이 앱의 기법으로 더 정해지지 않을 때: 안전한 칸 하나를 알려준다
  const safe = state.findIndex((s, i) => isClosed(s) && !f.mine[i]);
  if (safe < 0) return null;
  return {
    kind: 'reveal',
    name: '안전한 칸 공개',
    steps: ['여기서부터는 이 앱의 기법으로 더 정해지는 칸이 없어요.', '숫자와 닿은 칸들을 다시 따져 보세요.', `${josa(cellName(f.w, safe), '은', '는')} 안전해요.`],
    focus: [],
    open: [safe],
    flag: [],
  };
}

/** 힌트를 판에 적용한 새 칸 상태 */
export function applyHint(f: Field, hint: Hint, state: CellState[]): CellState[] {
  const s = state.slice();
  if (hint.unflag !== undefined) s[hint.unflag] = HIDDEN;
  for (const i of hint.flag) s[i] = FLAG;
  for (const i of hint.open) openCell(f, s, i);
  return s;
}
