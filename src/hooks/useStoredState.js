import { useEffect, useState } from 'react'

// localStorage에 값을 동기화하는 state. 여러 페이지가 같은 키를 공유할 때 재사용한다.
export function useStoredState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key)
      return saved ? JSON.parse(saved) : initialValue
    } catch { return initialValue }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage quota */ }
  }, [key, value])
  return [value, setValue]
}
