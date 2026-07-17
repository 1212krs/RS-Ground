import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Download, FilePenLine, Menu, Paperclip, Sparkles } from 'lucide-react'
import { composeReport, generateReport, getReportStatus, listTemplates } from '../../reportApi.js'
import './ReportsPage.css'

// 문서 편집 상태의 빈 값을 만든다. 서식이 바뀌면 섹션 개수가 달라지므로 매번 새로 만든다.
const emptyDoc = (tpl) => ({
  title: '',
  overview: '',
  sections: tpl ? tpl.sections.map(() => '') : [],
  includeTable: false,
  tableCaption: '',
  tableSection: tpl ? tpl.sections.length : 1,
  headers: ['', '', '', ''],
  rows: [],
})

// AI 응답(doc)을 편집 상태로 변환. 섹션 블록 배열 → 줄 단위 텍스트(대항목 "□ ", 하위 "- " 접두)
const levelPrefix = { head: '□ ', sub: '- ' }
const docToEdit = (doc, tpl) => ({
  title: doc.title || '',
  overview: doc.overview || '',
  sections: tpl.sections.map((_, i) =>
    (doc.sections?.[i] || []).map((b) => (levelPrefix[b.level] || '') + b.text).join('\n')),
  includeTable: Boolean(doc.table),
  tableCaption: doc.table?.caption || '',
  tableSection: doc.table?.section || tpl.sections.length,
  headers: [...(doc.table?.headers || []), '', '', '', ''].slice(0, 4),
  rows: (doc.table?.rows || []).map((r) => [...r, '', '', '', ''].slice(0, 4)),
})

// 편집 상태의 섹션 텍스트를 미리보기용 블록으로 파싱
const parseBlocks = (text) => (text || '').split('\n')
  .map((line) => line.trim()).filter(Boolean)
  .map((line) => {
    if (line.startsWith('□')) return { level: 'head', text: line.replace(/^□\s*/, '') }
    if (line.startsWith('-') || line.startsWith('―')) return { level: 'sub', text: line.replace(/^[-―]\s*/, '') }
    return { level: 'item', text: line.replace(/^○\s*/, '') }
  })

