import { useEffect, useState } from 'react'

/** 값 변경을 delay ms 만큼 지연 — 검색·필터 입력 렉 방지 */
export function useDebouncedValue(value, delay = 200) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])

  return debounced
}
