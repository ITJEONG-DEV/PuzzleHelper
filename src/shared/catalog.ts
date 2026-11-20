/** 퍼즐 도우미에 들어 있는 게임 목록. 홈 화면·앱 모음·화면 전환이 이 목록을 함께 쓴다 */
export const GAMES = [
  { id: 'sudoku', label: '스도쿠', desc: '9×9에 1~9 채우기. 문제 입력·사진 입력·랜덤 문제' },
  { id: 'nonogram', label: '노노그램', desc: '줄마다 단서대로 칸을 칠해 그림 완성' },
  { id: 'kakuro', label: '가쿠로', desc: '가로·세로 합 단서에 맞게 숫자 채우기' },
  { id: 'minesweeper', label: '지뢰찾기', desc: '찍지 않고 논리로 끝까지 풀리는 지뢰찾기' },
  { id: 'starbattle', label: '스타 배틀', desc: '행·열·영역마다 별 하나, 별끼리 닿지 않게' },
] as const;

export type GameId = (typeof GAMES)[number]['id'];

export const isGameId = (x: string): x is GameId => GAMES.some((g) => g.id === x);

/** 게임 화면 주소 (해시) */
export const gameHref = (id: GameId) => `#/${id}`;
