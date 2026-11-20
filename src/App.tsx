import { type ComponentType, Suspense, lazy, useEffect, useState } from 'react';
import { UpdateBanner } from './shared/UpdateBanner';
import { AppIcon } from './shared/AppIcon';
import { GAMES, type GameId, gameHref, isGameId } from './shared/catalog';

/** 게임 화면은 열 때만 내려받는다 */
const SCREENS: Record<GameId, ComponentType> = {
  sudoku: lazy(() => import('./games/sudoku/App')),
  nonogram: lazy(() => import('./games/nonogram/App')),
  kakuro: lazy(() => import('./games/kakuro/App')),
  minesweeper: lazy(() => import('./games/minesweeper/App')),
  starbattle: lazy(() => import('./games/starbattle/App')),
  calcudoku: lazy(() => import('./games/calcudoku/App')),
  tents: lazy(() => import('./games/tents/App')),
  killer: lazy(() => import('./games/killer/App')),
};

const TITLE = '퍼즐 도우미';

/** 주소의 #/게임 부분 */
function routeOf(hash: string): GameId | null {
  const id = hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return isGameId(id) ? id : null;
}

function useRoute(): GameId | null {
  const [route, setRoute] = useState(() => routeOf(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(routeOf(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

function Home() {
  return (
    <div className="app home">
      <header className="app-header">
        <h1>{TITLE}</h1>
      </header>
      <p className="lead">풀고 싶은 퍼즐을 고르세요. 막히면 다음 한 단계를 힌트로 알려 드려요.</p>
      <ul className="home-grid">
        {GAMES.map((g) => (
          <li key={g.id}>
            <a className="home-tile" href={gameHref(g.id)}>
              <AppIcon id={g.id} />
              <span className="home-text">
                <strong>{g.label}</strong>
                <span>{g.desc}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const Screen = route ? SCREENS[route] : null;

  useEffect(() => {
    const game = GAMES.find((g) => g.id === route);
    document.title = game ? `${game.label} · ${TITLE}` : TITLE;
    window.scrollTo(0, 0);
  }, [route]);

  return (
    <>
      <UpdateBanner />
      {Screen ? (
        // 게임마다 스타일을 .g-<게임> 안에서만 쓴다
        <div className={`g-${route}`} key={route}>
          <Suspense fallback={<p className="loading">불러오는 중…</p>}>
            <Screen />
          </Suspense>
        </div>
      ) : (
        <Home />
      )}
    </>
  );
}
