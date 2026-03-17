import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Course, CourseDetail } from '../../../main/lms/types'
import { getStore, setCourses, setDetails } from '../store'

function Courses(): JSX.Element {
  const navigate = useNavigate()
  const store = getStore()

  const [courses, setCoursesLocal] = useState<Course[]>(store.courses)
  const [details, setDetailsLocal] = useState<(CourseDetail | null)[]>(store.details)
  const [loading, setLoading] = useState(!store.loaded)
  const [loadingProgress, setLoadingProgress] = useState({ completed: 0, total: 0 })
  const [error, setError] = useState('')

  useEffect(() => {
    // 이미 로드된 데이터가 있으면 재로딩 스킵
    if (store.loaded) return

    let cancelled = false

    const unsubProgress = window.electronAPI.onLoadingProgress((data) => {
      if (!cancelled) setLoadingProgress(data)
    })

    async function load(): Promise<void> {
      try {
        const courseList = await window.electronAPI.fetchCourses()
        if (cancelled) return
        setCoursesLocal(courseList)
        setCourses(courseList)
        setLoadingProgress({ completed: 0, total: courseList.length })

        const detailList = await window.electronAPI.fetchAllDetails(courseList)
        if (cancelled) return
        setDetailsLocal(detailList)
        setDetails(detailList)
      } catch (e) {
        if (!cancelled) setError(`과목 로드 실패: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
      unsubProgress()
    }
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {loadingProgress.total > 0
              ? `강의 정보 로딩 중... (${loadingProgress.completed}/${loadingProgress.total})`
              : '과목 목록 불러오는 중...'}
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-red-500">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 rounded-lg bg-gray-200 px-4 py-2 text-sm dark:bg-gray-700 dark:text-white"
          >
            다시 로그인
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="border-b bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-800 dark:text-white">수강 과목</h1>
          <button
            onClick={() => navigate('/settings')}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300"
          >
            설정
          </button>
        </div>
      </div>

      <div className="p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course, i) => {
            const detail = details[i]
            const pending = detail?.pendingVideoCount ?? 0
            const total = detail?.totalVideoCount ?? 0

            return (
              <button
                key={course.id}
                onClick={() => navigate(`/course/${i}`)}
                className="rounded-xl border bg-white p-5 text-left shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
              >
                <h3 className="mb-2 font-semibold text-gray-800 dark:text-white">
                  {course.longName}
                </h3>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{course.term}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      pending === 0
                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                        : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                    }`}
                  >
                    {detail ? `${pending} / ${total}` : '- / -'}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default Courses
