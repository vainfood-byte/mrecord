import { getFramePathD, getStickerFrameClipId, normalizeFrameShape } from '../../utils/stickerFrame'

/** objectBoundingBox clipPath defs — 선택 틀과 분리된 이미지 마스킹용 */
export default function StickerFrameClipDefs({ stickerId, frameShape }) {
  const shape = normalizeFrameShape(frameShape)
  const d = getFramePathD(shape)
  const clipId = getStickerFrameClipId(stickerId, shape)
  if (!shape || !d || !clipId) return null

  return (
    <svg
      width={0}
      height={0}
      aria-hidden
      focusable="false"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <defs>
        <clipPath id={clipId} clipPathUnits="objectBoundingBox">
          <path d={d} />
        </clipPath>
      </defs>
    </svg>
  )
}
