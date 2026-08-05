/** 드래그 리사이즈 핸들 — hover 시 표시 */
export default function ResizeHandle({ direction = 'horizontal', onMouseDown, className = '' }) {
  const isHorizontal = direction === 'horizontal'
  return (
    <div
      role="separator"
      onMouseDown={onMouseDown}
      className={`group shrink-0 ${className}`}
      style={{ WebkitAppRegion: 'no-drag' }}
    >
      <div
        className={`transition-colors group-hover:bg-[var(--color-accent)]/40 ${
          isHorizontal
            ? 'mx-auto h-1.5 w-10 cursor-row-resize rounded-full bg-[var(--color-border)]'
            : 'my-auto h-10 w-1.5 cursor-col-resize rounded-full bg-[var(--color-border)]'
        }`}
      />
    </div>
  )
}
