// 아주 작은 마크다운 → HTML 변환기 (외부 라이브러리 없이 직접 구현).
// 지원: 제목(#~###), 굵게(**), 기울임(*), 인라인 코드(`), 코드펜스(```), 인용(>), 목록(-, 1.), 링크([]()), 표(| … |).
//
// 보안(중요): 사용자가 쓴 원문을 dangerouslySetInnerHTML로 그리므로,
// 텍스트 조각을 태그로 감싸기 전에 반드시 HTML 특수문자를 먼저 escape 한다.
// 블록 구분 기호(#, >, - 등)는 ASCII라 원문 그대로 판별해도 안전하고,
// 실제 사용자 텍스트(제목·문단·목록 내용)는 inlineFmt()에서 escape → 서식 변환 순으로 처리한다.

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// 원문 텍스트 조각 → 안전한 인라인 HTML. escape를 가장 먼저 한다.
function inlineFmt(raw) {
  let t = escapeHtml(raw)
  // 링크: http(s)만 허용(javascript: 등은 매칭 자체가 안 됨 → 그냥 텍스트로 남음)
  t = t.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, label, url) => `<a href="${url}" target="_blank" rel="noreferrer noopener">${label}</a>`,
  )
  t = t
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
  return t
}

// --- 표(GFM table) 판별/파싱 헬퍼 ---
// 한 줄을 셀 배열로 자른다. 양 끝의 파이프(|)는 있으면 제거한다. 예) "| a | b |" → ['a','b']
function splitRow(line) {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map((c) => c.trim())
}
// 표의 두 번째 줄(구분선). 각 칸이 --- / :--- / ---: / :---: 형태여야 한다.
function isTableSeparator(line) {
  const s = (line || '').trim()
  if (!s.includes('-')) return false
  return /^\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?$/.test(s)
}
// 표의 데이터/헤더 줄로 볼 수 있는지(파이프를 포함하고 빈 줄이 아님).
function isTableRow(line) {
  return line.trim() !== '' && line.includes('|')
}

export function renderMarkdown(src) {
  const lines = (src || '').split('\n')
  const html = []
  let listType = null   // 'ul' | 'ol' | null
  let inCode = false
  let codeBuf = []

  const closeList = () => {
    if (listType) { html.push(`</${listType}>`); listType = null }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 코드펜스 토글 (내용은 서식 없이 escape만)
    if (line.trim().startsWith('```')) {
      if (inCode) { html.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`); codeBuf = []; inCode = false }
      else { closeList(); inCode = true }
      continue
    }
    if (inCode) { codeBuf.push(line); continue }

    // 표: 현재 줄이 헤더처럼 보이고 바로 다음 줄이 구분선(|---|---|)이면 표로 처리
    if (isTableRow(line) && isTableSeparator(lines[i + 1])) {
      closeList()
      const header = splitRow(line)
      const rows = []
      let j = i + 2
      while (j < lines.length && isTableRow(lines[j]) && !isTableSeparator(lines[j])) {
        rows.push(splitRow(lines[j])); j++
      }
      html.push('<table><thead><tr>' + header.map((c) => `<th>${inlineFmt(c)}</th>`).join('') + '</tr></thead>')
      if (rows.length) {
        html.push('<tbody>' + rows.map((r) => '<tr>' + r.map((c) => `<td>${inlineFmt(c)}</td>`).join('') + '</tr>').join('') + '</tbody>')
      }
      html.push('</table>')
      i = j - 1   // 표가 끝난 다음 줄부터 바깥 루프가 이어받음
      continue
    }

    // 제목
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) { closeList(); const lv = h[1].length; html.push(`<h${lv}>${inlineFmt(h[2])}</h${lv}>`); continue }

    // 인용
    const bq = line.match(/^>\s?(.*)$/)
    if (bq) { closeList(); html.push(`<blockquote>${inlineFmt(bq[1])}</blockquote>`); continue }

    // 순서 없는 목록
    const ul = line.match(/^\s*[-*]\s+(.*)$/)
    if (ul) {
      if (listType !== 'ul') { closeList(); html.push('<ul>'); listType = 'ul' }
      html.push(`<li>${inlineFmt(ul[1])}</li>`); continue
    }
    // 순서 있는 목록
    const ol = line.match(/^\s*\d+\.\s+(.*)$/)
    if (ol) {
      if (listType !== 'ol') { closeList(); html.push('<ol>'); listType = 'ol' }
      html.push(`<li>${inlineFmt(ol[1])}</li>`); continue
    }

    // 빈 줄 / 문단
    if (line.trim() === '') { closeList(); continue }
    closeList()
    html.push(`<p>${inlineFmt(line)}</p>`)
  }
  if (inCode) html.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`)
  closeList()
  return html.join('\n')
}
