/** 스티커 프레임(모양 마스킹) — CSS clipPath / Canvas clip 공용 */

export const STICKER_FRAME_NONE = null

export const STICKER_FRAME_OPTIONS = [
  { id: 'star', label: '별모양' },
  { id: 'heart', label: '하트모양' },
  { id: 'roundedRect', label: '모서리둥근 네모모양' },
  { id: 'bottleCap', label: '병뚜껑모양' },
  { id: 'stamp', label: '우표모양' },
  { id: 'flower', label: '꽃모양' },
  { id: 'hexagram', label: '육각성모양' }
]

const FRAME_IDS = new Set(STICKER_FRAME_OPTIONS.map((o) => o.id))

/** objectBoundingBox(0~1) 기준 SVG path */
const FRAME_PATH_D = {
  star: buildStarPath(),
  heart:
    'M0.5 0.9 C0.5 0.9 0.08 0.62 0.08 0.34 C0.08 0.18 0.2 0.08 0.34 0.08 C0.42 0.08 0.48 0.13 0.5 0.22 C0.52 0.13 0.58 0.08 0.66 0.08 C0.8 0.08 0.92 0.18 0.92 0.34 C0.92 0.62 0.5 0.9 0.5 0.9 Z',
  roundedRect:
    'M0.14 0.04 H0.86 Q0.96 0.04 0.96 0.14 V0.86 Q0.96 0.96 0.86 0.96 H0.14 Q0.04 0.96 0.04 0.86 V0.14 Q0.04 0.04 0.14 0.04 Z',
  bottleCap: buildBottleCapPath(),
  stamp: buildStampPath(),
  flower: buildFlowerPath(),
  hexagram: buildHexagramPath()
}

/** Chubby / Rounded 5각 별 — 넓은 내경 + 살짝 둥근 꼭짓점 */
function buildStarPath() {
  const cx = 0.5
  const cy = 0.5
  const spikes = 5
  const rOuter = 0.475
  const rInner = 0.32
  const tipRound = 0.13
  const parts = []

  for (let i = 0; i < spikes; i++) {
    const step = (Math.PI * 2) / spikes
    const aTip = (i / spikes) * Math.PI * 2 - Math.PI / 2
    const aValley = aTip + step / 2
    const aL = aTip - step * tipRound * 0.5
    const aR = aTip + step * tipRound * 0.5
    const rShoulder = rOuter * 0.88

    const xL = cx + Math.cos(aL) * rShoulder
    const yL = cy + Math.sin(aL) * rShoulder
    const xTip = cx + Math.cos(aTip) * rOuter
    const yTip = cy + Math.sin(aTip) * rOuter
    const xR = cx + Math.cos(aR) * rShoulder
    const yR = cy + Math.sin(aR) * rShoulder
    const xV = cx + Math.cos(aValley) * rInner
    const yV = cy + Math.sin(aValley) * rInner

    if (i === 0) parts.push(`M${xL.toFixed(4)} ${yL.toFixed(4)}`)
    else parts.push(`L${xL.toFixed(4)} ${yL.toFixed(4)}`)
    parts.push(`Q${xTip.toFixed(4)} ${yTip.toFixed(4)} ${xR.toFixed(4)} ${yR.toFixed(4)}`)
    parts.push(`L${xV.toFixed(4)} ${yV.toFixed(4)}`)
  }
  parts.push('Z')
  return parts.join(' ')
}

function buildBottleCapPath() {
  const cx = 0.5
  const cy = 0.5
  const spikes = 16
  const rOuter = 0.48
  const rInner = 0.42
  const parts = []
  for (let i = 0; i < spikes; i++) {
    const a0 = (i / spikes) * Math.PI * 2 - Math.PI / 2
    const a1 = ((i + 0.5) / spikes) * Math.PI * 2 - Math.PI / 2
    const a2 = ((i + 1) / spikes) * Math.PI * 2 - Math.PI / 2
    const x0 = cx + Math.cos(a0) * rInner
    const y0 = cy + Math.sin(a0) * rInner
    const x1 = cx + Math.cos(a1) * rOuter
    const y1 = cy + Math.sin(a1) * rOuter
    const x2 = cx + Math.cos(a2) * rInner
    const y2 = cy + Math.sin(a2) * rInner
    if (i === 0) parts.push(`M${x0.toFixed(4)} ${y0.toFixed(4)}`)
    parts.push(`L${x1.toFixed(4)} ${y1.toFixed(4)} L${x2.toFixed(4)} ${y2.toFixed(4)}`)
  }
  parts.push('Z')
  return parts.join(' ')
}

