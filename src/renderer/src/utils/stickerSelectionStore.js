/** 스티커 선택 — React Context 없이 구독. 클릭 시 갤러리/앱 전체 리렌더를 피한다. */

let selectedStickerId = null
const listeners = new Set()

export function getSelectedStickerId() {
  return selectedStickerId
}

export function setSelectedStickerId(id) {
  if (selectedStickerId === id) return
  selectedStickerId = id ?? null
  listeners.forEach((listener) => listener())
}

export function subscribeSelectedSticker(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 해당 스티커의 선택 여부만 스냅샷 — 값이 바뀐 스티커만 리렌더 */
export function getIsStickerSelected(stickerId) {
  return selectedStickerId === stickerId
}
