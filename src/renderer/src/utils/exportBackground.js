/** 내보내기 중 백그라운드 스로틀링 비활성화 — 다른 창 포커스 시에도 진행 */

let depth = 0

export function isExportBackgroundActive() {
  return depth > 0
}

export function waitForExportTick(ms = 32) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export async function beginExportBackground() {
  depth += 1
  if (depth === 1) {
    await window.mrecord?.beginExportBackground?.()
  }
}

export async function endExportBackground() {
  if (depth <= 0) return
  depth -= 1
  if (depth === 0) {
    await window.mrecord?.endExportBackground?.()
  }
}

export async function withExportBackground(fn) {
  await beginExportBackground()
  try {
    return await fn()
  } finally {
    await endExportBackground()
  }
}
