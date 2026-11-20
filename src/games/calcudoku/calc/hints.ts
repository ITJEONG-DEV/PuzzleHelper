import { type Layout, bit, cageText, cellName, conflictCells, digitsOf, has, lineName } from './board';
import { type Deduction, basicCandidates, cageOptions, nextDeduction } from './logic';

export type HintKind = 'conflict' | 'wrong-value' | 'missing-candidate' | Deduction['kind'] | 'reveal';

export interface Hint {
  kind: HintKind;
  name: string;
  /** 1단계: 어디를 볼지 / 2단계: 무엇을 찾을지 / 3단계: 칸과 이유 */
  steps: [string, string, string];
  /** 1단계부터 강조할 칸 */
  focus: number[];
  /** 3단계에서 강조할 근거 칸 */
  keyCells: number[];
  place?: { cell: number; digit: number };
  eliminate?: { cell: number; digit: number }[];
  clear?: number;
  restore?: { cell: number; digit: number };
}

export interface HintInput {
  lay: Layout;
  values: number[];
  /** 사용자가 적은 후보. 0이면 아직 적지 않은 칸 */
  marks: number[];
  solution: number[];
}

/** 끝 글자 받침에 따라 조사를 고른다. 숫자는 읽는 소리로 본다 */
const DIGIT_BATCHIM: Record<string, boolean> = { '0': true, '1': true, '2': false, '3': true, '4': false, '5': false, '6': true, '7': true, '8': true, '9': false };
const josa = (word: string, a: string, b: string) => {
  const base = word.replace(/\([^)]*\)$/, '');
  const last = base[base.length - 1];
  const code = last.charCodeAt(0) - 0xac00;
  const batchim = last in DIGIT_BATCHIM ? DIGIT_BATCHIM[last] : code >= 0 && code <= 11171 && code % 28 !== 0;
  return word + (batchim ? a : b);
};
const eul = (w: string | number) => josa(String(w), '을', '를');
const eun = (w: string | number) => josa(String(w), '은', '는');
const yeyo = (d: number) => josa(String(d), '이에요', '예요');

/** 칸의 지금 후보: 적은 후보가 있으면 그중 가능한 것, 없으면 행·열로 가능한 숫자 */
export function workingCandidates(lay: Layout, values: number[], marks: number[]): number[] {
  const basic = basicCandidates(lay, values);
  return basic.map((b, i) => (values[i] ? b : marks[i] ? marks[i] & b : b));
}

const cageName = (lay: Layout, k: number) => `'${cageText(lay.p.cages[k])}' 상자`;

