import { useMemo, useRef, useState } from 'react'

// 임베딩 지도 — UMAP으로 2D 축소한 좌표를 SVG 산점도로 그린다.
// 색상 = 출처 파일. 같은 주제(문서)의 조각들이 서로 뭉치는지 눈으로 확인하는 진단용.
// (UMAP은 이웃 관계는 보존하지만 군집 간 거리·크기는 왜곡하므로, 2D 거리로 유사도를 재지는 않는다.)
const PALETTE = ['#AEE63E', '#8B7EE8', '#3B82F6', '#F2542D', '#F2B705', '#22D3EE', '#EF4444', '#1FA25A']
const W = 1000
const H = 620
const PAD = 28

const shortName = (s) => s.split('/').pop()

export default function EmbeddingMap({ points }) {
  const [hover, setHover] = useState(null) // { i, point }
  const [mouse, setMouse] = useState({ x: 0, y: 0 })
  const [muted, setMuted] = useState({}) // 범례에서 끈 출처
  const canvasRef = useRef(null)

  const { scaled, sources, colorOf } = useMemo(() => {
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const spanX = maxX - minX || 1
    const spanY = maxY - minY || 1
    const sx = (x) => PAD + ((x - minX) / spanX) * (W - 2 * PAD)
    const sy = (y) => PAD + (1 - (y - minY) / spanY) * (H - 2 * PAD) // y축 뒤집기(위가 큰 값)
    const sources = [...new Set(points.map((p) => p.source))].sort()
    const colorOf = {}
    sources.forEach((s, i) => { colorOf[s] = PALETTE[i % PALETTE.length] })
    const scaled = points.map((p) => ({ ...p, cx: sx(p.x), cy: sy(p.y), color: colorOf[p.source] }))
    return { scaled, sources, colorOf }
  }, [points])

  const onMove = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (rect) setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  const toggle = (s) => setMuted((m) => ({ ...m, [s]: !m[s] }))

  return (
    <div className="kb-map">
      <div className="kb-map-legend">
        {sources.map((s) => (
          <button
            key={s}
            className={`kb-map-leg ${muted[s] ? 'off' : ''}`}
            onClick={() => toggle(s)}
            title="클릭하면 숨기기/보이기"
          >
            <i style={{ background: colorOf[s] }} />
            {shortName(s)}
            <span className="kb-map-leg-n">{points.filter((p) => p.source === s).length}</span>
          </button>
        ))}
      </div>

      <div className="kb-map-canvas" ref={canvasRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
          {scaled.map((p, i) => {
            if (muted[p.source]) return null
            const active = hover?.i === i
            return (
              <circle
                key={i}
                cx={p.cx}
                cy={p.cy}
                r={active ? 6.5 : 3.4}
                fill={p.color}
                fillOpacity={hover && !active ? 0.3 : 0.85}
                stroke={active ? '#fff' : 'none'}
                strokeWidth={active ? 1.5 : 0}
                onMouseEnter={() => setHover({ i, point: p })}
              />
            )
          })}
        </svg>

        {hover && (
          <div
            className="kb-map-tip"
            style={{
              left: Math.min(mouse.x + 14, (canvasRef.current?.clientWidth || W) - 250),
              top: mouse.y + 14,
            }}
          >
            <strong>{shortName(hover.point.source)} · 조각 {hover.point.chunk_index}</strong>
            <span>{hover.point.text_preview}</span>
          </div>
        )}
      </div>
    </div>
  )
}
