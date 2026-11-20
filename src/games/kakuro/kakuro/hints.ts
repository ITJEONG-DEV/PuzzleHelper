import {
  type Layout,
  type Run,
  bit,
  cellName,
  combosWith,
  comboText,
  computeCandidates,
  digitList,
  digitsOf,
  has,
  josa,
  onlyDigit,
  placedOf,
  popcount,
  runAllowed,
  runName,
} from './board';
import { propagate, runFeasible } from './solver';

export type HintKind =
  | 'conflict'
  | 'wrong-value'
  | 'missing-candidate'
  | 'last-cell'
  | 'single'
  | 'naked-single'
  | 'run-hidden'
  | 'combo-narrow'
  | 'naked-subset'
  | 'matching'
  | 'probe'
  | 'reveal';

export interface Elimination {
  cell: number;
  digit: number;
}

export interface Hint {
  kind: HintKind;
  /** 기법 이름 (2단계부터 보여준다) */
  name: string;
  /** 1단계: 어디를 볼지 / 2단계: 무엇을 찾을지 / 3단계: 칸과 이유 */
  steps: [string, string, string];
  /** 1단계부터 강조할 칸 */
  focus: number[];
  /** 3단계에서 강조할 근거 칸 */
  keyCells: number[];
  place?: { cell: number; digit: number };
  eliminate?: Elimination[];
  /** 지워야 할 잘못된 숫자 */
  clear?: number;
  /** 다시 적어야 할 후보 */
  restore?: { cell: number; digit: number };
}

export interface HintInput {
  lay: Layout;
  values: number[];
  /** 사용자가 적은 후보. 0이면 그 칸은 아직 후보를 적지 않은 것으로 본다 */
  marks: number[];
  solution: number[] | null;
  /** 이 단계(1~5)보다 어려운 기법은 쓰지 않는다. 문제 만들 때 쓴다 */
  maxTier?: number;
}

/** 빈칸의 현재 후보: 적은 후보가 있으면 그중 조합으로 가능한 것, 없으면 조합으로 가능한 숫자 전부 */
export function workingCandidates(lay: Layout, values: number[], marks: number[]): number[] {
  const basic = computeCandidates(lay, values);
  return basic.map((b, i) => (marks[i] ? marks[i] & b : b));
}

const runsOfCell = (lay: Layout, i: number) => lay.cellRuns[i].filter((k) => k >= 0).map((k) => lay.runs[k]);
const runsCells = (runs: Run[]) => [...new Set(runs.flatMap((r) => r.cells))];
const eul = (w: string) => josa(w, '을', '를');
const eun = (w: string) => josa(w, '은', '는');
const ga = (d: number) => josa(String(d), '이', '가');
const yeyo = (d: number) => josa(String(d), '이에요', '예요');

/** 같은 줄 중복, 합이 맞지 않는 줄 */
function findConflict(lay: Layout, values: number[]): Hint | null {
  for (const run of lay.runs) {
    const pl = placedOf(run, values);
    const name = runName(run);
    if (pl.dup) {
      const dupCells = run.cells.filter((i) => values[i] && run.cells.some((j) => j !== i && values[j] === values[i]));
      return {
        kind: 'conflict',
        name: '같은 줄에 같은 숫자',
        steps: [`${eul(name)} 다시 보세요.`, '한 줄 안에는 같은 숫자를 두 번 넣을 수 없어요.', `${dupCells.map((i) => cellName(lay.p, i)).join(', ')}에 같은 숫자 ${ga(values[dupCells[0]])} 있어요. 하나를 고치세요.`],
        focus: run.cells,
        keyCells: dupCells,
      };
    }
    const over = pl.empty.length === 0 ? pl.sum !== run.sum : pl.sum >= run.sum;
    if (over) {
      const filled = pl.empty.length === 0;
      return {
        kind: 'conflict',
        name: '합이 맞지 않는 줄',
        steps: [
          `${eul(name)} 다시 보세요.`,
          filled ? `이 줄의 숫자를 모두 더하면 ${pl.sum}이라 합 ${run.sum}과 달라요.` : `넣은 숫자의 합이 벌써 ${pl.sum}이라, 남은 칸을 채우면 합 ${run.sum}을 넘어요.`,
          '이 줄에 넣은 숫자 중 틀린 것이 있어요. 합과 비교해 고치세요.',
        ],
        focus: run.cells,
        keyCells: run.cells.filter((i) => values[i]),
      };
    }
  }
  return null;
}

