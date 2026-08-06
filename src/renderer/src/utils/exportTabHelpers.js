import { getPropertyFieldForTab } from './tabHelpers'
import { isMemoFieldType } from './memoTabSettings'

const CORE_EXPORTABLE = new Set(['record', 'gallery', 'calendar'])

export const LOCK_EXPORT_WARNING_MESSAGE =
  '[잠금 활성화 상태]에서\n이미지 내보내기 진행시 로딩이 길 수 있습니다\n진행하시겠습니까?'

export function shouldConfirmLockExport(settings) {
  return (
    Boolean(settings?.lockSettings?.enabled) && settings?.confirmLockExportWarning !== false
  )
}

export function isPropertyTabExportable(tabId, settings) {
  const field = getPropertyFieldForTab(tabId, settings)
  if (!field) return false
  if (field.type === 'tags') return true
  if (isMemoFieldType(field.type)) return true
  return false
}

export function isTabImageExportable(tabId, settings) {
  return CORE_EXPORTABLE.has(tabId) || isPropertyTabExportable(tabId, settings)
}
