import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { ensurePaletteSlots } from '../../utils/colorPickerHelpers'
import ColorPickerPopover from '../ui/ColorPickerPopover'
import ColorPickerTrigger from '../ui/ColorPickerTrigger'

export default function TagColorSettings() {
  const { state, dispatch } = useApp()
  const [picker, setPicker] = useState(null)
  const [slotMenu, setSlotMenu] = useState(null)
  const [barColor, setBarColor] = useState('#FFFFFF')
  const palette = ensurePaletteSlots(state.settings.tagCustomPalette, 10)

  const updatePalette = (next) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: { tagCustomPalette: next } })
  }

  const openPicker = (e, pick) => {
    e.preventDefault()
    e.stopPropagation()
    setSlotMenu(null)
    setPicker({ x: e.clientX, y: e.clientY + 8, pick, initial: pick?.color || barColor })
  }

  const openSlotMenu = (e, index) => {
    e.preventDefault()
    e.stopPropagation()
    setSlotMenu({ x: e.clientX, y: e.clientY, index })
  }

  const applyPickerColor = (hex) => {
    const { mode, index } = picker?.pick || {}
    let next = [...palette]
    if ((mode === 'replace' || mode === 'fill') && index != null) {
      next[index] = hex
    } else if (mode === 'append') {
      const emptyIdx = next.findIndex((c) => !c)
      if (emptyIdx >= 0) next[emptyIdx] = hex
      else next.push(hex)
    }
    updatePalette(next)
    setBarColor(hex)
  }

  const deleteSlot = (index) => {
    const next = [...palette]
    next.splice(index, 1)
    while (next.length < 10) next.push(null)
    updatePalette(next)
    setSlotMenu(null)
  }

  const addBarColor = () => {
    let next = [...palette]
    const emptyIdx = next.findIndex((c) => !c)
    if (emptyIdx >= 0) next[emptyIdx] = barColor
    else next.push(barColor)
    updatePalette(next)
  }

  useEffect(() => {
    if (!slotMenu) return undefined
    const onDown = (e) => {
      if (e.target.closest('[data-slot-menu]')) return
      setSlotMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [slotMenu])

  return (
    <section>
      <h3 className="mb-2 text-sm font-medium">컬러 설정</h3>
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
        <label className="mb-3 flex items-center justify-between rounded-lg px-1 py-1.5 text-xs">
          <span>태그/ 신규추가 커스텀 색상만 사용</span>
          <input
            type="checkbox"
            checked={state.settings.tagCustomColorOnly === true}
            onChange={(e) =>
              dispatch({
                type: 'UPDATE_SETTINGS',
                payload: { tagCustomColorOnly: e.target.checked }
              })
            }
          />
        </label>

        <div className="mb-3 flex items-center gap-2">
          <ColorPickerTrigger
            value={barColor}
            onChange={setBarColor}
            barClassName="h-8 flex-1 rounded-lg"
            title="색상 선택"
          />
          <button
            type="button"
            onClick={addBarColor}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            title="컬러 추가"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {palette.map((color, index) =>
            color ? (
              <button
                key={`tag-color-${index}-${color}`}
                type="button"
                onClick={(e) => openPicker(e, { mode: 'replace', index, color })}
                onContextMenu={(e) => openSlotMenu(e, index)}
                className="h-9 w-9 rounded-full border border-black/10"
                style={{ backgroundColor: color }}
                title="클릭: 색상 변경 · 우클릭: 삭제"
              />
            ) : (
              <button
                key={`tag-empty-${index}`}
                type="button"
                onClick={(e) => openPicker(e, { mode: 'fill', index })}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-[var(--color-border)] bg-[var(--color-bg-panel)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]"
                title="색상 추가"
              >
                +
              </button>
            )
          )}
        </div>
        <p className="mt-2 text-[10px] text-[var(--color-text-muted)]">
          팔레트 클릭으로 색상 변경 · 우클릭으로 삭제 · 10개 이상 시 슬롯 추가
        </p>
      </div>

      {slotMenu && (
        <div
          data-slot-menu
          className="fixed z-[99999] min-w-[96px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] py-1 shadow-lg"
          style={{ left: slotMenu.x, top: slotMenu.y + 4 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-red-500/10"
            onClick={() => deleteSlot(slotMenu.index)}
          >
            삭제
          </button>
        </div>
      )}

      {picker && (
        <ColorPickerPopover
          value={picker.initial ?? barColor}
          x={picker.x}
          y={picker.y}
          onChange={applyPickerColor}
          onClose={() => setPicker(null)}
        />
      )}
    </section>
  )
}
