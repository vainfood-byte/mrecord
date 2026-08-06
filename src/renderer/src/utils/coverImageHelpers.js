/** 표지 이미지 — Base64(클립보드 Data URL 포함) → media://covers 로컬 파일 헬퍼 */

const DATA_IMAGE_RE = /^data:image\//i
const BARE_BASE64_RE = /^[A-Za-z0-9+/=\s]+$/
const MEDIA_COVER_RE = /^media:\/\/covers\//i

/** 대용량 마이그레이션 배치 크기 (10~20) */
const MIGRATE_BATCH_SIZE = 15

/**
 * coverUrl이 마이그레이션 대상인지 판별
 * - data:image/... (Ctrl+V / FileReader Data URL)
 * - 헤더 없는 긴 Base64 문자열
 * media:// · http(s) · blob · file 경로는 제외
 */
export function isBase64CoverUrl(url) {
  if (typeof url !== 'string') return false
  const s = url.trim()
  if (!s) return false
  if (DATA_IMAGE_RE.test(s) || /;base64,/i.test(s)) return true
  if (/^(https?:|media:|file:|blob:)/i.test(s)) return false
  /* 짧은 값은 경로/색상 등과 혼동 방지 */
  if (s.length < 200) return false
  return BARE_BASE64_RE.test(s)
}

export function isMediaCoverUrl(url) {
  return typeof url === 'string' && MEDIA_COVER_RE.test(url.trim())
}

/** 메인 스레드에 양보 — UI 렌더/입력 가능하도록 */
function yieldToUi() {
  return new Promise((resolve) => {
    const finish = () => setTimeout(resolve, 0)
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(finish)
    } else {
      finish()
    }
  })
}

/**
 * Base64 / Data URL을 로컬 표지 파일로 저장하고 mediaUri·thumbnailUrl을 반환합니다.
 * @returns {Promise<{ coverUrl: string, thumbnailUrl: string|null }|string|null>}
 *   - 성공: { coverUrl, thumbnailUrl }
 *   - 이미 로컬/원격 URL: 입력 문자열 그대로
 *   - 실패: null
 */
export async function saveCoverFromDataUrl(base64Data, recordId) {
  if (!base64Data || !recordId) return null
  const input = String(base64Data)
  if (!isBase64CoverUrl(input) && !DATA_IMAGE_RE.test(input)) {
    return base64Data
  }

  let base64Payload = input
  try {
    if (!window.mrecord?.saveCoverImage) {
      console.warn('saveCoverFromDataUrl: saveCoverImage IPC unavailable')
      return null
    }
    const result = await window.mrecord.saveCoverImage({
      base64Data: base64Payload,
      recordId
    })
    base64Payload = null
    if (result?.ok && result.mediaUri) {
      return {
        coverUrl: result.mediaUri,
        thumbnailUrl: result.thumbnailUrl || null
      }
    }
    console.warn('saveCoverFromDataUrl failed:', result?.error)
    /* IPC 실패 시 null — 호출측이 Data URL fallback으로 엑박 방지 */
    return null
  } catch (err) {
    console.warn('saveCoverFromDataUrl error:', err)
    return null
  } finally {
    base64Payload = null
  }
}

/**
 * 표지 변경 시 Base64/Data URL → media:// 우선 저장 후 patch 반환.
 * IPC 실패 시 원본 URL을 유지해 엑박을 막습니다.
 * @returns {Promise<{ coverUrl: string, thumbnailUrl: string }>}
 */
export async function resolveCoverChangePatch(base64OrUrl, recordId) {
  const fallback = {
    coverUrl: typeof base64OrUrl === 'string' ? base64OrUrl : '',
    thumbnailUrl: ''
  }
  if (!base64OrUrl || !recordId) return fallback

  const saved = await saveCoverFromDataUrl(base64OrUrl, recordId)
  if (saved && typeof saved === 'object' && saved.coverUrl) {
    return {
      coverUrl: saved.coverUrl,
      thumbnailUrl: saved.thumbnailUrl || ''
    }
  }
  if (typeof saved === 'string') {
    return { coverUrl: saved, thumbnailUrl: '' }
  }
  return fallback
}

/**
 * 원본 레코드 객체의 Base64 필드를 media:// 로 즉시 덮어써
 * 긴 마이그레이션 루프 중에도 대용량 문자열이 GC 대상이 되게 합니다.
 */