function fromDeduction(lay: Layout, values: number[], cand: number[], d: Deduction): Hint {
  const { n } = lay.p;
  const elimText = (es: { cell: number; digit: number }[]) => {
    const cells = [...new Set(es.map((e) => e.cell))];
    const ds = [...new Set(es.map((e) => e.digit))].sort();
    return `${cells.length === 1 ? cellName(n, cells[0]) : `${cellName(n, cells[0])} 외 ${cells.length - 1}칸`}에서 후보 ${ds.join(', ')}${josa(String(ds[ds.length - 1]), '을', '를').slice(-1)} 지워요`;
  };
  switch (d.kind) {
    case 'single-cage': {
      const k = d.cage!;
      const { cell, digit } = d.place!;
      return {
        kind: d.kind,
        name: '한 칸 상자',
        steps: [`${eul(cageName(lay, k))} 보세요.`, '칸이 하나뿐인 상자는 단서 숫자가 곧 답이에요.', `${eun(cellName(n, cell))} ${yeyo(digit)}`],
        focus: [cell],
        keyCells: [cell],
        place: d.place,
      };
    }
    case 'naked-single': {
      const { cell, digit } = d.place!;
      return {
        kind: d.kind,
        name: '후보가 하나 남은 칸',
        steps: [`${eul(cellName(n, cell))} 보세요.`, '같은 행·열에 이미 있는 숫자와 상자 계산으로 안 되는 숫자를 빼 보세요.', `남은 후보는 ${digit} 하나라 ${eun(cellName(n, cell))} ${yeyo(digit)}`],
        focus: [cell, ...lay.peers[cell]],
        keyCells: lay.peers[cell].filter((j) => values[j]),
        place: d.place,
      };
    }
    case 'hidden-single': {
      const { cell, digit } = d.place!;
      const line = lay.lines[d.line!];
      return {
        kind: d.kind,
        name: '한 곳에만 갈 수 있는 숫자',
        steps: [`${eul(lineName(n, d.line!))} 보세요.`, `이 줄에서 ${josa(String(digit), '이', '가')} 들어갈 수 있는 칸을 찾아보세요.`, `${lineName(n, d.line!)}에서 ${josa(String(digit), '이', '가')} 갈 수 있는 칸은 ${cellName(n, cell)}뿐이에요.`],
        focus: line,
        keyCells: line.filter((i) => i !== cell && !values[i]),
        place: d.place,
      };
    }
    case 'cage-narrow': {
      const k = d.cage!;
      const cage = lay.p.cages[k];
      return {
        kind: d.kind,
        name: '상자 계산',
        steps: [
          `${eul(cageName(lay, k))} 보세요.`,
          `상자 칸의 후보로 ${cageText(cage)}를 만들 수 있는 조합을 따져 보세요. 같은 행·열의 칸은 같은 숫자를 쓸 수 없어요.`,
          `어떤 조합에도 들어가지 않는 숫자가 있어요. ${elimText(d.eliminate)}.`,
        ],
        focus: cage.cells,
        keyCells: cage.cells,
        eliminate: d.eliminate,
      };
    }
    case 'cage-line': {
      const k = d.cage!;
      const cage = lay.p.cages[k];
      return {
        kind: d.kind,
        name: '상자가 줄에 꼭 넣는 숫자',
        steps: [
          `${josa(cageName(lay, k), '과', '와')} ${eul(lineName(n, d.line!))} 함께 보세요.`,
          `이 상자의 어떤 조합이든 ${lineName(n, d.line!)}에 놓인 칸에 꼭 ${josa(String(d.digit), '이', '가')} 들어가요.`,
          `그래서 ${lineName(n, d.line!)}의 다른 칸에는 ${josa(String(d.digit), '이', '가')} 올 수 없어요. ${elimText(d.eliminate)}.`,
        ],
        focus: [...new Set([...cage.cells, ...lay.lines[d.line!]])],
        keyCells: cage.cells,
        eliminate: d.eliminate,
      };
    }
    case 'naked-pair': {
      const [a, b] = d.cells!;
      const ds = digitsOf(cand[a]);
      return {
        kind: d.kind,
        name: '숫자 쌍',
        steps: [`${eul(lineName(n, d.line!))} 보세요.`, '이 줄에서 두 칸이 같은 숫자 두 개만 후보로 가지고 있어요.', `${cellName(n, a)}·${cellName(n, b)}의 후보는 ${ds.join(', ')}뿐이라 이 숫자들은 두 칸이 나눠 가져요. ${elimText(d.eliminate)}.`],
        focus: lay.lines[d.line!],
        keyCells: [a, b],
        eliminate: d.eliminate,
      };
    }
    case 'probe': {
      const e = d.eliminate[0];
      return {
        kind: d.kind,
        name: '넣어 보고 모순 찾기',
        steps: [
          `${eul(cellName(n, e.cell))} 보세요. 여기서부터는 상자 하나·줄 하나만 봐서는 더 정해지는 칸이 없어요.`,
          `${cellName(n, e.cell)}에 ${eul(e.digit)} 넣는다고 하고 이어서 풀어 보세요.`,
          `어느 줄이나 상자에서 모순이 생겨요. ${cellName(n, e.cell)}의 후보에서 ${eul(e.digit)} 지워요.`,
        ],
        focus: [e.cell],
        keyCells: [e.cell],
        eliminate: d.eliminate,
      };
    }
  }
}

