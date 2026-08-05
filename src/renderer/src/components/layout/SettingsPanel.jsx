import { useEffect, useRef, useState } from 'react'
import { Check, Download, ImagePlus, Plus, Save, Trash2, Upload, X } from 'lucide-react'
import { useApp, buildInitPayload } from '../../context/AppContext'
import {
  applyTheme,
  CUSTOM_FONT_ID,
  DEFAULT_SETTINGS,
  ensureCustomThemeSlots,
  FONT_PRESETS,
  buildThemeSlotSave,
  getThemeSlotPreviewColor,
  normalizeCustomTheme,
  normalizeUiStyle,
  THEME_PRESETS,
  UI_STYLE_IDS
} from '../../data/defaults'
import { getCustomFontStack, readFontFile } from '../../utils/customFont'
import { ensurePresets, isPresetFilled } from '../../utils/presets'
import {
  exportData,
  importData,
  buildDefaultAppState,
  buildFreshPersistedData,
  buildPersistedData,
  saveData,
  flushAllPersistedData
} from '../../utils/storage'
import { useOutsideDismiss } from '../../hooks/useOutsideDismiss'
import ColorSwatch from '../ui/ColorSwatch'
import ColorPickerTrigger from '../ui/ColorPickerTrigger'
import TagColorSettings from '../settings/TagColorSettings'
import DeleteConfirmDialog from '../ui/DeleteConfirmDialog'
import { resetInteractionLocks, restoreFocusAfterNativeDialog } from '../../utils/restoreFocusAfterDialog'

