/** 퍼즐 도우미에 들어 있는 게임 목록. 홈 화면·앱 모음·화면 전환이 이 목록을 함께 쓴다 */
export const GAMES = [
  { id: 'sudoku', label: '스도쿠', desc: '9×9에 1~9 채우기. 문제 입력·사진 입력·랜덤 문제' },
  { id: 'nonogram', label: '노노그램', desc: '줄마다 단서대로 칸을 칠해 그림 완성' },
  { id: 'kakuro', label: '가쿠로', desc: '가로·세로 합 단서에 맞게 숫자 채우기' },
  { id: 'minesweeper', label: '지뢰찾기', desc: '찍지 않고 논리로 끝까지 풀리는 지뢰찾기' },
  { id: 'starbattle', label: '스타 배틀', desc: '행·열·영역마다 별 하나, 별끼리 닿지 않게' },
  { id: 'calcudoku', label: '칼큐도쿠', desc: '켄켄과 같은 규칙. 상자마다 사칙연산 결과에 맞게 숫자 채우기' },
  { id: 'tents', label: '텐트와 나무', desc: '나무마다 텐트 하나, 텐트끼리 닿지 않게, 줄마다 텐트 수 맞추기' },
  { id: 'killer', label: '킬러 스도쿠', desc: '스도쿠 + 점선 상자마다 숫자 합 맞추기' },
  { id: 'futoshiki', label: '후토시키', desc: '행·열마다 숫자 한 번씩, 칸 사이 부등호 지키기' },
] as const;

export type GameId = (typeof GAMES)[number]['id'];

export const isGameId = (x: string): x is GameId => GAMES.some((g) => g.id === x);

/** 게임 화면 주소 (해시) */
export const gameHref = (id: GameId) => `#/${id}`;
