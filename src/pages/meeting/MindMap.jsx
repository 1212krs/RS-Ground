// 회의 분석 결과의 mindmap(중심→가지→세부, 3단계)을 순수 SVG로 그린다.
// 외부 차트 라이브러리를 쓰지 않는다(프로젝트 원칙). viewBox 기반이라 화면 크기에 맞춰 자동 축소.
// 레이아웃: 중심을 가운데 두고 가지를 좌/우로 나눠 배치, 각 가지의 세부 항목은
// 옆으로 뻗는 대괄호(스파인) 형태로 나열한다 — 방사형보다 텍스트가 잘리지 않고 읽기 쉽다.
// 세부 항목까지 도표에 전부 풀어서 보여주므로 별도 클릭 설명 패널은 두지 않는다.
// 용어 설명은 별도 목록(용어 설명 섹션)에서 다루므로 이 지도에는 회의 내용(중심·가지·세부)만 그린다.

// 앱 공통 브랜드 5색(가지별로 순환) + 중심 전용 빨강. 검정 캔버스 위에서 잘 보이도록 고른 팔레트.
const BRANCH_COLORS = ['#6C5CE7', '#1FA25A', '#E8871E', '#F2B705', '#3B82F6']
const CENTER_COLOR = '#E5484D'

const CENTER_FONT = { size: 15, weight: 800, charPx: 12.5, lineH: 19, maxChars: 8, maxLines: 1, padX: 30, padY: 18, minW: 120, minH: 52 }
const BRANCH_FONT = { size: 13, weight: 700, charPx: 11.2, lineH: 17, maxChars: 7, maxLines: 2, padX: 24, padY: 16, minW: 96, minH: 44 }
const LEAF_FONT = { size: 11.5, charPx: 9.4, lineH: 15, maxChars: 13, maxLines: 2 }

const GAP_CENTER_BRANCH = 110  // 중심 박스 가장자리 ~ 가지 박스 중심 사이 여유
const GAP_BRANCH_SPINE = 22    // 가지 박스 가장자리 ~ 세부 목록 세로선(스파인)
const GAP_SPINE_TEXT = 10      // 스파인 ~ 세부 텍스트 시작
const LEAF_ROW_GAP = 8         // 같은 가지 안 세부 항목끼리 세로 간격
const BLOCK_GAP_Y = 22         // 같은 쪽(좌/우)의 가지 블록끼리 세로 간격
const MARGIN = 46

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

const textWidth = (lines, charPx) => Math.max(...lines.map((l) => l.length), 1) * charPx

// 중심/가지: 색이 채워진 둥근 박스 + 가운데 정렬 텍스트.
function LabelBox({ x, y, lines, font, fill, stroke, strokeWidth, textFill, width, height }) {
  return (
    <>
      <rect x={x - width / 2} y={y - height / 2} width={width} height={height} rx={12}
        fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      <text x={x} y={y - ((lines.length - 1) * font.lineH) / 2 + font.size / 2.6} textAnchor="middle"
        fontSize={font.size} fontWeight={font.weight} fill={textFill}>
        {lines.map((l, i) => (
          <tspan key={i} x={x} dy={i === 0 ? 0 : font.lineH}>{l}</tspan>
        ))}
      </text>
    </>
  )
}

// 세부 항목: 박스 없이 밑줄만 있는 텍스트(대괄호로 가지와 연결). side: 1=오른쪽, -1=왼쪽.
function LeafLabel({ textX, centerY, lines, side, color, title }) {
  const anchor = side === 1 ? 'start' : 'end'
  const firstBaseline = centerY - ((lines.length - 1) * LEAF_FONT.lineH) / 2 + LEAF_FONT.size / 2.6
  return (
    <g className="mt-node mt-leaf">
      <text x={textX} y={firstBaseline} textAnchor={anchor} fontSize={LEAF_FONT.size} fill="#f2f2f2">
        {lines.map((l, i) => (
          <tspan key={i} x={textX} dy={i === 0 ? 0 : LEAF_FONT.lineH}>{l}</tspan>
        ))}
      </text>
      {lines.map((l, i) => {
        const w = l.length * LEAF_FONT.charPx
        const lineY = firstBaseline + i * LEAF_FONT.lineH + 3
        const x1 = side === 1 ? textX : textX - w
        return <line key={i} x1={x1} y1={lineY} x2={x1 + w} y2={lineY} stroke={color} strokeWidth="1.2" opacity="0.7" />
      })}
      <title>{title}</title>
    </g>
  )
}

