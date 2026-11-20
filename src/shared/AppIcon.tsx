import type { GameId } from './catalog';

/** 게임 아이콘. 파란 바탕에 흰 판, 게임마다 다른 무늬 */
export function AppIcon({ id }: { id: GameId }) {
  return (
    <svg viewBox="0 0 90 90" aria-hidden="true" className="app-icon">
      <rect width="90" height="90" rx="18" fill="#2f5bd3" />
      <rect x="18" y="18" width="54" height="54" fill="#fff" />
      {id === 'sudoku' && (
        <>
          <rect x="36" y="36" width="18" height="18" fill="#ffd666" />
          <path d="M36 18v54M54 18v54M18 36h54M18 54h54" stroke="#1c2233" strokeWidth="2.5" />
        </>
      )}
      {id === 'nonogram' && (
        <g fill="#1c2233">
          <rect x="28.8" y="18" width="10.8" height="10.8" />
          <rect x="50.4" y="18" width="10.8" height="10.8" />
          <rect x="18" y="28.8" width="54" height="21.6" />
          <rect x="28.8" y="50.4" width="32.4" height="10.8" />
          <rect x="39.6" y="61.2" width="10.8" height="10.8" />
        </g>
      )}
      {id === 'kakuro' && (
        <>
          <path d="M18 18h27v27H18zM45 45h27v27H45z" fill="#1c2233" />
          <path d="M18 18l27 27M45 45l27 27" stroke="#fff" strokeWidth="2" />
          <path d="M45 18v54M18 45h54" stroke="#1c2233" strokeWidth="2" />
        </>
      )}
      {id === 'minesweeper' && (
        <>
          <path d="M18 18h18v18H18zM54 54h18v18H54zM36 54h18v18H36zM54 18h18v18H54z" fill="#c9cfdc" />
          <path d="M45 35v20M35 45h20M38 38l14 14M52 38L38 52" stroke="#1c2233" strokeWidth="2.5" />
          <circle cx="45" cy="45" r="6.5" fill="#1c2233" />
          <path d="M36 18v54M54 18v54M18 36h54M18 54h54" stroke="#1c2233" strokeWidth="1.5" />
        </>
      )}
      <rect x="18" y="18" width="54" height="54" fill="none" stroke="#1c2233" strokeWidth="3" />
    </svg>
  );
}