/** 다음 한 단계를 찾는다. 다 풀었으면 null */
export function findHint({ lay, values, marks, solution }: HintInput): Hint | null {
  const { n } = lay.p;
  const conflicts = conflictCells(lay, values);
  if (conflicts.size) {
    const cells = [...conflicts];
    return {
      kind: 'conflict',
      name: '맞지 않는 칸',
      steps: [`${eul(cellName(n, cells[0]))} 다시 보세요.`, '같은 행·열에 같은 숫자가 있거나, 다 채운 상자의 계산이 맞지 않아요.', '빨간 칸 중 잘못 넣은 숫자를 고치세요.'],
      focus: cells,
      keyCells: cells,
    };
  }
  const wrong = values.findIndex((v, i) => v && v !== solution[i]);
  if (wrong >= 0) {
    return {
      kind: 'wrong-value',
      name: '틀린 숫자',
      steps: [`${eul(cellName(n, wrong))} 다시 보세요.`, '지금 넣은 숫자로는 끝까지 풀 수 없어요.', `${cellName(n, wrong)}의 ${eul(values[wrong])} 지우세요.`],
      focus: [wrong],
      keyCells: [wrong],
      clear: wrong,
    };
  }
  if (values.every(Boolean)) return null;
  const missing = values.findIndex((v, i) => !v && marks[i] && !has(marks[i], solution[i]));
  if (missing >= 0) {
    return {
      kind: 'missing-candidate',
      name: '빠진 후보',
      steps: [`${cellName(n, missing)}의 후보를 다시 보세요.`, '적어 둔 후보에 들어가야 할 숫자가 빠져 있어요.', `${cellName(n, missing)}에 후보 ${eul(solution[missing])} 다시 적으세요.`],
      focus: [missing],
      keyCells: [missing],
      restore: { cell: missing, digit: solution[missing] },
    };
  }
  const cand = workingCandidates(lay, values, marks);
  const d = nextDeduction(lay, values, cand, 3);
  if (d) return fromDeduction(lay, values, cand, d);
  const i = values.findIndex((v) => !v);
  return {
    kind: 'reveal',
    name: '정답 공개',
    steps: ['여기서부터는 이 앱의 기법으로 더 정해지는 칸이 없어요.', `${cellName(n, i)}에 숫자를 넣어 보고 따라가 보세요.`, `${eun(cellName(n, i))} ${yeyo(solution[i])}`],
    focus: [i],
    keyCells: [i],
    place: { cell: i, digit: solution[i] },
  };
}

/** 힌트를 판에 적용한 새 상태. 후보를 적지 않은 칸을 지울 때는 계산한 후보를 먼저 적는다 */
export function applyHint(lay: Layout, hint: Hint, values: number[], marks: number[]): { values: number[]; marks: number[] } {
  const v = values.slice();
  const m = marks.slice();
  if (hint.clear !== undefined) v[hint.clear] = 0;
  if (hint.restore) m[hint.restore.cell] |= bit(hint.restore.digit);
  if (hint.eliminate) {
    const computed = workingCandidates(lay, values, marks);
    for (const { cell, digit } of hint.eliminate) {
      if (!m[cell]) m[cell] = computed[cell];
      m[cell] &= ~bit(digit);
    }
  }
  if (hint.place) placeDigit(lay, v, m, hint.place.cell, hint.place.digit);
  return { values: v, marks: m };
}

/** 숫자를 넣고 같은 행·열 칸의 후보에서 그 숫자를 지운다 */
export function placeDigit(lay: Layout, values: number[], marks: number[], cell: number, digit: number) {
  values[cell] = digit;
  marks[cell] = 0;
  for (const j of lay.peers[cell]) marks[j] &= ~bit(digit);
}

/** 고른 칸이 든 상자의 가능한 조합 수와 칸별 숫자 (화면 도움말) */
export function cageHelp(lay: Layout, values: number[], marks: number[], cell: number): { cage: number; digits: number[] } | null {
  const k = lay.cageOf[cell];
  const opt = cageOptions(lay, k, workingCandidates(lay, values, marks));
  if (!opt) return null;
  const x = lay.p.cages[k].cells.indexOf(cell);
  return { cage: k, digits: digitsOf(opt.allowed[x]) };
}
