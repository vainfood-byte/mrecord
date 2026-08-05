import { useRef } from 'react'
import { SmilePlus } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { createSticker, loadImageSize, readImageFile } from '../../utils/stickerHelpers'
import { setSelectedStickerId } from '../../utils/stickerSelectionStore'

export default function DecorateButton() {
  const { state, dispatch } = useApp()
  const inputRef = useRef(null)

  const addStickers = async (files) => {
    const list = Array.from(files || []).filter((f) => f?.type?.match(/^image\/(png|gif|jpeg|webp)$/i))
    if (!list.length) return

    const cw = window.innerWidth
    const ch = window.innerHeight
    const total = list.length

    for (let index = 0; index < total; index += 1) {
      const file = list[index]
      try {
        const src = await readImageFile(file)
        const { width: natW, height: natH } = await loadImageSize(src)
        const width = Math.min(160, Math.max(80, natW > 0 ? natW * 0.5 : 120))
        const h = natW > 0 ? width * (natH / natW) : width * 0.75
        const offset = (index - (total - 1) / 2) * 28
        const sticker = createSticker({
          src,
          width,
          heightRatio: natW > 0 ? natH / natW : undefined,
          containerW: cw,
          containerH: ch,
          x: (cw - width) / 2 + offset,
          y: (ch - h) / 2 + offset
        })
        if (state.settings.stickerShadowEnabled === false) {
          sticker.shadowEnabled = false
        }
        sticker.tabId = state.activeTab
        dispatch({ type: 'ADD_STICKER', payload: sticker })
        setSelectedStickerId(sticker.id)
      } catch {
        /* ignore invalid file */
      }
    }
  }

  const handleFile = (e) => {
    addStickers(e.target.files)
    e.target.value = ''
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="rounded-lg p-2 hover:bg-black/5"
        title="꾸미기 — PNG/GIF 첨부 (다중 선택 가능)"
      >
        <SmilePlus size={16} />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/gif"
        multiple
        className="hidden"
        onChange={handleFile}
      />
    </div>
  )
}