function findWrongValue({ lay, values, solution }: HintInput): Hint | null {
  if (!solution) return null;
  const i = values.findIndex((v, k) => v && v !== solution[k]);
  if (i < 0) return null;
  return {
    kind: 'wrong-value',
    name: '틀린 숫자',
    steps: [`${cellName(lay.p, i)}을 다시 보세요.`, '지금 넣은 숫자로는 끝까지 풀 수 없어요.', `${cellName(lay.p, i)}의 ${eul(String(values[i]))} 지우세요. 이 숫자를 두고 계속 풀면 뒤에서 모순이 생겨요.`],
    focus: [i],
    keyCells: [i],
    clear: i,
  };
}

function findMissingCandidate({ lay, values, marks, solution }: HintInput): Hint | null {
  if (!solution) return null;
  const i = values.findIndex((v, k) => lay.p.white[k] && !v && marks[k] && !has(marks[k], solution[k]));
  if (i < 0) return null;
  const d = solution[i];
  return {
    kind: 'missing-candidate',
    name: '빠진 후보',
    steps: [`${cellName(lay.p, i)}의 후보를 다시 보세요.`, '적어 둔 후보에 들어가야 할 숫자가 빠져 있어요.', `${cellName(lay.p, i)}에 후보 ${eul(String(d))} 다시 적으세요.`],
    focus: [i],
    keyCells: [i],
    restore: { cell: i, digit: d },
  };
}

/** 빈칸이 하나 남은 줄: 합에서 넣은 숫자를 빼면 답 */
function findLastCell(lay: Layout, values: number[]): Hint | null {
  for (const run of lay.runs) {
    const pl = placedOf(run, values);
    if (pl.empty.length !== 1 || pl.dup) continue;
    const d = run.sum - pl.sum;
    if (d < 1 || d > 9 || has(pl.mask, d)) continue;
    const i = pl.empty[0];
    const name = runName(run);
    const parts = run.cells.filter((k) => values[k]).map((k) => values[k]);
    return {
      kind: 'last-cell',
      name: '마지막 한 칸',
      steps: [`${eul(name)} 보세요.`, '이 줄에 빈칸이 하나만 남았어요.', `${run.sum} − (${parts.join('+')}) = ${d}. ${eun(cellName(lay.p, i))} ${yeyo(d)}.`],
      focus: run.cells,
      keyCells: run.cells.filter((k) => values[k]),
      place: { cell: i, digit: d },
    };
  }
  return null;
}

/** 줄의 조합으로 가능한 숫자 설명: "합 16(2칸) = 7+9" */
function allowedText(run: Run, values: number[]): string {
  const pl = placedOf(run, values);
  const combos = combosWith(run, pl.mask);
  const shown = combos.slice(0, 4).map(comboText).join(', ') + (combos.length > 4 ? ` 외 ${combos.length - 4}개` : '');
  return `${runName(run)}의 조합 ${shown} → 빈칸에 가능한 숫자 ${digitList(runAllowed(run, values))}`;
}

/** 후보가 하나뿐인 칸. 가로·세로 조합이 겹치는 숫자가 하나면 조합으로 설명한다 */
function findSingle(lay: Layout, values: number[], basic: number[], cand: number[]): Hint | null {
  for (let i = 0; i < cand.length; i++) {
    if (values[i] || popcount(basic[i]) !== 1) continue;
    const d = onlyDigit(basic[i]);
    const runs = runsOfCell(lay, i);
    return {
      kind: 'single',
      name: '가로·세로 조합 겹치기',
      steps: [
        `${eul(cellName(lay.p, i))} 지나는 가로·세로 줄을 보세요.`,
        '가로 줄과 세로 줄의 조합에 함께 들어 있는 숫자를 찾아보세요.',
        `${runs.map((r) => allowedText(r, values)).join(' / ')}. 둘 다 되는 숫자는 ${d} 하나라 ${eun(cellName(lay.p, i))} ${yeyo(d)}.`,
      ],
      focus: runsCells(runs),
      keyCells: [i],
      place: { cell: i, digit: d },
    };
  }
  for (let i = 0; i < cand.length; i++) {
    if (values[i] || !lay.p.white[i] || popcount(cand[i]) !== 1) continue;
    const d = onlyDigit(cand[i]);
    return {
      kind: 'naked-single',
      name: '후보가 하나 남은 칸',
      steps: [`${eul(cellName(lay.p, i))} 보세요.`, '이 칸에 남은 후보를 세어 보세요.', `${cellName(lay.p, i)}에 남은 후보는 ${d} 하나예요.`],
      focus: [i],
      keyCells: [i],
      place: { cell: i, digit: d },
    };
  }
  return null;
}

