import { app, BrowserWindow, shell, ipcMain, nativeImage, powerSaveBlocker, powerMonitor, protocol, net, session } from 'electron'
import { join, basename, dirname, resolve, relative, isAbsolute, extname } from 'path'
import { access, constants, createReadStream, readFileSync } from 'fs'
import { writeFile, readFile, readdir, unlink, mkdir, stat, rename } from 'fs/promises'
import { promisify } from 'util'
import { execFile } from 'child_process'
import { pathToFileURL } from 'url'
import { setupAutoUpdater, isInstallingUpdate } from './autoUpdate'

const accessAsync = promisify(access)

/** GPU 셰이더 디스크 캐시 접근 실패(0x5) 로그 방지 — whenReady 이전 필수 */
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
/** 초기 창 기동 가속 */
app.commandLine.appendSwitch('disable-site-isolation-trials')
app.commandLine.appendSwitch('disable-renderer-backgrounding')

/** dev/prod 동일 userData — npm start마다 localStorage 초기화 방지 */
const USER_DATA_DIR_NAME = 'My Record'
app.setPath('userData', join(app.getPath('appData'), USER_DATA_DIR_NAME))

const isDev = !app.isPackaged
const EXPORT_DIR_NAME = 'MyR 마이리코드'
const PERSISTENT_DATA_DIR_NAME = 'MyR 마이리코드'
const PERSISTENT_DATA_FILENAME = 'mrecord-data.json'

/** 표지 이미지 로컬 파일 저장소 */
const MEDIA_DIR_NAME = 'media'
const COVERS_DIR_NAME = 'covers'
const MEDIA_PROTOCOL = 'media'
const COVER_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif']
/** BrowserWindow와 동일 파티션 — media:// 는 이 세션에 등록해야 엑박이 나지 않음 */
const APP_SESSION_PARTITION = 'persist:mrecord'

/** 렌더러 <img src="media://..."> 용 — app.whenReady 이전에 등록 필수 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true,
      corsEnabled: true
    }
  }
])

function getCoversDirectory() {
  return join(app.getPath('userData'), MEDIA_DIR_NAME, COVERS_DIR_NAME)
}

async function ensureCoversDirectory() {
  const coversDir = getCoversDirectory()
  await mkdir(coversDir, { recursive: true })
  return coversDir
}

function sanitizeRecordId(recordId) {
  const safe = String(recordId ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
  if (!safe) {
    const err = new Error('invalid-record-id')
    throw err
  }
  return safe
}

function mimeToCoverExt(mime) {
  const m = String(mime || '').toLowerCase()
  if (m.includes('png')) return 'png'
  if (m.includes('webp')) return 'webp'
  if (m.includes('gif')) return 'gif'
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg'
  return 'jpg'
}

/**
 * Ctrl+V Data URL / 일반 Base64 → Buffer
 * - data:image/png;base64,... / data:image/jpeg;base64,...
 * - data:image/png;charset=utf-8;base64,...
 * - 헤더 없는 raw Base64
 */
function parseBase64Image(base64Data) {
  const str = String(base64Data ?? '').trim()
  if (!str) {
    const err = new Error('empty-image-data')
    throw err
  }
  const dataUrlMatch =
    /^data:(image\/[a-zA-Z0-9.+-]+)(?:;[A-Za-z0-9=+_.:-]+)*;base64,([\s\S]+)$/i.exec(str)
  if (dataUrlMatch) {
    const mime = dataUrlMatch[1].toLowerCase()
    const raw = dataUrlMatch[2].replace(/\s+/g, '')
    if (!raw) {
      const err = new Error('empty-image-data')
      throw err
    }
    return { buffer: Buffer.from(raw, 'base64'), ext: mimeToCoverExt(mime), mime }
  }

  /* 헤더만 남은/깨진 Data URL도 정규식으로 제거 후 저장 */
  const stripped = str
    .replace(/^data:image\/[a-zA-Z0-9.+-]+(?:;[A-Za-z0-9=+_.:-]+)*;base64,/i, '')
    .replace(/\s+/g, '')
  if (!stripped) {
    const err = new Error('empty-image-data')
    throw err
  }
  return { buffer: Buffer.from(stripped, 'base64'), ext: 'jpg', mime: 'image/jpeg' }
}

function extFromFilePath(filePath) {
  const raw = extname(String(filePath || ''))
    .replace(/^\./, '')
    .toLowerCase()
  if (raw === 'jpeg') return 'jpg'
  if (COVER_EXTENSIONS.includes(raw)) return raw
  return 'jpg'
}

/**
 * save-cover-image 입력 — Base64(Data URL) 또는 로컬 파일 경로
 * @returns {Promise<{ buffer: Buffer, ext: string, mime: string }>}
 */
async function resolveCoverImageInput(payload = {}) {
  const base64Data = payload?.base64Data
  if (base64Data != null && String(base64Data).trim() !== '') {
    return parseBase64Image(base64Data)
  }

  const sourcePath = payload?.filePath || payload?.path || payload?.imagePath
  if (sourcePath != null && String(sourcePath).trim() !== '') {
    const abs = resolve(String(sourcePath).trim())
    if (!(await pathExists(abs))) {
      const err = new Error('source-file-not-found')
      throw err
    }
    const st = await stat(abs)
    if (!st.isFile()) {
      const err = new Error('source-not-a-file')
      throw err
    }
    const buffer = await readFile(abs)
    if (!buffer.length) {
      const err = new Error('empty-image-data')
      throw err
    }
    const ext = extFromFilePath(abs)
    return {
      buffer,
      ext,
      mime: `image/${ext === 'jpg' ? 'jpeg' : ext}`
    }
  }

  const err = new Error('missing-image-data')
  throw err
}

function toMediaUri(fileName) {
  return `${MEDIA_PROTOCOL}://covers/${fileName}`
}

/** media://covers/[filename] → appData/.../media/covers 실물 파일 */
async function handleMediaProtocolRequest(request) {
  try {
    const coversDir = resolve(getCoversDirectory())
    const parsed = new URL(request.url)
    let fileName = ''

    if (parsed.hostname === COVERS_DIR_NAME) {
      fileName = basename(decodeURIComponent(parsed.pathname || ''))
    } else if (!parsed.hostname) {
      /* media:///covers/file.jpg 형태 호환 */
      const parts = decodeURIComponent(parsed.pathname || '')
        .split(/[/\\]/)
        .filter(Boolean)
      if (parts[0] === COVERS_DIR_NAME && parts[1]) {
        fileName = basename(parts.slice(1).join('/'))
      }
    }

    if (!fileName || fileName === '.' || fileName === '..') {
      return new Response('Forbidden', { status: 403 })
    }
    if (fileName.includes('..') || /[/\\]/.test(fileName)) {
      return new Response('Forbidden', { status: 403 })
    }

    const filePath = join(coversDir, fileName)
    if (!isPathInsideDirectory(coversDir, filePath)) {
      return new Response('Forbidden', { status: 403 })
    }
    if (!(await pathExists(filePath))) {
      return new Response('Not Found', { status: 404 })
    }

    return net.fetch(pathToFileURL(filePath).href, {
      bypassCustomProtocolHandlers: true
    })
  } catch (err) {
    console.warn('media protocol error:', err?.message || err)
    return new Response('Not Found', { status: 404 })
  }
}

function thumbFileName(safeId) {
  return `thumb_${safeId}.jpg`
}