function detachBase64Fields(rec, { coverUrl, thumbnailUrl } = {}) {
  if (!rec || typeof rec !== 'object') return
  try {
    if (typeof coverUrl === 'string') rec.coverUrl = coverUrl
    if (thumbnailUrl === null) {
      if (isBase64CoverUrl(rec.thumbnailUrl)) rec.thumbnailUrl = ''
    } else if (typeof thumbnailUrl === 'string') {
      rec.thumbnailUrl = thumbnailUrl
    }
  } catch {
    /* sealed/frozen 객체는 무시 — next 배열의 새 객체로만 교체 */
  }
}

/**
 * Base64 thumbnailUrl → media://covers/thumb_[id].jpg
 * 실패 시 null (호출측에서 기존 값 유지)
 */
async function migrateBase64ThumbnailUrl(recordId, thumbnailUrl) {
  if (!recordId || !isBase64CoverUrl(thumbnailUrl)) return null

  let base64Payload = thumbnailUrl
  try {
    if (window.mrecord?.saveCoverThumbnail) {
      const result = await window.mrecord.saveCoverThumbnail({
        base64Data: base64Payload,
        recordId
      })
      base64Payload = null
      if (result?.ok && result.thumbnailUrl) return result.thumbnailUrl
    }

    /* fallback: media 표지가 있으면 원본에서 썸네일 재생성 */
    if (window.mrecord?.ensureCoverThumbnail) {
      const ensured = await window.mrecord.ensureCoverThumbnail({
        recordId,
        force: true
      })
      if (ensured?.ok && ensured.thumbnailUrl) return ensured.thumbnailUrl
    }
  } catch (err) {
    console.warn('Thumbnail base64 migration failed for record:', recordId, err)
  } finally {
    base64Payload = null
  }
  return null
}

/** 단일 레코드 Base64 → media:// 변환. 실패 시 원본 유지 */
async function migrateOneRecordCover(rec) {
  if (!rec?.id) return { patched: rec, changed: false, patch: null }

  let patched = rec
  let localChanged = false
  const patch = {}

  /* 1) coverUrl Base64 → media://covers/[id].ext (+ thumb 생성) */
  if (isBase64CoverUrl(patched.coverUrl) && window.mrecord?.saveCoverImage) {
    let base64Payload = patched.coverUrl
    try {
      const result = await window.mrecord.saveCoverImage({
        base64Data: base64Payload,
        recordId: patched.id
      })
      base64Payload = null

      if (result?.ok && result.mediaUri) {
        const mediaUri = result.mediaUri
        const thumbUri = result.thumbnailUrl || null

        detachBase64Fields(rec, {
          coverUrl: mediaUri,
          thumbnailUrl: thumbUri || (isBase64CoverUrl(rec.thumbnailUrl) ? null : undefined)
        })

        patched = { ...rec, coverUrl: mediaUri }
        patch.coverUrl = mediaUri
        if (thumbUri) {
          patched.thumbnailUrl = thumbUri
          patch.thumbnailUrl = thumbUri
        } else if (isBase64CoverUrl(patched.thumbnailUrl)) {
          delete patched.thumbnailUrl
          patch.thumbnailUrl = ''
        }
        localChanged = true
      } else {
        console.warn(
          'Cover migration skipped for record (kept base64):',
          patched.id,
          result?.error
        )
      }
    } catch (err) {
      console.warn('Cover migration failed for record (kept base64):', patched.id, err)
    } finally {
      base64Payload = null
    }
  }

  /* 2) thumbnailUrl이 아직 Base64면 실물 파일로 추출해 JSON·메모리에서 제거 */
  if (isBase64CoverUrl(patched.thumbnailUrl)) {
    const mediaThumb = await migrateBase64ThumbnailUrl(patched.id, patched.thumbnailUrl)
    if (mediaThumb) {
      detachBase64Fields(rec, { thumbnailUrl: mediaThumb })
      if (patched === rec) patched = { ...patched }
      patched.thumbnailUrl = mediaThumb
      patch.thumbnailUrl = mediaThumb
      localChanged = true
    } else {
      console.warn('Thumbnail migration skipped for record (kept base64):', patched.id)
    }
  }

  return {
    patched,
    changed: localChanged,
    patch: localChanged ? patch : null
  }
}

