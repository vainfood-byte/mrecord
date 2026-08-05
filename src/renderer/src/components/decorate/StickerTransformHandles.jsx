/** 스티커 · 쁘띠스티커 선택 시 회전/크기 조절 핸들 */
export const STICKER_HANDLE_SIZE = 25
export const STICKER_HANDLE_ICON_SIZE = 20
function StickerRotateIcon() {
  const s = STICKER_HANDLE_ICON_SIZE
  return (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M9.2 6.4a3.6 3.6 0 1 1-1.1-2.6"
        stroke="white"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M8.1 2.2 6.2 2.2 7.4 0.6"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function StickerResizeIcon() {
  const s = STICKER_HANDLE_ICON_SIZE
  return (
    <svg width={s} height={s} viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M1.2 1.2 1.2 6.4 6.4 1.2" fill="white" />
      <path d="M10.8 10.8 10.8 5.6 5.6 10.8" fill="white" />
    </svg>
  )
}

export default function StickerTransformHandles({
  onRotateDown,
  onResizeDown,
  onPointerMove,
  onPointerUp
}) {
  const half = STICKER_HANDLE_SIZE / 2

  return (
    <>
      <div
        className="absolute left-1/2 z-10 flex -translate-x-1/2 items-center justify-center rounded-full border-2 border-white bg-blue-500 shadow cursor-grab active:cursor-grabbing"
        style={{
          width: STICKER_HANDLE_SIZE,
          height: STICKER_HANDLE_SIZE,
          top: -(half + 6)
        }}
        title="회전"
        onPointerDown={onRotateDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <StickerRotateIcon />
      </div>
      <div
        className="absolute z-10 flex items-center justify-center rounded-full border-2 border-white bg-blue-500 shadow cursor-se-resize"
        style={{
          width: STICKER_HANDLE_SIZE,
          height: STICKER_HANDLE_SIZE,
          right: -(half - 2),
          bottom: -(half - 2)
        }}
        title="크기 조절"
        onPointerDown={onResizeDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <StickerResizeIcon />
      </div>
    </>
  )
}
