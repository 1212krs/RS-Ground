// 회의 분석 결과의 mindmap(중심→가지→세부, 3단계)을 순수 SVG로 그린다.
// 외부 차트 라이브러리를 쓰지 않는다(프로젝트 원칙). viewBox 기반이라 화면 크기에 맞춰 자동 축소.
// 노드 클릭 시 onSelect(node)로 알려서 부모가 설명/요약 패널을 띄운다.

// 가지별 색상 팔레트(로그인 화면 5색 + 중심 빨강). 가지 수만큼 순환해서 쓴다.
const BRANCH_COLORS = ['#6C5CE7', '#1FA25A', '#E8871E', '#F2B705', '#3B82F6', '#E5484D', '#0EA5A4', '#D6409F']
const CENTER_COLOR = '#E5484D'

const W = 1000
const H = 760
const CX = W / 2
const CY = H / 2

const rad = (deg) => (deg * Math.PI) / 180
const trunc = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '')

export default function MindMap({ mindmap, selected, onSelect }) {
  if (!mindmap) return null
  const branches = mindmap.children || []
  const n = Math.max(branches.length, 1)

  // 가지를 중심 주위 360°에 균등 배치. 12시 방향에서 시작(-90°).
  const branchNodes = branches.map((b, i) => {
    const angle = -90 + (360 / n) * i
    const bx = CX + 230 * Math.cos(rad(angle))
    const by = CY + 230 * Math.sin(rad(angle))
    const leaves = b.children || []
    const r = Math.min(48, 30 + leaves.length * 3) // 세부 항목이 많은 가지일수록 크게
    return { ...b, i, angle, x: bx, y: by, r, leaves }
  })

  // 세부(leaf)는 부모 가지의 바깥 방향을 중심으로 부채꼴로 편다.
  const leafNodes = []
  branchNodes.forEach((b) => {
    const m = b.leaves.length
    const spread = Math.min(120, 26 * Math.max(m - 1, 1)) // 총 펼침 각도
    b.leaves.forEach((leaf, j) => {
      const off = m === 1 ? 0 : (j - (m - 1) / 2) * (spread / Math.max(m - 1, 1))
      const a = b.angle + off
      const lx = b.x + 150 * Math.cos(rad(a))
      const ly = b.y + 150 * Math.sin(rad(a))
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
          stroke="#c9c9c9" strokeWidth="2" />
      ))}
      {leafNodes.map((l, k) => {
        const b = branchNodes[l.parent]
        return <line key={`ll-${k}`} x1={b.x} y1={b.y} x2={l.x} y2={l.y}
          stroke="#dcdcdc" strokeWidth="1.5" />
      })}

      {/* 세부 노드 */}
      {leafNodes.map((l, k) => (
        <g key={`leaf-${k}`} className={`mt-node mt-leaf${l.term ? ' mt-term' : ''}`}
          onClick={() => onSelect({ kind: 'leaf', label: l.label, term: !!l.term, parent: l.parent })}>
          <circle cx={l.x} cy={l.y} r={20}
            fill={`${l.color}22`} stroke={l.color}
            strokeWidth={isSel(l, 'leaf') ? 3.5 : 1.8} />
          <text x={l.x} y={l.y + 4} textAnchor="middle" fontSize="11" fill="#1a1a1a">
            {trunc(l.label, 6)}
          </text>
          <title>{l.label}{l.term ? ' (용어 — 클릭하면 설명)' : ''}</title>
        </g>
      ))}

      {/* 가지 노드 */}
      {branchNodes.map((b) => {
        const color = BRANCH_COLORS[b.i % BRANCH_COLORS.length]
        return (
          <g key={`branch-${b.i}`} className="mt-node mt-branch"
            onClick={() => onSelect({ kind: 'branch', label: b.label })}>
            <circle cx={b.x} cy={b.y} r={b.r}
              fill={color} stroke="#ffffff"
              strokeWidth={isSel(b, 'branch') ? 4 : 2} />
            <text x={b.x} y={b.y + 4} textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#ffffff">
              {trunc(b.label, 7)}
            </text>
            <title>{b.label}</title>
          </g>
        )
      })}

      {/* 중심 노드 */}
      <g className="mt-node mt-center" onClick={() => onSelect({ kind: 'center', label: mindmap.label })}>
        <circle cx={CX} cy={CY} r={58} fill={CENTER_COLOR} stroke="#ffffff" strokeWidth="3" />
        <text x={CX} y={CY + 5} textAnchor="middle" fontSize="14" fontWeight="800" fill="#ffffff">
          {trunc(mindmap.label, 9)}
        </text>
        <title>{mindmap.label}</title>
      </g>
    </svg>
  )
}
