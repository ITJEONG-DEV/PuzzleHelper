import type { Puzzle } from './board';

/**
 * 답을 limit개까지 센다. 행마다 별 k개를 고르고, 열·영역 별 수와 닿음을 따지며 내려간다.
 * 반환하는 답은 별이 있는 칸 번호 목록(오름차순).
 */
export function solveCount(p: Puzzle, limit = 2): number[][] {
  const { n, k, region } = p;
  const colCount = new Array<number>(n).fill(0);
  const regCount = new Array<number>(n).fill(0);
  // 아래 행들에 남은 영역별 칸 수 (영역에 별이 모자라지 않는지 본다)
  const below: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(n).fill(0));
  for (let r = n - 1; r >= 0; r--) {
    below[r] = below[r + 1].slice();
    for (let c = 0; c < n; c++) below[r][region[r * n + c]]++;
  }
  const prevRow: number[] = [];
  const out: number[][] = [];
  const stars: number[] = [];
  const rec = (r: number) => {
    if (out.length >= limit) return;
    if (r === n) {
      if (regCount.every((x) => x === k) && colCount.every((x) => x === k)) out.push(stars.slice());
      return;
    }
    // 아래 행으로 열·영역을 다 채울 수 있는지
    for (let g = 0; g < n; g++) if (regCount[g] > k || regCount[g] + below[r][g] < k) return;
    for (let c = 0; c < n; c++) if (colCount[c] > k || colCount[c] + (n - r) < k) return;
    const cols = Array.from({ length: n }, (_, c) => c).filter((c) => colCount[c] < k && !prevRow.some((pc) => Math.abs(pc - c) < 2));
    const choose = (start: number, picked: number[]) => {
      if (out.length >= limit) return;
      if (picked.length === k) {
        const saved = prevRow.splice(0, prevRow.length, ...picked);
        for (const c of picked) {
          colCount[c]++;
          regCount[region[r * n + c]]++;
          stars.push(r * n + c);
        }
        rec(r + 1);
        for (const c of picked) {
          colCount[c]--;
          regCount[region[r * n + c]]--;
          stars.pop();
        }
        prevRow.splice(0, prevRow.length, ...saved);
        return;
      }
      for (let x = start; x < cols.length; x++) {
        const c = cols[x];
        if (picked.length && c - picked[picked.length - 1] < 2) continue;
        // 이 행에서 같은 영역에 별이 넘치면 바로 건너뛴다
        const g = region[r * n + c];
        if (regCount[g] + picked.filter((pc) => region[r * n + pc] === g).length >= k) continue;
        choose(x + 1, [...picked, c]);
      }
    };
    choose(0, []);
  };
  rec(0);
  return out;
}