function isPathInsideDirectory(parentDir, targetPath) {
  const parent = resolve(parentDir)
  const target = resolve(targetPath)
  const rel = relative(parent, target)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

async function pathExists(filePath) {
  try {
    await accessAsync(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function findCoverFilePath(coversDir, safeId) {
  for (const ext of COVER_EXTENSIONS) {
    const filePath = join(coversDir, `${safeId}.${ext}`)
    if (await pathExists(filePath)) return filePath
  }
  return null
}

/**
 * 갤러리 카드용 소형 썸네일 생성 (너비 ≈ 360px JPEG)
 * 실패 시 null — 호출측에서 원본 coverUrl fallback
 */
async function writeCoverThumbnail(coversDir, safeId, source) {
  try {
    const image =
      typeof source === 'string'
        ? nativeImage.createFromPath(source)
        : nativeImage.createFromBuffer(source)
    if (!image || image.isEmpty()) return null

    const { width, height } = image.getSize()
    if (!width || !height) return null

    const TARGET_WIDTH = 360
    let out = image
    if (width > TARGET_WIDTH) {
      out = image.resize({
        width: TARGET_WIDTH,
        height: Math.max(1, Math.round((height * TARGET_WIDTH) / width)),
        quality: 'good'
      })
    }

    const fileName = thumbFileName(safeId)
    const filePath = join(coversDir, fileName)
    await writeFile(filePath, out.toJPEG(82))
    return { fileName, filePath, thumbnailUrl: toMediaUri(fileName) }
  } catch {
    return null
  }
}

async function removeCoverFilesById(coversDir, safeId) {
  let deleted = false
  const targets = [
    ...COVER_EXTENSIONS.map((ext) => join(coversDir, `${safeId}.${ext}`)),
    join(coversDir, thumbFileName(safeId))
  ]
  await Promise.all(
    targets.map(async (filePath) => {
      try {
        await unlink(filePath)
        deleted = true
      } catch {
        /* ignore missing */
      }
    })
  )
  return deleted
}

function getPrimaryDataPath() {
  return join(app.getPath('userData'), PERSISTENT_DATA_FILENAME)
}

function getLegacyDocumentsDataPath() {
  return join(getPersistentDataDirectory(), PERSISTENT_DATA_FILENAME)
}

/** mrecord-data.json 본문에 Base64 Data URL이 남아 있으면 쓰기 금지 */
const PERSISTENT_DATA_IMAGE_MARKER = 'data:image'

function persistentBodyHasDataImage(body) {
  return String(body ?? '').includes(PERSISTENT_DATA_IMAGE_MARKER)
}

/**
 * Direct Copy / raw text 쓰기 금지용 Assert.
 * "data:image" 잔존 시 write를 중단합니다 (123MB급 원본 덮어쓰기 차단).
 */
function assertNoDataImageInPersistentBody(body) {
  if (persistentBodyHasDataImage(body)) {
    const err = new Error('blocked-data-image-in-persistent-json')
    err.code = 'BLOCKED_DATA_IMAGE'
    throw err
  }
}

/**
 * 비동기 atomic write — renameSync 금지(대용량 JSON 시 메인 스레드 Freeze 방지).
 * mrecord-data.json 전용: raw copyFile·원본 버퍼 직사 금지, data:image Assert 필수.
 */
async function writeDataFileAtomic(filePath, body) {
  const text = String(body ?? '')
  assertNoDataImageInPersistentBody(text)

  const dir = dirname(filePath)
  await mkdir(dir, { recursive: true })
  const tmpPath = `${filePath}.tmp`
  await writeFile(tmpPath, text, 'utf8')
  try {
    await rename(tmpPath, filePath)
  } catch {
    await unlink(filePath).catch(() => {})
    await rename(tmpPath, filePath)
  }
  const st = await stat(filePath)
  return st.mtimeMs
}

/** HTML/텍스트에 박힌 data:image/...;base64,... 토큰 */
const EMBEDDED_DATA_IMAGE_TOKEN_RE =
  /data:image\/[a-zA-Z0-9.+-]+(?:;[A-Za-z0-9=+_.:-]+)*;base64,[A-Za-z0-9+/=\r\n]+/gi

/**
 * 단일 Data URL → media/covers 실물 파일.
 * @returns {Promise<string>} media://covers/...
 */
async function extractDataImageToCoverFile(dataUrl, coversDir, fileStem) {
  const { buffer, ext } = parseBase64Image(dataUrl)
  if (!buffer?.length) {
    const err = new Error('empty-image-data')
    throw err
  }
  const safeStem = String(fileStem || 'emb')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 80) || 'emb'
  const fileName = `${safeStem}.${ext}`
  const filePath = join(coversDir, fileName)
  await writeFile(filePath, buffer)
  return toMediaUri(fileName)
}

/**
 * 객체 트리 내 data:image 를 모두 media:// 로 치환 (records·settings.backgroundImage·스티커 등).
 * 원본 백업 문자열을 그대로 쓰지 않고, clean 객체만 stringify 하기 위한 전처리.
 */
async function deepCleanDataImagesInTree(node, coversDir, stats) {
  if (typeof node === 'string') {
    if (!node.includes(PERSISTENT_DATA_IMAGE_MARKER)) return node

    const trimmed = node.trim()
    if (/^data:image\//i.test(trimmed)) {
      try {
        const stem = `emb_${Date.now().toString(36)}_${stats.index++}`
        const uri = await extractDataImageToCoverFile(trimmed, coversDir, stem)
        stats.converted += 1
        return uri
      } catch (err) {
        console.warn('deepClean data URL failed:', err?.message || err)
        /* 저장 차단 방지를 위해 비움 — 표지 필드는 migrateImportRecordCovers가 우선 처리 */
        return ''
      }
    }

    const re = new RegExp(EMBEDDED_DATA_IMAGE_TOKEN_RE.source, 'gi')
    const matches = node.match(re)
    if (!matches?.length) return node

    let out = node
    for (let i = 0; i < matches.length; i++) {
      const token = matches[i]
      try {
        const stem = `emb_${Date.now().toString(36)}_${stats.index++}`
        const uri = await extractDataImageToCoverFile(token, coversDir, stem)
        out = out.split(token).join(uri)
        stats.converted += 1
      } catch (err) {
        console.warn('deepClean embedded data URL failed:', err?.message || err)
        out = out.split(token).join('')
      }
      if (stats.converted > 0 && stats.converted % 8 === 0) await yieldMainLoop()
    }
    return out
  }

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      node[i] = await deepCleanDataImagesInTree(node[i], coversDir, stats)
    }
    return node
  }

  if (node && typeof node === 'object') {
    const keys = Object.keys(node)
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      node[key] = await deepCleanDataImagesInTree(node[key], coversDir, stats)
    }
    return node
  }

  return node
}

/**
 * 파싱된 저장 데이터 객체 → Base64 제거 → JSON.stringify 본문만 생성.
 * raw 파일/버퍼/원본 text 직사(Direct Copy) 금지.
 * @returns {Promise<{ body: string, cleanRecords: array, convertedCount: number }>}
 */
