import type { Course, CourseDetail, PlaybackState } from '../main/lms/types'

export interface ApiInfo {
  port: number
  token: string
  running: boolean
}

declare global {
  interface Window {
    electronAPI: {
      getApiInfo: () => Promise<ApiInfo>
      getPythonStatus: () => Promise<{ running: boolean; port: number }>

      // LMS
      login: (username: string, password: string) => Promise<boolean>
      fetchCourses: () => Promise<Course[]>
      fetchLectures: (course: Course) => Promise<CourseDetail>
      fetchAllDetails: (courses: Course[]) => Promise<(CourseDetail | null)[]>
      playLecture: (lectureUrl: string, fallbackDuration: number) => Promise<PlaybackState>
      extractVideoUrl: (lectureUrl: string) => Promise<string | null>
      cleanup: () => Promise<void>

      // Events
      onPlayProgress: (callback: (state: PlaybackState) => void) => () => void
      onLoadingProgress: (callback: (data: { completed: number; total: number }) => void) => () => void
    }
  }
}
