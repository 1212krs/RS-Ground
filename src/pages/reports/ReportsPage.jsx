import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { ChevronDown, ChevronRight, Download, FilePenLine, FilePlus2, Menu, Paperclip, Sparkles, Trash2 } from 'lucide-react'
import {
  checkTemplateFile, composeReport, createTemplate, deleteTemplate,
  generateReport, getReportStatus, listTemplates,
} from '../../reportApi.js'
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

// AI 응답(doc)을 편집 상태로 변환. 섹션 블록 배열 → 줄 단위 텍스트
// (목차 "1. "(순서대로 자동 번호), 대항목 "□ ", 하위 "- " 접두)
const levelPrefix = { head: '□ ', sub: '- ' }
const docToEdit = (doc, tpl) => ({
  title: doc.title || '',
  // 개요란 없는 서식은 AI가 개요를 보내와도 버린다 (hwpx에 안 들어가는데 미리보기에만 보이는 혼란 방지)
  overview: (tpl.features?.overview ?? true) ? (doc.overview || '') : '',
  sections: tpl.sections.map((_, i) => {
    let secNo = 0
    return (doc.sections?.[i] || []).map((b) =>
      (b.level === 'sec' ? `${++secNo}. ` : levelPrefix[b.level] || '') + b.text).join('\n')
  }),
  includeTable: Boolean(doc.table),
  tableCaption: doc.table?.caption || '',
  tableSection: doc.table?.section || tpl.sections.length,
  headers: [...(doc.table?.headers || []), '', '', '', ''].slice(0, 4),
  rows: (doc.table?.rows || []).map((r) => [...r, '', '', '', ''].slice(0, 4)),
})

// 편집 상태의 섹션 텍스트를 미리보기용 블록으로 파싱
const parseBlocks = (text, feats) => (text || '').split('\n')
  .map((line) => line.trim()).filter(Boolean)
  .map((line) => {
    const sec = feats?.sec && line.match(/^\d{1,2}[.)]\s+(.*)/)
    if (sec) return { level: 'sec', text: sec[1] }
    if (line.startsWith('□')) return { level: 'head', text: line.replace(/^□\s*/, '') }
    if (line.startsWith('-') || line.startsWith('―')) return { level: 'sub', text: line.replace(/^[-―]\s*/, '') }
    return { level: 'item', text: line.replace(/^○\s*/, '') }
  })

// 담당자가 한글 문서에 적어 넣는 표시어 — 백엔드 template_builder.WORD_MARKERS 와 짝을 이룬다
const MARKER_WORDS = [
  { word: '제목', desc: '문서 제목이 들어갈 자리', required: true },
  { word: '개요', desc: '개요 상자 (없는 서식이면 생략)', required: false },
  { word: '목차', desc: '번호 목차 (AI가 목차를 짜는 서식용)', required: false },
  { word: '대항목', desc: '□ 소제목 묶음', required: false },
  { word: '대제목', desc: '○ 항목 — 한 줄만 견본으로', required: true },
  { word: '소제목', desc: '- 세부 — 한 줄만 견본으로', required: true },
  { word: '표제목', desc: '표 위 캡션', required: false },
  { word: '머리글', desc: '표 첫 줄 4칸에 각각', required: false },
  { word: '표내용', desc: '표 둘째 줄 4칸에 각각', required: false },
]