/**
 * records 배열의 Base64 coverUrl·thumbnailUrl을 로컬 파일로 마이그레이션합니다.
 * 10~20개 단위 배치 + rAF/setTimeout 양보로 UI 멈춤을 방지합니다.
 * 변환 성공 즉시 원본/반환 객체에서 Base64 문자열을 제거하고 media:// 로 교체합니다.
 * @param {object[]} records
 * @param {{
 *   onBatchComplete?: (info: {
 *     records: object[],
 *     batchPatches: Record<string, { coverUrl?: string, thumbnailUrl?: string }>,
 *     convertedInBatch: number,
 *     convertedCount: number,
 *     index: number
 *   }) => (void|Promise<void>),
 *   signal?: { cancelled?: boolean }
 * }} [options]
 * @returns {Promise<{ records: object[], changed: boolean, convertedCount: number }>}
 */
export async function migrateBase64RecordCovers(records, options = {}) {
  if (!Array.isArray(records) || !records.length) {
    return { records: records || [], changed: false, convertedCount: 0 }
  }

  try {
    if (!window.mrecord?.saveCoverImage && !window.mrecord?.saveCoverThumbnail) {
      return { records, changed: false, convertedCount: 0 }
    }
  } catch {
    return { records, changed: false, convertedCount: 0 }
  }

  const onBatchComplete =
    typeof options.onBatchComplete === 'function' ? options.onBatchComplete : null
  const signal = options.signal || null
  let changed = false
  let convertedCount = 0
  let batchConverted = 0
  let batchPatches = {}
  const next = records.slice()

  for (let i = 0; i < next.length; i++) {
    if (signal?.cancelled) break

    const rec = next[i]
    try {
      const { patched, changed: localChanged, patch } = await migrateOneRecordCover(rec)
      if (localChanged) {
        changed = true
        convertedCount += 1
        batchConverted += 1
        next[i] = patched
        records[i] = patched
        if (patched?.id && patch) batchPatches[patched.id] = patch
      } else {
        next[i] = patched
      }
    } catch (err) {
      console.warn('Cover migration failed for record (kept original):', rec?.id, err)
      next[i] = rec
    }

    const atBatchEnd = (i + 1) % MIGRATE_BATCH_SIZE === 0 || i === next.length - 1
    if (atBatchEnd) {
      if (batchConverted > 0 && onBatchComplete) {
        try {
          await onBatchComplete({
            records: next,
            batchPatches,
            convertedInBatch: batchConverted,
            convertedCount,
            index: i
          })
        } catch (flushErr) {
          console.warn('Cover migration batch flush failed:', flushErr)
        }
        batchConverted = 0
        batchPatches = {}
      }
      /* UI 렌더·입력에 양보 */
      await yieldToUi()
    }
  }

  return { records: next, changed, convertedCount }
}

/**
 * media:// 표지인데 thumbnailUrl이 없거나 썸네일 파일이 없는 경우 백그라운드 생성.
 * 실패 시 해당 레코드는 그대로 두고 갤러리가 coverUrl로 fallback합니다.
 * @returns {Promise<{ records: object[], changed: boolean }>}
 */
export async function ensureMissingCoverThumbnails(records) {
  if (!Array.isArray(records) || !records.length) {
    return { records: records || [], changed: false }
  }

  try {
    if (!window.mrecord?.ensureCoverThumbnail) {
      return { records, changed: false }
    }
  } catch {
    return { records, changed: false }
  }

  let changed = false
  const next = records.slice()

  for (let i = 0; i < next.length; i++) {
    const rec = next[i]
    try {
      if (!rec?.id || !isMediaCoverUrl(rec.coverUrl)) continue

      /* 이미 thumb 메타가 있으면 스킵 — 파일 유실 시 갤러리 onError가 coverUrl로 fallback */
      const hasThumbMeta =
        typeof rec.thumbnailUrl === 'string' &&
        rec.thumbnailUrl.includes('thumb_') &&
        MEDIA_COVER_RE.test(rec.thumbnailUrl)
      if (hasThumbMeta) continue

      const result = await window.mrecord.ensureCoverThumbnail({
        recordId: rec.id,
        force: false
      })

      if (!result?.ok || !result.thumbnailUrl) {
        if (rec.thumbnailUrl) {
          /* 깨진 thumbnailUrl 제거 → coverUrl fallback */
          const { thumbnailUrl: _t, ...rest } = rec
          void _t
          next[i] = rest
          changed = true
        }
        continue
      }

      next[i] = { ...rec, thumbnailUrl: result.thumbnailUrl }
      changed = true
    } catch (err) {
      console.warn('Thumbnail ensure failed for record (kept coverUrl):', rec?.id, err)
    }

    if ((i + 1) % MIGRATE_BATCH_SIZE === 0) {
      await yieldToUi()
    }
  }

  return { records: next, changed }
}
