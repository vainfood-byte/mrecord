/** 드래그 리사이즈 등으로 body에 남은 상호작용 잠금 해제 */
export function resetInteractionLocks() {
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.documentElement.style.userSelect = ''
}

/** Electron native confirm/alert 후 입력 포커스가 깨지는 현상 완화 */
export function restoreFocusAfterNativeDialog() {
  resetInteractionLocks()
  window.mrecord?.focusWindow?.()

  window.setTimeout(() => {

    const active = document.activeElement
    if (active && active !== document.body && active.tagName !== 'HTML') return

    const panel = document.querySelector('[data-detail-panel]')
    const titleInput = panel?.querySelector('[data-detail-title-input]')
    if (titleInput instanceof HTMLInputElement) {
      titleInput.focus()
      titleInput.select()
      return
    }

    const review = panel?.querySelector('[data-export-review="true"]')
    if (review instanceof HTMLElement) {
      review.focus()
      return
    }

    const hidden = document.createElement('input')
    hidden.type = 'text'
    hidden.tabIndex = -1
    hidden.setAttribute('aria-hidden', 'true')
    hidden.style.cssText =
      'position:fixed;opacity:0;width:0;height:0;padding:0;border:0;pointer-events:none;'
    document.body.appendChild(hidden)
    hidden.focus()
    hidden.remove()
  }, 0)
}
