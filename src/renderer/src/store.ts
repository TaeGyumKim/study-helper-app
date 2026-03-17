/**
 * 글로벌 앱 상태.
 * 과목/상세 데이터를 캐싱하여 페이지 전환 시 재로딩을 방지한다.
 */

import type { Course, CourseDetail } from '../../main/lms/types'

interface AppStore {
  courses: Course[]
  details: (CourseDetail | null)[]
  loaded: boolean
}

const store: AppStore = {
  courses: [],
  details: [],
  loaded: false
}

export function getStore(): AppStore {
  return store
}

export function setCourses(courses: Course[]): void {
  store.courses = courses
}

export function setDetails(details: (CourseDetail | null)[]): void {
  store.details = details
  store.loaded = true
}

export function updateDetail(index: number, detail: CourseDetail): void {
  if (index >= 0 && index < store.details.length) {
    store.details[index] = detail
  }
}

export function clearStore(): void {
  store.courses = []
  store.details = []
  store.loaded = false
}
