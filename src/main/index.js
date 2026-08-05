import { app, BrowserWindow, shell, ipcMain, nativeImage, powerSaveBlocker, powerMonitor } from 'electron'
import { join, basename, dirname } from 'path'
import { access, constants, renameSync } from 'fs'
import { writeFile, readFile, readdir, unlink, mkdir, stat } from 'fs/promises'
import { promisify } from 'util'
import { execFile } from 'child_process'
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

function getPrimaryDataPath() {
  return join(app.getPath('userData'), PERSISTENT_DATA_FILENAME)
}

function getLegacyDocumentsDataPath() {
  return join(getPersistentDataDirectory(), PERSISTENT_DATA_FILENAME)
}

async function writeDataFileAtomic(filePath, body) {
  const dir = dirname(filePath)
  await mkdir(dir, { recursive: true })
  const tmpPath = `${filePath}.tmp`
  await writeFile(tmpPath, body, 'utf8')
  try {
    renameSync(tmpPath, filePath)
  } catch {
    await unlink(filePath).catch(() => {})
    renameSync(tmpPath, filePath)
  }
  const st = await stat(filePath)
  return st.mtimeMs
}

async function readDataFileIfExists(filePath) {
  try {
    const content = await readFile(filePath, 'utf8')
    if (!String(content ?? '').trim()) return null
    const st = await stat(filePath)
    let savedAt = st.mtimeMs
    try {
      const parsed = JSON.parse(content)
      if (parsed?.savedAt) savedAt = Number(parsed.savedAt) || savedAt
    } catch {
      /* use mtime */
    }
    return { content, savedAt, filePath }
  } catch {
    return null
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

function parsePersistedMeta(content, fallbackSavedAt = 0) {
  try {
    const parsed = JSON.parse(content)
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
  } catch {
    return { savedAt: fallbackSavedAt, recordCount: 0, revision: 0, sampleLike: false }
  }
}

/** 작품 수 우선 — 재시작 후 샘플 데이터가 최신 시각으로 덮어쓴 경우에도 실데이터 복구 */
function comparePersistedCandidates(a, b) {
  const ma = parsePersistedMeta(a.content, a.savedAt)
  const mb = parsePersistedMeta(b.content, b.savedAt)

  if (ma.sampleLike !== mb.sampleLike) return ma.sampleLike ? -1 : 1
  if (ma.recordCount !== mb.recordCount) return ma.recordCount - mb.recordCount
  if (ma.savedAt !== mb.savedAt) return ma.savedAt - mb.savedAt
  if (ma.revision !== mb.revision) return ma.revision - mb.revision

  const sourceRank = { primary: 3, 'legacy-documents': 2 }
  return (sourceRank[a.source] || 0) - (sourceRank[b.source] || 0)
}

function isDestructiveOverwrite(prevContent, nextContent) {
  const prev = parsePersistedMeta(prevContent)
  const next = parsePersistedMeta(nextContent)
  if (prev.recordCount < 5) return false
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
      partition: 'persist:mrecord'
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

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.mrecord.app')
  }
  const win = createWindow()

  /* GitHub Releases 자동 업데이트 — 개발 환경에서는 내부에서 스킵 */
  setupAutoUpdater()

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

  ipcMain.handle('save-persistent-data', async (_, jsonString, options = {}) => {
    try {
      const primaryPath = getPrimaryDataPath()
      const body = String(jsonString ?? '')
      const force = options?.force === true

      if (!force) {
        const existing = await readDataFileIfExists(primaryPath)
        if (existing && isDestructiveOverwrite(existing.content, body)) {
          return {
            ok: false,
            error: 'blocked-destructive-overwrite',
            filePath: primaryPath
          }
        }
      }

      const savedAt = await writeDataFileAtomic(primaryPath, body)
      return {
        ok: true,
        filePath: primaryPath,
        folderPath: app.getPath('userData'),
        savedAt,
        source: 'primary'
      }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('load-persistent-data', async () => {
    try {
      const candidates = []

      const primary = await readDataFileIfExists(getPrimaryDataPath())
      if (primary) candidates.push({ ...primary, source: 'primary' })

      const legacy = await readDataFileIfExists(getLegacyDocumentsDataPath())
      if (legacy) candidates.push({ ...legacy, source: 'legacy-documents' })

      if (!candidates.length) {
        return { ok: false, error: 'not-found' }
      }

      const best = candidates.reduce((a, b) => (comparePersistedCandidates(a, b) >= 0 ? a : b))

      return {
        ok: true,
        data: best.content,
        filePath: best.filePath,
        folderPath: dirname(best.filePath),
        savedAt: best.savedAt,
        source: best.source
      }
    } catch (err) {
      return { ok: false, error: String(err) }
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
