import { contextBridge, ipcRenderer } from 'electron'
import type { Course, CourseDetail, PlaybackState } from '../main/lms/types'

export interface ApiInfo {
  port: number
  token: string
  running: boolean
}

const api = {
  /** Python API 서버 접속 정보. */
  getApiInfo: (): Promise<ApiInfo> => ipcRenderer.invoke('get-api-info'),

  /** Python 코어 상태. */
  getPythonStatus: (): Promise<{ running: boolean; port: number }> =>
    ipcRenderer.invoke('get-python-status'),

  // ── LMS 자동화 ────────────────────────────────────────────────

  /** LMS 로그인. */
  login: (username: string, password: string): Promise<boolean> =>
    ipcRenderer.invoke('lms:login', username, password),

  /** 과목 목록 조회. */
  fetchCourses: (): Promise<Course[]> => ipcRenderer.invoke('lms:courses'),

  /** 단일 과목 강의 상세. */
  fetchLectures: (course: Course): Promise<CourseDetail> =>
    ipcRenderer.invoke('lms:lectures', course),

  /** 전체 과목 강의 상세 (병렬). */
  fetchAllDetails: (courses: Course[]): Promise<(CourseDetail | null)[]> =>
    ipcRenderer.invoke('lms:all-details', courses),

  /** 영상 재생 (출석 처리). */
  playLecture: (lectureUrl: string, fallbackDuration: number): Promise<PlaybackState> =>
    ipcRenderer.invoke('lms:play', lectureUrl, fallbackDuration),

  /** 영상 URL 추출 (다운로드용). */
  extractVideoUrl: (lectureUrl: string): Promise<string | null> =>
    ipcRenderer.invoke('lms:extract-video-url', lectureUrl),

  /** LMS 윈도우 정리. */
  cleanup: (): Promise<void> => ipcRenderer.invoke('lms:cleanup'),

  // ── 이벤트 리스너 ─────────────────────────────────────────────

  /** 재생 진행률 수신. */
  onPlayProgress: (callback: (state: PlaybackState) => void): (() => void) => {
    const handler = (_event: unknown, state: PlaybackState): void => callback(state)
    ipcRenderer.on('lms:play-progress', handler)
    return () => ipcRenderer.removeListener('lms:play-progress', handler)
  },

  /** 과목 로딩 진행률 수신. */
  onLoadingProgress: (callback: (data: { completed: number; total: number }) => void): (() => void) => {
    const handler = (_event: unknown, data: { completed: number; total: number }): void => callback(data)
    ipcRenderer.on('lms:loading-progress', handler)
    return () => ipcRenderer.removeListener('lms:loading-progress', handler)
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)
