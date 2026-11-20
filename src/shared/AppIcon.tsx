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
      {id === 'starbattle' && (
        <>
          <path d="M18 18h36v18H18z" fill="#dcefff" />
          <path d="M54 18h18v36H54z" fill="#fde2e2" />
          <path d="M18 36h36v36H18z" fill="#e3f6dd" />
          <path d="M54 54h18v18H54z" fill="#fff1c7" />
          <path d="M18 36h36M54 18v54M54 54h18" stroke="#1c2233" strokeWidth="2.5" fill="none" />
          <text x="36" y="62" textAnchor="middle" fontSize="22" fill="#c98a00">
            ★
          </text>
        </>
      )}
      {id === 'calcudoku' && (
        <>
          <path d="M36 18v54M54 18v54M18 36h54M18 54h54" stroke="#c9cfdc" strokeWidth="1.5" />
          <path d="M18 36h36V18M54 36v36M36 36v36M18 54h18" stroke="#1c2233" strokeWidth="3" fill="none" />
          <text x="21" y="30" fontSize="10" fontWeight="700" fill="#1c2233">
            6+
          </text>
          <text x="57" y="30" fontSize="10" fontWeight="700" fill="#1c2233">
            2÷
          </text>
          <text x="45" y="50" textAnchor="middle" fontSize="14" fontWeight="700" fill="#2f5bd3">
            3
          </text>
        </>
      )}
      {id === 'tents' && (
        <>
          <path d="M18 18h54v54H18z" fill="#e3f3d6" />
          <path d="M36 18v54M54 18v54M18 36h54M18 54h54" stroke="#9fb48f" strokeWidth="1.5" />
          <circle cx="27" cy="25" r="6" fill="#2f8a3c" />
          <path d="M26 30h2v5h-2z" fill="#7a4a1f" />
          <path d="M45 39l7 12H38z" fill="#e0662f" />
          <circle cx="63" cy="61" r="6" fill="#2f8a3c" />
          <path d="M62 66h2v5h-2z" fill="#7a4a1f" />
          <path d="M45 57l7 12H38z" fill="#e0662f" />
        </>
      )}
      <rect x="18" y="18" width="54" height="54" fill="none" stroke="#1c2233" strokeWidth="3" />
    </svg>
  );
}
