import { useApp } from '../../context/AppContext'
import { pushRecentColor, normalizeRecentColors, RECENT_COLOR_SLOTS } from '../../utils/recentColorHelpers'
import { normalizeHex } from '../../utils/colorPickerHelpers'

export default function RecentColorRow({ value, onSelect, slotSize = 'h-8 w-8' }) {
  const { state } = useApp()
  const recent = normalizeRecentColors(state.settings.recentPickColors)

  return (
    <div>
      <p className="mb-1.5 text-[10px] text-[var(--color-text-muted)]">최근 사용 색상</p>
      <div className="flex gap-2">
        {Array.from({ length: RECENT_COLOR_SLOTS }, (_, i) => {
          const color = recent[i]
          return color ? (
            <button
              key={`recent-${i}-${color}`}
              type="button"
              title={color}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onSelect?.(normalizeHex(color))
              }}
              className={`${slotSize} rounded-full border ${
                normalizeHex(value).toLowerCase() === normalizeHex(color).toLowerCase()
                  ? 'ring-2 ring-[var(--color-accent)]'
                  : 'border-black/10'
              }`}
              style={{ backgroundColor: color }}
            />
          ) : (
            <span
              key={`recent-empty-${i}`}
              className={`${slotSize} rounded-full border border-dashed border-[var(--color-border)] bg-[var(--color-bg)]`}
            />
          )
        })}
      </div>
    </div>
  )
}