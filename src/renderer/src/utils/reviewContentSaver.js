/** 감상 본문 저장 — 입력 중 innerHTML 읽기/디스패치 최소화 */
export function createReviewContentSaver({ getContent, onSave, delay = 400 }) {
  let timer = null
  let lastSaved = ''

  const cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  const persist = () => {
    timer = null
    const content = getContent()
    if (content === lastSaved) return
    lastSaved = content
    onSave(content)
  }

  const schedule = () => {
    cancel()
    timer = setTimeout(persist, delay)
  }

  const flush = () => {
    cancel()
    const content = getContent()
    if (content === lastSaved) return
    lastSaved = content
    onSave(content)
  }

  const reset = (content = '') => {
    cancel()
    lastSaved = content
  }

  return { schedule, flush, reset, cancel }
}
