/** 우클릭 메뉴 — 크기/옵션 선택 섹션 */

const SECTION_STYLES = {
  card: 'border-sky-500/30 bg-sky-500/[0.06]',
  text: 'border-violet-500/30 bg-violet-500/[0.06]',
  color: 'border-amber-500/30 bg-amber-500/[0.06]'
}

export function SizeOptionMenuSection({ label, variant = 'card', options, current, onSelect }) {
  const boxClass = SECTION_STYLES[variant] || SECTION_STYLES.card

  return (
    <div className={`mx-1.5 mb-1.5 overflow-hidden rounded-lg border ${boxClass}`}>
      <p className="border-b border-black/[0.06] px-2.5 py-1.5 text-[10px] font-semibold tracking-wide text-[var(--color-text)]">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-1 p-1.5">
        {options.map(([key, { label: optionLabel }]) => {
          const active = current === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={`rounded-md px-2 py-1.5 text-center text-[11px] transition-colors ${
                active
                  ? 'bg-[var(--color-accent)] font-medium text-white shadow-sm'
                  : 'bg-[var(--color-bg-card)] text-[var(--color-text)] hover:bg-black/5'
              }`}
            >
              {optionLabel}
              {active ? ' ✓' : ''}
            </button>
          )
        })}
      </div>
    </div>
  )
}
