import { app, BrowserWindow, ipcMain, Menu, safeStorage, shell } from 'electron'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { PythonCore } from './python'
import { registerIpcHandlers } from './ipc'

let mainWindow: BrowserWindow | null = null
let pythonCore: PythonCore | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // HTTP(S) 스킴만 외부 브라우저로 열기 (javascript:, file: 등 차단)
    if (details.url.startsWith('https://') || details.url.startsWith('http://')) {
      shell.openExternal(details.url)
    }
    return { action: 'deny' }
  })

  // LMS 자동화 IPC 핸들러 등록
  registerIpcHandlers(mainWindow)

  // Dev: vite dev server / Prod: 빌드된 HTML
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.studyhelper.app')

  // macOS 표준 앱 메뉴 설정
  if (process.platform === 'darwin') {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      },
      {
        label: 'Window',
        submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }]
      }
    ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Python 코어 프로세스 시작
  pythonCore = new PythonCore()
  try {
    await pythonCore.start()
  } catch (e) {
    console.error('[PythonCore] 시작 실패 — STT/AI 기능 비활성화:', e)
    // Python 없이도 LMS 자동화는 동작
  }

  // IPC: Python API 정보를 렌더러에 전달
  ipcMain.handle('get-api-info', (event) => {
    // 렌더러 origin 검증 (dev: vite dev server, prod: file://)
    const senderUrl = event.senderFrame?.url ?? ''
    const isAllowed = senderUrl.startsWith('file://') || senderUrl.startsWith('http://localhost:')
    if (!isAllowed) return { port: 0, token: '', running: false }
    return {
      port: pythonCore?.port ?? 18090,
      token: pythonCore?.token ?? '',
      running: pythonCore?.isRunning ?? false
    }
  })

  // IPC: Python 코어 상태 확인
  ipcMain.handle('get-python-status', () => ({
    running: pythonCore?.isRunning ?? false,
    port: pythonCore?.port ?? 0
  }))

  // IPC: 로그인 정보 암호화 저장/로드 (Electron safeStorage)
  const credPath = join(app.getPath('userData'), 'credentials.enc')

  ipcMain.handle('credentials:save', (_event, username: string, password: string) => {
    if (!safeStorage.isEncryptionAvailable()) return false
    const data = JSON.stringify({ username, password })
    const encrypted = safeStorage.encryptString(data)
    writeFileSync(credPath, encrypted)
    return true
  })

  ipcMain.handle('credentials:load', () => {
    if (!safeStorage.isEncryptionAvailable()) return null
    if (!existsSync(credPath)) return null
    try {
      const encrypted = readFileSync(credPath)
      const data = safeStorage.decryptString(encrypted)
      return JSON.parse(data) as { username: string; password: string }
    } catch {
      return null
    }
  })

  ipcMain.handle('credentials:clear', () => {
    if (existsSync(credPath)) {
      unlinkSync(credPath)
    }
    return true
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  pythonCore?.stop()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
