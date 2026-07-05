import { Component } from 'react'
import './ErrorBoundary.css'

// 하위 컴포넌트에서 렌더링 중 예외가 발생하면 앱 전체가 하얀 화면으로 죽는 대신
// 이 화면을 보여준다. React는 함수형 컴포넌트로 이 기능을 못 만들기 때문에 클래스로 작성한다.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <h1>문제가 발생했습니다</h1>
          <p>화면을 표시하는 중 오류가 났습니다. 새로고침해서 다시 시도해 주세요.</p>
          <button className="primary-button" onClick={() => window.location.reload()}>새로고침</button>
        </div>
      )
    }
    return this.props.children
  }
}
