import { useEffect, useRef, useState } from 'react'
import { API_BASE, authHeaders } from '../apiBase'

// 서버(SQLite)에 동기화되는 state(배열 또는 문자열). useStoredState(localStorage)를 대체한다.
// 목표: 브라우저를 지우거나 다른 브라우저·PC로 바꿔도 데이터가 유지되게 한다.
//
// 동작:
//  - 초기값은 localStorage 캐시에서 즉시 읽어 화면 깜빡임을 없앤다(오프라인에서도 즉시 표시).
//  - 마운트 후 서버와 조회해 최신값으로 맞춘다. 서버가 비어 있으면(최초 사용)
//    캐시/기존 localStorage/시드값을 서버에 올려 마이그레이션한다.
//  - 값이 바뀌면 캐시에 쓰고, 디바운스 후 서버에 저장한다. 서버가 꺼져 있으면
//    캐시에만 남아 있다가 다음에 서버가 살아나면 반영된다.

const API = API_BASE + '/api/store'

function readCache(cacheKey, legacyKey) {
  for (const k of [cacheKey, legacyKey].filter(Boolean)) {
    try {
      const raw = localStorage.getItem(k)
      if (raw) return JSON.parse(raw)
    } catch { /* 파싱 실패는 무시하고 다음 후보로 */ }
  }
  return null
}

function writeCache(cacheKey, value) {
  try { localStorage.setItem(cacheKey, JSON.stringify(value)) } catch { /* storage quota */ }
}

async function putServer(key, value) {
  await fetch(`${API}/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ data: value }),
  })
}

export function useServerState(key, fallback, legacyKey) {
  const cacheKey = `store:${key}`
  const [value, setValue] = useState(() => readCache(cacheKey, legacyKey) ?? fallback)
  const ready = useRef(false) // 서버 조회 전에는 저장하지 않는다(빈 값으로 덮어쓰기 방지)
  const timer = useRef(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API}/${key}`, { headers: authHeaders() })
        if (res.ok) {
          const body = await res.json()
          if (body.data != null) { // 배열·문자열 등 저장된 값이 있으면 사용
            if (!cancelled) setValue(body.data)
          } else {
            // 서버에 아직 데이터가 없음(최초) → 캐시/기존값/시드를 서버에 올린다.
            const seed = readCache(cacheKey, legacyKey) ?? fallback
            await putServer(key, seed)
            if (!cancelled) setValue(seed)
          }
        }
      } catch { /* 서버 접속 불가 → 캐시값으로 오프라인 동작 */ }
      if (!cancelled) ready.current = true
    })()
    return () => { cancelled = true }
    // key는 hook 인스턴스마다 고정이라 마운트 시 1회만 실행된다.

  }, [key])

  useEffect(() => {
    writeCache(cacheKey, value)
    if (!ready.current) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { putServer(key, value).catch(() => { /* 오프라인이면 캐시로 유지 */ }) }, 400)

  }, [value])

  return [value, setValue]
}