async function buildCleanPersistentJsonBody(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    const err = new Error('invalid-persistent-shape')
    throw err
  }

  const coversDir = await ensureCoversDirectory()
  if (!Array.isArray(data.records)) data.records = []

  let convertedCount = 0
  const { convertedCount: coverConverted } = await migrateImportRecordCovers(
    data.records,
    coversDir
  )
  convertedCount += coverConverted || 0

  if (recordsHaveBase64Covers(data.records)) {
    const extra = await migrateImportRecordCovers(data.records, coversDir)
    convertedCount += extra.convertedCount || 0
  }

  const stats = { converted: 0, index: 0 }
  await deepCleanDataImagesInTree(data, coversDir, stats)
  convertedCount += stats.converted

  /* 오직 clean 객체의 stringify 결과만 디스크에 기록 */
  const cleanRecords = data.records
  const body = JSON.stringify(data, null, 2)
  assertNoDataImageInPersistentBody(body)

  return { body, cleanRecords, convertedCount }
}

async function readDataFileIfExists(filePath) {
  try {
    const content = await readFile(filePath, 'utf8')
    if (!String(content ?? '').trim()) return null
    const st = await stat(filePath)
    let savedAt = st.mtimeMs
    let parsed = null
    try {
      parsed = JSON.parse(content)
      if (parsed?.savedAt) savedAt = Number(parsed.savedAt) || savedAt
    } catch {
      /* use mtime */
    }
    /* parsed를 함께 보관해 후보 비교 시 동일 파일 재파싱을 피함 */
    return { content, parsed, savedAt, filePath }
  } catch {
    return null
  }
}

/** 대용량 백업 JSON — Node 문자열 한계/파싱 실패 대비 다중 읽기 */
const IMPORT_SHRINK_THRESHOLD_BYTES = 24 * 1024 * 1024
const IMPORT_DATA_IMAGE_FIELD_RE =
  /"(coverUrl|thumbnailUrl)"(\s*:\s*)"(data:image\/[a-zA-Z0-9.+-]+(?:;[A-Za-z0-9=+_.:-]+)*;base64,[^"]+)"/gi
const IMPORT_BARE_BASE64_RE = /^[A-Za-z0-9+/=\s]+$/

function yieldMainLoop() {
  return new Promise((resolve) => setImmediate(resolve))
}