export default function MindMap({ mindmap }) {
  if (!mindmap) return null

  const centerLines = wrapLabel(mindmap.label, CENTER_FONT.maxChars, CENTER_FONT.maxLines)
  const centerW = Math.max(CENTER_FONT.minW, textWidth(centerLines, CENTER_FONT.charPx) + CENTER_FONT.padX)
  const centerH = Math.max(CENTER_FONT.minH, centerLines.length * CENTER_FONT.lineH + CENTER_FONT.padY)

  const branches = mindmap.children || []
  const branchData = branches.map((b, i) => {
    const lines = wrapLabel(b.label, BRANCH_FONT.maxChars, BRANCH_FONT.maxLines)
    const width = Math.max(BRANCH_FONT.minW, textWidth(lines, BRANCH_FONT.charPx) + BRANCH_FONT.padX)
    const height = Math.max(BRANCH_FONT.minH, lines.length * BRANCH_FONT.lineH + BRANCH_FONT.padY)
    const leaves = (b.children || []).map((leaf) => {
      const llines = wrapLabel(leaf.label, LEAF_FONT.maxChars, LEAF_FONT.maxLines)
      return { label: leaf.label, lines: llines, width: textWidth(llines, LEAF_FONT.charPx), height: llines.length * LEAF_FONT.lineH }
    })
    const leavesHeight = leaves.length ? leaves.reduce((s, l) => s + l.height, 0) + (leaves.length - 1) * LEAF_ROW_GAP : 0
    const blockHeight = Math.max(height, leavesHeight, 40)
    const maxLeafWidth = leaves.length ? Math.max(...leaves.map((l) => l.width)) : 0
    return { i, label: b.label, lines, width, height, leaves, blockHeight, maxLeafWidth, color: BRANCH_COLORS[i % BRANCH_COLORS.length] }
  })

  // 가지를 좌/우로 번갈아 배정해 균형 있게 나눈다.
  const right = []; const left = []
  branchData.forEach((b, i) => (i % 2 === 0 ? right : left).push(b))

  const sideHeight = (list) =>
    list.length ? list.reduce((s, b) => s + b.blockHeight, 0) + (list.length - 1) * BLOCK_GAP_Y : 0
  const rightTotalH = sideHeight(right)
  const leftTotalH = sideHeight(left)

  const H = Math.max(rightTotalH, leftTotalH, centerH) + MARGIN * 2
  const CY = H / 2

  const BRANCH_DX = Math.max(230, centerW / 2 + GAP_CENTER_BRANCH)
  const sideReach = (list) =>
    list.length
      ? Math.max(...list.map((b) => BRANCH_DX + b.width / 2 + (b.leaves.length ? GAP_BRANCH_SPINE + GAP_SPINE_TEXT + b.maxLeafWidth : 0)))
      : centerW / 2 + 40
  const leftReach = sideReach(left)
  const rightReach = sideReach(right)

  const CX = leftReach + MARGIN
  const W = CX + rightReach + MARGIN

  const layoutSide = (list, side) => {
    const totalH = sideHeight(list)
    let cursor = CY - totalH / 2
    return list.map((b) => {
      const y = cursor + b.blockHeight / 2
      cursor += b.blockHeight + BLOCK_GAP_Y
      return { ...b, y, x: CX + side * BRANCH_DX, side }
    })
  }
  const positioned = [...layoutSide(right, 1), ...layoutSide(left, -1)]

  return (
    <svg className="mt-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="회의 마인드맵">
      {/* 중심 ↔ 가지 연결선 */}
      {positioned.map((b) => (
        <line key={`bl-${b.i}`} x1={CX} y1={CY} x2={b.x} y2={b.y} stroke="#3a3a3a" strokeWidth="2" />
      ))}

      {/* 가지별 세부(leaf) 목록: 대괄호(스파인) + 텍스트 */}
      {positioned.map((b) => {
        if (!b.leaves.length) return null
        const spineX = b.x + b.side * (b.width / 2 + GAP_BRANCH_SPINE)
        const textX = spineX + b.side * GAP_SPINE_TEXT
        let cursor = b.y - (b.leaves.reduce((s, l) => s + l.height, 0) + (b.leaves.length - 1) * LEAF_ROW_GAP) / 2
        const leafCenters = b.leaves.map((l) => {
          const cy = cursor + l.height / 2
          cursor += l.height + LEAF_ROW_GAP
          return cy
        })
        const top = leafCenters[0] - b.leaves[0].height / 2
        const bottom = leafCenters[leafCenters.length - 1] + b.leaves[b.leaves.length - 1].height / 2
        return (
          <g key={`spine-${b.i}`}>
            <line x1={b.x + b.side * (b.width / 2)} y1={b.y} x2={spineX} y2={b.y} stroke="#3a3a3a" strokeWidth="1.5" />
            <line x1={spineX} y1={top} x2={spineX} y2={bottom} stroke="#3a3a3a" strokeWidth="1.5" />
            {b.leaves.map((l, j) => (
              <g key={j}>
                <line x1={spineX} y1={leafCenters[j]} x2={textX} y2={leafCenters[j]} stroke="#3a3a3a" strokeWidth="1.5" />
                <LeafLabel textX={textX} centerY={leafCenters[j]} lines={l.lines} side={b.side} color={b.color} title={l.label} />
              </g>
            ))}
          </g>
        )
      })}

      {/* 가지 박스 */}
      {positioned.map((b) => (
        <g key={`branch-${b.i}`} className="mt-node mt-branch">
          <LabelBox x={b.x} y={b.y} lines={b.lines} font={BRANCH_FONT}
            fill={b.color} stroke="#0d0d0d" strokeWidth={2}
            textFill="#ffffff" width={b.width} height={b.height} />
          <title>{b.label}</title>
        </g>
      ))}

      {/* 중심 박스 */}
      <g className="mt-node mt-center">
        <LabelBox x={CX} y={CY} lines={centerLines} font={CENTER_FONT}
          fill={CENTER_COLOR} stroke="#ffffff" strokeWidth={2.5}
          textFill="#ffffff" width={centerW} height={centerH} />
        <title>{mindmap.label}</title>
      </g>
    </svg>
  )
}
