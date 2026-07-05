import { Construction } from 'lucide-react'
import './ComingSoonPage.css'

// 아직 만들지 않은 화면의 자리표시자. 페이지를 하나씩 붙여나가면서
// 이 컴포넌트 대신 실제 페이지 컴포넌트로 교체한다.
export default function ComingSoonPage({ label }) {
  return (
    <div className="page-content coming-soon-page">
      <div className="coming-soon-box">
        <Construction size={32} />
        <h2>{label} 화면 준비 중</h2>
        <p>다음 단계에서 이 화면을 이어서 구현합니다.</p>
      </div>
    </div>
  )
}
