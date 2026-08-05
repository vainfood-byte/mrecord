import { NotepadText, ScrollText } from 'lucide-react'

import { useApp } from '../../context/AppContext'

export default function ViewModeToggle() {
  const { state, dispatch } = useApp()
  const pagedView = Boolean(state.settings.pagedView)

  const toggle = () => {
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: { pagedView: !pagedView }
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-lg p-2 text-[var(--color-accent)] hover:bg-black/5"
      title={pagedView ? '보기 변경 (무한 스크롤로 전환)' : '보기 변경 (페이지 보기 · 100개씩)'}
    >
      {pagedView ? <ScrollText size={16} /> : <NotepadText size={16} />}
    </button>
  )
}
