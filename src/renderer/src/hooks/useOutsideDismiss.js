import { useEffect } from 'react'
import { isColorPickerSessionActive } from '../utils/openColorPicker'

const COLOR_PICKER_IGNORE = '[data-color-picker-native], [data-color-picker-popover]'

/** 팝업/메뉴 — 지정 영역 밖 클릭 시 닫기 */
export function useOutsideDismiss(ref, isOpen, onClose, { ignoreSelector, isPaused = false, pauseRef } = {}) {
  useEffect(() => {
    if (!isOpen || !onClose) return

    const onDown = (e) => {
      if (pauseRef?.current || isPaused) return
      if (isColorPickerSessionActive()) return
      if (ref.current?.contains(e.target)) return
      if (e.target.closest?.(COLOR_PICKER_IGNORE)) return
      if (ignoreSelector && e.target.closest(ignoreSelector)) return
      onClose()
    }

    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [isOpen, onClose, ref, ignoreSelector, isPaused, pauseRef])
}