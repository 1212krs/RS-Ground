import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Menu, Plus, Search, Trash2, ChevronLeft, Paperclip, Pencil, Download, X, FileText, FolderPlus } from 'lucide-react'
import {
  listStudies, getStudy, createStudy, updateStudy, removeStudy,
  listSubjects, createSubject, removeSubject,
  uploadStudyFile, removeStudyFile, downloadStudyFile,
} from '../../studyApi.js'
import { renderMarkdown } from '../../markdown.js'
import './StudyPage.css'

const ACCEPT = '.txt,.md,.csv,.pdf,.docx,.hwpx,.hwp'
const BOARD_COLORS = ['#6C5CE7', '#1FA25A', '#E8871E', '#F2B705', '#3B82F6']

const fmtSize = (n) => (n < 1024 ? `${n}B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)}KB` : `${(n / 1024 / 1024).toFixed(1)}MB`)

export default function StudyPage() {
  const { notify, onMenu } = useOutletContext()
  const fileInputRef = useRef(null)

  const [view, setView] = useState('list')       // 'list' | 'edit' | 'view'
  const [notes, setNotes] = useState([])
  const [subjects, setSubjects] = useState([])    // [{id, name, count}]
  const [loading, setLoading] = useState(false)

  // 검색
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)

  // 편집 폼
  const [editId, setEditId] = useState(null)      // null이면 새 노트
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')      // 분류(카테고리) 이름
  const [tagText, setTagText] = useState('')
  const [content, setContent] = useState('')
  const [files, setFiles] = useState([])
  const [pendingFiles, setPendingFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  // 상세 보기
  const [current, setCurrent] = useState(null)

  // 분류 추가 모달
  const [subjectModal, setSubjectModal] = useState(false)
  const [newSubject, setNewSubject] = useState('')
  const [creatingSubject, setCreatingSubject] = useState(false)

  const loadNotes = async (q = '') => {
    setLoading(true)
    try {
      const { notes } = await listStudies(q)
      setNotes(notes)
    } catch (err) {
      notify(`목록을 불러오지 못했습니다: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }
  const loadSubjects = async () => {
    try {
      const { subjects } = await listSubjects()
      setSubjects(subjects)
    } catch (err) {
      notify(`분류를 불러오지 못했습니다: ${err.message}`, 'error')
    }
  }

  useEffect(() => { loadNotes(); loadSubjects() }, [])

  // 검색어 입력 → 디바운스
  useEffect(() => {
    if (view !== 'list') return
    const q = query.trim()
    setSearching(!!q)
    const t = setTimeout(() => loadNotes(q), 250)
    return () => clearTimeout(t)
  }, [query, view])

  const knownTags = useMemo(() => [...new Set(notes.flatMap((n) => n.tags || []))], [notes])
  const notesBySubject = useMemo(() => {
    const map = new Map()
    for (const n of notes) {
      const key = n.subject || '미분류'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(n)
    }
    return map
  }, [notes])

  // --- 분류 ---
  const openSubjectModal = () => { setNewSubject(''); setSubjectModal(true) }
  const submitSubject = async () => {
    const name = newSubject.trim()
    if (!name || creatingSubject) return
    setCreatingSubject(true)
    try {
      await createSubject(name)
      await loadSubjects()
      setSubjectModal(false)
      notify('분류를 만들었습니다.')
    } catch (err) {
      notify(`분류 생성 실패: ${err.message}`, 'error')
    } finally {
      setCreatingSubject(false)
    }
  }
  const deleteSubject = async (sid, name, e) => {
    if (e) e.stopPropagation()
    if (!window.confirm(`'${name}' 분류를 삭제할까요? (노트가 있으면 삭제되지 않습니다)`)) return
    try {
      await removeSubject(sid)
      await loadSubjects()
      notify('분류를 삭제했습니다.')
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  // --- 편집 진입 ---
  const startNew = (presetSubject) => {
    setEditId(null); setTitle(''); setSubject(presetSubject || (subjects[0]?.name ?? ''))
    setTagText(''); setContent(''); setFiles([]); setPendingFiles([]); setView('edit')
  }
  const startEdit = (note) => {
    setEditId(note.id); setTitle(note.title); setSubject(note.subject || '')
    setTagText((note.tags || []).join(', ')); setContent(note.content || '')
    setFiles(note.files || []); setPendingFiles([]); setView('edit')
  }

  const openView = async (id) => {
    try {
      setCurrent(await getStudy(id)); setView('view')
    } catch (err) {
      notify(`불러오지 못했습니다: ${err.message}`, 'error')
    }
  }

  const parseTags = (s) => [...new Set(s.split(',').map((t) => t.trim()).filter(Boolean))]

  // --- 파일 첨부 ---
  const handleFiles = async (fileList) => {
    const picked = [...fileList]
    if (editId == null) {
      setPendingFiles((prev) => [...prev, ...picked])
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setUploading(true)
    try {
      for (const file of picked) {
        try {
          const saved = await uploadStudyFile(editId, file)
          setFiles((prev) => [...prev, saved])
          notify(`${file.name} 첨부됨`)
        } catch (err) {
          notify(`${file.name} 첨부 실패: ${err.message}`, 'error')
        }
      }
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }
  const detachSaved = async (fileId) => {
    try {
      await removeStudyFile(fileId)
      setFiles((prev) => prev.filter((f) => f.id !== fileId))
    } catch (err) {
      notify(`첨부 삭제 실패: ${err.message}`, 'error')
    }
  }

  const handleSave = async () => {
    if (!title.trim()) { notify('제목을 입력하세요.', 'error'); return }
    if (!subject) { notify('분류를 선택하세요.', 'error'); return }
    setSaving(true)
    try {
      const body = { title, subject, tags: parseTags(tagText), content }
      if (editId == null) {
        const { id } = await createStudy(body)
        for (const file of pendingFiles) {
          try { await uploadStudyFile(id, file) }
          catch (err) { notify(`${file.name} 첨부 실패: ${err.message}`, 'error') }
        }
        notify('노트를 저장했습니다.')
      } else {
        await updateStudy(editId, body)
        notify('노트를 수정했습니다.')
      }
      await Promise.all([loadNotes(query.trim()), loadSubjects()])
      setView('list')
    } catch (err) {
      notify(`저장 실패: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id, e) => {
    if (e) e.stopPropagation()
    if (!window.confirm('이 노트를 삭제할까요? (첨부 파일도 함께 삭제됩니다)')) return
    try {
      await removeStudy(id)
      notify('삭제했습니다.')
      if (view === 'view') setView('list')
      await Promise.all([loadNotes(query.trim()), loadSubjects()])
    } catch (err) {
      notify(`삭제 실패: ${err.message}`, 'error')
    }
  }

  return (
    <div className="st">
      <header className="st-head">
        <button className="oa-icon mobile-only" onClick={onMenu} aria-label="메뉴"><Menu size={20} /></button>
        <div>
          <h1>공부 노트</h1>
          <p className="st-sub">분류를 먼저 만들고, 그 안에서 노트를 작성해 과목별로 모으고 검색합니다.</p>
        </div>
      </header>

      {/* ---------- 목록 ---------- */}
      {view === 'list' && (
        <>
          <div className="st-toolbar">
            <div className="st-search">
              <Search size={16} />
              <input placeholder="제목·내용·태그·첨부파일 검색"
                value={query} onChange={(e) => setQuery(e.target.value)} />
              {query && <button className="st-search-clear" onClick={() => setQuery('')} aria-label="지우기"><X size={14} /></button>}
            </div>
            <button className="st-primary" onClick={openSubjectModal}><FolderPlus size={16} /> 분류 추가</button>
          </div>

          {searching ? (
            // 검색 결과: 평평한 목록
            loading ? <p className="st-empty">불러오는 중…</p>
            : notes.length === 0 ? <p className="st-empty">검색 결과가 없습니다.</p>
            : (
              <ul className="st-results">
                {notes.map((n) => (
                  <li key={n.id} className="st-result-item" onClick={() => openView(n.id)}>
                    <FileText size={16} />
                    <div className="st-result-info">
                      <strong>{n.title}</strong>
                      {n.preview && <span className="st-result-preview">{n.preview}</span>}
                      <span className="st-result-meta">
                        {n.subject && <em className="st-badge-sm">{n.subject}</em>}
                        {(n.tags || []).map((t) => <em key={t} className="st-tag-chip">#{t}</em>)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : subjects.length === 0 ? (
            <p className="st-empty">아직 분류가 없습니다. '분류 추가'로 첫 분류(예: 과목)를 만들어 보세요.</p>
          ) : (
            // 분류별 보드 (빈 분류도 표시)
            <div className="st-board">
              {subjects.map((s, ci) => {
                const items = notesBySubject.get(s.name) || []
                return (
                  <div className="st-column" key={s.id}>
                    <div className="st-column-head" style={{ '--st-accent': BOARD_COLORS[ci % BOARD_COLORS.length] }}>
                      <span className="st-column-name">{s.name} <span className="st-count">{s.count}</span></span>
                      <button className="st-col-del" onClick={(e) => deleteSubject(s.id, s.name, e)} aria-label="분류 삭제"><Trash2 size={13} /></button>
                    </div>
                    <button className="st-add-note" onClick={() => startNew(s.name)}><Plus size={14} /> 노트</button>
                    <div className="st-column-body">
                      {items.map((n) => (
                        <div key={n.id} className="st-note-card" onClick={() => openView(n.id)}>
                          <strong>{n.title}</strong>
                          {n.preview && <p className="st-note-preview">{n.preview}</p>}
                          {n.tags?.length > 0 && (
                            <div className="st-note-tags">
                              {n.tags.map((t) => <span key={t} className="st-tag-chip">#{t}</span>)}
                            </div>
                          )}
                          <div className="st-note-foot">
                            <span>{new Date(n.updated_at).toLocaleDateString('ko-KR')}</span>
                            <button className="st-del" onClick={(e) => handleDelete(n.id, e)} aria-label="삭제"><Trash2 size={13} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ---------- 편집 ---------- */}
      {view === 'edit' && (
        <div className="st-editor">
          <button className="st-back" onClick={() => setView('list')}><ChevronLeft size={16} /> 목록으로</button>

          <div className="st-meta-row">
            <input className="st-input st-title-input" placeholder="제목"
              value={title} onChange={(e) => setTitle(e.target.value)} />
            <select className="st-input st-subject-select" value={subject} onChange={(e) => setSubject(e.target.value)}>
              {subjects.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
            <input className="st-input" list="st-tags" placeholder="태그 (쉼표로 구분)"
              value={tagText} onChange={(e) => setTagText(e.target.value)} />
            <datalist id="st-tags">{knownTags.map((t) => <option key={t} value={t} />)}</datalist>
          </div>

          <div className="st-split">
            <textarea className="st-md-input" placeholder="# 제목&#10;- 목록&#10;**굵게** *기울임* `코드`&#10;&gt; 인용"
              value={content} onChange={(e) => setContent(e.target.value)} />
            <div className="st-md-preview st-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
          </div>

          <div className="st-attach">
            <button className="st-attach-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <Paperclip size={14} /> {uploading ? '첨부 중…' : '파일 첨부'}
            </button>
            <input ref={fileInputRef} type="file" accept={ACCEPT} multiple hidden
              onChange={(e) => e.target.files.length && handleFiles(e.target.files)} />
            <div className="st-attach-list">
              {files.map((f) => (
                <span key={f.id} className="st-attach-chip">
                  {f.filename} <span className="st-attach-size">{fmtSize(f.size)}</span>
                  <button onClick={() => detachSaved(f.id)} aria-label="첨부 삭제"><X size={12} /></button>
                </span>
              ))}
              {pendingFiles.map((f, i) => (
                <span key={`p${i}`} className="st-attach-chip st-pending">
                  {f.name} <span className="st-attach-size">저장 시 첨부</span>
                  <button onClick={() => setPendingFiles((prev) => prev.filter((_, k) => k !== i))} aria-label="취소"><X size={12} /></button>
                </span>
              ))}
            </div>
          </div>

          <div className="st-editor-actions">
            <button className="st-primary" onClick={handleSave} disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
          </div>
        </div>
      )}

      {/* ---------- 상세 보기 ---------- */}
      {view === 'view' && current && (
        <div className="st-viewer">
          <div className="st-view-top">
            <button className="st-back" onClick={() => setView('list')}><ChevronLeft size={16} /> 목록으로</button>
            <div className="st-view-actions">
              <button className="st-secondary" onClick={() => startEdit(current)}><Pencil size={14} /> 수정</button>
              <button className="st-secondary st-danger" onClick={() => handleDelete(current.id)}><Trash2 size={14} /> 삭제</button>
            </div>
          </div>

          <h2 className="st-title">{current.title}</h2>
          <div className="st-badges">
            {current.subject && <span className="st-badge">{current.subject}</span>}
            {(current.tags || []).map((t) => <span key={t} className="st-tag-chip">#{t}</span>)}
          </div>

          <div className="st-markdown st-view-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(current.content) }} />

          {current.files?.length > 0 && (
            <section className="st-files">
              <h3><Paperclip size={15} /> 첨부 파일</h3>
              <ul>
                {current.files.map((f) => (
                  <li key={f.id}>
                    <FileText size={15} />
                    <span className="st-file-name">{f.filename}</span>
                    <span className="st-attach-size">{fmtSize(f.size)}</span>
                    <button className="st-file-dl" onClick={() => downloadStudyFile(f.id, f.filename)} aria-label="다운로드"><Download size={15} /></button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* ---------- 분류 추가 모달 ---------- */}
      {subjectModal && (
        <div className="st-modal-backdrop" onMouseDown={() => setSubjectModal(false)}>
          <div className="st-modal" role="dialog" aria-modal="true" aria-label="새 분류" onMouseDown={(e) => e.stopPropagation()}>
            <h3 className="st-modal-title">새 분류</h3>
            <input className="st-input st-modal-input" autoFocus placeholder="예: 행정법"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitSubject()
                else if (e.key === 'Escape') setSubjectModal(false)
              }} />
            <div className="st-modal-actions">
              <button className="st-secondary" onClick={() => setSubjectModal(false)}>취소</button>
              <button className="st-primary" onClick={submitSubject} disabled={!newSubject.trim() || creatingSubject}>
                {creatingSubject ? '만드는 중…' : '만들기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
