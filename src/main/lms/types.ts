/**
 * LMS 데이터 모델.
 * Python core의 src/scraper/models.py 포팅.
 */

export const BASE_URL = 'https://canvas.ssu.ac.kr'

export enum LectureType {
  MOVIE = 'movie',
  READYSTREAM = 'readystream',
  SCREENLECTURE = 'screenlecture',
  EVERLEC = 'everlec',
  ZOOM = 'zoom',
  MP4 = 'mp4',
  ASSIGNMENT = 'assignment',
  WIKI_PAGE = 'wiki_page',
  QUIZ = 'quiz',
  DISCUSSION = 'discussion',
  FILE = 'file',
  OTHER = 'other'
}

export const VIDEO_LECTURE_TYPES = new Set([
  LectureType.MOVIE,
  LectureType.READYSTREAM,
  LectureType.SCREENLECTURE,
  LectureType.EVERLEC,
  LectureType.MP4
])

export const TYPE_CLASS_MAP: Record<string, LectureType> = {
  movie: LectureType.MOVIE,
  readystream: LectureType.READYSTREAM,
  screenlecture: LectureType.SCREENLECTURE,
  everlec: LectureType.EVERLEC,
  zoom: LectureType.ZOOM,
  mp4: LectureType.MP4,
  assignment: LectureType.ASSIGNMENT,
  wiki_page: LectureType.WIKI_PAGE,
  quiz: LectureType.QUIZ,
  discussion: LectureType.DISCUSSION,
  file: LectureType.FILE,
  attachment: LectureType.FILE
}

export interface Course {
  id: string
  longName: string
  href: string
  term: string
  isFavorited: boolean
  fullUrl: string
  lecturesUrl: string
}

export interface LectureItem {
  title: string
  itemUrl: string
  lectureType: LectureType
  weekLabel: string
  lessonLabel: string
  duration: string | null
  attendance: string // 'none' | 'attendance' | 'late' | 'absent' | 'excused'
  completion: string // 'completed' | 'incomplete'
  isUpcoming: boolean
  startDate: string | null
  endDate: string | null
  fullUrl: string
  isVideo: boolean
  needsWatch: boolean
}

export interface Week {
  title: string
  weekNumber: number
  lectures: LectureItem[]
  videoLectures: LectureItem[]
  pendingCount: number
}

export interface CourseDetail {
  course: Course
  courseName: string
  professors: string
  weeks: Week[]
  allVideoLectures: LectureItem[]
  totalVideoCount: number
  pendingVideoCount: number
}

export interface PlaybackState {
  current: number
  duration: number
  ended: boolean
  error: string | null
}

export function createCourse(raw: {
  id: number | string
  longName?: string
  href?: string
  term?: string
  isFavorited?: boolean
}): Course {
  const id = String(raw.id)
  let longName = raw.longName || ''
  // LMS API가 "과목명 - 과목명" 형태로 중복 반환하는 경우 앞쪽만 사용
  if (longName.includes(' - ')) {
    const [first, , second] = longName.split(' - ')
    if (first?.trim() === second?.trim()) {
      longName = first.trim()
    }
  }
  return {
    id,
    longName,
    href: raw.href || `/courses/${id}`,
    term: raw.term || '',
    isFavorited: raw.isFavorited || false,
    fullUrl: `${BASE_URL}${raw.href || `/courses/${id}`}`,
    lecturesUrl: `${BASE_URL}/courses/${id}/external_tools/71`
  }
}

export function createLectureItem(data: Partial<LectureItem>): LectureItem {
  const item: LectureItem = {
    title: data.title || '',
    itemUrl: data.itemUrl || '',
    lectureType: data.lectureType || LectureType.OTHER,
    weekLabel: data.weekLabel || '',
    lessonLabel: data.lessonLabel || '',
    duration: data.duration || null,
    attendance: data.attendance || 'none',
    completion: data.completion || 'incomplete',
    isUpcoming: data.isUpcoming || false,
    startDate: data.startDate || null,
    endDate: data.endDate || null,
    fullUrl: '',
    isVideo: false,
    needsWatch: false
  }
  item.fullUrl = item.itemUrl.startsWith('http') ? item.itemUrl : `${BASE_URL}${item.itemUrl}`
  item.isVideo = VIDEO_LECTURE_TYPES.has(item.lectureType)
  item.needsWatch = item.isVideo && item.completion !== 'completed' && !item.isUpcoming
  return item
}

export function createWeek(title: string, weekNumber: number, lectures: LectureItem[]): Week {
  const videoLectures = lectures.filter((l) => l.isVideo)
  return {
    title,
    weekNumber,
    lectures,
    videoLectures,
    pendingCount: lectures.filter((l) => l.needsWatch).length
  }
}

export function createCourseDetail(
  course: Course,
  courseName: string,
  professors: string,
  weeks: Week[]
): CourseDetail {
  const allVideoLectures = weeks.flatMap((w) => w.videoLectures)
  return {
    course,
    courseName,
    professors,
    weeks,
    allVideoLectures,
    totalVideoCount: allVideoLectures.length,
    pendingVideoCount: allVideoLectures.filter((l) => l.needsWatch).length
  }
}
