import { useEffect, useRef, useState } from 'react';
import { AppIcon } from './AppIcon';
import { GAMES, type GameId, gameHref } from './catalog';

/**
 * 게임 화면 제목 줄의 앱 모음 버튼. 누르면 아래에서 게임 목록이 올라온다.
 * 같은 앱 안에서 주소(#/게임)만 바꿔 이동한다.
 */
export function AppNav({ current }: { current: GameId }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    sheet.current?.querySelector<HTMLElement>('a')?.focus();
    const onKey = (e: KeyboardEvent) => {
      // 게임 단축키(숫자 입력 등)가 시트 뒤에서 동작하지 않게 막는다
      e.stopPropagation();
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  return (
    <>
      <button ref={button} type="button" className="app-launch" aria-label="다른 퍼즐" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="app-sheet-backdrop" onClick={close}>
          <div ref={sheet} className="app-sheet" role="dialog" aria-modal="true" aria-label="퍼즐 도우미" onClick={(e) => e.stopPropagation()}>
            <header>
              <a className="app-sheet-home" href="#/" onClick={() => setOpen(false)}>
                퍼즐 도우미 목록
              </a>
              <button type="button" className="app-sheet-close" aria-label="닫기" onClick={close}>
                ✕
              </button>
            </header>
            <ul className="app-grid">
              {GAMES.map((g) => (
                <li key={g.id}>
                  {g.id === current ? (
                    <span className="app-tile current" aria-current="page">
                      <AppIcon id={g.id} />
                      <span className="app-name">{g.label}</span>
                      <span className="app-here">지금 게임</span>
                    </span>
                  ) : (
                    <a className="app-tile" href={gameHref(g.id)} onClick={() => setOpen(false)}>
                      <AppIcon id={g.id} />
                      <span className="app-name">{g.label}</span>
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
