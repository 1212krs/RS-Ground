import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle, Color } from '@tiptap/extension-text-style'
import { Highlight } from '@tiptap/extension-highlight'
import { TableKit } from '@tiptap/extension-table'
import {
  Bold, Italic, Underline, Strikethrough, Heading1, Heading2,
  List, ListOrdered, Quote, Code, Table as TableIcon, Highlighter, RemoveFormatting,
  Rows, Columns, Trash2,
} from 'lucide-react'
import { renderMarkdown } from '../../markdown.js'
import './RichEditor.css'

// 글자색 / 형광펜 스와치 (몇 가지 지정색)
const TEXT_COLORS = ['#E5484D', '#E8871E', '#F2B705', '#1FA25A', '#3B82F6', '#6C5CE7']
const HL_COLORS = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fecaca', '#e9d5ff']

// content가 HTML이 아니면(옛 마크다운 노트) 1회 변환해 호환.
const toHtml = (v) => {
  const s = v || ''
  return s.trim().startsWith('<') ? s : renderMarkdown(s)
}

function Btn({ on, active, disabled, title, children }) {
  return (
    <button type="button" className={`rte-btn${active ? ' on' : ''}`} title={title}
      disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={on}>
      {children}
    </button>
  )
}

function Toolbar({ editor }) {
  if (!editor) return null
  const chain = () => editor.chain().focus()
  const inTable = editor.isActive('table')
  return (
    <div className="rte-toolbar">
      <Btn title="굵게" active={editor.isActive('bold')} on={() => chain().toggleBold().run()}><Bold size={15} /></Btn>
      <Btn title="기울임" active={editor.isActive('italic')} on={() => chain().toggleItalic().run()}><Italic size={15} /></Btn>
      <Btn title="밑줄" active={editor.isActive('underline')} on={() => chain().toggleUnderline().run()}><Underline size={15} /></Btn>
      <Btn title="취소선" active={editor.isActive('strike')} on={() => chain().toggleStrike().run()}><Strikethrough size={15} /></Btn>
      <span className="rte-sep" />
      <Btn title="제목1" active={editor.isActive('heading', { level: 1 })} on={() => chain().toggleHeading({ level: 1 }).run()}><Heading1 size={15} /></Btn>
      <Btn title="제목2" active={editor.isActive('heading', { level: 2 })} on={() => chain().toggleHeading({ level: 2 }).run()}><Heading2 size={15} /></Btn>
      <Btn title="글머리 목록" active={editor.isActive('bulletList')} on={() => chain().toggleBulletList().run()}><List size={15} /></Btn>
      <Btn title="번호 목록" active={editor.isActive('orderedList')} on={() => chain().toggleOrderedList().run()}><ListOrdered size={15} /></Btn>
      <Btn title="인용" active={editor.isActive('blockquote')} on={() => chain().toggleBlockquote().run()}><Quote size={15} /></Btn>
      <Btn title="코드" active={editor.isActive('code')} on={() => chain().toggleCode().run()}><Code size={15} /></Btn>
      <span className="rte-sep" />

      {/* 글자색 */}
      <div className="rte-colors" title="글자색">
        {TEXT_COLORS.map((c) => (
          <button key={c} type="button" className="rte-swatch" style={{ background: c }}
            title={`글자색 ${c}`} onMouseDown={(e) => e.preventDefault()}
            onClick={() => chain().setColor(c).run()} />
        ))}
        <label className="rte-swatch rte-swatch-custom" title="다른 색상 선택" onMouseDown={(e) => e.preventDefault()}>
          <input type="color" aria-label="글자색 직접 선택" onChange={(e) => chain().setColor(e.target.value).run()} />
        </label>
        <Btn title="글자색 지우기" on={() => chain().unsetColor().run()}><RemoveFormatting size={14} /></Btn>
      </div>
      <span className="rte-sep" />

      {/* 형광펜 */}
      <div className="rte-colors" title="형광펜">
        <Highlighter size={14} className="rte-hl-icon" />
        {HL_COLORS.map((c) => (
          <button key={c} type="button" className="rte-swatch" style={{ background: c }}
            title={`형광펜 ${c}`} onMouseDown={(e) => e.preventDefault()}
            onClick={() => chain().toggleHighlight({ color: c }).run()} />
        ))}
        <label className="rte-swatch rte-swatch-custom" title="다른 색상 선택" onMouseDown={(e) => e.preventDefault()}>
          <input type="color" aria-label="형광펜 직접 선택" onChange={(e) => chain().toggleHighlight({ color: e.target.value }).run()} />
        </label>
        <Btn title="형광펜 지우기" on={() => chain().unsetHighlight().run()}><RemoveFormatting size={14} /></Btn>
      </div>
      <span className="rte-sep" />

      {/* 표 */}
      <Btn title="표 삽입 (3×3)" on={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon size={15} /></Btn>
      {inTable && (
        <>
          <Btn title="열 추가" on={() => chain().addColumnAfter().run()}><Columns size={15} /></Btn>
          <Btn title="행 추가" on={() => chain().addRowAfter().run()}><Rows size={15} /></Btn>
          <Btn title="열 삭제" on={() => chain().deleteColumn().run()}><Columns size={15} className="rte-del" /></Btn>
          <Btn title="행 삭제" on={() => chain().deleteRow().run()}><Rows size={15} className="rte-del" /></Btn>
          <Btn title="표 삭제" on={() => chain().deleteTable().run()}><Trash2 size={15} /></Btn>
        </>
      )}
    </div>
  )
}

export default function RichEditor({ value = '', onChange, editable = true }) {
  const editor = useEditor({
    editable,
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TableKit.configure({ table: { resizable: true } }),
    ],
    content: toHtml(value),
    onUpdate: ({ editor }) => onChange && onChange(editor.getHTML()),
  }, [])

  useEffect(() => { if (editor) editor.setEditable(editable) }, [editable, editor])

  // 보기 모드에서 다른 노트로 value가 바뀌면 반영(편집 모드에선 초깃값만 사용).
  useEffect(() => {
    if (editor && !editable) {
      const html = toHtml(value)
      if (html !== editor.getHTML()) editor.commands.setContent(html)
    }
  }, [value, editable, editor])

  if (!editor) return null
  return (
    <div className={editable ? 'rte' : 'rte rte-readonly'}>
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} className="rte-content" />
    </div>
  )
}