/** 지금 후보로 만들 수 있는 조합: 칸마다 조합 숫자가 하나는 있고, 조합 숫자마다 들어갈 칸이 있는 것 */
function possibleCombos(run: Run, values: number[], cand: number[]): { combos: number[]; placed: number; empty: number[] } {
  const pl = placedOf(run, values);
  let union = 0;
  for (const i of pl.empty) union |= cand[i];
  const combos = combosWith(run, pl.mask).filter((c) => {
    const rest = c & ~pl.mask;
    return (rest & union) === rest && pl.empty.every((i) => cand[i] & rest);
  });
  return { combos, placed: pl.mask, empty: pl.empty };
}

/** 줄의 모든 조합에 든 숫자가 들어갈 칸이 하나뿐 */
function findRunHidden(lay: Layout, values: number[], cand: number[]): Hint | null {
  for (const run of lay.runs) {
    const { combos, placed, empty } = possibleCombos(run, values, cand);
    if (!combos.length || !empty.length) continue;
    let must = combos.reduce((a, c) => a & c, ~0) & ~placed;
    for (; must; must &= must - 1) {
      const d = onlyDigit(must & -must);
      const spots = empty.filter((i) => has(cand[i], d));
      if (spots.length !== 1) continue;
      const i = spots[0];
      if (popcount(cand[i]) === 1) continue;
      const name = runName(run);
      return {
        kind: 'run-hidden',
        name: '꼭 들어갈 숫자',
        steps: [
          `${eul(name)} 보세요.`,
          `이 줄을 만들 수 있는 조합에 모두 들어 있는 숫자가 있어요. 그 숫자가 갈 수 있는 칸을 찾아보세요.`,
          `지금 후보로 가능한 조합은 ${josa(combos.map(comboText).join(', '), '이고', '고')}, 모두 ${eul(String(d))} 포함해요. 이 줄에서 ${ga(d)} 들어갈 수 있는 칸은 ${cellName(lay.p, i)}뿐이에요.`,
        ],
        focus: run.cells,
        keyCells: empty.filter((k) => k !== i),
        place: { cell: i, digit: d },
      };
    }
  }
  return null;
}

/** 지금 후보로 만들 수 없는 조합을 빼면 줄에서 빠지는 숫자 */
function findComboNarrow(lay: Layout, values: number[], cand: number[]): Hint | null {
  for (const run of lay.runs) {
    const { combos, placed, empty } = possibleCombos(run, values, cand);
    if (!empty.length || !combos.length) continue;
    let allowed = 0;
    for (const c of combos) allowed |= c;
    allowed &= ~placed;
    const elim: { cell: number; digit: number }[] = [];
    for (const i of empty) for (const d of digitsOf(cand[i] & ~allowed)) elim.push({ cell: i, digit: d });
    if (!elim.length) continue;
    const all = combosWith(run, placed);
    const dropped = all.filter((c) => !combos.includes(c));
    const name = runName(run);
    const out = digitList(elim.reduce((m, e) => m | bit(e.digit), 0));
    return {
      kind: 'combo-narrow',
      name: '조합 좁히기',
      steps: [
        `${eul(name)} 보세요.`,
        '이 줄의 조합 중 지금 후보로는 만들 수 없는 조합이 있어요.',
        `${eun(dropped.map(comboText).join(', '))} 칸 후보와 맞지 않아 빠지고 ${combos.map(comboText).join(', ')}만 남아요. 그래서 이 줄의 빈칸에서 ${eul(out)} 지워요.`,
      ],
      focus: run.cells,
      keyCells: empty.filter((i) => !elim.some((e) => e.cell === i)),
      eliminate: elim,
    };
  }
  return null;
}

const subsetWord = (n: number) => (n === 2 ? '쌍' : '세 쌍');