export default function ReportsPage() {
  const { notify, onMenu } = useOutletContext()
  const fileInputRef = useRef(null)
  const tplFileRef = useRef(null)

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

  // ③ 서식 만들기 (샘플 hwpx → 서식 자동 변환·등록)
  const [tplOpen, setTplOpen] = useState(false)
  const [tFile, setTFile] = useState(null)
  const [tName, setTName] = useState('')
  const [tGuide, setTGuide] = useState('')
  const [tBusy, setTBusy] = useState('')        // '' | 'check' | 'save'
  const [tPass, setTPass] = useState(null)      // 검사 통과 결과 { sections, features, steps }
  const [tErrors, setTErrors] = useState([])
  const [tWarnings, setTWarnings] = useState([])

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

  // ── 서식 만들기 ──────────────────────────────────────────────
  const resetTplCheck = () => { setTPass(null); setTErrors([]); setTWarnings([]) }

  const pickTplFile = (event) => {
    const f = event.target.files[0]
    event.target.value = ''
    if (!f) return
    resetTplCheck()
    setTFile(f)
    if (!tName.trim()) setTName(f.name.replace(/\.hwpx$/i, ''))
  }

  const handleTplCheck = async () => {
    if (!tFile) return
    setTBusy('check')
    resetTplCheck()
    try {
      const out = await checkTemplateFile(tFile)
      setTPass(out)
      setTWarnings(out.warnings || [])
    } catch (err) {
      setTErrors(err.errors?.length ? err.errors : [err.message])
      setTWarnings(err.warnings || [])
    } finally {
      setTBusy('')
    }
  }

  const saveTemplate = async (overwrite) => {
    setTBusy('save')
    try {
      const out = await createTemplate({ file: tFile, name: tName, guide: tGuide, overwrite })
      const list = await listTemplates()
      setTemplates(list)
      setTplId(out.id)
      setDoc(emptyDoc(list.find((t) => t.id === out.id)))
      setTFile(null); setTName(''); setTGuide(''); resetTplCheck()
      notify(`'${out.name}' 서식을 등록했습니다. 위 서식 목록에서 바로 쓸 수 있습니다.`)
    } catch (err) {
      // 같은 이름이 이미 있거나 기본 서식과 겹치면(409) 서버가 준 사유를 그대로 보여주고 다시 묻는다
      if (err.status === 409 && !overwrite
          && window.confirm(`${err.errors?.[0] || `'${tName}' 서식이 이미 있습니다.`}\n\n계속할까요?`)) {
        setTBusy('')
        return saveTemplate(true)
      }
      setTErrors(err.errors?.length ? err.errors : [err.message])
    } finally {
      setTBusy('')
    }
  }

  const handleTplDelete = async (t) => {
    if (!window.confirm(`'${t.name}' 서식을 삭제할까요? 작성 지침도 함께 지워집니다.`)) return
    try {
      await deleteTemplate(t.id)
      const list = await listTemplates()
      setTemplates(list)
      if (tplId === t.id) {
        setTplId(list[0]?.id || '')
        setDoc(emptyDoc(list[0]))
      }
      notify(`'${t.name}' 서식을 삭제했습니다.`)
    } catch (err) {
      notify(`삭제 실패: ${err.errors?.[0] || err.message}`, 'error')
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
            <p className="rp-hint">{feats.sec
              ? '한 줄 = 한 항목 · 줄 앞 “1.” 숫자는 목차(번호 자동), “□”는 대항목, “-”는 세부, 없으면 항목(○)'
              : feats.head
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

          {/* ── 서식 만들기: 표시어만 적은 한글 문서 → 서식으로 자동 변환 ── */}
          <section className="rp-card rp-tpl">
            <h2 className="rp-fold" onClick={() => setTplOpen((o) => !o)}>
              {tplOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              <FilePlus2 size={15} /> 서식 만들기
              <span className="rp-sub">한글 문서를 올려 새 서식 등록</span>
            </h2>

            {tplOpen && (
              <>
                <p className="rp-hint">
                  한글에서 원하는 서식을 만든 뒤, 내용이 들어갈 자리에 <b>표시어</b>를 적어 저장하세요.
                  표시어는 <b>한 줄에 하나만</b> 단독으로 적습니다(다른 글자와 같은 줄에 있으면 인식되지 않습니다).
                  글꼴·여백·표 디자인은 적어 둔 그대로 유지됩니다.
                  <br />본문에 같은 낱말이 들어가 헷갈릴 때만 <code>[[제목]]</code>처럼 대괄호 두 개로 감싸세요
                  (감쌌다면 문서 전체를 그 방식으로 통일해야 합니다).
                </p>
                <ul className="rp-words">
                  {MARKER_WORDS.map((m) => (
                    <li key={m.word} className={m.required ? 'req' : ''}>
                      <code>{m.word}</code>
                      <span>{m.desc}</span>
                      {m.required && <em>필수</em>}
                    </li>
                  ))}
                </ul>

                <label>샘플 한글 문서 <span className="rp-sub">hwpx · 최대 5MB</span></label>
                <button className="rp-attach" onClick={() => tplFileRef.current?.click()} disabled={!!tBusy}>
                  <Paperclip size={14} /> {tFile ? tFile.name : '파일 선택'}
                </button>
                <input ref={tplFileRef} type="file" hidden accept=".hwpx" onChange={pickTplFile} />

                <button className="rp-attach rp-check-btn" onClick={handleTplCheck} disabled={!tFile || !!tBusy}>
                  {tBusy === 'check' ? '검사 중…' : '① 검사하기'}
                </button>

                {tErrors.length > 0 && (
                  <div className="rp-diag err">
                    <strong>서식으로 만들 수 없습니다. 아래를 고쳐서 다시 올려주세요.</strong>
                    <ul>{tErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                  </div>
                )}
                {tWarnings.length > 0 && (
                  <div className="rp-diag warn">
                    <strong>확인해 주세요</strong>
                    <ul>{tWarnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                  </div>
                )}
                {tPass && (
                  <div className="rp-diag ok">
                    <strong>✓ 서식으로 쓸 수 있습니다</strong>
                    <ul>
                      <li>목차 {tPass.sections.length}개: {tPass.sections.join(' · ')}</li>
                      <li>
                        지원 기능: {[
                          tPass.features.overview && '개요', tPass.features.table && '표',
                          tPass.features.sec && '번호 목차', tPass.features.head && '□ 대항목',
                        ].filter(Boolean).join(' · ') || '기본 항목만'}
                      </li>
                      {tPass.steps.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}

                {tPass && (
                  <>
                    <label>서식 이름 * <span className="rp-sub">목록에 표시될 이름</span></label>
                    <input value={tName} onChange={(e) => setTName(e.target.value)}
                      placeholder="예: 검토보고서" disabled={!!tBusy} />
                    <label>작성 지침 <span className="rp-sub">선택 · AI에게 줄 이 서식만의 규칙</span></label>
                    <textarea rows={3} value={tGuide} onChange={(e) => setTGuide(e.target.value)}
                      disabled={!!tBusy} placeholder="예: 목차는 5개를 넘지 않는다. 결론을 첫 줄에 쓴다." />
                    <button className="rp-primary" onClick={() => saveTemplate(false)}
                      disabled={!tName.trim() || !!tBusy}>
                      <FilePlus2 size={15} /> {tBusy === 'save' ? '등록 중…' : '② 서식으로 등록'}
                    </button>
                  </>
                )}

                <label>등록된 서식 <span className="rp-sub">기본 서식은 지울 수 없습니다</span></label>
                <ul className="rp-tpllist">
                  {templates.map((t) => (
                    <li key={t.id}>
                      <span>{t.name}</span>
                      <span className="rp-sub">
                        {t.builtin ? '기본' : '내가 등록'} · {t.sections.length}개 섹션{t.has_guide ? ' · 지침' : ''}
                      </span>
                      {!t.builtin && (
                        <button onClick={() => handleTplDelete(t)} aria-label={`${t.name} 삭제`} title="삭제">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        {/* ── 오른쪽: 미리보기 (한글 문서 모양 흉내) ── */}
        <div className="rp-preview">
          <div className="rp-doc">
            <div className="rp-doc-org">파 주 시</div>
            <h1 className="rp-doc-title">{doc.title || '문서 제목'}</h1>
            {doc.overview.trim() && <div className="rp-doc-overview">{doc.overview}</div>}
            {tpl?.sections.map((label, i) => {
              const blocks = parseBlocks(doc.sections[i], feats)
              let secNo = 0
              return (
                <div key={label + i}>
                  {tpl.sections.length > 1 && <div className="rp-doc-bar"><span>{i + 1}</span>{label}</div>}
                  {blocks.length === 0 && <p className="rp-doc-empty">（내용 없음）</p>}
                  {blocks.map((b, j) => {
                    if (b.level === 'sec') { secNo += 1; return <p key={j} className="rp-doc-sec">{secNo}. {b.text}</p> }
                    if (b.level === 'head') return <p key={j} className="rp-doc-head">□ {b.text}</p>
                    if (b.level === 'sub') return <p key={j} className="rp-doc-sub">- {b.text}</p>
                    return <p key={j} className="rp-doc-item">○ {b.text}</p>
                  })}
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
