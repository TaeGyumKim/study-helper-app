/**
 * types.ts 단위 테스트.
 * 순수 함수(createCourse, createLectureItem, createWeek, createCourseDetail)를 검증한다.
 */

import { describe, expect, it } from 'vitest'
import {
  LectureType,
  VIDEO_LECTURE_TYPES,
  createCourse,
  createCourseDetail,
  createLectureItem,
  createWeek
} from '../src/main/lms/types'

describe('createCourse', () => {
  it('기본 과목 생성', () => {
    const course = createCourse({ id: 12345, longName: '데이터사이언스', term: '2026년 1학기' })
    expect(course.id).toBe('12345')
    expect(course.longName).toBe('데이터사이언스')
    expect(course.term).toBe('2026년 1학기')
    expect(course.fullUrl).toBe('https://canvas.ssu.ac.kr/courses/12345')
    expect(course.lecturesUrl).toBe('https://canvas.ssu.ac.kr/courses/12345/external_tools/71')
  })

  it('중복 과목명 정리 (LMS가 "A - A" 형태로 반환하는 경우)', () => {
    const course = createCourse({ id: 1, longName: '핀테크 - 핀테크' })
    expect(course.longName).toBe('핀테크')
  })

  it('다른 과목명은 유지 (A - B)', () => {
    const course = createCourse({ id: 1, longName: '핀테크 - 경영학과' })
    expect(course.longName).toBe('핀테크 - 경영학과')
  })

  it('href가 있으면 fullUrl에 반영', () => {
    const course = createCourse({ id: 1, href: '/courses/999' })
    expect(course.fullUrl).toBe('https://canvas.ssu.ac.kr/courses/999')
  })

  it('id가 문자열이어도 처리', () => {
    const course = createCourse({ id: '99999' })
    expect(course.id).toBe('99999')
  })
})

describe('createLectureItem', () => {
  it('비디오 강의 생성', () => {
    const lec = createLectureItem({
      title: '1주차 강의',
      lectureType: LectureType.MOVIE,
      completion: 'incomplete'
    })
    expect(lec.isVideo).toBe(true)
    expect(lec.needsWatch).toBe(true)
  })

  it('완료된 비디오는 needsWatch = false', () => {
    const lec = createLectureItem({
      title: '완료 강의',
      lectureType: LectureType.MOVIE,
      completion: 'completed'
    })
    expect(lec.isVideo).toBe(true)
    expect(lec.needsWatch).toBe(false)
  })

  it('예정된 강의는 needsWatch = false', () => {
    const lec = createLectureItem({
      title: '예정 강의',
      lectureType: LectureType.SCREENLECTURE,
      isUpcoming: true
    })
    expect(lec.isVideo).toBe(true)
    expect(lec.needsWatch).toBe(false)
  })

  it('과제는 비디오가 아님', () => {
    const lec = createLectureItem({
      title: '레포트',
      lectureType: LectureType.ASSIGNMENT
    })
    expect(lec.isVideo).toBe(false)
    expect(lec.needsWatch).toBe(false)
  })

  it('퀴즈는 비디오가 아님', () => {
    const lec = createLectureItem({ title: '퀴즈 1', lectureType: LectureType.QUIZ })
    expect(lec.isVideo).toBe(false)
  })

  it('상대 URL은 BASE_URL과 합쳐짐', () => {
    const lec = createLectureItem({ title: 't', itemUrl: '/courses/1/modules/items/100' })
    expect(lec.fullUrl).toBe('https://canvas.ssu.ac.kr/courses/1/modules/items/100')
  })

  it('절대 URL은 그대로 유지', () => {
    const lec = createLectureItem({ title: 't', itemUrl: 'https://example.com/video' })
    expect(lec.fullUrl).toBe('https://example.com/video')
  })
})

describe('VIDEO_LECTURE_TYPES', () => {
  it('비디오 타입 5종 포함', () => {
    expect(VIDEO_LECTURE_TYPES.has(LectureType.MOVIE)).toBe(true)
    expect(VIDEO_LECTURE_TYPES.has(LectureType.READYSTREAM)).toBe(true)
    expect(VIDEO_LECTURE_TYPES.has(LectureType.SCREENLECTURE)).toBe(true)
    expect(VIDEO_LECTURE_TYPES.has(LectureType.EVERLEC)).toBe(true)
    expect(VIDEO_LECTURE_TYPES.has(LectureType.MP4)).toBe(true)
  })

  it('비디오 아닌 타입 미포함', () => {
    expect(VIDEO_LECTURE_TYPES.has(LectureType.ASSIGNMENT)).toBe(false)
    expect(VIDEO_LECTURE_TYPES.has(LectureType.QUIZ)).toBe(false)
    expect(VIDEO_LECTURE_TYPES.has(LectureType.ZOOM)).toBe(false)
    expect(VIDEO_LECTURE_TYPES.has(LectureType.FILE)).toBe(false)
  })
})

describe('createWeek', () => {
  it('주차 생성 + 비디오/미시청 카운트', () => {
    const lectures = [
      createLectureItem({ title: 'A', lectureType: LectureType.MOVIE, completion: 'incomplete' }),
      createLectureItem({ title: 'B', lectureType: LectureType.MOVIE, completion: 'completed' }),
      createLectureItem({ title: 'C', lectureType: LectureType.ASSIGNMENT })
    ]
    const week = createWeek('1주차', 1, lectures)

    expect(week.title).toBe('1주차')
    expect(week.weekNumber).toBe(1)
    expect(week.lectures).toHaveLength(3)
    expect(week.videoLectures).toHaveLength(2)
    expect(week.pendingCount).toBe(1) // A만 미시청
  })

  it('빈 주차', () => {
    const week = createWeek('공강 주', 5, [])
    expect(week.videoLectures).toHaveLength(0)
    expect(week.pendingCount).toBe(0)
  })
})

describe('createCourseDetail', () => {
  it('전체 과목 상세 통계', () => {
    const course = createCourse({ id: 1, longName: '테스트 과목' })
    const weeks = [
      createWeek('1주차', 1, [
        createLectureItem({ title: 'A', lectureType: LectureType.MOVIE, completion: 'incomplete' }),
        createLectureItem({ title: 'B', lectureType: LectureType.MOVIE, completion: 'completed' })
      ]),
      createWeek('2주차', 2, [
        createLectureItem({
          title: 'C',
          lectureType: LectureType.SCREENLECTURE,
          completion: 'incomplete'
        })
      ])
    ]

    const detail = createCourseDetail(course, '테스트 과목', '김교수', weeks)
    expect(detail.totalVideoCount).toBe(3)
    expect(detail.pendingVideoCount).toBe(2) // A, C
    expect(detail.allVideoLectures).toHaveLength(3)
    expect(detail.professors).toBe('김교수')
  })
})
