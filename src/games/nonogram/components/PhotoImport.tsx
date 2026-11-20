import { useEffect, useRef, useState } from 'react';
import type { Point, Quad } from '../photo/image';
import { MAX_SIZE } from '../nonogram/puzzle';
import { type PhotoResult, detectQuad, detectSize, loadImage, readClues, readState } from '../photo/recognize';

interface Props {
  file: File;
  /** full: 단서와 판 상태 / state: 판 상태만 (칸 수 고정) */
  mode: 'full' | 'state';
  fixedSize?: { cols: number; rows: number };
  onDone: (result: PhotoResult) => void;
  onCancel: () => void;
  onPickAgain: () => void;
}

const CORNER_LABELS = ['왼쪽 위', '오른쪽 위', '오른쪽 아래', '왼쪽 아래'];

export function PhotoImport({ file, mode, fixedSize, onDone, onCancel, onPickAgain }: Props) {
  const [img, setImg] = useState<ImageData | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [url, setUrl] = useState('');
  const [cols, setCols] = useState(fixedSize?.cols ?? 10);
  const [rows, setRows] = useState(fixedSize?.rows ?? 10);
  const [wantClues, setWantClues] = useState(true);
  const [wantState, setWantState] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [error, setError] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    const u = URL.createObjectURL(file);
    setUrl(u);
    setImg(null);
    setQuad(null);
    setError('');
    loadImage(file)
      .then((data) => {
        if (!alive) return;
        const q = detectQuad(data);
        setImg(data);
        setQuad(q);
        if (!fixedSize) {
          const s = detectSize(data, q);
          setCols(s.cols);
          setRows(s.rows);
        }
      })
      .catch(() => alive && setError('사진을 열지 못했어요. 다른 사진을 골라 주세요.'));
    return () => {
      alive = false;
      URL.revokeObjectURL(u);
    };
  }, [file, fixedSize]);

  const toImagePoint = (e: React.PointerEvent): Point | null => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm || !img) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: Math.min(img.width, Math.max(0, p.x)), y: Math.min(img.height, Math.max(0, p.y)) };
  };

  const onMove = (e: React.PointerEvent) => {
    if (drag.current === null || !quad) return;
    const p = toImagePoint(e);
    if (!p) return;
    const next = quad.slice() as Quad;
    next[drag.current] = p;
    setQuad(next);
  };

  const redetect = () => {
    if (!img || !quad) return;
    const s = detectSize(img, quad);
    setCols(s.cols);
    setRows(s.rows);
  };

  const read = async () => {
    if (!img || !quad) return;
    setBusy(true);
    setError('');
    try {
      const result: PhotoResult = { cols, rows };
      if (mode === 'state' || wantState) result.state = readState(img, quad, cols, rows);
      if (mode === 'full' && wantClues) result.clues = await readClues(img, quad, cols, rows, (d, t) => setProgress([d, t]));
      onDone(result);
    } catch {
      setError('사진을 읽지 못했어요. 모서리와 칸 수를 확인하거나 다른 사진으로 해 보세요.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handle = img ? Math.max(img.width, img.height) / 32 : 10;
  const sizeOk = cols >= 1 && rows >= 1 && cols <= MAX_SIZE && rows <= MAX_SIZE;
  const nothing = mode === 'full' && !wantClues && !wantState;

  // 칸 경계선 미리 보기: 칸 수가 맞는지 눈으로 확인하게 한다
  const lerp = (a: Point, b: Point, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const gridLines: [Point, Point][] = [];
  if (quad && sizeOk) {
    const [tl, tr, br, bl] = quad;
    for (let c = 1; c < cols; c++) gridLines.push([lerp(tl, tr, c / cols), lerp(bl, br, c / cols)]);
    for (let r = 1; r < rows; r++) gridLines.push([lerp(tl, bl, r / rows), lerp(tr, br, r / rows)]);
  }

  return (
    <div className="photo-sheet" role="dialog" aria-modal="true" aria-label="사진으로 입력">
      <div className="photo-inner">
        <h2>{mode === 'full' ? '사진으로 입력' : '사진으로 판 읽기'}</h2>
        <p className="lead">
          동그라미를 <strong>칠하는 칸 영역의 네 모서리</strong>에 맞추세요(단서 영역은 빼요). 얇은 선이 사진의 칸과 겹치면 칸 수가 맞은 거예요.
        </p>
        <div className="photo-stage">
          {url && <img src={url} alt="고른 사진" draggable={false} />}
          {img && quad && (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${img.width} ${img.height}`}
              preserveAspectRatio="none"
              onPointerMove={onMove}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
            >
              <polygon points={quad.map((p) => `${p.x},${p.y}`).join(' ')} className="photo-quad" />
              {gridLines.map(([a, b], k) => (
                <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="photo-gridline" />
              ))}
              {quad.map((p, k) => (
                <circle
                  key={k}
                  cx={p.x}
                  cy={p.y}
                  r={handle}
                  className="photo-handle"
                  aria-label={`${CORNER_LABELS[k]} 모서리`}
                  onPointerDown={(e) => {
                    drag.current = k;
                    try {
                      (e.target as Element).setPointerCapture(e.pointerId);
                    } catch {
                      /* 합성 이벤트 등 캡처할 수 없는 경우 */
                    }
                    e.preventDefault();
                  }}
                />
              ))}
            </svg>
          )}
        </div>

        <div className="size-inputs">
          <label>
            가로
            <input type="number" min={1} max={MAX_SIZE} value={cols} disabled={!!fixedSize || busy} onChange={(e) => setCols(Number(e.target.value))} />
            칸
          </label>
          <label>
            세로
            <input type="number" min={1} max={MAX_SIZE} value={rows} disabled={!!fixedSize || busy} onChange={(e) => setRows(Number(e.target.value))} />
            칸
          </label>
          {!fixedSize && (
            <button type="button" className="link" onClick={redetect} disabled={!quad || busy}>
              칸 수 다시 찾기
            </button>
          )}
        </div>

        {mode === 'full' && (
          <div className="read-options">
            <label className="check">
              <input type="checkbox" checked={wantClues} onChange={(e) => setWantClues(e.target.checked)} disabled={busy} />
              단서 숫자 읽기
            </label>
            <label className="check">
              <input type="checkbox" checked={wantState} onChange={(e) => setWantState(e.target.checked)} disabled={busy} />
              칠한 칸·X 읽기
            </label>
          </div>
        )}

        {error && <div className="message error">{error}</div>}
        {progress && (
          <div className="message">
            단서 읽는 중… {progress[0]}/{progress[1]}줄
          </div>
        )}
        <div className="hint-actions">
          <button type="button" className="primary" onClick={read} disabled={!quad || busy || !sizeOk || nothing}>
            {busy ? '읽는 중…' : '읽기'}
          </button>
          <button type="button" onClick={onPickAgain} disabled={busy}>
            다른 사진
          </button>
          <button type="button" onClick={onCancel} disabled={busy}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
