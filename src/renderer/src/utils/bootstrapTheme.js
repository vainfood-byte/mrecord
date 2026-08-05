import { DEFAULT_SETTINGS, applyTheme } from '../data/defaults'
import { migrateSettings } from './tabHelpers'
import { loadThemeSnapshot } from './storage'

/** React 마운트 전 저장된 테마를 적용해 기본 베이지 깜빡임 방지 */
export function bootstrapThemeFromStorage() {
  try {
    const themeSettings = loadThemeSnapshot()
    const settings = migrateSettings({
      ...DEFAULT_SETTINGS,
      ...(themeSettings || {})
    })
    applyTheme(settings)
  } catch {
    applyTheme(DEFAULT_SETTINGS)
  }
}
