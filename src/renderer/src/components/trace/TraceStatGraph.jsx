import { useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { getThemeColors } from '../../utils/colorUtils'
import { buildTraceGraphColorMap, resolveTraceGraphSliceColor } from '../../utils/traceHelpers'

export default function TraceStatGraph({
  distribution = [],
  type = 'pie',
  size = 120,
  graphColorMode = 'theme',
  graphColorSeed = 0
}) {
  const { state } = useApp()
  const themeKey = `${state.settings.themePresetId}|${JSON.stringify(state.settings.customTheme || {})}`
  const theme = useMemo(() => getThemeColors(), [themeKey])

  const colorOptions = useMemo(
    () => ({
      mode: graphColorMode,
      seed: graphColorSeed,
      settings: state.settings,
      theme
    }),
    [graphColorMode, graphColorSeed, state.settings, theme]
  )

  const colorMap = useMemo(
    () => buildTraceGraphColorMap(distribution, colorOptions),
    [distribution, colorOptions]
  )

  if (!distribution.length) {
    return (
      <div
        className="flex items-center justify-center bg-[var(--color-bg)] text-[10px] text-[var(--color-text-muted)]"
        style={{ width: size, height: size }}
      >
        —
      </div>
    )
  }

  const sliceFill = (d, i) => resolveTraceGraphSliceColor(d, i, distribution, colorOptions, colorMap)

  if (type === 'bar') {
    const max = Math.max(...distribution.map((d) => d.count), 1)
    const barW = Math.max(8, Math.floor((size - 16) / distribution.length) - 4)
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
        {distribution.slice(0, 6).map((d, i) => {
          const h = Math.round((d.count / max) * (size - 28))
          const x = 8 + i * (barW + 4)
          return (
            <g key={d.id}>
              <rect
                x={x}
                y={size - 12 - h}
                width={barW}
                height={h}
                rx={2}
                fill={sliceFill(d, i)}
              />
              <text
                x={x + barW / 2}
                y={size - 2}
                textAnchor="middle"
                fontSize="7"
                fill="var(--color-text-muted)"
              >
                {d.percent}%
              </text>
            </g>
          )
        })}
      </svg>
    )
  }

  const total = distribution.reduce((s, d) => s + d.count, 0) || 1
  const r = size / 2 - 4
  const cx = size / 2
  const cy = size / 2
  let angle = -Math.PI / 2

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
      {distribution.slice(0, 6).map((d, i) => {
        const slice = (d.count / total) * Math.PI * 2
        const x1 = cx + r * Math.cos(angle)
        const y1 = cy + r * Math.sin(angle)
        angle += slice
        const x2 = cx + r * Math.cos(angle)
        const y2 = cy + r * Math.sin(angle)
        const large = slice > Math.PI ? 1 : 0
        const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`
        return <path key={d.id} d={path} fill={sliceFill(d, i)} />
      })}
      <circle cx={cx} cy={cy} r={r * 0.45} fill="var(--color-bg-card)" />
    </svg>
  )
}