function buildStampPath() {
  const left = 0.06
  const right = 0.94
  const top = 0.08
  const bottom = 0.92
  const notches = 8
  const depth = 0.035
  const parts = [`M${left} ${top}`]

  for (let i = 0; i < notches; i++) {
    const t0 = left + ((right - left) * i) / notches
    const t1 = left + ((right - left) * (i + 0.5)) / notches
    const t2 = left + ((right - left) * (i + 1)) / notches
    parts.push(`L${t0.toFixed(4)} ${top} L${t1.toFixed(4)} ${(top + depth).toFixed(4)} L${t2.toFixed(4)} ${top}`)
  }
  for (let i = 0; i < notches; i++) {
    const t0 = top + ((bottom - top) * i) / notches
    const t1 = top + ((bottom - top) * (i + 0.5)) / notches
    const t2 = top + ((bottom - top) * (i + 1)) / notches
    parts.push(`L${right} ${t0.toFixed(4)} L${(right - depth).toFixed(4)} ${t1.toFixed(4)} L${right} ${t2.toFixed(4)}`)
  }
  for (let i = 0; i < notches; i++) {
    const t0 = right - ((right - left) * i) / notches
    const t1 = right - ((right - left) * (i + 0.5)) / notches
    const t2 = right - ((right - left) * (i + 1)) / notches
    parts.push(`L${t0.toFixed(4)} ${bottom} L${t1.toFixed(4)} ${(bottom - depth).toFixed(4)} L${t2.toFixed(4)} ${bottom}`)
  }
  for (let i = 0; i < notches; i++) {
    const t0 = bottom - ((bottom - top) * i) / notches
    const t1 = bottom - ((bottom - top) * (i + 0.5)) / notches
    const t2 = bottom - ((bottom - top) * (i + 1)) / notches
    parts.push(`L${left} ${t0.toFixed(4)} L${(left + depth).toFixed(4)} ${t1.toFixed(4)} L${left} ${t2.toFixed(4)}`)
  }
  parts.push('Z')
  return parts.join(' ')
}

/** Daisy/Blossom — 통통한 둥근 꽃잎(11개) + 넓은 중심 */
function buildFlowerPath() {
  const cx = 0.5
  const cy = 0.5
  const petals = 11
  const parts = []

  // 중앙 주요 내용이 보이도록 넓은 중심 원
  const cr = 0.34
  parts.push(
    `M${(cx + cr).toFixed(4)} ${cy.toFixed(4)} ` +
      `A${cr} ${cr} 0 1 1 ${(cx - cr).toFixed(4)} ${cy.toFixed(4)} ` +
      `A${cr} ${cr} 0 1 1 ${(cx + cr).toFixed(4)} ${cy.toFixed(4)} Z`
  )

  // 끝이 둥근 타원 꽃잎 (중심과 크게 겹쳐 통통한 실루엣)
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 - Math.PI / 2
    const dist = 0.3
    const px = cx + Math.cos(a) * dist
    const py = cy + Math.sin(a) * dist
    const rx = 0.185
    const ry = 0.15
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    const k = 0.5522847498
    const pt = (lx, ly) => {
      const x = px + lx * cos - ly * sin
      const y = py + lx * sin + ly * cos
      return `${x.toFixed(4)} ${y.toFixed(4)}`
    }
    parts.push(
      `M${pt(rx, 0)} ` +
        `C${pt(rx, ry * k)} ${pt(rx * k, ry)} ${pt(0, ry)} ` +
        `C${pt(-rx * k, ry)} ${pt(-rx, ry * k)} ${pt(-rx, 0)} ` +
        `C${pt(-rx, -ry * k)} ${pt(-rx * k, -ry)} ${pt(0, -ry)} ` +
        `C${pt(rx * k, -ry)} ${pt(rx, -ry * k)} ${pt(rx, 0)} Z`
    )
  }
  return parts.join(' ')
}

/** 육각성(두 정삼각형 겹침 — nonzero로 채워진 별 실루엣) */
function buildHexagramPath() {
  const cx = 0.5
  const cy = 0.5
  const r = 0.46
  const tri = (rot) => {
    const pts = []
    for (let i = 0; i < 3; i++) {
      const a = rot + (i * Math.PI * 2) / 3
      pts.push(`${(cx + Math.cos(a) * r).toFixed(4)} ${(cy + Math.sin(a) * r).toFixed(4)}`)
    }
    return `M${pts[0]} L${pts[1]} L${pts[2]} Z`
  }
  // 위쪽 꼭짓점 / 아래쪽 꼭짓점 정삼각형
  return `${tri(-Math.PI / 2)} ${tri(Math.PI / 2)}`
}

/** 저장 데이터 호환: 없거나 알 수 없으면 null(사각/없음) */
export function normalizeFrameShape(value) {
  if (value == null || value === '' || value === 'none' || value === 'square' || value === 'Square') {
    return STICKER_FRAME_NONE
  }
  return FRAME_IDS.has(value) ? value : STICKER_FRAME_NONE
}

export function getFramePathD(frameShape) {
  const shape = normalizeFrameShape(frameShape)
  return shape ? FRAME_PATH_D[shape] : null
}

export function getStickerFrameClipId(stickerId, frameShape) {
  const shape = normalizeFrameShape(frameShape)
  if (!shape || !stickerId) return null
  return `sticker-frame-clip-${stickerId}-${shape}`
}

/** img에 적용할 clip-path 스타일 (defs의 clipPath와 함께 사용) */
export function getStickerFrameClipStyle(stickerId, frameShape) {
  const clipId = getStickerFrameClipId(stickerId, frameShape)
  if (!clipId) return undefined
  const ref = `url(#${clipId})`
  return { clipPath: ref, WebkitClipPath: ref }
}

/**
 * Canvas에서 프레임으로 clip.
 * 현재 CTM 기준 (ox, oy)가 좌상단, width/height 크기.
 * clip만 적용하며 save/restore는 호출측에서 한다.
 */
export function applyFrameClipToCanvas(ctx, frameShape, width, height, ox = 0, oy = 0) {
  const d = getFramePathD(frameShape)
  if (!d || !ctx || width <= 0 || height <= 0) return false
  const path = new Path2D()
  const matrix = new DOMMatrix().translateSelf(ox, oy).scaleSelf(width, height)
  path.addPath(new Path2D(d), matrix)
  ctx.clip(path)
  return true
}
