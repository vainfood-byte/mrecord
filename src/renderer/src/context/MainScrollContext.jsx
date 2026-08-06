import { createContext, useContext, useEffect, useRef } from 'react'

const MainScrollContext = createContext(null)

export function MainScrollProvider({ children }) {
  const scrollRef = useRef(null)
  return <MainScrollContext.Provider value={scrollRef}>{children}</MainScrollContext.Provider>
}

export function useMainScrollRef() {
  return useContext(MainScrollContext)
}

/**
 * 탭 전환 시 공유 스크롤 컨테이너의 scrollTop을 탭별로 보존·복원.
 * (mountedTabs display:none 유지와 함께 UI State Preservation)
 */
export function TabScrollPreserver({ activeTab }) {
  const scrollRef = useMainScrollRef()
  const savedByTabRef = useRef(new Map())
  const prevTabRef = useRef(activeTab)

  useEffect(() => {
    const el = scrollRef?.current
    const prevTab = prevTabRef.current
    if (!el || prevTab === activeTab) {
      prevTabRef.current = activeTab
      return undefined
    }

    savedByTabRef.current.set(prevTab, el.scrollTop)
    const restoreTop = savedByTabRef.current.get(activeTab) ?? 0
    prevTabRef.current = activeTab

    const id = requestAnimationFrame(() => {
      const node = scrollRef?.current
      if (node) node.scrollTop = restoreTop
    })
    return () => cancelAnimationFrame(id)
  }, [activeTab, scrollRef])

  return null
}

/** 메인 콘텐츠 스크롤 영역 — 갤러리 가상화용 */
export function MainScrollContainer({ className, children }) {
  const scrollRef = useMainScrollRef()
  return (
    <div ref={scrollRef} data-main-scroll className={className}>
      {children}
    </div>
  )
}
