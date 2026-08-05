import { getPropertyFieldForTab } from './tabHelpers'
import { isMemoFieldType } from './memoTabSettings'

const CORE_EXPORTABLE = new Set(['record', 'gallery', 'calendar'])

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
