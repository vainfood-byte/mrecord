import { useRef } from 'react'
import { ImagePlus } from 'lucide-react'
import { useClipboardPaste } from '../../hooks/useClipboardPaste'

export default function ImagePasteArea({
  images = [],
  onAddImage,
  onRemoveImage,
  className = '',
  placeholder = '이미지를 붙여넣기(Ctrl+V)하거나 클릭하여 추가'
}) {
  const inputRef = useRef(null)

  useClipboardPaste((dataUrl) => {
    onAddImage?.(dataUrl)
  })

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') onAddImage?.(reader.result)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        className="flex min-h-[80px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] bg-black/[0.02] p-3 text-center text-xs text-[var(--color-text-muted)] transition-colors hover:bg-black/[0.04]"
      >
        <ImagePlus size={20} className="mb-1 opacity-50" />
        {placeholder}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      {images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {images.map((src, i) => (
            <div key={i} className="group relative">
              <img src={src} alt="" className="h-20 w-20 rounded-lg object-cover" />
              <button
                type="button"
                onClick={() => onRemoveImage?.(i)}
                className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white group-hover:flex"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