/** 줄 안에서 n칸이 같은 n개 숫자만 후보로 가지면, 그 숫자는 다른 칸에서 빠진다 */
function findNakedSubset(lay: Layout, values: number[], cand: number[]): Hint | null {
  for (const n of [2, 3]) {
    for (const run of lay.runs) {
      const empty = run.cells.filter((i) => !values[i]);
      if (empty.length <= n) continue;
      const pick = (start: number, acc: number[]): Hint | null => {
        if (acc.length === n) {
          const union = acc.reduce((m, i) => m | cand[i], 0);
          if (popcount(union) !== n) return null;
          const elim = empty.filter((i) => !acc.includes(i)).flatMap((i) => digitsOf(cand[i] & union).map((d) => ({ cell: i, digit: d })));
          if (!elim.length) return null;
          const cells = acc.map((i) => cellName(lay.p, i)).join(', ');
          return {
            kind: 'naked-subset',
            name: `숫자 ${subsetWord(n)}`,
            steps: [
              `${eul(runName(run))} 보세요.`,
              `이 줄에서 ${n}칸이 같은 숫자 ${n}개만 후보로 가지고 있어요.`,
              `${cells}의 후보는 ${digitList(union)}뿐이라 이 숫자들은 그 칸들이 나눠 가져요. 같은 줄의 다른 칸에서 ${eul(digitList(union))} 지워요.`,
            ],
            focus: run.cells,
            keyCells: acc,
            eliminate: elim,
          };
        }
        for (let k = start; k < empty.length; k++) {
          const i = empty[k];
          const c = popcount(cand[i]);
          if (c < 2 || c > n) continue;
          const h = pick(k + 1, [...acc, i]);
          if (h) return h;
        }
        return null;
      };
      const h = pick(0, []);
      if (h) return h;
    }
  }
  return null;
}

/** 칸마다 숫자를 하나씩 맞춰 보면 어느 칸에도 놓을 수 없는 숫자 */
function findMatching(lay: Layout, values: number[], cand: number[]): Hint | null {
  const full = lay.p.white.map((w, i) => (!w ? 0 : values[i] ? bit(values[i]) : cand[i]));
  for (const run of lay.runs) {
    const allowed = runFeasible(run, full);
    if (!allowed) continue;
    const elim: Elimination[] = [];
    run.cells.forEach((i, j) => {
      if (values[i]) return;
      for (const d of digitsOf(cand[i] & ~allowed[j])) elim.push({ cell: i, digit: d });
    });
    if (!elim.length) continue;
    const e = elim[0];
    const { combos } = possibleCombos(run, values, cand);
    return {
      kind: 'matching',
      name: '칸마다 맞춰 보기',
      steps: [
        `${eul(runName(run))} 보세요.`,
        `남은 조합(${combos.map(comboText).join(', ')})의 숫자를 빈칸에 하나씩 맞춰 보세요. 어떤 숫자는 놓으면 다른 칸을 채울 수 없게 돼요.`,
        `${cellName(lay.p, e.cell)}에 ${eul(String(e.digit))} 넣으면 이 줄의 나머지 칸에 조합 숫자를 하나씩 놓을 수 없어요. ${elim.length > 1 ? `같은 이유로 이 줄에서 후보 ${elim.length}개를 지워요.` : '이 후보를 지워요.'}`,
      ],
      focus: run.cells,
      keyCells: run.cells.filter((i) => !values[i] && i !== e.cell),
      eliminate: elim,
    };
  }
  return null;
}

/** 후보 하나를 넣어 보고 줄 단위로 이어 풀면 모순이 나는 곳 */
export function findProbe(lay: Layout, values: number[], cand: number[]): { cell: number; digit: number; run: number } | null {
  const base = lay.p.white.map((w, i) => (!w ? 0 : values[i] ? bit(values[i]) : cand[i]));
  const order = base
    .map((m, i) => ({ i, n: values[i] ? 0 : popcount(m) }))
    .filter((x) => x.n > 1)
    .sort((a, b) => a.n - b.n);
  for (const { i } of order) {
    for (const d of digitsOf(base[i])) {
      const trial = base.slice();
      trial[i] = bit(d);
      const bad = propagate(lay, trial, lay.cellRuns[i].filter((k) => k >= 0));
      if (bad >= 0) return { cell: i, digit: d, run: bad };
    }
  }
  return null;
}

