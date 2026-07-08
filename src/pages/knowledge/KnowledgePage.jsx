import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { FileText, Menu, List, Waypoints, UploadCloud } from 'lucide-react'
import { listDocuments, uploadDocument, getUmap, rebuildUmap } from '../../ragApi.js'
import EmbeddingMap from './EmbeddingMap.jsx'
import './KnowledgePage.css'

export default function KnowledgePage() {
  const { notify, onMenu } = useOutletContext()
  const fileInputRef = useRef(null)
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [categoryL1, setCategoryL1] = useState('')
  const [categoryL2, setCategoryL2] = useState('')
  const [categoryL3, setCategoryL3] = useState('')
  const [view, setView] = useState('list')        // 'list' | 'map'
  const [umap, setUmap] = useState(null)           // { points, stale, count, collection_count }
  const [umapLoading, setUmapLoading] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)

  const refresh = async () => {
    setLoading(true)
    try {
      const { documents } = await listDocuments()
      setDocuments(documents)
    } catch (err) {
      notify(`문서 목록을 불러오지 못했습니다: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const loadUmap = async () => {
    setUmapLoading(true)
    try {
      setUmap(await getUmap())
    } catch (err) {
      notify(`지도를 불러오지 못했습니다: ${err.message}`, 'error')
    } finally {
      setUmapLoading(false)
    }
  }

  const showMap = () => {
    setView('map')
    if (!umap) loadUmap()
  }

  const handleRebuild = async () => {
    setRebuilding(true)
    try {
      setUmap(await rebuildUmap())
      notify('임베딩 지도를 새로 만들었습니다.')
    } catch (err) {
      notify(`지도 생성 실패: ${err.message}`, 'error')
    } finally {
      setRebuilding(false)
    }
  }

  const handleFileChange = async (event) => {
    const file = event.target.files[0]
    event.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const result = await uploadDocument(file, { categoryL1, categoryL2, categoryL3 })
      notify(`"${result.source}" 임베딩 완료 (청크 ${result.chunk_count}개)`)
      await refresh()
    } catch (err) {
      notify(`업로드 실패: ${err.message}`, 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="kb">
      <header className="kb-head">
        <button className="oa-icon mobile-only" onClick={onMenu} aria-label="메뉴"><Menu size={20} /></button>
        <h1>지식</h1>
      </header>

      {view === 'list' && (
        <section className="kb-card kb-upload">
          <h2>문서 업로드</h2>
          <p className="kb-hint">.txt, .md, .pdf, .docx, .hwpx 파일을 지원합니다. 업로드하면 자동으로 텍스트 추출 → 청킹 → 임베딩 → 색인까지 진행됩니다.</p>
          <div className="kb-category-row">
            <input placeholder="대분류 (예: 회계)" value={categoryL1} onChange={(e) => setCategoryL1(e.target.value)} disabled={uploading} />
            <input placeholder="중분류 (예: 계약)" value={categoryL2} onChange={(e) => setCategoryL2(e.target.value)} disabled={uploading} />
            <input placeholder="소분류 (예: 수의계약)" value={categoryL3} onChange={(e) => setCategoryL3(e.target.value)} disabled={uploading} />
          </div>
          <button className="kb-upload-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <UploadCloud size={16} /> {uploading ? '임베딩 처리 중…' : '내 PC에서 문서 선택'}
          </button>
          <input ref={fileInputRef} type="file" accept=".txt,.md,.pdf,.docx,.hwpx" hidden onChange={handleFileChange} />
        </section>
      )}

      <section className="kb-card kb-list">
        <div className="kb-list-head">
          <h2>색인된 문서{!loading && ` (${documents.length})`}</h2>
          <div className="kb-viewtoggle">
            <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}><List size={14} /> 목록</button>
            <button className={view === 'map' ? 'on' : ''} onClick={showMap}><Waypoints size={14} /> 지도</button>
          </div>
        </div>

        {view === 'list' ? (
          loading ? (
            <p className="kb-empty">불러오는 중…</p>
          ) : documents.length === 0 ? (
            <p className="kb-empty">아직 업로드된 문서가 없습니다.</p>
          ) : (
            <ul className="kb-doc-list">
              {documents.map((doc) => (
                <li key={doc.source} className="kb-doc">
                  <FileText size={16} />
                  <div className="kb-doc-info">
                    <strong>{doc.source}</strong>
                    <div className="kb-badges">
                      {doc.category_l1 && <span className="kb-badge">{doc.category_l1}</span>}
                      {doc.category_l2 && <span className="kb-badge">{doc.category_l2}</span>}
                      {doc.category_l3 && <span className="kb-badge">{doc.category_l3}</span>}
                      <span className="kb-badge success">색인 완료</span>
                    </div>
                  </div>
                  <span className="kb-chunk-count">{doc.chunk_count}개 청크</span>
                </li>
              ))}
            </ul>
          )
        ) : (
          <div className="kb-mapwrap">
            {umapLoading ? (
              <p className="kb-empty">지도 불러오는 중…</p>
            ) : !umap || umap.points.length === 0 ? (
              <div className="kb-map-empty">
                <p>색인된 문서로 임베딩 지도를 만들 수 있습니다. 비슷한 내용의 조각끼리 뭉쳐서 보입니다.</p>
                <button className="kb-upload-btn" onClick={handleRebuild} disabled={rebuilding}>
                  {rebuilding ? '지도 생성 중… (수십 초)' : '지도 만들기'}
                </button>
              </div>
            ) : (
              <>
                {umap.stale && (
                  <div className="kb-map-banner">
                    <span>문서가 바뀌어 지도가 최신이 아닙니다 (표시 {umap.count}개 / 현재 {umap.collection_count}개).</span>
                    <button onClick={handleRebuild} disabled={rebuilding}>
                      {rebuilding ? '생성 중…' : '지도 새로 만들기'}
                    </button>
                  </div>
                )}
                <EmbeddingMap points={umap.points} />
              </>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
