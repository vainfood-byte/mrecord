import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FolderOpen, Minus, Pin, PinOff, RotateCcw, Settings, Square, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import ExportCameraButton from './ExportCameraButton'
import ExportProgressIndicator from './ExportProgressIndicator'
import { iconUrl } from '../../utils/iconUrl'
import { isPresetFilled } from '../../utils/presets'
import { OVERLAY_ABOVE_SIDE_PANEL } from '../../constants/overlayZIndex'

const overlayRoot = document.getElementById('overlay-root')
const maricoLogoUrl = iconUrl('marico-logo.png')
const presetIconUrl = iconUrl('preset-icon.png')
const pukiCreditIconUrl = iconUrl('puki-credit.png')

function TitleCreditMenu({ x, y }) {
  const left = Math.min(x, window.innerWidth - 280)
  const top = Math.min(y, window.innerHeight - 88)
  const year = new Date().getFullYear()

  const menu = (
    <div
      data-title-credit-menu
      data-popup-root
      className="fixed max-w-[280px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-3 py-2.5 shadow-lg"
      style={{
        left,
        top,
        zIndex: OVERLAY_ABOVE_SIDE_PANEL,
        WebkitAppRegion: 'no-drag'
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="mt-0.5 h-8 w-8 shrink-0"
          style={{
            backgroundColor: 'var(--color-text)',
            WebkitMaskImage: `url(${pukiCreditIconUrl})`,
            WebkitMaskSize: 'contain',
            WebkitMaskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
            maskImage: `url(${pukiCreditIconUrl})`,
            maskSize: 'contain',
            maskRepeat: 'no-repeat',
            maskPosition: 'center'
          }}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-[11px] leading-snug text-[var(--color-text-muted)]">
            {year} <span className="font-medium text-[var(--color-text)]">[Puki]</span> All rights
            reserved.
          </p>
          <p className="mt-1 text-[10px] leading-snug text-[var(--color-text-muted)]">
            즐거운 기록 생활 되세요
          </p>
        </div>
      </div>
    </div>
  )

  return overlayRoot ? createPortal(menu, overlayRoot) : menu
}

function MaricoRestartMenu({ x, y, onRestart, onClose }) {
  useEffect(() => {
    const ignore = (target) =>
      target?.closest?.('[data-marico-restart-menu]') ||
      target?.closest?.('[data-marico-restart-trigger]')

    const onPointerDown = (e) => {
      if (e.button === 2) return
      if (ignore(e.target)) return
      onClose()
    }
    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [onClose])

  const left = Math.min(x, window.innerWidth - 140)
  const top = Math.min(y, window.innerHeight - 48)

  const menu = (
    <div
      data-marico-restart-menu
      className="fixed min-w-[128px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] py-1 shadow-lg"
      style={{ left, top, zIndex: OVERLAY_ABOVE_SIDE_PANEL, WebkitAppRegion: 'no-drag' }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => {
          onRestart()
          onClose()
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/5"
      >
        <RotateCcw size={14} />
        재시작
      </button>
    </div>
  )

  return overlayRoot ? createPortal(menu, overlayRoot) : menu
}

function PresetSlotMenu({ x, y, onActivate, onClose }) {
  useEffect(() => {
    const onDown = (e) => {
      if (e.target.closest('[data-preset-slot-menu]')) return
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  const left = Math.min(x, window.innerWidth - 140)
  const top = Math.min(y, window.innerHeight - 48)

  const menu = (
    <div
      data-preset-slot-menu
      className="fixed min-w-[128px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] py-1 shadow-lg"
      style={{ left, top, zIndex: OVERLAY_ABOVE_SIDE_PANEL, WebkitAppRegion: 'no-drag' }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => {
          onActivate()
          onClose()
        }}
        className="block w-full px-3 py-2 text-left text-sm hover:bg-black/5"
      >
        슬롯 활성화
      </button>
    </div>
  )

  return overlayRoot ? createPortal(menu, overlayRoot) : menu
}

export default function Header() {
  const { state, dispatch, uiPresetSlot } = useApp()
  const win = window.mrecord
  const presets = state.settings.presets || []
  const activeSlot = uiPresetSlot ?? state.settings.activePresetSlot
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)
  const [slotMenu, setSlotMenu] = useState(null)
  const [restartMenu, setRestartMenu] = useState(null)
  const [creditMenu, setCreditMenu] = useState(null)

  useEffect(() => {
    window.mrecord?.getAlwaysOnTop?.().then((v) => setAlwaysOnTop(Boolean(v))).catch(() => {})
  }, [])

  useEffect(() => {
    if (!creditMenu) return undefined

    const shouldIgnore = (target) =>
      target?.closest?.('[data-title-credit-menu]') ||
      target?.closest?.('[data-marico-restart-trigger]')

    const onPointerDown = (e) => {
      if (e.button === 2) return
      if (shouldIgnore(e.target)) return
      setCreditMenu(null)
    }

    const onContextMenu = (e) => {
      if (shouldIgnore(e.target)) return
      e.preventDefault()
      setCreditMenu(null)
    }

    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true)
      document.addEventListener('contextmenu', onContextMenu, true)
    }, 0)

    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('contextmenu', onContextMenu, true)
    }
  }, [creditMenu])

  const toggleAlwaysOnTop = () => {
    const next = !alwaysOnTop
    win?.setAlwaysOnTop?.(next)
    setAlwaysOnTop(next)
  }

  const openExportFolder = async () => {
    try {
      const result = await win?.openExportFolder?.()
      if (result && !result.ok) {
        alert(`폴더를 열 수 없습니다.\n${result.error || ''}`)
      }
    } catch (err) {
      alert(`폴더를 열 수 없습니다.\n${err?.message || err}`)
    }
  }

  const isInactiveSlot = (slot) => {
    const preset = presets[slot]
    return !isPresetFilled(preset) && slot !== 0
  }

  const handlePresetSlotClick = (slot) => {
    const preset = presets[slot]
    if (!isPresetFilled(preset)) {
      dispatch({ type: 'ACTIVATE_PRESET_SLOT', payload: slot })
      return
    }
    dispatch({ type: 'LOAD_PRESET', payload: slot })
  }

  const goToMain = () => {
    dispatch({ type: 'CLOSE_DETAIL' })
    dispatch({ type: 'SET_TAB', payload: 'gallery' })
    if (state.settingsOpen) dispatch({ type: 'TOGGLE_SETTINGS' })
  }

  const handleRestart = async () => {
    try {
      await win?.relaunch?.()
    } catch (err) {
      alert(`재시작할 수 없습니다.\n${err?.message || err}`)
    }
  }

  return (
    <>
      <header
        className="relative z-[55] flex items-center justify-between px-5 pt-3 pb-2"
        style={{ WebkitAppRegion: 'drag' }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex min-w-0 items-center gap-3" style={{ WebkitAppRegion: 'no-drag' }}>
            <button
              type="button"
              data-marico-restart-trigger
              onClick={(e) => {
                setCreditMenu(null)
                const rect = e.currentTarget.getBoundingClientRect()
                setRestartMenu((prev) =>
                  prev ? null : { x: rect.left, y: rect.bottom + 6 }
                )
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setRestartMenu(null)
                const rect = e.currentTarget.getBoundingClientRect()
                setCreditMenu((prev) =>
                  prev ? null : { x: rect.left, y: rect.bottom + 6 }
                )
              }}
              className="shrink-0 rounded-lg p-0.5 hover:opacity-85"
              title="클릭: 재시작 · 우클릭: 크레딧"
            >
              <div
                className="h-10 w-10 shrink-0"
                style={{
                  backgroundColor: 'var(--color-text)',
                  WebkitMaskImage: `url(${maricoLogoUrl})`,
                  WebkitMaskSize: 'contain',
                  WebkitMaskRepeat: 'no-repeat',
                  WebkitMaskPosition: 'center',
                  maskImage: `url(${maricoLogoUrl})`,
                  maskSize: 'contain',
                  maskRepeat: 'no-repeat',
                  maskPosition: 'center'
                }}
                aria-hidden
              />
            </button>
            <button
              type="button"
              onClick={goToMain}
              className="min-w-0 rounded-lg text-left hover:opacity-85"
              title="메인으로 이동"
            >
              <h1 className="text-xl font-semibold tracking-tight">My Record</h1>
              <p className="text-[11px] text-[var(--color-text-muted)]">마이리코드</p>
            </button>
          </div>

          <div
            className="ml-2 flex items-center gap-1 border-l border-[var(--color-border)] pl-3"
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            {[0, 1, 2, 3].map((slot) => {
              const preset = presets[slot]
              const filled = isPresetFilled(preset)
              const isActive = activeSlot === slot
              const inactive = isInactiveSlot(slot)
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => handlePresetSlotClick(slot)}
                  onContextMenu={(e) => {
                    if (!inactive) return
                    e.preventDefault()
                    setSlotMenu({ slot, x: e.clientX, y: e.clientY })
                  }}
                  className={`rounded-lg p-1.5 transition-colors ${
                    inactive ? 'opacity-30 hover:opacity-50' : 'hover:bg-black/5'
                  }`}
                  title={
                    filled
                      ? `${slot + 1}번 프리셋${preset.name ? `: ${preset.name}` : ''}`
                      : inactive
                        ? `${slot + 1}번 슬롯 (비활성 · 우클릭: 활성화)`
                        : `${slot + 1}번 슬롯 (비어 있음)`
                  }
                >
                  <div
                    className="h-[18px] w-[18px]"
                    style={{
                      backgroundColor: isActive
                        ? 'var(--color-text)'
                        : filled
                          ? 'var(--color-text-muted)'
                          : 'var(--color-text-muted)',
                      opacity: filled || slot === 0 ? (isActive ? 1 : 0.45) : 0.25,
                      WebkitMaskImage: `url(${presetIconUrl})`,
                      WebkitMaskSize: 'contain',
                      WebkitMaskRepeat: 'no-repeat',
                      WebkitMaskPosition: 'center',
                      maskImage: `url(${presetIconUrl})`,
                      maskSize: 'contain',
                      maskRepeat: 'no-repeat',
                      maskPosition: 'center'
                    }}
                    aria-hidden
                  />
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' }}>
          <ExportProgressIndicator />
          <button
            type="button"
            onClick={openExportFolder}
            className="rounded-lg p-2 hover:bg-black/5"
            title="MyR 마이리코드 폴더 열기"
          >
            <FolderOpen size={16} />
          </button>
          <ExportCameraButton />
          <button
            type="button"
            onClick={toggleAlwaysOnTop}
            className={`rounded-lg p-2 hover:bg-black/5 ${
              alwaysOnTop ? 'text-[var(--color-accent)]' : ''
            }`}
            title={alwaysOnTop ? '항상 위에 고정 해제' : '항상 위에 고정'}
          >
            {alwaysOnTop ? <Pin size={16} className="fill-current" /> : <PinOff size={16} />}
          </button>
          <button
            type="button"
            data-settings-trigger
            onClick={() => dispatch({ type: 'TOGGLE_SETTINGS' })}
            className="mr-2 rounded-lg p-2 hover:bg-black/5"
            title="설정"
          >
            <Settings size={18} />
          </button>
          <button type="button" onClick={() => win?.minimize?.()} className="rounded p-1.5 hover:bg-black/5">
            <Minus size={14} />
          </button>
          <button type="button" onClick={() => win?.maximize?.()} className="rounded p-1.5 hover:bg-black/5">
            <Square size={12} />
          </button>
          <button type="button" onClick={() => win?.close?.()} className="rounded p-1.5 hover:bg-black/5">
            <X size={14} />
          </button>
        </div>
      </header>

      {slotMenu && (
        <PresetSlotMenu
          x={slotMenu.x}
          y={slotMenu.y}
          onActivate={() => dispatch({ type: 'ACTIVATE_PRESET_SLOT', payload: slotMenu.slot })}
          onClose={() => setSlotMenu(null)}
        />
      )}

      {restartMenu && (
        <MaricoRestartMenu
          x={restartMenu.x}
          y={restartMenu.y}
          onRestart={handleRestart}
          onClose={() => setRestartMenu(null)}
        />
      )}

      {creditMenu && <TitleCreditMenu x={creditMenu.x} y={creditMenu.y} />}
    </>
  )
}
