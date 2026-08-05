import { normalizeHex } from '../../utils/colorPickerHelpers'
import {
  TEXT_COLOR_CHROMATIC_COLS,
  TEXT_COLOR_GRAYSCALE_ROW
} from '../../constants/textColorPalette'

function Swatch({ color, value, onSelect, size = 'h-5 w-5' }) {
  const active =
    normalizeHex(value).toLowerCase() === normalizeHex(color).toLowerCase()
  const isLight = ['#FFFFFF', '#F2F2F2', '#EFEFEF', '#FFEBEE', '#FFF3E0', '#FFFDE7', '#E8F5E9', '#E0F7FA', '#E3F2FD', '#F3E5F5', '#FCE4EC', '#B4D6FA', '#FFF9C4', '#FFCDD2', '#FFE0B2', '#C8E6C9', '#B2EBF2', '#BBDEFB', '#E1BEE7', '#F8BBD0'].includes(
      color.toUpperCase()
    )

  return (
    <button
      type="button"
      title={color}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onSelect?.(normalizeHex(color))
      }}
      className={`${size} shrink-0 border ${active ? 'ring-2 ring-[var(--color-accent)] ring-offset-1' : isLight ? 'border-black/15' : 'border-black/10'}`}
      style={{ backgroundColor: color }}
    />
  )
}

function ColorRow({ colors, value, onSelect, cols, size }) {
  return (
    <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {colors.map((color) => (
        <Swatch key={color} color={color} value={value} onSelect={onSelect} size={size} />
      ))}
    </div>
  )
}

export default function StandardColorPalette({ value, onSelect }) {
  const chromaticRows = Array.from({ length: 5 }, (_, row) =>
    TEXT_COLOR_CHROMATIC_COLS.map((col) => col[row])
  )

  return (
    <div className="space-y-1.5">
      <ColorRow colors={TEXT_COLOR_GRAYSCALE_ROW} value={value} onSelect={onSelect} cols={9} />
      <div className="space-y-px">
        {chromaticRows.map((row, i) => (
          <ColorRow key={`chroma-${i}`} colors={row} value={value} onSelect={onSelect} cols={8} />
        ))}
      </div>
    </div>
  )
}
