import { describe, expect, it } from 'vitest';
import { type CellState, FLAG, HIDDEN, OPEN, isCleared, makeField, neighborsOf, openCell } from './board';
import { LEVELS, SIZES, generate, rate } from './generate';
import { applyHint, findHint } from './hints';
import { constraintsOf, findBasic, findEnumerate, findPair } from './logic';

/** 매번 같은 결과가 나오는 난수 */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 그림으로 판 만들기: '*' 지뢰, '.' 빈칸 */
function fieldFrom(rows: string[]) {
  const w = rows[0].length;
  const mine = rows.join('').split('').map((ch) => ch === '*');
  return makeField(w, rows.length, mine);
}

describe('판', () => {
  it('숫자는 주변 지뢰 수이고, 0인 칸을 열면 이어서 열린다', () => {
    const f = fieldFrom(['*..', '...', '...']);
    expect(f.num).toEqual([0, 1, 0, 1, 1, 0, 0, 0, 0]);
    const state = new Array<CellState>(9).fill(HIDDEN);
    openCell(f, state, 8);
    expect(state.filter((s) => s === OPEN).length).toBe(8);
    expect(isCleared(f, state)).toBe(true);
  });
});

describe('추론', () => {
  const view = (rows: string[], open: string[], total: number) => {
    const f = fieldFrom(rows);
    const state = open.join('').split('').map((ch) => (ch === 'o' ? OPEN : ch === 'f' ? FLAG : HIDDEN)) as CellState[];
    return { f, v: { w: f.w, h: f.h, state, num: f.num, total } };
  };

  it('1단계: 깃발을 다 찾은 숫자의 나머지는 안전', () => {
    const { v } = view(['*..', '...'], ['f#o', '###'], 1);
    // 오른쪽 위 칸(숫자 0)은 열려 있다
    const d = findBasic(constraintsOf(v));
    expect(d).not.toBeNull();
  });

  it('2단계: 1-2 무늬', () => {
    // 맨 아래 줄: 열린 1 2 1 이 위의 닫힌 줄과 닿는다 → 가운데 위는 안전, 양쪽 위는 지뢰
    const { v } = view(['*.*', '121'], ['###', 'ooo'], 2);
    expect(findBasic(constraintsOf(v))).toBeNull();
    const d = findPair(constraintsOf(v));
    expect(d).not.toBeNull();
    expect(new Set([...d!.mines, ...d!.safe]).size).toBeGreaterThan(0);
  });

  it('3단계: 남은 지뢰 수까지 써서 정해지는 칸', () => {
    // 숫자와 닿지 않은 칸만 남고 남은 지뢰가 0이면 모두 안전
    const { v } = view(['*...', '1...', '....'], ['#ooo', 'oooo', 'oooo'], 1);
    const cons = constraintsOf(v);
    const d = findBasic(cons) ?? findPair(cons) ?? findEnumerate(v, cons);
    expect(d?.mines).toEqual([0]);
  });
});

describe('새 판', () => {
  for (const s of SIZES) {
    LEVELS.forEach((l, k) => {
      it(`${s.label} ${l.label}: 찍지 않고 풀리고 난이도가 맞으며, 힌트만 따라가도 끝난다`, () => {
        const g = generate(s.id, l.id, seeded(s.w * 100 + s.h + k), 20000);
        expect(g.approximate).toBe(false);
        expect(g.mine.filter(Boolean).length).toBe(s.mines);
        const f = makeField(g.w, g.h, g.mine);
        // 시작 칸 주변에는 지뢰가 없다
        for (const j of [g.start, ...neighborsOf(g.w, g.h)[g.start]]) expect(g.mine[j]).toBe(false);
        expect(rate(f, g.total, g.start)).toBe(k + 1);
        let state = new Array<CellState>(g.w * g.h).fill(HIDDEN);
        openCell(f, state, g.start);
        const kinds = new Set<string>();
        for (let i = 0; i < 3000; i++) {
          const h = findHint({ field: f, state, total: g.total });
          if (!h) break;
          kinds.add(h.kind);
          state = applyHint(f, h, state);
        }
        expect(isCleared(f, state)).toBe(true);
        expect(state.some((x, i) => x === OPEN && g.mine[i])).toBe(false);
        expect(kinds.has('reveal')).toBe(false);
      });
    });
  }

  it('잘못 꽂은 깃발을 먼저 알려준다', () => {
    const g = generate('beginner', 'easy', seeded(5));
    const f = makeField(g.w, g.h, g.mine);
    const state = new Array<CellState>(g.w * g.h).fill(HIDDEN);
    openCell(f, state, g.start);
    const notMine = state.findIndex((x, i) => x === HIDDEN && !g.mine[i]);
    state[notMine] = FLAG;
    const h = findHint({ field: f, state, total: g.total });
    expect(h?.kind).toBe('wrong-flag');
    expect(h?.unflag).toBe(notMine);
  });
});
