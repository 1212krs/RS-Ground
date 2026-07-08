import { useEffect, useRef, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { Menu, Send, FileText, Sparkles } from 'lucide-react'
import { chat } from '../../ragApi.js'
import './ChatPage.css'

// 하나의 채팅 화면이 URL 파라미터로 두 모드를 겸한다.
//   /chat                         → AI챗 (전체 문서 검색)
//   /chat?scope=회계&label=회계챗  → 회계챗 (회계 분야만 검색)
// 임베딩 창고는 같고, category_l1 필터만 다르다.
export default function ChatPage() {
  const { onMenu } = useOutletContext()
  const [params] = useSearchParams()
  const scope = params.get('scope') || ''
  const title = params.get('label') || (scope ? `${scope}챗` : 'AI 채팅')
  const subtitle = scope ? `${scope} 분야 문서만 검색` : '전체 문서에서 검색'

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef(null)

  // 에이전트(검색 범위)가 바뀌면 대화를 초기화한다.
  useEffect(() => { setMessages([]) }, [scope])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  const send = async () => {
    const question = input.trim()
    if (!question || loading) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: question }])
    setLoading(true)
    try {
      const res = await chat({ question, categoryL1: scope, scopeLabel: scope })
      setMessages((m) => [...m, {
        role: 'assistant', text: res.answer, sources: res.sources || [], engine: res.engine,
      }])
    } catch (err) {
      setMessages((m) => [...m, {
        role: 'assistant', text: `답변을 가져오지 못했습니다: ${err.message}`, sources: [], engine: 'error',
      }])
    } finally {
      setLoading(false)
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const suggestions = scope === '회계'
    ? ['수의계약이 가능한 경우는?', '지출원인행위란 무엇인가?', '예정가격은 어떻게 결정하나?']
    : ['이 프로젝트의 기술 스택은?', '지식 탭은 어떻게 동작하나?']

  return (
    <div className="ai">
      <header className="ai-head">
        <button className="oa-icon mobile-only" onClick={onMenu} aria-label="메뉴"><Menu size={20} /></button>
        <div>
          <h1>{title}</h1>
          <p className="ai-sub">{subtitle}</p>
        </div>
      </header>

      <div className="ai-thread" ref={scrollRef}>
        {messages.length === 0 && !loading && (
          <div className="ai-empty">
            <Sparkles size={28} />
            <p>무엇이든 물어보세요. 올려둔 문서를 근거로 답합니다.</p>
            <div className="ai-suggest">
              {suggestions.map((s) => (
                <button key={s} onClick={() => setInput(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ai-msg-${m.role}`}>
            <div className="ai-bubble">
              <div className="ai-text">{m.text}</div>
              {m.role === 'assistant' && m.sources?.length > 0 && (
                <details className="ai-sources">
                  <summary>근거 {m.sources.length}개{m.engine === 'fallback' ? ' (AI 답변 미사용)' : ''}</summary>
                  <ul>
                    {m.sources.map((s) => (
                      <li key={s.n}>
                        <FileText size={13} />
                        <span className="ai-src-name">[{s.n}] {s.source.split('/').pop()} · 조각 {s.chunk_index}</span>
                        <span className="ai-src-preview">{s.preview}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="ai-msg ai-msg-assistant">
            <div className="ai-bubble ai-typing"><span></span><span></span><span></span></div>
          </div>
        )}
      </div>

      <div className="ai-inputbar">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`${title}에게 질문하기…  (Enter 전송, Shift+Enter 줄바꿈)`}
          rows={1}
        />
        <button className="ai-send" onClick={send} disabled={loading || !input.trim()} aria-label="전송">
          <Send size={18} />
        </button>
      </div>
    </div>
  )
}