function probeHint(lay: Layout, values: number[], cand: number[]): Hint | null {
  const found = findProbe(lay, values, cand);
  if (!found) return null;
  const { cell, digit, run } = found;
  const where = cellName(lay.p, cell);
  const bad = lay.runs[run];
  return {
    kind: 'probe',
    name: '넣어 보고 모순 찾기',
    steps: [
      `${eul(where)} 보세요. 여기서부터는 줄 하나만 봐서는 더 정해지는 칸이 없어요.`,
      `${where}에 ${eul(String(digit))} 넣는다고 가정하고 이어서 풀어 보세요. 어느 줄에서 맞는 조합이 없어져요.`,
      `${where}에 ${eul(String(digit))} 넣으면 ${runName(bad)}에서 모순이 생겨요. ${where}의 후보에서 ${eul(String(digit))} 지워요.`,
    ],
    focus: [cell],
    keyCells: bad.cells,
    eliminate: [{ cell, digit }],
  };
}

function reveal(lay: Layout, values: number[], solution: number[] | null): Hint | null {
  if (!solution) return null;
  const i = values.findIndex((v, k) => lay.p.white[k] && !v);
  if (i < 0) return null;
  return {
    kind: 'reveal',
    name: '정답 공개',
    steps: ['여기서부터는 이 앱의 기법으로 더 정해지는 칸이 없어요.', `${cellName(lay.p, i)}에 숫자를 넣어 보고 끝까지 따라가 보세요.`, `${eun(cellName(lay.p, i))} ${yeyo(solution[i])}.`],
    focus: [i],
    keyCells: [i],
    place: { cell: i, digit: solution[i] },
  };
}

/** 다음 한 단계를 찾는다. 다 풀었으면 null */
export function findHint(input: HintInput): Hint | null {
  const { lay, values, marks, solution } = input;
  const err = findConflict(lay, values) ?? findWrongValue(input);
  if (err) return err;
  if (lay.p.white.every((w, i) => !w || values[i])) return null;
  const missing = findMissingCandidate(input);
  if (missing) return missing;

  const basic = computeCandidates(lay, values);
  const cand = basic.map((b, i) => (marks[i] ? marks[i] & b : b));
  // [기법 단계, 찾기]. 쉬운 기법부터 본다
  const steps: [number, () => Hint | null][] = [
    [1, () => findLastCell(lay, values)],
    [1, () => findSingle(lay, values, basic, cand)],
    [2, () => findRunHidden(lay, values, cand)],
    [2, () => findComboNarrow(lay, values, cand)],
    [3, () => findNakedSubset(lay, values, cand)],
    [3, () => findMatching(lay, values, cand)],
    [4, () => probeHint(lay, values, cand)],
    [5, () => reveal(lay, values, solution)],
  ];
  const max = input.maxTier ?? 5;
  for (const [tier, find] of steps) {
    if (tier > max) break;
    const h = find();
    if (h) return h;
  }
  return null;
}

/** 힌트를 판에 적용한 새 상태. 후보를 적지 않은 칸을 지울 때는 계산한 후보를 먼저 적는다 */
export function applyHint(lay: Layout, hint: Hint, values: number[], marks: number[]): { values: number[]; marks: number[] } {
  const v = values.slice();
  const m = marks.slice();
  if (hint.clear !== undefined) v[hint.clear] = 0;
  if (hint.restore) m[hint.restore.cell] |= bit(hint.restore.digit);
  if (hint.eliminate) {
    const computed = computeCandidates(lay, values);
    for (const { cell, digit } of hint.eliminate) {
      if (!m[cell]) m[cell] = computed[cell];
      m[cell] &= ~bit(digit);
    }
  }
  if (hint.place) placeDigit(lay, v, m, hint.place.cell, hint.place.digit);
  return { values: v, marks: m };
}

/** 숫자를 넣고 같은 줄 칸의 후보에서 그 숫자를 지운다 */
export function placeDigit(lay: Layout, values: number[], marks: number[], cell: number, digit: number) {
  values[cell] = digit;
  marks[cell] = 0;
  for (const run of runsOfCell(lay, cell)) for (const i of run.cells) marks[i] &= ~bit(digit);
}
