import { createContext, useContext, useRef } from 'react'

const MainScrollContext = createContext(null)

export function MainScrollProvider({ children }) {
  const scrollRef = useRef(null)
  return <MainScrollContext.Provider value={scrollRef}>{children}</MainScrollContext.Provider>
}

export function useMainScrollRef() {
  return useContext(MainScrollContext)
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
