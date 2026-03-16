import { app, BrowserWindow, ipcMain, shell } from 'electron'
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
  ipcMain.handle('get-api-info', () => ({
    port: pythonCore?.port ?? 18090,
    token: pythonCore?.token ?? '',
    running: pythonCore?.isRunning ?? false
  }))

  // IPC: Python 코어 상태 확인
  ipcMain.handle('get-python-status', () => ({
    running: pythonCore?.isRunning ?? false,
    port: pythonCore?.port ?? 0
  }))

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