export default function ReportsPage() {
  const { notify, onMenu } = useOutletContext()
  const fileInputRef = useRef(null)

  const [templates, setTemplates] = useState([])
  const [tplId, setTplId] = useState('')
  const [aiReady, setAiReady] = useState(null)

  // ① 생성 입력
  const [cTitle, setCTitle] = useState('')
  const [cBrief, setCBrief] = useState('')
  const [cFiles, setCFiles] = useState([])
  const [cTable, setCTable] = useState(true)
  const [composing, setComposing] = useState(false)
  const [composeMsg, setComposeMsg] = useState(null) // { text, tone: 'ok'|'warn'|'error' }

  // ② 문서 편집 상태
  const [doc, setDoc] = useState(emptyDoc(null))
  const [generating, setGenerating] = useState(false)

  const tpl = useMemo(() => templates.find((t) => t.id === tplId), [templates, tplId])
  // 서식이 지원하는 기능(개요 상자·표·□ 대항목). 옛 응답엔 features가 없으므로 전부 지원으로 간주
  const feats = tpl?.features || { overview: true, table: true, head: false }

  useEffect(() => {
    (async () => {
      try {
        const list = await listTemplates()
        setTemplates(list)
        if (list.length) { setTplId(list[0].id); setDoc(emptyDoc(list[0])) }
      } catch (err) {
        notify(`서식 목록을 불러오지 못했습니다: ${err.message} (백엔드 서버 확인)`, 'error')
      }
      try { setAiReady((await getReportStatus()).ai_ready) } catch { setAiReady(false) }
    })()
  }, [])

  const changeTemplate = (id) => {
    const next = templates.find((t) => t.id === id)
    setTplId(id)
    setDoc(emptyDoc(next))
    setComposeMsg(null)
  }

  const handleFiles = (event) => {
    const picked = [...event.target.files].slice(0, 3)
    const tooBig = picked.filter((f) => f.size > 5 * 1024 * 1024)
    if (tooBig.length) notify(`5MB 초과로 제외: ${tooBig.map((f) => f.name).join(', ')}`, 'error')
    setCFiles(picked.filter((f) => f.size <= 5 * 1024 * 1024))
    event.target.value = ''
  }

  const handleCompose = async () => {
    if (!cTitle.trim()) { setComposeMsg({ text: '보고서 제목을 입력하세요.', tone: 'error' }); return }
    setComposing(true)
    setComposeMsg({ text: 'AI가 본문을 생성하는 중… (참고 파일 분석 포함, 수십 초 걸릴 수 있음)', tone: 'ok' })
    try {
      const out = await composeReport({
        title: cTitle, brief: cBrief, template: tplId, includeTable: cTable && feats.table, files: cFiles,
      })
      setDoc(docToEdit(out.doc, tpl))
      const fileNote = out.files_used?.length ? ` (참고 자료 ${out.files_used.length}개 반영)` : ''
      setComposeMsg(out.engine === 'ai'
        ? { text: `✓ Claude가 본문을 생성했습니다${fileNote}. 아래에서 수정하거나 다운로드하세요.`, tone: 'ok' }
        : { text: `△ 대체 생성기로 초안 생성 — ${out.reason || 'AI 미연결'}`, tone: 'warn' })
    } catch (err) {
      setComposeMsg({ text: `✗ 생성 실패: ${err.message}`, tone: 'error' })
    } finally {
      setComposing(false)
    }
  }

  const handleDownload = async () => {
    setGenerating(true)
    try {
      const blob = await generateReport({
        template: tplId,
        title: doc.title,
        overview: doc.overview,
        sections: doc.sections,
        include_table: doc.includeTable,
        table: {
          caption: doc.tableCaption,
          headers: doc.headers,
          rows: doc.rows,
          section: doc.tableSection,
        },
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${doc.title || '보고서'}.hwpx`
      a.click()
      URL.revokeObjectURL(url)
      notify('hwpx 파일이 다운로드되었습니다. 한글에서 열어 확인하세요.')
    } catch (err) {
      notify(`다운로드 실패: ${err.message}`, 'error')
    } finally {
      setGenerating(false)
    }
  }

  const setSection = (i, value) => setDoc((d) => {
    const sections = [...d.sections]; sections[i] = value
    return { ...d, sections }
  })
  const setHeader = (i, value) => setDoc((d) => {
    const headers = [...d.headers]; headers[i] = value
    return { ...d, headers }
  })
  const setCell = (r, c, value) => setDoc((d) => {
    const rows = d.rows.map((row) => [...row]); rows[r][c] = value
    return { ...d, rows }
  })

  const previewTable = doc.includeTable && (
    <>
      <div className="rp-doc-cap">[{doc.tableCaption || '표'}]</div>
      <table className="rp-doc-table">
        <thead><tr>{doc.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>
          {doc.rows.filter((r) => r.some((c) => c.trim())).map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </>
  )

  return (
    <div className="rp">
      <header className="rp-head">
        <button className="oa-icon mobile-only" onClick={onMenu} aria-label="메뉴"><Menu size={20} /></button>
        <h1>보고서</h1>
        {aiReady !== null && (
          <span className={`rp-ai-badge ${aiReady ? 'on' : ''}`}>
            {aiReady ? '🤖 AI 연결됨' : 'AI 미연결 — backend/.env에 ANTHROPIC_API_KEY 필요'}
          </span>
        )}
      </header>

      <div className="rp-body">
        {/* ── 왼쪽: 입력·편집 ── */}
        <div className="rp-form">
          <section className="rp-card">
            <h2>보고서 서식</h2>
            <select value={tplId} onChange={(e) => changeTemplate(e.target.value)} aria-label="보고서 서식 선택">
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.sections.length}개 섹션)</option>
              ))}
            </select>
            {tpl?.has_guide && <p className="rp-hint">📋 이 서식에는 작성 지침이 등록되어 있어 AI 생성 시 자동 반영됩니다.</p>}
          </section>

          <section className="rp-card rp-gen">
            <h2><Sparkles size={15} /> 내용으로 생성</h2>
            <label>보고서 제목 *</label>
            <input value={cTitle} onChange={(e) => setCTitle(e.target.value)} placeholder="예: AI 다국어 번역 시스템 도입 계획" disabled={composing} />
            <label>간단한 내용 <span className="rp-sub">핵심 내용·메모 (자유 형식)</span></label>
            <textarea rows={4} value={cBrief} onChange={(e) => setCBrief(e.target.value)} disabled={composing}
              placeholder="예: 외국인 민원 증가로 번역 시스템 도입 필요. 예산 5천만원, 8월 사업자 선정, 10월 시범운영." />
            <label>참고 파일 <span className="rp-sub">선택 · 최대 3개, 각 5MB · txt, md, csv, hwp, hwpx, docx</span></label>
            <button className="rp-attach" onClick={() => fileInputRef.current?.click()} disabled={composing}>
              <Paperclip size={14} /> 파일 선택{cFiles.length > 0 && ` (${cFiles.length}개)`}
            </button>
            <input ref={fileInputRef} type="file" multiple hidden accept=".txt,.md,.csv,.hwp,.hwpx,.docx" onChange={handleFiles} />
            {cFiles.length > 0 && (
              <ul className="rp-filelist">
                {cFiles.map((f) => <li key={f.name}>📎 {f.name} ({Math.round(f.size / 1024)}KB)</li>)}
              </ul>
            )}
            {feats.table && (
              <label className="rp-check">
                <input type="checkbox" checked={cTable} onChange={(e) => setCTable(e.target.checked)} disabled={composing} />
                표 포함하여 생성
              </label>
            )}
            <button className="rp-primary" onClick={handleCompose} disabled={composing}>
              <Sparkles size={15} /> {composing ? '생성 중…' : 'AI로 본문 생성'}
            </button>
            {composeMsg && <p className={`rp-status ${composeMsg.tone}`}>{composeMsg.text}</p>}
          </section>

          <section className="rp-card">
            <h2><FilePenLine size={15} /> 문서 편집</h2>
            <label>문서 제목</label>
            <input value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} />
            {feats.overview && (
              <>
                <label>개요</label>
                <textarea rows={3} value={doc.overview} onChange={(e) => setDoc({ ...doc, overview: e.target.value })} />
              </>
            )}
            <p className="rp-hint">{feats.head
              ? '한 줄 = 한 항목 · 줄 앞 “□”는 대항목, “-”는 세부(―), 없으면 항목(○)'
              : '한 줄 = 한 항목(○) · 줄 앞에 “-”를 붙이면 하위 항목(―)'}</p>
            {tpl?.sections.map((label, i) => (
              <div key={label + i} className="rp-section">
                <div className="rp-section-label"><span className="rp-num">{i + 1}</span>{label}</div>
                <textarea rows={3} value={doc.sections[i] || ''} onChange={(e) => setSection(i, e.target.value)} />
              </div>
            ))}

            {feats.table && (
              <label className="rp-check">
                <input type="checkbox" checked={doc.includeTable} onChange={(e) => setDoc({ ...doc, includeTable: e.target.checked })} />
                표 포함
              </label>
            )}
            {feats.table && doc.includeTable && (
              <div className="rp-tablebox">
                <label>표 제목</label>
                <input value={doc.tableCaption} onChange={(e) => setDoc({ ...doc, tableCaption: e.target.value })} />
                <label>표 위치 <span className="rp-sub">AI가 어울리는 섹션을 고르며 직접 바꿀 수 있음</span></label>
                <select value={doc.tableSection} onChange={(e) => setDoc({ ...doc, tableSection: Number(e.target.value) })} aria-label="표가 들어갈 섹션 선택">
                  {tpl?.sections.map((label, i) => (
                    <option key={label + i} value={i + 1}>{i + 1}. {label}</option>
                  ))}
                </select>
                <label>표 내용 <span className="rp-sub">4열 고정 · 첫 줄=머리글</span></label>
                <table className="rp-grid">
                  <tbody>
                    <tr>{doc.headers.map((h, i) => (
                      <td key={i}><input value={h} onChange={(e) => setHeader(i, e.target.value)} aria-label={`머리글 ${i + 1}`} /></td>
                    ))}</tr>
                    {doc.rows.map((row, r) => (
                      <tr key={r}>{row.map((c, j) => (
                        <td key={j}><input value={c} onChange={(e) => setCell(r, j, e.target.value)} aria-label={`${r + 1}행 ${j + 1}열`} /></td>
                      ))}</tr>
                    ))}
                  </tbody>
                </table>
                <button className="rp-attach" onClick={() => setDoc({ ...doc, rows: [...doc.rows, ['', '', '', '']] })}>+ 행 추가</button>
              </div>
            )}

            <button className="rp-primary" onClick={handleDownload} disabled={generating || !doc.title.trim()}>
              <Download size={15} /> {generating ? '생성 중…' : 'HWPX 다운로드'}
            </button>
          </section>
        </div>

        {/* ── 오른쪽: 미리보기 (한글 문서 모양 흉내) ── */}
        <div className="rp-preview">
          <div className="rp-doc">
            <div className="rp-doc-org">파 주 시</div>
            <h1 className="rp-doc-title">{doc.title || '문서 제목'}</h1>
            {doc.overview.trim() && <div className="rp-doc-overview">{doc.overview}</div>}
            {tpl?.sections.map((label, i) => {
              const blocks = parseBlocks(doc.sections[i])
              return (
                <div key={label + i}>
                  <div className="rp-doc-bar"><span>{i + 1}</span>{label}</div>
                  {blocks.length === 0 && <p className="rp-doc-empty">（내용 없음）</p>}
                  {blocks.map((b, j) => (
                    b.level === 'head'
                      ? <p key={j} className="rp-doc-head">□ {b.text}</p>
                      : b.level === 'sub'
                        ? <p key={j} className="rp-doc-sub">- {b.text}</p>
                        : <p key={j} className="rp-doc-item">○ {b.text}</p>
                  ))}
                  {doc.includeTable && doc.tableSection === i + 1 && previewTable}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
