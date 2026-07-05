import { CheckCircle2 } from 'lucide-react'

export default function Toast({ toast }) {
  if (!toast) return null
  return (
    <div className={`toast ${toast.type}`}>
      <CheckCircle2 size={18} />
      <span>{toast.message}</span>
    </div>
  )
}
