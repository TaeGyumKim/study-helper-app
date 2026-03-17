/**
 * IPC 핸들러 등록.
 *
 * Renderer ↔ Main process 간 통신을 중재한다.
 * LMS 자동화는 hidden BrowserWindow에서 실행하고,
 * 결과만 renderer에 전달한다.
 */

import { BrowserWindow, ipcMain } from 'electron'
import { fetchCourses } from './lms/courses'
import { fetchLectures } from './lms/lectures'
import { playLecture } from './lms/player'
import { extractVideoUrl } from './lms/extractor'
import { performLogin } from './lms/auth'
import { Course, CourseDetail, PlaybackState } from './lms/types'

let lmsWindow: BrowserWindow | null = null

/** LMS 작업용 hidden BrowserWindow를 생성/반환한다. */
function getLmsWindow(): BrowserWindow {
  if (lmsWindow && !lmsWindow.isDestroyed()) return lmsWindow

  lmsWindow = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required'
    }
  })

  // 사용자 에이전트 설정 (플랫폼별)
  const ua =
    process.platform === 'darwin'
      ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  lmsWindow.webContents.setUserAgent(ua)

  lmsWindow.on('closed', () => {
    lmsWindow = null
  })

  return lmsWindow
}

// 세션에 저장된 credentials
let _username = ''
let _password = ''

/**
 * 모든 LMS 관련 IPC 핸들러를 등록한다.
 */
export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // ── 로그인 ─────────────────────────────────────────────────────
  ipcMain.handle(
    'lms:login',
    async (_event, username: string, password: string): Promise<boolean> => {
      const win = getLmsWindow()
      await win.loadURL('https://canvas.ssu.ac.kr/')
      const ok = await performLogin(win, username, password)
      if (ok) {
        _username = username
        _password = password
      }
      return ok
    }
  )

  // ── 과목 목록 ─────────────────────────────────────────────────
  ipcMain.handle('lms:courses', async (): Promise<Course[]> => {
    const win = getLmsWindow()
    return fetchCourses(win, _username, _password)
  })

  // ── 강의 상세 (단일) ──────────────────────────────────────────
  ipcMain.handle(
    'lms:lectures',
    async (_event, course: Course): Promise<CourseDetail> => {
      const win = getLmsWindow()
      return fetchLectures(win, course, _username, _password)
    }
  )

  // ── 강의 상세 (전체 병렬) ─────────────────────────────────────
  ipcMain.handle(
    'lms:all-details',
    async (_event, courses: Course[]): Promise<(CourseDetail | null)[]> => {
      // Electron에서는 여러 BrowserWindow를 열어 병렬 처리
      const concurrency = 3
      const results: (CourseDetail | null)[] = new Array(courses.length).fill(null)
      let completed = 0

      const queue = courses.map((c, i) => ({ course: c, index: i }))

      async function worker(): Promise<void> {
        while (queue.length > 0) {
          const item = queue.shift()
          if (!item) break

          const win = new BrowserWindow({
            show: false,
            width: 1280,
            height: 720,
            webPreferences: {
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true
            }
          })
          win.webContents.setUserAgent(getLmsWindow().webContents.getUserAgent())

          // 기존 세션 쿠키 공유 (같은 partition)
          try {
            results[item.index] = await fetchLectures(
              win,
              item.course,
              _username,
              _password
            )
          } catch {
            results[item.index] = null
          } finally {
            win.destroy()
            completed++
            !mainWindow.isDestroyed() && mainWindow.webContents.send('lms:loading-progress', {
              completed,
              total: courses.length
            })
          }
        }
      }

      await Promise.all(Array.from({ length: concurrency }, () => worker()))
      return results
    }
  )

  // ── 영상 재생 (출석 처리) ─────────────────────────────────────
  ipcMain.handle(
    'lms:play',
    async (_event, lectureUrl: string, fallbackDuration: number): Promise<PlaybackState> => {
      const win = getLmsWindow()

      const onProgress = (state: PlaybackState): void => {
        !mainWindow.isDestroyed() && mainWindow.webContents.send('lms:play-progress', state)
      }

      const logLines: string[] = []
      const logFn = (msg: string): void => {
        logLines.push(msg)
      }

      const result = await playLecture(win, lectureUrl, onProgress, fallbackDuration, logFn)

      // 로그를 결과와 함께 전달
      !mainWindow.isDestroyed() && mainWindow.webContents.send('lms:play-log', logLines)

      return result
    }
  )

  // ── 영상 URL 추출 ─────────────────────────────────────────────
  ipcMain.handle(
    'lms:extract-video-url',
    async (_event, lectureUrl: string): Promise<string | null> => {
      const win = getLmsWindow()
      return extractVideoUrl(win, lectureUrl)
    }
  )

  // ── LMS 윈도우 정리 ───────────────────────────────────────────
  ipcMain.handle('lms:cleanup', async (): Promise<void> => {
    if (lmsWindow && !lmsWindow.isDestroyed()) {
      lmsWindow.destroy()
      lmsWindow = null
    }
    // 메모리 내 평문 자격증명 초기화
    _username = ''
    _password = ''
  })
}