export default function SettingsPanel() {
  const { state, dispatch, persistAll, uiPresetSlot } = useApp()
  const { settings } = state
  const presets = ensurePresets(settings.presets)
  const [draftTheme, setDraftTheme] = useState(settings.customTheme)
  const [autoLaunch, setAutoLaunch] = useState(Boolean(settings.autoStartOnLaunch))
  const [desktopShortcut, setDesktopShortcut] = useState(Boolean(settings.desktopShortcut))
  const [themeSlotMenu, setThemeSlotMenu] = useState(null)
  const [uiStyleMenuOpen, setUiStyleMenuOpen] = useState(false)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const panelRef = useRef(null)
  const customFontInputRef = useRef(null)
  const settingsSnapshotRef = useRef(settings)
  const draftThemeRef = useRef(settings.customTheme)

  settingsSnapshotRef.current = settings
  draftThemeRef.current = draftTheme

  useEffect(() => {
    if (!state.settingsOpen) {
      setResetConfirmOpen(false)
    }
  }, [state.settingsOpen])

  useEffect(() => {
    setResetConfirmOpen(false)
  }, [state.easterEggResetEpoch])

  useOutsideDismiss(panelRef, state.settingsOpen, () => {
    dispatch({ type: 'TOGGLE_SETTINGS' })
  }, {
    ignoreSelector:
      '[data-settings-trigger], [data-color-picker-popover], [data-color-picker-native], [data-delete-confirm-dialog]',
    isPaused: resetConfirmOpen
  })

  useEffect(() => {
    setDraftTheme(normalizeCustomTheme(settings.customTheme))
  }, [
    settings.customTheme.bg,
    settings.customTheme.bgPanel,
    settings.customTheme.bgSubPanel,
    settings.customTheme.text,
    settings.customTheme.border
  ])

  useEffect(() => {
    window.mrecord?.getAutoLaunch?.().then((enabled) => {
      if (typeof enabled === 'boolean') setAutoLaunch(enabled)
    })
    window.mrecord?.getDesktopShortcut?.().then((enabled) => {
      if (typeof enabled === 'boolean') setDesktopShortcut(enabled)
    })
  }, [])

  const updateSettings = (patch) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: patch })
  }

  const handleCustomFontPick = () => {
    if (!settings.customFont) {
      customFontInputRef.current?.click()
      return
    }
    if (settings.fontId !== CUSTOM_FONT_ID) {
      updateSettings({ fontId: CUSTOM_FONT_ID })
      return
    }
    customFontInputRef.current?.click()
  }

  const handleCustomFontFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    try {
      const customFont = await readFontFile(file)
      updateSettings({
        customFont,
        fontId: CUSTOM_FONT_ID
      })
    } catch (err) {
      alert(err?.message || '글꼴을 추가할 수 없습니다.')
    }
  }

  const handleAutoLaunch = async (enabled) => {
    setAutoLaunch(enabled)
    updateSettings({ autoStartOnLaunch: enabled })
    await window.mrecord?.setAutoLaunch?.(enabled)
  }

  const handleDesktopShortcut = async (enabled) => {
    setDesktopShortcut(enabled)
    updateSettings({ desktopShortcut: enabled })
    await window.mrecord?.setDesktopShortcut?.(enabled)
  }

  const handlePresetClick = (index) => {
    const preset = presets[index]
    if (!isPresetFilled(preset)) {
      dispatch({ type: 'ACTIVATE_PRESET_SLOT', payload: index })
      return
    }
    dispatch({ type: 'LOAD_PRESET', payload: index })
  }

  const handlePresetRename = (index, e) => {
    e.preventDefault()
    const current = presets[index]?.name || `${index + 1}번`
    const next = window.prompt('슬롯 이름 변경', current)
    if (next === null) return
    const updated = ensurePresets(settings.presets)
    updated[index] = {
      ...(updated[index] || { data: null }),
      name: next.trim() || `${index + 1}번`,
      data: updated[index]?.data ?? null
    }
    dispatch({ type: 'UPDATE_SETTINGS', payload: { presets: updated } })
  }

  const executeResetData = async () => {
    setResetConfirmOpen(false)

    const fresh = buildDefaultAppState()
    const data = buildFreshPersistedData()
    saveData(data)
    dispatch({ type: 'RESET_ALL', payload: fresh })
    resetInteractionLocks()
    restoreFocusAfterNativeDialog()

    try {
      await flushAllPersistedData(data, { force: true })
      applyTheme(fresh.settings)
      await window.mrecord?.setAutoLaunch?.(false)
      await window.mrecord?.setDesktopShortcut?.(false)
      setAutoLaunch(false)
      setDesktopShortcut(false)
      setDraftTheme(normalizeCustomTheme(DEFAULT_SETTINGS.customTheme))
    } catch (err) {
      console.error(err)
      alert(`초기화 저장 중 오류가 발생했습니다.\n${err?.message || err}`)
    }
  }

  const handleQuickSave = async () => {
    if (saving) return

    const mergedSettings = {
      ...settings,
      ...(settings.useCustomTheme
        ? { useCustomTheme: true, customTheme: normalizeCustomTheme(draftThemeRef.current) }
        : {})
    }

    if (
      mergedSettings.useCustomTheme !== settings.useCustomTheme ||
      JSON.stringify(mergedSettings.customTheme) !== JSON.stringify(settings.customTheme)
    ) {
      updateSettings({
        useCustomTheme: mergedSettings.useCustomTheme,
        customTheme: mergedSettings.customTheme
      })
    }

    setSaving(true)
    try {
      await persistAll()
      alert('설정과 작품 목록을 모두 저장했습니다.')
    } catch (err) {
      console.error(err)
      alert(`저장 중 오류가 발생했습니다.\n${err?.message || err}`)
    } finally {
      setSaving(false)
    }
  }

  if (!state.settingsOpen) return null

  const handleThemePreview = (key, value) => {
    const next = { ...draftThemeRef.current, [key]: value }
    draftThemeRef.current = next
    applyTheme({ ...settingsSnapshotRef.current, useCustomTheme: true, customTheme: next })
  }

  const handleThemeCommit = (key, value) => {
    const next = { ...draftThemeRef.current, [key]: value }
    draftThemeRef.current = next
    setDraftTheme(next)
    updateSettings({ useCustomTheme: true, customTheme: next })
  }

  /** 사용자 지정 테마 — draft 색상을 저장·CSS 변수·[컬러>테마] 등 전역 반영 */
  const applyCustomThemeNow = () => {
    const next = normalizeCustomTheme(draftThemeRef.current)
    draftThemeRef.current = next
    setDraftTheme(next)
    const merged = { ...settingsSnapshotRef.current, useCustomTheme: true, customTheme: next }
    applyTheme(merged)
    updateSettings({ useCustomTheme: true, customTheme: next })
    window.dispatchEvent(new CustomEvent('mrecord:theme-applied'))
  }

  const applyPresetTheme = (preset) => {
    const customTheme = normalizeCustomTheme({
      bg: preset.bg,
      bgPanel: preset.bgPanel,
      bgSubPanel: preset.bgCard,
      text: preset.text,
      border: preset.border
    })
    setDraftTheme(customTheme)
    updateSettings({ themePresetId: preset.id, useCustomTheme: false, customTheme })
  }

  const enableCustomTheme = () => {
    const preset =
      THEME_PRESETS.find((t) => t.id === settings.themePresetId) || THEME_PRESETS[0]
    const customTheme = settings.useCustomTheme
      ? normalizeCustomTheme(draftTheme)
      : normalizeCustomTheme({
          bg: preset.bg,
          bgPanel: preset.bgPanel,
          bgSubPanel: preset.bgCard,
          text: preset.text,
          border: preset.border
        })
    setDraftTheme(customTheme)
    updateSettings({ useCustomTheme: true, customTheme })
  }

  const overwriteThemeSlot = (index) => {
    const slots = ensureCustomThemeSlots(settings.customThemeSlots)
    slots[index] = buildThemeSlotSave(settings.customTheme)
    updateSettings({ customThemeSlots: slots })
    setThemeSlotMenu(null)
  }

  const deleteThemeSlot = (index) => {
    const slots = ensureCustomThemeSlots(settings.customThemeSlots)
    slots[index] = null
    updateSettings({ customThemeSlots: slots })
    setThemeSlotMenu(null)
  }

  const handleExport = async () => {
    try {
      // 주 파일과 동기화한 뒤, 주 파일 내용(전체 스냅샷)을 내보내기
      await persistAll()
      const result = await window.mrecord?.loadPersistentData?.()
      if (result?.ok && result.data) {
        exportData(JSON.parse(result.data))
        return
      }
    } catch (err) {
      console.warn('Export from primary file failed, using current state:', err)
    }
    exportData(buildPersistedData(state))
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        const data = await importData(file)
        dispatch({
          type: 'INIT',
          payload: {
            ...buildInitPayload(data),
            preserveEasterEggDismissed: true
          }
        })
        await persistAll({ force: true })
        alert('백업 파일을 불러와 저장했습니다.')
      } catch (err) {
        console.error(err)
        alert('파일을 불러올 수 없습니다.')
      }
    }
    input.click()
  }

  const handleBackgroundImage = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/gif'
    input.onchange = (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        updateSettings({ backgroundImage: reader.result, useCustomTheme: true })
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  const noDragProps = {
    style: { WebkitAppRegion: 'no-drag' },
    onMouseDown: (e) => e.stopPropagation()
  }

  const handleSettingsBlankClick = (e) => {
    if (resetConfirmOpen) return
    if (e.target.closest('[data-color-picker-popover], [data-color-picker-native]')) return
    const interactive = e.target.closest(
      'button, a, input, select, textarea, label, [role="button"], [data-color-picker-trigger], [data-no-settings-close]'
    )
    if (interactive) return
    dispatch({ type: 'TOGGLE_SETTINGS' })
  }

  return (
    <>
      <div
        ref={panelRef}
        data-settings-panel
        className="animate-slide-in pointer-events-auto fixed inset-y-0 right-0 z-[200] flex w-[320px] flex-col border-l border-[var(--color-border)] bg-[var(--color-bg-panel)] shadow-xl"
        style={{ WebkitAppRegion: 'no-drag' }}
        onMouseDown={(e) => {
          e.stopPropagation()
          handleSettingsBlankClick(e)
        }}
      >
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <h2 className="font-semibold">설정</h2>
        <button
          type="button"
          onClick={() => dispatch({ type: 'TOGGLE_SETTINGS' })}
          className="rounded-lg p-1.5 hover:bg-black/5"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <h3 className="text-sm font-medium">테마</h3>
            <button
              type="button"
              aria-expanded={uiStyleMenuOpen}
              aria-label="UI 스타일 선택"
              title="UI 스타일"
              onClick={() => setUiStyleMenuOpen((open) => !open)}
              className="inline-flex h-5 w-5 items-center justify-center text-[10px] leading-none text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              {...noDragProps}
            >
              <span aria-hidden>{uiStyleMenuOpen ? '▼' : '▶'}</span>
            </button>
          </div>
          {uiStyleMenuOpen && (
            <div
              className="mb-3 flex flex-wrap gap-1"
              data-no-settings-close
              role="group"
              aria-label="UI 스타일"
            >
              {[
                { id: 'default', label: '기본' },
                { id: 'glass', label: '글래스' },
                { id: 'retro', label: '레트로' }
              ].map((opt) => {
                const active = normalizeUiStyle(settings.uiStyle) === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      if (!UI_STYLE_IDS.includes(opt.id)) return
                      updateSettings({ uiStyle: opt.id })
                    }}
                    className={`rounded-md border px-2.5 py-1 text-[11px] ${
                      active
                        ? 'border-[var(--color-accent)] bg-[var(--color-bg-card)] font-medium'
                        : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-black/5'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {THEME_PRESETS.map((t) => (
              <ColorSwatch
                key={t.id}
                color={t.bg}
                label={t.name}
                selected={!settings.useCustomTheme && settings.themePresetId === t.id}
                onClick={() => applyPresetTheme(t)}
              />
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium">사용자 지정 테마</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={settings.useCustomTheme}
                  onChange={(e) => {
                    if (e.target.checked) enableCustomTheme()
                    else updateSettings({ useCustomTheme: false })
                  }}
                />
                사용자 지정 테마 사용
              </label>
              <button
                type="button"
                title="적용"
                onClick={applyCustomThemeNow}
                className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-[var(--color-border)] px-2 text-[10px] text-[var(--color-text-muted)] hover:bg-[var(--color-accent)]/10 hover:text-[var(--color-accent)]"
                {...noDragProps}
              >
                <Check size={13} strokeWidth={2.5} />
                적용
              </button>
            </div>
            <div className="flex flex-wrap items-start justify-center gap-3">
              {[
                ['bg', '배경'],
                ['bgPanel', '패널'],
                ['bgSubPanel', '서브패널'],
                ['text', '글자색'],
                ['border', '테두리']
              ].map(([key, label]) => (
                <div key={key} className="flex flex-col items-center gap-1">
                  <ColorPickerTrigger
                    value={draftTheme[key]}
                    onPreview={(hex) => handleThemePreview(key, hex)}
                    onChange={(hex) => handleThemeCommit(key, hex)}
                    barClassName="h-9 w-9"
                    title={`${label} 색상`}
                  />
                  <span className="text-[10px] text-[var(--color-text-muted)]">{label}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBackgroundImage}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] py-2.5 text-xs hover:bg-black/5"
                  {...noDragProps}
                >
                  <ImagePlus size={14} />
                  배경 이미지
                </button>
                {settings.backgroundImage && (
                  <button
                    type="button"
                    onClick={() => updateSettings({ backgroundImage: null })}
                    className="rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-text-muted)] hover:bg-black/5"
                    title="배경 이미지 제거"
                    {...noDragProps}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              {settings.backgroundImage && (
                <>
                  <div
                    className="h-16 rounded-md border border-[var(--color-border)] bg-cover bg-center"
                    style={{ backgroundImage: `url(${settings.backgroundImage})` }}
                  />
                  <label className="block text-xs text-[var(--color-text-muted)]">
                    투명도 ({Math.round((settings.backgroundImageOpacity ?? 0.3) * 100)}%)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round((settings.backgroundImageOpacity ?? 0.3) * 100)}
                    onChange={(e) =>
                      updateSettings({ backgroundImageOpacity: Number(e.target.value) / 100 })
                    }
                    className="w-full"
                    {...noDragProps}
                  />
                  <label className="block text-xs text-[var(--color-text-muted)]">표시 방식</label>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      ['original', '원본'],
                      ['fill', '채우기'],
                      ['tile', '바둑판']
                    ].map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => updateSettings({ backgroundImageMode: mode })}
                        className={`rounded-lg border py-1.5 text-[10px] ${
                          (settings.backgroundImageMode || 'fill') === mode
                            ? 'border-[var(--color-accent)] bg-[var(--color-bg-card)] font-medium'
                            : 'border-[var(--color-border)] hover:bg-black/5'
                        }`}
                        {...noDragProps}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-start justify-center gap-3">
              {ensureCustomThemeSlots(settings.customThemeSlots).map((saved, i) => (
                <div key={`slot-${i}`} className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    title={
                      saved
                        ? `슬롯 ${i + 1} 불러오기 (우클릭: 메뉴)`
                        : `슬롯 ${i + 1}에 저장`
                    }
                    onClick={() => {
                      if (saved) {
                        updateSettings({
                          useCustomTheme: true,
                          customTheme: normalizeCustomTheme(saved)
                        })
                        return
                      }
                      overwriteThemeSlot(i)
                    }}
                    onContextMenu={(e) => {
                      if (!saved) return
                      e.preventDefault()
                      setThemeSlotMenu({ index: i, x: e.clientX, y: e.clientY })
                    }}
                    className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--color-border)] transition-transform hover:scale-105"
                    {...noDragProps}
                  >
                    {saved ? (
                      <span
                        className="absolute inset-0 rounded-full"
                        style={{ backgroundColor: getThemeSlotPreviewColor(saved) }}
                        aria-hidden
                      />
                    ) : (
                      <Plus size={16} />
                    )}
                  </button>
                  <span className="text-[10px] text-[var(--color-text-muted)]">저장{i + 1}</span>
                </div>
              ))}
            </div>

            {themeSlotMenu && (
              <>
                <div
                  className="fixed inset-0 z-[99998]"
                  aria-hidden
                  onMouseDown={() => setThemeSlotMenu(null)}
                />
                <div
                  data-popup-root
                  className="fixed z-[99999] w-32 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] py-1 shadow-lg"
                  style={{
                    left: Math.min(themeSlotMenu.x, window.innerWidth - 140),
                    top: Math.min(themeSlotMenu.y, window.innerHeight - 88),
                    WebkitAppRegion: 'no-drag'
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-xs hover:bg-black/5"
                    onClick={() => overwriteThemeSlot(themeSlotMenu.index)}
                  >
                    덮어쓰기
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-black/5"
                    onClick={() => deleteThemeSlot(themeSlotMenu.index)}
                  >
                    삭제
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        <TagColorSettings />

        <section>
          <h3 className="mb-2 text-sm font-medium">글꼴</h3>
          <div className="grid grid-cols-2 gap-2">
            {FONT_PRESETS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => updateSettings({ fontId: f.id })}
                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                  settings.fontId === f.id
                    ? 'border-[var(--color-accent)] bg-[var(--color-bg)]'
                    : 'border-[var(--color-border)] hover:bg-black/5'
                }`}
                style={{ fontFamily: f.family }}
              >
                {f.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleCustomFontPick}
            className={`mt-2 w-full rounded-lg border px-3 py-2 text-sm transition-colors ${
              settings.fontId === CUSTOM_FONT_ID && settings.customFont
                ? 'border-[var(--color-accent)] bg-[var(--color-bg)]'
                : 'border-[var(--color-border)] hover:bg-black/5'
            }`}
            style={
              settings.customFont
                ? { fontFamily: getCustomFontStack() }
                : undefined
            }
            title={
              settings.customFont
                ? '다른 글꼴 파일로 교체'
                : 'TTF, OTF, WOFF, WOFF2 파일 추가'
            }
          >
            {settings.customFont?.name || '사용자 글꼴 추가'}
          </button>
          <input
            ref={customFontInputRef}
            type="file"
            accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
            className="hidden"
            onChange={handleCustomFontFile}
          />
          <p className="mt-1.5 text-[10px] leading-snug text-[var(--color-text-muted)]">
            사용자 글꼴은 1개만 저장됩니다. 버튼을 다시 누르면 다른 파일로 교체됩니다.
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium">글자 크기 ({settings.fontSize}px)</h3>
          <input
            type="range"
            min={11}
            max={20}
            value={settings.fontSize}
            onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
            className="w-full"
            {...noDragProps}
          />
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium">UI 크기 ({settings.uiScale ?? 100}%)</h3>
          <input
            type="range"
            min={80}
            max={120}
            step={5}
            value={settings.uiScale ?? 100}
            onChange={(e) => updateSettings({ uiScale: Number(e.target.value) })}
            className="w-full"
            {...noDragProps}
          />
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium">프리셋 설정</h3>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
            <div className="grid grid-cols-4 gap-1">
              {[0, 1, 2, 3].map((i) => {
                const preset = presets[i]
                const label = preset?.name?.trim() || `${i + 1}번`
                const active = (uiPresetSlot ?? settings.activePresetSlot ?? 0) === i
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handlePresetClick(i)}
                    onContextMenu={(e) => handlePresetRename(i, e)}
                    className={`rounded-lg border px-1 py-2 text-xs leading-tight ${
                      active
                        ? 'border-[var(--color-accent)] bg-[var(--color-bg-card)] font-medium'
                        : 'border-[var(--color-border)] hover:bg-black/5'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[10px] text-[var(--color-text-muted)]">
              슬롯 클릭 시 해당 프리셋으로 전환
            </p>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium">일반</h3>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
            <div className="space-y-1">
              <label className="flex items-center justify-between rounded-lg px-1 py-1.5 text-xs">
                <span>윈도우 시작 시 자동 실행</span>
                <input
                  type="checkbox"
                  checked={autoLaunch}
                  onChange={(e) => handleAutoLaunch(e.target.checked)}
                  {...noDragProps}
                />
              </label>
              <label className="flex items-center justify-between rounded-lg px-1 py-1.5 text-xs">
                <span>바탕화면에 바로가기 생성</span>
                <input
                  type="checkbox"
                  checked={desktopShortcut}
                  onChange={(e) => handleDesktopShortcut(e.target.checked)}
                  {...noDragProps}
                />
              </label>
              <label className="flex items-center justify-between rounded-lg px-1 py-1.5 text-xs">
                <span>삭제 시 질문 다시 묻기</span>
                <input
                  type="checkbox"
                  checked={settings.confirmBeforeDelete !== false}
                  onChange={(e) => updateSettings({ confirmBeforeDelete: e.target.checked })}
                  {...noDragProps}
                />
              </label>
              <button
                type="button"
                onClick={() => setResetConfirmOpen(true)}
                className="mt-2 flex w-full items-center justify-center rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                {...noDragProps}
              >
                데이터 초기화
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="flex gap-2 border-t border-[var(--color-border)] p-4">
        <button
          type="button"
          onClick={handleExport}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] py-2 text-sm hover:bg-black/5"
          title="주 저장 파일(mrecord-data)을 JSON으로 내보내기"
        >
          <Download size={14} /> 내보내기
        </button>
        <button
          type="button"
          onClick={handleImport}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] py-2 text-sm hover:bg-black/5"
          title="백업 JSON 불러오기"
        >
          <Upload size={14} /> 불러오기
        </button>
        <button
          type="button"
          onClick={handleQuickSave}
          disabled={saving}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent)]/10 py-2 text-sm font-medium hover:bg-[var(--color-accent)]/15 disabled:cursor-not-allowed disabled:opacity-60"
          title="설정과 작품 목록 전체 저장"
        >
          <Save size={14} /> {saving ? '저장 중…' : '저장'}
        </button>
      </div>
      </div>

      {resetConfirmOpen && (
        <DeleteConfirmDialog
          title="데이터 초기화"
          message="작품목록 및 설정이 전부 초기화되며, 이는 복구할 수 없습니다. 초기화 하시겠습니까?"
          confirmLabel="초기화"
          showSkipAsk={false}
          onConfirm={executeResetData}
          onCancel={() => setResetConfirmOpen(false)}
        />
      )}
    </>
  )
}
