import { type Deduction, type Grid, basicCandidates, bit, cageHolds, cellName, digitsOf, has, nextDeduction, unitName } from './engine';

export interface Hint {
  kind: string;
  name: string;
  /** 1단계: 어디를 볼지 / 2단계: 무엇을 찾을지 / 3단계: 칸과 이유 */
  steps: [string, string, string];
  focus: number[];
  keyCells: number[];
  place?: { cell: number; digit: number };
  eliminate?: { cell: number; digit: number }[];
  clear?: number;
  restore?: { cell: number; digit: number };
}

/** 게임별 규칙 추론의 설명 (공용 기법이 아닐 때) */
export type ExplainRule = (g: Grid, d: Deduction, values: number[], cand: number[]) => Omit<Hint, 'kind' | 'place' | 'eliminate'> | null;

export interface HintInput {
  g: Grid;
  values: number[];
  marks: number[];
  solution: number[];
  /** 상자 이름 ("'15' 상자") */
  cageName?: (k: number) => string;
  explainRule?: ExplainRule;
  /** 게임 규칙에 어긋난 칸 */
  conflicts: Set<number>;
}

const DIGIT_BATCHIM: Record<string, boolean> = { '0': true, '1': true, '2': false, '3': true, '4': false, '5': false, '6': true, '7': true, '8': true, '9': false };
export const josa = (word: string, a: string, b: string) => {
  const base = word.replace(/\([^)]*\)$/, '').replace(/'$/, '');
  const last = base[base.length - 1];
  const code = last.charCodeAt(0) - 0xac00;
  const batchim = last in DIGIT_BATCHIM ? DIGIT_BATCHIM[last] : code >= 0 && code <= 11171 && code % 28 !== 0;
  return word + (batchim ? a : b);
};
export const eul = (w: string | number) => josa(String(w), '을', '를');
export const eun = (w: string | number) => josa(String(w), '은', '는');
export const ga = (w: string | number) => josa(String(w), '이', '가');
export const yeyo = (d: number) => josa(String(d), '이에요', '예요');

/** 칸의 지금 후보: 적은 후보가 있으면 그중 가능한 것, 없으면 같은 묶음으로 가능한 숫자 */
export function workingCandidates(g: Grid, values: number[], marks: number[]): number[] {
  const basic = basicCandidates(g, values);
  return basic.map((b, i) => (values[i] ? b : marks[i] ? marks[i] & b : b));
}

export function elimText(n: number, es: { cell: number; digit: number }[]) {
  const cells = [...new Set(es.map((e) => e.cell))];
  const ds = [...new Set(es.map((e) => e.digit))].sort((a, b) => a - b);
  const where = cells.length === 1 ? cellName(n, cells[0]) : `${cellName(n, cells[0])} 외 ${cells.length - 1}칸`;
  return `${where}에서 후보 ${eul(ds.join(', '))} 지워요`;
}

function explainCommon(input: HintInput, d: Deduction, cand: number[]): Omit<Hint, 'kind' | 'place' | 'eliminate'> | null {
  const { g, values } = input;
  const { n } = g;
  const cageName = (k: number) => input.cageName?.(k) ?? `${k + 1}번 상자`;
  switch (d.kind) {
    case 'given': {
      const c = d.place!.cell;
      return { name: '주어진 숫자', steps: [`${eul(cellName(n, c))} 보세요.`, '처음부터 주어진 숫자예요.', `${eun(cellName(n, c))} ${yeyo(d.place!.digit)}`], focus: [c], keyCells: [c] };
    }
    case 'single-cage': {
      const c = d.place!.cell;
      return { name: '한 칸 상자', steps: [`${eul(cageName(d.cage!))} 보세요.`, '칸이 하나뿐인 상자는 단서 숫자가 곧 답이에요.', `${eun(cellName(n, c))} ${yeyo(d.place!.digit)}`], focus: [c], keyCells: [c] };
    }
    case 'naked-single': {
      const { cell, digit } = d.place!;
      return {
        name: '후보가 하나 남은 칸',
        steps: [`${eul(cellName(n, cell))} 보세요.`, '같은 행·열(·박스)에 이미 있는 숫자와 단서로 안 되는 숫자를 빼 보세요.', `남은 후보는 ${digit} 하나라 ${eun(cellName(n, cell))} ${yeyo(digit)}`],
        focus: [cell, ...g.peers[cell]],
        keyCells: g.peers[cell].filter((j) => values[j]),
      };
    }
    case 'hidden-single': {
      const { cell, digit } = d.place!;
      const unit = g.units[d.line!];
      return {
        name: '한 곳에만 갈 수 있는 숫자',
        steps: [`${eul(unitName(g, d.line!))} 보세요.`, `여기서 ${ga(digit)} 들어갈 수 있는 칸을 찾아보세요.`, `${unitName(g, d.line!)}에서 ${ga(digit)} 갈 수 있는 칸은 ${cellName(n, cell)}뿐이에요.`],
        focus: unit,
        keyCells: unit.filter((i) => i !== cell && !values[i]),
      };
    }
    case 'cage-narrow': {
      const cage = g.cages[d.cage!];
      return {
        name: '상자 계산',
        steps: [`${eul(cageName(d.cage!))} 보세요.`, '상자 칸의 후보로 단서를 만들 수 있는 조합을 따져 보세요. 같은 상자·줄의 칸은 같은 숫자를 쓸 수 없어요.', `어떤 조합에도 들어가지 않는 숫자가 있어요. ${elimText(n, d.eliminate)}.`],
        focus: cage.cells,
        keyCells: cage.cells,
      };
    }
    case 'cage-line': {
      const cage = g.cages[d.cage!];
      const u = unitName(g, d.line!);
      return {
        name: '상자가 묶음에 꼭 넣는 숫자',
        steps: [`${josa(cageName(d.cage!), '과', '와')} ${eul(u)} 함께 보세요.`, `이 상자의 어떤 조합이든 ${u}에 놓인 칸에 꼭 ${ga(d.digit!)} 들어가요.`, `그래서 ${u}의 다른 칸에는 ${ga(d.digit!)} 올 수 없어요. ${elimText(n, d.eliminate)}.`],
        focus: [...new Set([...cage.cells, ...g.units[d.line!]])],
        keyCells: cage.cells,
      };
    }
    case 'naked-pair': {
      const [a, b] = d.cells!;
      const ds = digitsOf(cand[a]);
      return {
        name: '숫자 쌍',
        steps: [`${eul(unitName(g, d.line!))} 보세요.`, '여기서 두 칸이 같은 숫자 두 개만 후보로 가지고 있어요.', `${cellName(n, a)}·${cellName(n, b)}의 후보는 ${ds.join(', ')}뿐이라 이 숫자들은 두 칸이 나눠 가져요. ${elimText(n, d.eliminate)}.`],
        focus: g.units[d.line!],
        keyCells: [a, b],
      };
    }
    case 'probe': {
      const e = d.eliminate[0];
      return {
        name: '넣어 보고 모순 찾기',
        steps: [
          `${eul(cellName(n, e.cell))} 보세요. 여기서부터는 단서 하나·줄 하나만 봐서는 더 정해지는 칸이 없어요.`,
          `${cellName(n, e.cell)}에 ${eul(e.digit)} 넣는다고 하고 이어서 풀어 보세요.`,
          `어딘가에서 모순이 생겨요. ${cellName(n, e.cell)}의 후보에서 ${eul(e.digit)} 지워요.`,
        ],
        focus: [e.cell],
        keyCells: [e.cell],
      };
    }
  }
  return null;
}