function isBase64CoverUrlMain(url) {
  if (typeof url !== 'string') return false
  const s = url.trim()
  if (!s) return false
  if (/^data:image\//i.test(s) || /;base64,/i.test(s)) return true
  if (/^(https?:|media:|file:|blob:)/i.test(s)) return false
  if (s.length < 200) return false
  return IMPORT_BARE_BASE64_RE.test(s)
}

function recordsHaveBase64Covers(records) {
  if (!Array.isArray(records) || !records.length) return false
  for (let i = 0; i < records.length; i++) {
    const rec = records[i]
    if (!rec || typeof rec !== 'object') continue
    if (isBase64CoverUrlMain(rec.coverUrl) || isBase64CoverUrlMain(rec.thumbnailUrl)) {
      return true
    }
  }
  return false
}

async function readImportFileText(filePath) {
  /* 1) 비동기 Buffer → utf8 (메인 스레드 블로킹 최소화) */
  try {
    const buf = await readFile(filePath)
    return buf.toString('utf8')
  } catch (err) {
    console.warn('import-data readFile(Buffer) failed:', err?.message || err)
  }

  /* 2) 동기 utf-8 — 실패 시 스트림으로 복구 */
  try {
    return readFileSync(filePath, 'utf-8')
  } catch (err) {
    console.warn('import-data readFileSync(utf-8) failed:', err?.message || err)
  }

  /* 3) 스트림 분할 읽기 후 결합 */
  return new Promise((resolve, reject) => {
    const chunks = []
    const stream = createReadStream(filePath, {
      encoding: 'utf8',
      highWaterMark: 4 * 1024 * 1024
    })
    stream.on('data', (chunk) => {
      chunks.push(chunk)
    })
    stream.on('error', (err) => {
      reject(err)
    })
    stream.on('end', () => {
      resolve(chunks.join(''))
    })
  })
}

/**
 * 파싱 전 data:image Base64를 실물 파일로 추출해 JSON 문자열을 축소합니다.
 * (100MB+ 백업의 JSON.parse 메모리 압박 완화)
 */
async function shrinkDataImageFieldsInImportText(text, coversDir) {
  const re = new RegExp(IMPORT_DATA_IMAGE_FIELD_RE.source, 'gi')
  let match
  let lastIndex = 0
  let converted = 0
  let tempIndex = 0
  const parts = []

  while ((match = re.exec(text)) !== null) {
    const field = match[1]
    const sep = match[2]
    const dataUrl = match[3]
    parts.push(text.slice(lastIndex, match.index))

    let replacement = match[0]
    try {
      const tempId = `imp${Date.now().toString(36)}_${tempIndex++}`
      const { buffer, ext } = parseBase64Image(dataUrl)
      if (!buffer?.length) {
        parts.push(replacement)
        lastIndex = match.index + match[0].length
        continue
      }

      if (field === 'thumbnailUrl') {
        const thumb = await writeCoverThumbnail(coversDir, tempId, buffer)
        if (thumb?.thumbnailUrl) {
          replacement = `"${field}"${sep}"${thumb.thumbnailUrl}"`
          converted += 1
        }
      } else {
        await removeCoverFilesById(coversDir, tempId)
        const fileName = `${tempId}.${ext}`
        const filePath = join(coversDir, fileName)
        await writeFile(filePath, buffer)
        await writeCoverThumbnail(coversDir, tempId, buffer)
        replacement = `"${field}"${sep}"${toMediaUri(fileName)}"`
        converted += 1
      }
    } catch (err) {
      console.warn('import-data shrink field failed:', err?.message || err)
    }

    parts.push(replacement)
    lastIndex = match.index + match[0].length

    if (converted > 0 && converted % 8 === 0) {
      await yieldMainLoop()
    }
  }

  parts.push(text.slice(lastIndex))
  return { text: parts.join(''), converted }
}

/** shrink 단계의 imp* 임시 파일을 실제 recordId 파일명으로 정리 */
async function remapImportTempCoverFiles(records, coversDir) {
  if (!Array.isArray(records) || !records.length) return 0
  let remapped = 0

  for (let i = 0; i < records.length; i++) {
    const rec = records[i]
    if (!rec?.id || typeof rec !== 'object') continue

    let safeId
    try {
      safeId = sanitizeRecordId(rec.id)
    } catch {
      continue
    }

    const coverUrl = typeof rec.coverUrl === 'string' ? rec.coverUrl.trim() : ''
    if (coverUrl.startsWith(`${MEDIA_PROTOCOL}://covers/`)) {
      const fileName = basename(coverUrl.slice(`${MEDIA_PROTOCOL}://covers/`.length))
      if (fileName.startsWith('imp')) {
        const srcPath = join(coversDir, fileName)
        const ext = extFromFilePath(fileName)
        const destName = `${safeId}.${ext}`
        const destPath = join(coversDir, destName)
        try {
          if (await pathExists(srcPath)) {
            if (resolve(srcPath) !== resolve(destPath)) {
              /* 표지·썸네일만 교체 — removeCoverFilesById는 src(imp)까지 지울 수 있어 수동 정리 */
              for (const oldExt of COVER_EXTENSIONS) {
                const oldPath = join(coversDir, `${safeId}.${oldExt}`)
                if (resolve(oldPath) !== resolve(srcPath)) {
                  await unlink(oldPath).catch(() => {})
                }
              }
              try {
                await rename(srcPath, destPath)
              } catch {
                await writeFile(destPath, await readFile(srcPath))
                await unlink(srcPath).catch(() => {})
              }
            }
            rec.coverUrl = toMediaUri(destName)
            remapped += 1
          }

          /* thumb_impxxx.jpg → thumb_[recordId].jpg */
          const tempStem = fileName.replace(/\.[^.]+$/, '')
          const srcThumbPath = join(coversDir, thumbFileName(tempStem))
          const destThumbPath = join(coversDir, thumbFileName(safeId))
          if (await pathExists(srcThumbPath)) {
            if (resolve(srcThumbPath) !== resolve(destThumbPath)) {
              await unlink(destThumbPath).catch(() => {})
              try {
                await rename(srcThumbPath, destThumbPath)
              } catch {
                await writeFile(destThumbPath, await readFile(srcThumbPath))
                await unlink(srcThumbPath).catch(() => {})
              }
            }
            if (
              !rec.thumbnailUrl ||
              isBase64CoverUrlMain(rec.thumbnailUrl) ||
              (typeof rec.thumbnailUrl === 'string' && rec.thumbnailUrl.includes('/imp'))
            ) {
              rec.thumbnailUrl = toMediaUri(thumbFileName(safeId))
            }
          } else if (await pathExists(destThumbPath)) {
            if (!rec.thumbnailUrl || isBase64CoverUrlMain(rec.thumbnailUrl)) {
              rec.thumbnailUrl = toMediaUri(thumbFileName(safeId))
            }
          }
        } catch (err) {
          console.warn('import-data remap cover failed:', rec.id, err?.message || err)
        }
      }
    }

    const thumbUrl = typeof rec.thumbnailUrl === 'string' ? rec.thumbnailUrl.trim() : ''
    if (thumbUrl.startsWith(`${MEDIA_PROTOCOL}://covers/`)) {
      const fileName = basename(thumbUrl.slice(`${MEDIA_PROTOCOL}://covers/`.length))
      const stem = fileName.startsWith('thumb_')
        ? fileName.slice('thumb_'.length).replace(/\.[^.]+$/, '')
        : fileName.replace(/\.[^.]+$/, '')
      if (stem.startsWith('imp')) {
        const srcPath = join(coversDir, fileName.startsWith('thumb_') ? fileName : thumbFileName(stem))
        const destName = thumbFileName(safeId)
        const destPath = join(coversDir, destName)
        try {
          if (await pathExists(srcPath) && resolve(srcPath) !== resolve(destPath)) {
            try {
              await rename(srcPath, destPath)
            } catch {
              await writeFile(destPath, await readFile(srcPath))
              await unlink(srcPath).catch(() => {})
            }
          }
          if (await pathExists(destPath)) {
            rec.thumbnailUrl = toMediaUri(destName)
            remapped += 1
          }
        } catch (err) {
          console.warn('import-data remap thumb failed:', rec.id, err?.message || err)
        }
      }
    }

    if ((i + 1) % 20 === 0) await yieldMainLoop()
  }

  return remapped
}

/** 파싱 후 남은 Base64 coverUrl/thumbnailUrl → media:// 실물 파일 */
async function migrateImportRecordCovers(records, coversDir) {
  if (!Array.isArray(records) || !records.length) {
    return { convertedCount: 0 }
  }

  let convertedCount = 0

  for (let i = 0; i < records.length; i++) {
    const rec = records[i]
    if (!rec?.id || typeof rec !== 'object') continue

    let safeId
    try {
      safeId = sanitizeRecordId(rec.id)
    } catch {
      continue
    }

    if (isBase64CoverUrlMain(rec.coverUrl)) {
      try {
        const { buffer, ext } = parseBase64Image(rec.coverUrl)
        if (buffer?.length) {
          await removeCoverFilesById(coversDir, safeId)
          const fileName = `${safeId}.${ext}`
          const filePath = join(coversDir, fileName)
          await writeFile(filePath, buffer)
          const thumb = await writeCoverThumbnail(coversDir, safeId, buffer)
          /* 파일 저장 성공 후에만 Base64 제거 — 실패 시 원본 유지 */
          rec.coverUrl = toMediaUri(fileName)
          if (thumb?.thumbnailUrl) {
            rec.thumbnailUrl = thumb.thumbnailUrl
          } else if (isBase64CoverUrlMain(rec.thumbnailUrl)) {
            rec.thumbnailUrl = ''
          }
          convertedCount += 1
        }
      } catch (err) {
        console.warn('import-data cover migrate failed:', rec.id, err?.message || err)
      }
    }

    if (isBase64CoverUrlMain(rec.thumbnailUrl)) {
      try {
        const { buffer } = parseBase64Image(rec.thumbnailUrl)
        if (buffer?.length) {
          const thumb = await writeCoverThumbnail(coversDir, safeId, buffer)
          if (thumb?.thumbnailUrl) {
            rec.thumbnailUrl = thumb.thumbnailUrl
            convertedCount += 1
          }
        }
      } catch (err) {
        console.warn('import-data thumb migrate failed:', rec.id, err?.message || err)
      }
    }

    if ((i + 1) % 10 === 0) await yieldMainLoop()
  }

  return { convertedCount }
}

/**
 * 저장 직전 최후 보루 — 파싱 → Base64 추출 → JSON.stringify(clean) 만 허용.
 * 원본 jsonString(raw text)을 그대로 디스크에 쓰지 않습니다.
 * @returns {Promise<{ body: string, parsed: object|null, convertedCount: number, sanitized: boolean, reject?: boolean, error?: string }>}
 */
async function sanitizePersistentDataBody(jsonString) {
  const original = String(jsonString ?? '')
  if (!original) {
    return { body: original, parsed: null, convertedCount: 0, sanitized: false }
  }

  let parsed = null
  try {
    parsed = JSON.parse(original)
  } catch {
    /* 파싱 불가 raw 문자열은 mrecord-data.json 에 직사 금지 */
    return {
      body: '',
      parsed: null,
      convertedCount: 0,
      sanitized: false,
      reject: true,
      error: 'invalid-json-for-persistent-save'
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      body: '',
      parsed,
      convertedCount: 0,
      sanitized: false,
      reject: true,
      error: 'invalid-persistent-shape'
    }
  }

  const needsClean =
    persistentBodyHasDataImage(original) ||
    (Array.isArray(parsed.records) && recordsHaveBase64Covers(parsed.records))

  if (!needsClean) {
    /* 이미 경량 — 그래도 객체 stringify 본문만 사용해 raw 직사 여지를 제거 */
    const body = JSON.stringify(parsed, null, 2)
    try {
      assertNoDataImageInPersistentBody(body)
    } catch {
      /* stringify 후에도 잔존 시 강제 클린 */
      try {
        const cleaned = await buildCleanPersistentJsonBody(parsed)
        return {
          body: cleaned.body,
          parsed,
          convertedCount: cleaned.convertedCount,
          sanitized: true
        }
      } catch (cleanErr) {
        return {
          body: '',
          parsed,
          convertedCount: 0,
          sanitized: false,
          reject: true,
          error: String(cleanErr?.message || cleanErr)
        }
      }
    }
    return { body, parsed, convertedCount: 0, sanitized: false }
  }

  try {
    const cleaned = await buildCleanPersistentJsonBody(parsed)
    return {
      body: cleaned.body,
      parsed,
      convertedCount: cleaned.convertedCount,
      sanitized: true
    }
  } catch (err) {
    return {
      body: '',
      parsed,
      convertedCount: 0,
      sanitized: false,
      reject: true,
      error: String(err?.message || err)
    }
  }
}

/**
 * 부팅 시 userData/mrecord-data.json 내 data:image Base64 잔존 검사.
 * 존재 시 media/covers 실물 추출 → media://covers/... 치환 → 경량 JSON atomic 저장.
 * 기존 사용자는 별도 조치 없이 자동 적용됩니다.
 * @returns {Promise<{ migrated: boolean, convertedCount: number, reason: string, error?: string }>}
 */
async function migratePrimaryDataOnBoot() {
  const primaryPath = getPrimaryDataPath()
  try {
    const existing = await readDataFileIfExists(primaryPath)
    if (!existing) {
      return { migrated: false, convertedCount: 0, reason: 'not-found' }
    }

    const raw = String(existing.content ?? '')
    const hasDataImage = persistentBodyHasDataImage(raw)
    const hasBareCovers =
      existing.parsed &&
      Array.isArray(existing.parsed.records) &&
      recordsHaveBase64Covers(existing.parsed.records)

    if (!hasDataImage && !hasBareCovers) {
      return { migrated: false, convertedCount: 0, reason: 'already-light' }
    }

    await ensureCoversDirectory()
    await yieldMainLoop()

    let parsed = existing.parsed
    let workingText = raw

    /*
     * 대용량 JSON: 파싱 전 coverUrl/thumbnailUrl Data URL을 파일로 추출해 축소.
     * (100MB+ 백업과 동일 경로 — 메인 스레드 메모리 압박 완화)
     */
    if (hasDataImage) {
      try {
        const coversDir = getCoversDirectory()
        const shrunk = await shrinkDataImageFieldsInImportText(workingText, coversDir)
        if (shrunk.converted > 0) {
          workingText = shrunk.text
          parsed = null
        }
      } catch (err) {
        console.warn('boot auto-migration shrink failed:', err?.message || err)
      }
    }

    if (!parsed) {
      try {
        parsed = JSON.parse(workingText)
      } catch (err) {
        console.warn('boot auto-migration: JSON parse failed:', err?.message || err)
        return { migrated: false, convertedCount: 0, reason: 'parse-failed' }
      }
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { migrated: false, convertedCount: 0, reason: 'invalid-shape' }
    }

    const cleaned = await buildCleanPersistentJsonBody(parsed)
    await yieldMainLoop()
    await writeDataFileAtomic(primaryPath, cleaned.body)

    return {
      migrated: true,
      convertedCount: cleaned.convertedCount || 0,
      reason: 'ok'
    }
  } catch (err) {
    console.warn('boot auto-migration failed:', err?.message || err)
    return {
      migrated: false,
      convertedCount: 0,
      reason: 'error',
      error: String(err?.message || err)
    }
  }
}

/**
 * 백업 JSON 안전 로드 → Base64 추출 → cleanRecords stringify 강제 flush.
 * 원본 파일 copyFile / raw text 직사 금지. 제목·감상·속성·태그는 유지.
 */
async function importBackupDataFile(filePath) {
  const absPath = resolve(String(filePath || '').trim())
  if (!absPath) {
    return { ok: false, error: 'missing-file-path' }
  }
  if (!(await pathExists(absPath))) {
    return { ok: false, error: 'file-not-found' }
  }

  const st = await stat(absPath)
  if (!st.isFile()) {
    return { ok: false, error: 'not-a-file' }
  }

  /*
   * Direct Copy 금지: 원본 경로를 getPrimaryDataPath()로 copyFile 하지 않음.
   * 읽기 → 파싱 → cleanRecords → JSON.stringify 결과만 저장.
   */
  let text = await readImportFileText(absPath)
  if (!String(text ?? '').trim()) {
    return { ok: false, error: 'empty-file' }
  }

  const coversDir = await ensureCoversDirectory()
  let preConverted = 0

  /*
   * 파싱 전 data:image 를 파일로 추출해 문자열을 축소.
   * 대용량 임계값뿐 아니라 data:image 잔존 시에도 항상 수행 (1~3MB 경량화).
   */
  const hasEmbeddedDataImage = /"data:image\//i.test(text)
  if (
    hasEmbeddedDataImage ||
    st.size >= IMPORT_SHRINK_THRESHOLD_BYTES ||
    text.length >= IMPORT_SHRINK_THRESHOLD_BYTES
  ) {
    try {
      const shrunk = await shrinkDataImageFieldsInImportText(text, coversDir)
      if (shrunk.converted > 0) {
        text = shrunk.text
        preConverted = shrunk.converted
      }
    } catch (err) {
      console.warn('import-data pre-shrink failed, parse raw text:', err?.message || err)
    }
  }

  let data = null
  try {
    data = JSON.parse(text)
  } catch (parseErr) {
    console.warn('import-data JSON.parse failed, retry after shrink:', parseErr?.message || parseErr)
    try {
      const shrunk = await shrinkDataImageFieldsInImportText(text, coversDir)
      text = shrunk.text
      preConverted += shrunk.converted
      data = JSON.parse(text)
    } catch (retryErr) {
      text = null
      return {
        ok: false,
        error: `json-parse-failed: ${retryErr?.message || retryErr}`
      }
    }
  }
  /* 원본/축소 텍스트는 즉시 폐기 — mrecord-data.json 에 raw 로 쓰지 않음 */
  text = null

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'invalid-backup-shape' }
  }

  if (!Array.isArray(data.records)) {
    data.records = []
  }

  await remapImportTempCoverFiles(data.records, coversDir)

  const prevRevision = Number(data.persistRevision) || 0
  data.savedAt = Date.now()
  data.persistRevision = prevRevision + 1
  if (data.schemaVersion == null) data.schemaVersion = 2

  let cleaned
  try {
    cleaned = await buildCleanPersistentJsonBody(data)
  } catch (err) {
    console.warn('import-data clean stringify failed:', err?.message || err)
    return { ok: false, error: String(err?.message || err) }
  }

  /* cleanRecords 참조를 data에 반영 (이미 동일 배열이지만 의도 명시) */
  data.records = cleaned.cleanRecords

  const primaryPath = getPrimaryDataPath()
  await yieldMainLoop()
  const savedAt = await writeDataFileAtomic(primaryPath, cleaned.body)
  data.savedAt = savedAt || data.savedAt

  const totalConverted = preConverted + (cleaned.convertedCount || 0)
  return {
    ok: true,
    data,
    filePath: primaryPath,
    folderPath: app.getPath('userData'),
    coversMigrated: totalConverted > 0,
    convertedCount: totalConverted,
    alreadyFlushed: true,
    savedAt: data.savedAt
  }
}

