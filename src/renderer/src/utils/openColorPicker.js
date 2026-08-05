let sessionActive = false

/** 네이티브 컬러피커가 열려 있는 동안 outside-dismiss 차단 */
export function isColorPickerSessionActive() {
  return sessionActive || document.body.dataset.colorPickerOpen === '1'
}

/** 숨겨진 color input — 클릭 위치 근처에서 네이티브 피커 열기 */
export function openColorPicker(input, clientX, clientY, { onClose } = {}) {
  if (!input) return

  if (input._pickerFinish) {
    input._pickerFinish()
  }

  const prev = input.style.cssText
  input.style.cssText = [
    'position:fixed',
    `left:${Math.max(0, clientX - 12)}px`,
    `top:${Math.max(0, clientY - 12)}px`,
    'width:28px',
    'height:28px',
    'opacity:0.01',
    'border:0',
    'padding:0',
    'margin:0',
    'z-index:999999',
    'pointer-events:auto'
  ].join(';')

  sessionActive = true
  document.body.dataset.colorPickerOpen = '1'

  let done = false
  const finish = () => {
    if (done) return
    done = true
    sessionActive = false
    delete document.body.dataset.colorPickerOpen
    input.removeEventListener('change', onChange)
    input.removeEventListener('cancel', onCancel)
    document.removeEventListener('keydown', onKeyDown)
    delete input._pickerFinish
    input.style.cssText = prev
    onClose?.()
  }

  const onChange = () => {
    finish()
  }
  const onCancel = () => finish()
  const onKeyDown = (e) => {
    if (e.key === 'Escape') finish()
  }

  input._pickerFinish = finish
  input.addEventListener('change', onChange, { once: true })
  input.addEventListener('cancel', onCancel, { once: true })
  document.addEventListener('keydown', onKeyDown)

  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker()
      return
    } catch {
      /* click fallback */
    }
  }
  input.click()
}
