import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { CourseDetail as CourseDetailType, LectureItem } from '../../../main/lms/types'

function CourseDetail(): JSX.Element {
  const { courseIdx } = useParams<{ courseIdx: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<CourseDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState<string | null>(null)
  const detailRef = useRef<CourseDetailType | null>(null)

  // ref를 최신 detail과 동기화
  useEffect(() => {
    detailRef.current = detail
  }, [detail])

  const loadDetail = useCallback(async (): Promise<void> => {
    const cur = detailRef.current
    if (!cur) return
    try {
      const d = await window.electronAPI.fetchLectures(cur.course)
      setDetail(d)
    } catch {
      // 무시
    }
  }, [])

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const courses = await window.electronAPI.fetchCourses()
        const idx = parseInt(courseIdx || '0')
        if (idx < 0 || idx >= courses.length) {
          navigate('/courses')
          return
        }
        const d = await window.electronAPI.fetchLectures(courses[idx])
        setDetail(d)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [courseIdx, navigate])

  // 재생 진행률 구독
  useEffect(() => {
    const unsub = window.electronAPI.onPlayProgress((state) => {
      if (state.ended) {
        setPlaying(null)
        loadDetail()
      }
    })
    return unsub
  }, [loadDetail])

  async function handlePlay(lec: LectureItem): Promise<void> {
    setPlaying(lec.fullUrl)
    try {
      const dur = parseDuration(lec.duration)
      const result = await window.electronAPI.playLecture(lec.fullUrl, dur)
      if (result.ended) {
        await loadDetail()
      }
    } catch (e) {
      console.error('재생 실패:', e)
    } finally {
      setPlaying(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="p-6 text-center text-gray-500">
        강의 정보를 불러올 수 없습니다.
        <button onClick={() => navigate('/courses')} className="ml-4 text-blue-500 underline">
          돌아가기
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* 헤더 */}
      <div className="border-b bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
        <button
          onClick={() => navigate('/courses')}
          className="mb-2 text-sm text-blue-500 hover:underline"
        >
          &larr; 과목 목록
        </button>
        <h1 className="text-lg font-bold text-gray-800 dark:text-white">{detail.courseName}</h1>
        {detail.professors && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{detail.professors}</p>
        )}
      </div>

      {/* 주차별 강의 목록 */}
      <div className="p-6 space-y-6">
        {detail.weeks
          .filter((w) => w.videoLectures.length > 0)
          .map((week) => (
            <div key={week.weekNumber} className="rounded-xl border bg-white dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center justify-between border-b px-5 py-3 dark:border-gray-700">
                <h2 className="font-semibold text-gray-800 dark:text-white">{week.title}</h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    week.pendingCount === 0
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                  }`}
                >
                  {week.pendingCount} / {week.videoLectures.length}
                </span>
              </div>

              <div className="divide-y dark:divide-gray-700">
                {week.videoLectures.map((lec, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-5 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm ${
                            lec.isUpcoming
                              ? 'text-gray-400'
                              : lec.completion === 'completed'
                                ? 'text-green-500'
                                : 'text-yellow-500'
                          }`}
                        >
                          {lec.isUpcoming ? '예정' : lec.completion === 'completed' ? '✓' : '○'}
                        </span>
                        <span className="truncate text-sm text-gray-800 dark:text-gray-200">
                          {lec.title}
                        </span>
                      </div>
                      {lec.startDate && lec.endDate && (
                        <p className="mt-0.5 text-xs text-gray-400">
                          {lec.startDate} ~ {lec.endDate}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 ml-4">
                      {lec.duration && (
                        <span className="text-xs text-gray-400">{lec.duration}</span>
                      )}
                      {!lec.isUpcoming && lec.completion !== 'completed' && (
                        <button
                          onClick={() => handlePlay(lec)}
                          disabled={playing !== null}
                          className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {playing === lec.fullUrl ? '재생 중...' : '재생'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}

function parseDuration(duration: string | null): number {
  if (!duration) return 0
  const parts = duration.split(':').map(Number)
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}

export default CourseDetail