/** 구버전 자동 백업 폴더 정리 — 주 파일만 사용 */
async function clearLegacyAutoBackupDirectory() {
  try {
    const backupDir = join(app.getPath('userData'), 'backups')
    const files = await readdir(backupDir)
    await Promise.all(files.map((f) => unlink(join(backupDir, f)).catch(() => {})))
  } catch {
    /* ignore */
  }
}

const SAMPLE_RECORD_IDS = new Set(['rec-1', 'rec-2', 'rec-3', 'rec-4'])

function metaFromParsed(parsed, fallbackSavedAt = 0) {
  if (!parsed || typeof parsed !== 'object') {
    return { savedAt: fallbackSavedAt, recordCount: 0, revision: 0, sampleLike: false }
  }
  const records = Array.isArray(parsed.records) ? parsed.records : []
  const recordCount = records.length
  const sampleLike =
    recordCount > 0 &&
    recordCount <= 4 &&
    records.every((r) => r?.id && SAMPLE_RECORD_IDS.has(r.id))
  return {
    savedAt: Number(parsed.savedAt) || fallbackSavedAt,
    recordCount,
    revision: Number(parsed.persistRevision) || 0,
    sampleLike
  }
}

function parsePersistedMeta(contentOrParsed, fallbackSavedAt = 0) {
  if (contentOrParsed && typeof contentOrParsed === 'object') {
    return metaFromParsed(contentOrParsed, fallbackSavedAt)
  }
  try {
    return metaFromParsed(JSON.parse(contentOrParsed), fallbackSavedAt)
  } catch {
    return { savedAt: fallbackSavedAt, recordCount: 0, revision: 0, sampleLike: false }
  }
}

