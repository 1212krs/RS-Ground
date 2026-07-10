// 회의 분석 결과의 mindmap(중심→가지→세부, 3단계)을 순수 SVG로 그린다.
// 외부 차트 라이브러리를 쓰지 않는다(프로젝트 원칙). viewBox 기반이라 화면 크기에 맞춰 자동 축소.
// 노드 클릭 시 onSelect(node)로 알려서 부모가 설명 패널을 띄운다. 용어 설명은 별도 목록(용어 설명 섹션)에서
// 다루므로 이 지도에는 회의 내용(중심·가지·세부)만 그린다.

// 앱 공통 브랜드 5색(가지별로 순환) + 중심 전용 빨강. 검정 캔버스 위에서 잘 보이도록 고른 팔레트.
const BRANCH_COLORS = ['#6C5CE7', '#1FA25A', '#E8871E', '#F2B705', '#3B82F6']
const CENTER_COLOR = '#E5484D'

const W = 1100
const H = 820
const CX = W / 2
const CY = H / 2

const rad = (deg) => (deg * Math.PI) / 180

// 글자를 자르지 않고 여러 줄로 접는다(최대 maxLines줄, 넘치면 마지막 줄만 말줄임).
function wrapLabel(text, maxChars, maxLines) {
  const words = (text || '').trim().split(/\s+/).filter(Boolean)
  const lines = []
  let cur = ''
  for (let w of words) {
    while (w.length > maxChars) {
      if (cur) { lines.push(cur); cur = '' }
      lines.push(w.slice(0, maxChars))
      w = w.slice(maxChars)
    }
    const candidate = cur ? `${cur} ${w}` : w
    if (candidate.length <= maxChars) cur = candidate
    else { if (cur) lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    let last = kept[maxLines - 1]
    if (last.length > maxChars - 1) last = last.slice(0, maxChars - 1)
    kept[maxLines - 1] = `${last}…`
    return kept
  }
  return lines.length ? lines : ['']
}

// 텍스트 줄 수에 맞춰 박스 크기를 정하고, 잘리는 대신 줄바꿈된 <text>를 그린다.
function TextBox({ x, y, label, maxChars, fontSize, fontWeight, maxLines, charPx, padX, minWidth, minHeight, fill, stroke, strokeWidth, textFill, rx }) {
  const lines = wrapLabel(label, maxChars, maxLines)
  const longest = Math.max(...lines.map((l) => l.length), 1)
  const width = Math.max(minWidth, longest * charPx + padX)
  const lineH = fontSize + 5
  const height = Math.max(minHeight, lines.length * lineH + 14)
  return (
    <>
      <rect x={x - width / 2} y={y - height / 2} width={width} height={height} rx={rx}
        fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <text x={x} y={y - ((lines.length - 1) * lineH) / 2 + fontSize / 2.6} textAnchor="middle"
        fontSize={fontSize} fontWeight={fontWeight} fill={textFill}>
        {lines.map((l, i) => (
          <tspan key={i} x={x} dy={i === 0 ? 0 : lineH}>{l}</tspan>
        ))}
      </text>
    </>
  )
}

export default function MindMap({ mindmap, selected, onSelect }) {
  if (!mindmap) return null
  const branches = mindmap.children || []
  const n = Math.max(branches.length, 1)

  // 가지를 중심 주위 360°에 균등 배치. 12시 방향에서 시작(-90°).
  const branchNodes = branches.map((b, i) => {
    const angle = -90 + (360 / n) * i
    const bx = CX + 260 * Math.cos(rad(angle))
    const by = CY + 260 * Math.sin(rad(angle))
    const leaves = b.children || []
    return { ...b, i, angle, x: bx, y: by, leaves }
  })

  // 세부(leaf)는 부모 가지의 바깥 방향을 중심으로 부채꼴로 편다.
  const leafNodes = []
  branchNodes.forEach((b) => {
    const m = b.leaves.length
    const spread = Math.min(160, 24 * Math.max(m - 1, 1)) // 총 펼침 각도
    b.leaves.forEach((leaf, j) => {
      const off = m === 1 ? 0 : (j - (m - 1) / 2) * (spread / Math.max(m - 1, 1))
      const a = b.angle + off
      const lx = b.x + 190 * Math.cos(rad(a))
      const ly = b.y + 190 * Math.sin(rad(a))
      leafNodes.push({ ...leaf, x: lx, y: ly, parent: b.i, color: BRANCH_COLORS[b.i % BRANCH_COLORS.length] })
    })
  })

  const isSel = (node, kind) =>
    selected && selected.kind === kind && selected.label === node.label &&
    (kind !== 'leaf' || selected.parent === node.parent)

  return (
    <svg className="mt-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="회의 마인드맵">
      {/* 연결선: 중심→가지, 가지→세부 */}
      {branchNodes.map((b) => (
        <line key={`bl-${b.i}`} x1={CX} y1={CY} x2={b.x} y2={b.y}
          stroke="#3a3a3a" strokeWidth="2" />
      ))}
      {leafNodes.map((l, k) => {
        const b = branchNodes[l.parent]
        return <line key={`ll-${k}`} x1={b.x} y1={b.y} x2={l.x} y2={l.y}
          stroke="#2c2c2c" strokeWidth="1.5" />
      })}

      {/* 세부 노드 */}
      {leafNodes.map((l, k) => (
        <g key={`leaf-${k}`} className="mt-node mt-leaf"
          onClick={() => onSelect({ kind: 'leaf', label: l.label, parent: l.parent })}>
          <TextBox x={l.x} y={l.y} label={l.label}
            maxChars={9} maxLines={2} fontSize={10.5} fontWeight="500" charPx={9.2} padX={20}
            minWidth={72} minHeight={30} rx={9}
            fill={`${l.color}1f`} stroke={l.color} strokeWidth={isSel(l, 'leaf') ? 3 : 1.6}
            textFill="#f2f2f2" />
          <title>{l.label}</title>
        </g>
      ))}

      {/* 가지 노드 */}
      {branchNodes.map((b) => {
        const color = BRANCH_COLORS[b.i % BRANCH_COLORS.length]
        return (
          <g key={`branch-${b.i}`} className="mt-node mt-branch"
            onClick={() => onSelect({ kind: 'branch', label: b.label, children: b.leaves.map((l) => l.label) })}>
            <TextBox x={b.x} y={b.y} label={b.label}
              maxChars={7} maxLines={2} fontSize={12.5} fontWeight="700" charPx={11} padX={26}
              minWidth={92} minHeight={40} rx={12}
              fill={color} stroke="#0d0d0d" strokeWidth={isSel(b, 'branch') ? 4 : 2}
              textFill="#ffffff" />
            <title>{b.label}</title>
          </g>
        )
      })}

      {/* 중심 노드 */}
      <g className="mt-node mt-center" onClick={() => onSelect({ kind: 'center', label: mindmap.label })}>
        <circle cx={CX} cy={CY} r={62} fill={CENTER_COLOR} stroke="#ffffff" strokeWidth="3" />
        <text x={CX} y={CY + 5} textAnchor="middle" fontSize="14" fontWeight="800" fill="#ffffff">
          {wrapLabel(mindmap.label, 8, 1)[0]}
        </text>
        <title>{mindmap.label}</title>
      </g>
    </svg>
  )
}