/** 다음 한 단계를 찾는다. 다 풀었으면 null */
export function findHint(input: HintInput): Hint | null {
  const { g, values, marks, solution } = input;
  const { n } = g;
  if (input.conflicts.size) {
    const cells = [...input.conflicts];
    return {
      kind: 'conflict',
      name: '맞지 않는 칸',
      steps: [`${eul(cellName(n, cells[0]))} 다시 보세요.`, '같은 줄·박스에 같은 숫자가 있거나, 단서와 맞지 않는 칸이 있어요.', '빨간 칸 중 잘못 넣은 숫자를 고치세요.'],
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
  const cand = workingCandidates(g, values, marks);
  const d = nextDeduction(g, values, cand, 3);
  if (d) {
    const cell = d.place?.cell ?? d.eliminate[0]?.cell ?? 0;
    // 설명이 따로 없는 기법이라도 정해지는 칸과 결과는 알려 준다
    const ex = explainCommon(input, d, cand) ??
      input.explainRule?.(g, d, values, cand) ?? {
        name: '정해지는 칸',
        steps: [`${eul(cellName(n, cell))} 보세요.`, '이 칸에서 정해지는 것이 있어요.', d.place ? `${eun(cellName(n, cell))} ${yeyo(d.place.digit)}` : `${elimText(n, d.eliminate)}.`],
        focus: [cell],
        keyCells: [cell],
      };
    return { ...ex, kind: d.kind, place: d.place, eliminate: d.eliminate.length ? d.eliminate : undefined };
  }
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

/** 숫자를 넣고 같은 묶음 칸의 후보에서 그 숫자를 지운다 */
export function placeDigit(g: Grid, values: number[], marks: number[], cell: number, digit: number) {
  values[cell] = digit;
  marks[cell] = 0;
  for (const j of g.peers[cell]) marks[j] &= ~bit(digit);
}

/** 힌트를 판에 적용한 새 상태. 후보를 적지 않은 칸을 지울 때는 계산한 후보를 먼저 적는다 */
export function applyHint(g: Grid, hint: Hint, values: number[], marks: number[]): { values: number[]; marks: number[] } {
  const v = values.slice();
  const m = marks.slice();
  if (hint.clear !== undefined) v[hint.clear] = 0;
  if (hint.restore) m[hint.restore.cell] |= bit(hint.restore.digit);
  if (hint.eliminate) {
    const computed = workingCandidates(g, values, marks);
    for (const { cell, digit } of hint.eliminate) {
      if (!m[cell]) m[cell] = computed[cell];
      m[cell] &= ~bit(digit);
    }
  }
  if (hint.place) placeDigit(g, v, m, hint.place.cell, hint.place.digit);
  return { values: v, marks: m };
}

/** 같은 묶음의 같은 숫자, 다 채운 상자의 틀린 계산 */
export function baseConflicts(g: Grid, values: number[]): Set<number> {
  const out = new Set<number>();
  for (const u of g.units) for (const i of u) if (values[i] && u.some((j) => j !== i && values[j] === values[i])) out.add(i);
  for (const c of g.cages) {
    const ds = c.cells.map((i) => values[i]);
    if (ds.every(Boolean) && (!cageHolds(c, ds) || (g.cageAllDistinct && new Set(ds).size !== ds.length))) for (const i of c.cells) out.add(i);
  }
  return out;
}