function getCandidateMeta(candidate) {
  if (candidate?.meta) return candidate.meta
  if (candidate?.parsed && typeof candidate.parsed === 'object') {
    return metaFromParsed(candidate.parsed, candidate.savedAt)
  }
  return parsePersistedMeta(candidate?.content, candidate?.savedAt || 0)
}

/** 작품 수 우선 — 재시작 후 샘플 데이터가 최신 시각으로 덮어쓴 경우에도 실데이터 복구 */
function comparePersistedCandidates(a, b) {
  const ma = getCandidateMeta(a)
  const mb = getCandidateMeta(b)

  if (ma.sampleLike !== mb.sampleLike) return ma.sampleLike ? -1 : 1
  if (ma.recordCount !== mb.recordCount) return ma.recordCount - mb.recordCount
  if (ma.savedAt !== mb.savedAt) return ma.savedAt - mb.savedAt
  if (ma.revision !== mb.revision) return ma.revision - mb.revision

  const sourceRank = { primary: 3, 'legacy-documents': 2 }
  return (sourceRank[a.source] || 0) - (sourceRank[b.source] || 0)
}

function isDestructiveOverwriteByMeta(prev, next) {
  if (!prev || prev.recordCount < 5) return false
  if (next.sampleLike && next.recordCount < prev.recordCount) return true
  if (next.recordCount <= 4 && next.recordCount < prev.recordCount * 0.5) return true
  return false
}

function getExportDirectory() {
  return join(app.getPath('downloads'), EXPORT_DIR_NAME)
}

function getPersistentDataDirectory() {
  return join(app.getPath('documents'), PERSISTENT_DATA_DIR_NAME)
}

async function ensurePersistentDataDirectory() {
  const dataDir = getPersistentDataDirectory()
  await mkdir(dataDir, { recursive: true })
  return dataDir
}

async function exportDirectoryExists() {
  try {
    await accessAsync(getExportDirectory(), constants.F_OK)
    return true
  } catch {
    return false
  }
}

/** 폴더가 없을 때만 다운로드 경로에 생성 */
async function createExportDirectoryIfMissing() {
  const exportDir = getExportDirectory()
  if (!(await exportDirectoryExists())) {
    await mkdir(exportDir)
  }
  return exportDir
}

/** 내보내기 저장 — 폴더 없으면 생성, 있으면 그대로 사용 */
async function resolveExportDirectory() {
  return createExportDirectoryIfMissing()
}

function revealExportDirectory(exportDir, filePath) {
  if (filePath) {
    shell.showItemInFolder(filePath)

    if (process.platform === 'win32') {
      const normalized = exportDir.replace(/'/g, "''")
      const psScript = [
        'Start-Sleep -Milliseconds 120',
        `$target = '${normalized}'`,
        '$shell = New-Object -ComObject Shell.Application',
        'foreach ($win in @($shell.Windows())) {',
        '  try {',
        "    if ($win.FullName -like '*Explorer.EXE*' -and $win.Document -and $win.Document.Folder) {",
        '      $path = $win.Document.Folder.Self.Path',
        '      if ($path -eq $target) {',
        '        $win.Visible = $true',
        '        if ($win.WindowState -eq 3) { $win.WindowState = 0 }',
        '        $win.Activate() | Out-Null',
        '        break',
        '      }',
        '    }',
        '  } catch {}',
        '}'
      ].join('; ')

      return new Promise((resolve) => {
        execFile(
          'powershell.exe',
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
          () => resolve()
        )
      })
    }

    return Promise.resolve()
  }

  if (process.platform !== 'win32') {
    return shell.openPath(exportDir)
  }

  const normalized = exportDir.replace(/'/g, "''")
  const psScript = [
    `$target = '${normalized}'`,
    '$shell = New-Object -ComObject Shell.Application',
    '$found = $false',
    'foreach ($win in @($shell.Windows())) {',
    '  try {',
    "    if ($win.FullName -like '*Explorer.EXE*' -and $win.Document -and $win.Document.Folder) {",
    '      $path = $win.Document.Folder.Self.Path',
    '      if ($path -eq $target) {',
    '        $win.Visible = $true',
    '        if ($win.WindowState -eq 3) { $win.WindowState = 0 }',
    '        $win.Activate() | Out-Null',
    '        $found = $true',
    '        break',
    '      }',
    '    }',
    '  } catch {}',
    '}',
    'if (-not $found) { Start-Process explorer.exe -ArgumentList $target }'
  ].join('; ')

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      () => resolve()
    )
  })
}

