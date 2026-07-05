import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import './NotFoundPage.css'

export default function NotFoundPage() {
  return (
    <div className="not-found-page">
      <Compass size={32} />
      <h1>404</h1>
      <p>요청하신 주소를 찾을 수 없습니다.</p>
      <Link to="/" className="primary-button">홈으로 이동</Link>
    </div>
  )
}
