/**
 * 과목 목록 스크래핑.
 * Python core의 src/scraper/course_scraper.py fetch_courses 포팅.
 */

import { BrowserWindow } from 'electron'
import { BASE_URL, Course, createCourse } from './types'
import { ensureLoggedIn } from './auth'

const DASHBOARD_URL = `${BASE_URL}/`

/**
 * 대시보드에서 수강 과목 목록을 추출한다.
 */
export async function fetchCourses(
  win: BrowserWindow,
  username: string,
  password: string
): Promise<Course[]> {
  const wc = win.webContents

  // 대시보드로 이동 (이미 대시보드에 있으면 스킵)
  const currentUrl = wc.getURL()
  if (!currentUrl.startsWith(BASE_URL) || currentUrl.includes('login')) {
    await win.loadURL(DASHBOARD_URL)
  }

  // 세션 만료 시 재로그인
  if (wc.getURL().includes('login') || wc.getURL().includes('sso')) {
    const ok = await ensureLoggedIn(win, username, password)
    if (!ok) throw new Error('로그인 실패')
    await win.loadURL(DASHBOARD_URL)
  }

  // window.ENV.STUDENT_PLANNER_COURSES에서 과목 목록 추출
  const raw = await wc.executeJavaScript(
    '(function() { return window.ENV && window.ENV.STUDENT_PLANNER_COURSES; })()'
  )
  if (!raw || !Array.isArray(raw)) {
    throw new Error('과목 목록을 불러올 수 없습니다.')
  }

  const courses: Course[] = []
  for (const item of raw) {
    // 학기 정보가 없는 비교과(안내 등) 과목 제외
    const term = item.term || ''
    if (!term) continue

    courses.push(
      createCourse({
        id: item.id,
        longName: item.longName || '',
        href: item.href || `/courses/${item.id}`,
        term,
        isFavorited: item.isFavorited || false
      })
    )
  }

  return courses
}