function getAppIcon() {
  const iconName = process.platform === 'win32' ? 'app-icon.ico' : 'app-icon.png'
  return nativeImage.createFromPath(join(__dirname, '../../resources/icons', iconName))
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#E6E1D3',
    title: 'My Record',
    icon: getAppIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      partition: APP_SESSION_PARTITION
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(async () => {
  /*
   * media:// 동기 최우선 등록 — whenReady 최상단, 어떠한 await/창 생성보다 앞서
   * 창은 persist:mrecord 파티션을 쓰므로 해당 세션에 반드시 등록해야 엑박이 나지 않음
   */
  const appSession = session.fromPartition(APP_SESSION_PARTITION)
  appSession.protocol.handle(MEDIA_PROTOCOL, handleMediaProtocolRequest)
  /* 기본 세션에도 동일 등록 (파티션 없는 경로·도구용) */
  protocol.handle(MEDIA_PROTOCOL, handleMediaProtocolRequest)

  try {
    await ensureCoversDirectory()
  } catch (err) {
    console.warn('ensureCoversDirectory failed:', err)
  }

  if (process.platform === 'win32') {
    app.setAppUserModelId('com.mrecord.app')
  }

  const win = createWindow()

  /*
   * 기존 사용자 Auto-Migration — 창 생성 후 백그라운드 실행.
   * load-persistent-data 는 완료를 await 해 경량화된 JSON을 읽도록 한다.
   */
  const bootMigrationPromise = migratePrimaryDataOnBoot()
  void bootMigrationPromise.then((result) => {
    if (!result?.migrated) return
    const notify = () => {
      if (win.isDestroyed()) return
      try {
        win.webContents.send('data-optimization-complete', {
          convertedCount: result.convertedCount || 0
        })
      } catch (err) {
        console.warn('data-optimization-complete notify failed:', err?.message || err)
      }
    }
    const schedule = () => setTimeout(notify, 600)
    try {
      if (win.webContents.isLoading()) {
        win.webContents.once('did-finish-load', schedule)
      } else {
        schedule()
      }
    } catch {
      schedule()
    }
  })

  /* GitHub Releases 자동 업데이트 — 개발 환경에서는 내부에서 스킵 */
  setupAutoUpdater(() => win)

  const notifyWindowBounds = () => {
    if (win.isDestroyed()) return
    win.webContents.send('window-bounds-changed')
  }

  win.on('maximize', notifyWindowBounds)
  win.on('unmaximize', notifyWindowBounds)
  win.on('restore', notifyWindowBounds)
  win.on('resize', notifyWindowBounds)

  ipcMain.handle('window-focus', () => {
    if (win.isMinimized()) win.restore()
    win.focus()
    win.webContents.focus()
    return true
  })

  ipcMain.on('window-minimize', () => win.minimize())
  ipcMain.on('window-maximize', () => {
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    setTimeout(notifyWindowBounds, 0)
  })
  ipcMain.handle('window-get-always-on-top', () => win.isAlwaysOnTop())
  ipcMain.on('window-set-always-on-top', (_, flag) => {
    win.setAlwaysOnTop(Boolean(flag))
  })

  ipcMain.handle('get-auto-launch', () => {
    const settings = app.getLoginItemSettings()
    return Boolean(settings.openAtLogin)
  })

  ipcMain.handle('set-auto-launch', (_, enabled) => {
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      path: process.execPath
    })
    return true
  })

  const shortcutName = 'My Record.lnk'
  const getShortcutPath = () => join(app.getPath('desktop'), shortcutName)

  ipcMain.handle('get-desktop-shortcut', async () => {
    try {
      await accessAsync(getShortcutPath(), constants.F_OK)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('set-desktop-shortcut', async (_, enabled) => {
    const shortcutPath = getShortcutPath()
    try {
      if (enabled) {
        shell.writeShortcutLink(shortcutPath, {
          target: process.execPath,
          cwd: dirname(process.execPath),
          description: 'My Record'
        })
      } else {
        await unlink(shortcutPath)
      }
      return true
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('open-export-folder', async () => {
    try {
      const exportDir = await createExportDirectoryIfMissing()
      await revealExportDirectory(exportDir)
      return { ok: true, folderPath: exportDir }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('save-download', async (_, { filename, dataBase64, openFolder = false }) => {
    try {
      const exportDir = await resolveExportDirectory()
      const safeName = basename(filename)
      const filePath = join(exportDir, safeName)
      await writeFile(filePath, Buffer.from(dataBase64, 'base64'))
      if (openFolder) {
        await revealExportDirectory(exportDir, filePath)
      }
      return { ok: true, filePath, folderPath: exportDir }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  /** Base64/파일경로 표지 → userData/media/covers/[recordId].(jpg|png|…) + thumb_[recordId].jpg */
  ipcMain.handle('save-cover-image', async (_, payload = {}) => {
    try {
      const recordId = payload?.recordId
      const coversDir = await ensureCoversDirectory()
      const safeId = sanitizeRecordId(recordId)
      const { buffer, ext } = await resolveCoverImageInput(payload)
      /* IPC로 복제된 대용량 Base64 문자열 즉시 파기 → 메인 프로세스 GC */
      try {
        if (payload && typeof payload === 'object') {
          payload.base64Data = null
          payload.filePath = null
          payload.path = null
          payload.imagePath = null
        }
      } catch {
        /* ignore */
      }
      if (!buffer?.length) {
        return { ok: false, error: 'empty-image-data' }
      }

      await removeCoverFilesById(coversDir, safeId)

      const fileName = `${safeId}.${ext}`
      const filePath = join(coversDir, fileName)
      await writeFile(filePath, buffer)

      /* 쓰기 직후 존재 확인 — media:// 엑박 방지 */
      if (!(await pathExists(filePath))) {
        return { ok: false, error: 'cover-write-verify-failed' }
      }

      const mediaUri = toMediaUri(fileName)

      /* 썸네일 실패해도 원본 저장은 성공 — 갤러리는 coverUrl fallback */
      const thumb = await writeCoverThumbnail(coversDir, safeId, buffer)
      return {
        ok: true,
        filePath,
        mediaUri,
        fileName,
        thumbnailUrl: thumb?.thumbnailUrl || null,
        thumbFileName: thumb?.fileName || null,
        folderPath: coversDir
      }
    } catch (err) {
      try {
        if (payload && typeof payload === 'object') {
          payload.base64Data = null
          payload.filePath = null
          payload.path = null
          payload.imagePath = null
        }
      } catch {
        /* ignore */
      }
      console.warn('save-cover-image failed:', err?.message || err)
      return { ok: false, error: String(err?.message || err) }
    }
  })

  /** Base64 썸네일만 → userData/media/covers/thumb_[recordId].jpg (원본 표지 파일은 유지) */
  ipcMain.handle('save-cover-thumbnail', async (_, payload = {}) => {
    try {
      const recordId = payload?.recordId
      const coversDir = await ensureCoversDirectory()
      const safeId = sanitizeRecordId(recordId)
      const { buffer } = parseBase64Image(payload?.base64Data)
      try {
        if (payload && typeof payload === 'object') payload.base64Data = null
      } catch {
        /* ignore */
      }
      if (!buffer.length) {
        return { ok: false, error: 'empty-image-data' }
      }

      const thumb = await writeCoverThumbnail(coversDir, safeId, buffer)
      if (!thumb) {
        return { ok: false, error: 'thumbnail-failed' }
      }

      return {
        ok: true,
        thumbnailUrl: thumb.thumbnailUrl,
        thumbFileName: thumb.fileName,
        filePath: thumb.filePath,
        folderPath: coversDir
      }
    } catch (err) {
      try {
        if (payload && typeof payload === 'object') payload.base64Data = null
      } catch {
        /* ignore */
      }
      return { ok: false, error: String(err?.message || err) }
    }
  })

  /**
   * 기존 원본 표지에서 갤러리 썸네일 보장
   * - 이미 thumb 파일이 있으면 재사용
   * - 없거나 force면 원본에서 생성
   */
  ipcMain.handle('ensure-cover-thumbnail', async (_, payload = {}) => {
    try {
      const { recordId, force = false } = payload
      const coversDir = await ensureCoversDirectory()
      const safeId = sanitizeRecordId(recordId)
      const fileName = thumbFileName(safeId)
      const thumbPath = join(coversDir, fileName)

      if (!force && (await pathExists(thumbPath))) {
        return {
          ok: true,
          thumbnailUrl: toMediaUri(fileName),
          existed: true,
          folderPath: coversDir
        }
      }

      const sourcePath = await findCoverFilePath(coversDir, safeId)
      if (!sourcePath) {
        return { ok: false, error: 'cover-not-found' }
      }

      const thumb = await writeCoverThumbnail(coversDir, safeId, sourcePath)
      if (!thumb) {
        return { ok: false, error: 'thumbnail-failed' }
      }

      return {
        ok: true,
        thumbnailUrl: thumb.thumbnailUrl,
        existed: false,
        folderPath: coversDir
      }
    } catch (err) {
      return { ok: false, error: String(err?.message || err) }
    }
  })

  /** 표지 파일 삭제 — 동일 recordId의 확장자 변형·썸네일 모두 제거 */
  ipcMain.handle('delete-cover-image', async (_, payload) => {
    try {
      const recordId =
        typeof payload === 'object' && payload != null ? payload.recordId : payload
      const coversDir = await ensureCoversDirectory()
      const safeId = sanitizeRecordId(recordId)
      const deleted = await removeCoverFilesById(coversDir, safeId)
      return { ok: true, deleted, folderPath: coversDir }
    } catch (err) {
      return { ok: false, error: String(err?.message || err) }
    }
  })

  ipcMain.handle('save-persistent-data', async (_, jsonString, options = {}) => {
    try {
      const primaryPath = getPrimaryDataPath()
      const force = options?.force === true

      /*
       * Direct Copy 금지 — raw jsonString을 그대로 쓰지 않음.
       * 파싱 → Base64 추출 → JSON.stringify(clean) 결과만 기록.
       * data:image 잔존 시 Assert로 write 중단.
       */
      const sanitized = await sanitizePersistentDataBody(String(jsonString ?? ''))
      if (sanitized.reject) {
        return {
          ok: false,
          error: sanitized.error || 'blocked-data-image-in-persistent-json',
          filePath: primaryPath
        }
      }

      const body = sanitized.body
      assertNoDataImageInPersistentBody(body)

      const nextMeta = sanitized.parsed
        ? metaFromParsed(sanitized.parsed)
        : parsePersistedMeta(body)

      if (!force) {
        const existing = await readDataFileIfExists(primaryPath)
        if (existing) {
          /* 이미 파싱된 객체 재사용 — 대용량 JSON 재파싱으로 메인 스레드 정지 방지 */
          const prevMeta = getCandidateMeta(existing)
          if (isDestructiveOverwriteByMeta(prevMeta, nextMeta)) {
            return {
              ok: false,
              error: 'blocked-destructive-overwrite',
              filePath: primaryPath
            }
          }
        }
      }

      await yieldMainLoop()
      const savedAt = await writeDataFileAtomic(primaryPath, body)
      return {
        ok: true,
        filePath: primaryPath,
        folderPath: app.getPath('userData'),
        savedAt,
        source: 'primary',
        coversSanitized: sanitized.sanitized,
        convertedCount: sanitized.convertedCount
      }
    } catch (err) {
      return { ok: false, error: String(err?.message || err) }
    }
  })

  /**
   * 주 파일(userData/mrecord-data.json)만 로드.
   * Documents 레거시·backups·.bak·.tmp 자동 복구(fallback) 금지 —
   * 파일이 없으면 not-found (렌더러가 빈 records로 시작).
   * 부팅 Auto-Migration 완료 후 읽어 경량 JSON을 보장한다.
   */
  ipcMain.handle('load-persistent-data', async () => {
    try {
      try {
        await bootMigrationPromise
      } catch (migErr) {
        console.warn('boot auto-migration await failed:', migErr?.message || migErr)
      }

      const primary = await readDataFileIfExists(getPrimaryDataPath())
      if (!primary) {
        return { ok: false, error: 'not-found' }
      }

      return {
        ok: true,
        data: primary.content,
        filePath: primary.filePath,
        folderPath: dirname(primary.filePath),
        savedAt: primary.savedAt,
        source: 'primary'
      }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  /** 부팅 Auto-Migration 결과 — 렌더러 구독 전에 끝난 경우 폴백 조회 */
  ipcMain.handle('get-data-optimization-result', async () => {
    try {
      return await bootMigrationPromise
    } catch (err) {
      return {
        migrated: false,
        convertedCount: 0,
        reason: 'error',
        error: String(err?.message || err)
      }
    }
  })

  /**
   * 대용량 백업 JSON 안전 불러오기
   * - Buffer/utf-8/스트림 다중 읽기 + 파싱 전 Base64 축소
   * - coverUrl/thumbnailUrl → media/covers 실물 파일
   * - 경량 records를 mrecord-data.json에 강제 flush 후 반환
   */
  ipcMain.handle('import-data', async (_, filePath) => {
    try {
      return await importBackupDataFile(filePath)
    } catch (err) {
      console.warn('import-data failed:', err?.message || err)
      return { ok: false, error: String(err?.message || err) }
    }
  })

  ipcMain.handle('capture-page-rect', async (_, rect) => {
    try {
      const MAX = 4096
      const width = Math.max(1, Math.floor(rect.width))
      const height = Math.max(1, Math.floor(rect.height))
      if (width > MAX || height > MAX) {
        return { ok: false, error: 'Capture area too large' }
      }
      const image = await win.webContents.capturePage({
        x: Math.max(0, Math.floor(rect.x)),
        y: Math.max(0, Math.floor(rect.y)),
        width,
        height
      })
      return { ok: true, dataBase64: image.toPNG().toString('base64') }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  let exportBackgroundDepth = 0
  let exportPowerSaveBlockerId = null

  const setExportBackgroundActive = (active) => {
    if (win.isDestroyed()) return
    win.webContents.setBackgroundThrottling(!active)
    if (active) {
      if (exportPowerSaveBlockerId == null) {
        exportPowerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension')
      }
      return
    }
    if (exportPowerSaveBlockerId != null && powerSaveBlocker.isStarted(exportPowerSaveBlockerId)) {
      powerSaveBlocker.stop(exportPowerSaveBlockerId)
    }
    exportPowerSaveBlockerId = null
  }

  ipcMain.handle('export-background-begin', () => {
    exportBackgroundDepth += 1
    if (exportBackgroundDepth === 1) setExportBackgroundActive(true)
    return exportBackgroundDepth
  })

  ipcMain.handle('export-background-end', () => {
    exportBackgroundDepth = Math.max(0, exportBackgroundDepth - 1)
    if (exportBackgroundDepth === 0) setExportBackgroundActive(false)
    return exportBackgroundDepth
  })

  void clearLegacyAutoBackupDirectory()

  let quitting = false
  let quitPreparing = false
  let quitTimer = null
  let relaunchPending = false

  const beginQuit = () => {
    if (quitting || quitPreparing) return
    quitPreparing = true
    if (!win.isDestroyed()) {
      win.webContents.send('app-prepare-quit')
    }
    clearTimeout(quitTimer)
    quitTimer = setTimeout(() => {
      quitting = true
      if (!win.isDestroyed()) win.close()
      else app.exit(0)
    }, 8000)
  }

  ipcMain.on('window-close', beginQuit)

  try {
    powerMonitor.on('shutdown', () => {
      beginQuit()
    })
  } catch {
    /* platform may not support */
  }

  app.on('before-quit', (e) => {
    if (quitting || isInstallingUpdate()) return
    e.preventDefault()
    beginQuit()
  })

  ipcMain.handle('app-relaunch', () => {
    relaunchPending = true
    beginQuit()
    return true
  })

  ipcMain.on('app-quit-ready', () => {
    clearTimeout(quitTimer)
    quitting = true
    if (relaunchPending) {
      relaunchPending = false
      app.relaunch()
      app.exit(0)
      return
    }
    win.close()
  })

  ipcMain.handle('window-get-bounds', () => {
    const bounds = win.getBounds()
    return {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: win.isMaximized()
    }
  })

  ipcMain.handle('window-set-bounds', (_, bounds) => {
    if (!bounds || win.isDestroyed()) return false
    try {
      if (bounds.isMaximized) {
        win.maximize()
      } else {
        if (win.isMaximized()) win.unmaximize()
        win.setBounds({
          width: Math.max(960, Math.round(bounds.width || 1440)),
          height: Math.max(640, Math.round(bounds.height || 860)),
          x: bounds.x != null ? Math.round(bounds.x) : undefined,
          y: bounds.y != null ? Math.round(bounds.y) : undefined
        })
      }
      return true
    } catch {
      return false
    }
  })

  win.on('close', (e) => {
    if (quitting || isInstallingUpdate()) return
    e.preventDefault()
    beginQuit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
