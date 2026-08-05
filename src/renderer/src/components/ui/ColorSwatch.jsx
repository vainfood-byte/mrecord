export default function ColorSwatch({ color, selected, onClick, label, size = 'md' }) {
  const sizeClass = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'

  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`${sizeClass} rounded-full border-2 transition-transform hover:scale-105 ${
        selected ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)] ring-offset-1' : 'border-[var(--color-border)]'
      }`}
      style={{ backgroundColor: color }}
    />
  )
}
