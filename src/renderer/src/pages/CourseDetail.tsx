import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { CourseDetail as CourseDetailType, LectureItem } from '../../../main/lms/types'
import {
  initApiClient,
  runPipeline,
  type PipelineMessage,
  type PipelineComplete
} from '../api/client'
import { getStore, updateDetail } from '../store'

// ── 파이프라인 모달 ───────────────────────────────────────────

interface PipelineState {
  lecture: LectureItem
  stage: string
  progress: number
  message: string
  result: PipelineComplete | null
  error: string | null
}

function PipelineModal({
  state,
  onClose
}: {
  state: PipelineState
  onClose: () => void
}): JSX.Element {
  const isDone = !!state.result || !!state.error
  const stageLabels: Record<string, string> = {
    download: '다운로드',
    convert: '오디오 변환',
    transcribe: 'STT 변환',
    summarize: 'AI 요약',
    notify: '알림 전송'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-gray-800">
        <h3 className="mb-1 font-bold text-gray-800 dark:text-white">
          {isDone ? '처리 완료' : '처리 중...'}
        </h3>
        <p className="mb-4 truncate text-sm text-gray-500 dark:text-gray-400">
          {state.lecture.title}
        </p>

        {/* 진행률 */}
        {!isDone && (
          <div className="mb-4">
            <div className="mb-1 flex justify-between text-xs text-gray-500">
              <span>{stageLabels[state.stage] || state.stage}</span>
              <span>{Math.round(state.progress)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-300"
                style={{ width: `${state.progress}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-400">{state.message}</p>
          </div>
        )}

        {/* 에러 */}
        {state.error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {state.error}
          </div>
        )}

        {/* 결과 */}
        {state.result?.success && (
          <div className="mb-4 space-y-2">
            {state.result.mp4_path && (
              <ResultRow label="영상" path={state.result.mp4_path} />
            )}
            {state.result.mp3_path && (
              <ResultRow label="오디오" path={state.result.mp3_path} />
            )}
            {state.result.txt_path && (
              <ResultRow label="STT 텍스트" path={state.result.txt_path} />
            )}
            {state.result.summary_path && (
              <ResultRow label="AI 요약" path={state.result.summary_path} />
            )}
            {state.result.stage_errors && Object.keys(state.result.stage_errors).length > 0 && (
              <div className="mt-2 text-xs text-yellow-600 dark:text-yellow-400">
                {Object.entries(state.result.stage_errors).map(([stage, err]) => (
                  <p key={stage}>
                    {stageLabels[stage] || stage}: {err}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {isDone && (
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            닫기
          </button>
        )}
      </div>
    </div>
  )
}

function ResultRow({ label, path }: { label: string; path: string }): JSX.Element {
  const filename = path.split(/[/\\]/).pop() || path
  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-700">
      <span className="text-gray-600 dark:text-gray-300">{label}</span>
      <span className="ml-2 truncate text-xs text-gray-400" title={path}>
        {filename}
      </span>
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────

function CourseDetail(): JSX.Element {
  const { courseIdx } = useParams<{ courseIdx: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<CourseDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState<string | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)
  const [pipeline, setPipeline] = useState<PipelineState | null>(null)
  const [pythonReady, setPythonReady] = useState(false)
  const detailRef = useRef<CourseDetailType | null>(null)
  const pipelineWsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    detailRef.current = detail
  }, [detail])

  // Python 코어 상태 확인
  useEffect(() => {
    window.electronAPI.getPythonStatus().then((s) => {
      setPythonReady(s.running)
      if (s.running) {
        initApiClient().catch(() => setPythonReady(false))
      }
    })
  }, [])

  const loadDetail = useCallback(async (): Promise<void> => {
    const cur = detailRef.current
    if (!cur) return
    try {
      const d = await window.electronAPI.fetchLectures(cur.course)
      setDetail(d)
    } catch (e) {
      console.error('[CourseDetail] 강의 목록 새로고침 실패:', e instanceof Error ? e.message : e)
    }
  }, [])

  useEffect(() => {
    async function load(): Promise<void> {
      const store = getStore()
      const idx = parseInt(courseIdx || '0', 10)

      // 캐시에서 course 조회 (fetchCourses 재호출 불필요)
      if (isNaN(idx) || idx < 0 || idx >= store.courses.length) {
        navigate('/courses')
        return
      }

      // 캐시에 상세 정보가 있으면 우선 표시
      const cached = store.details[idx]
      if (cached) {
        setDetail(cached)
        setLoading(false)
      }

      // 최신 데이터 로드 (캐시 유무와 무관하게)
      try {
        const d = await window.electronAPI.fetchLectures(store.courses[idx])
        setDetail(d)
        updateDetail(idx, d)
      } catch (e) {
        if (!cached) console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [courseIdx, navigate])

  useEffect(() => {
    const unsub = window.electronAPI.onPlayProgress((state) => {
      if (state.error) {
        setPlaying(null)
        setPlayError(state.error)
      } else if (state.ended) {
        setPlaying(null)
        setPlayError(null)
        loadDetail()
      }
    })
    return unsub
  }, [loadDetail])

  async function handlePlay(lec: LectureItem): Promise<void> {
    setPlaying(lec.fullUrl)
    setPlayError(null)
    try {
      const dur = parseDuration(lec.duration)
      const result = await window.electronAPI.playLecture(lec.fullUrl, dur)
      if (result.ended) {
        await loadDetail()
      }
    } catch (e) {
      setPlayError(e instanceof Error ? e.message : '재생 중 오류가 발생했습니다.')
    } finally {
      setPlaying(null)
    }
  }

  async function handleProcess(lec: LectureItem): Promise<void> {
    if (!pythonReady) return

    // 영상 URL 추출
    setPipeline({
      lecture: lec,
      stage: 'download',
      progress: 0,
      message: '영상 URL 추출 중...',
      result: null,
      error: null
    })

    try {
      const videoUrl = await window.electronAPI.extractVideoUrl(lec.fullUrl)
      if (!videoUrl) {
        setPipeline((p) => p && { ...p, error: '영상 URL을 추출할 수 없습니다.' })
        return
      }

      // 파이프라인 실행
      await initApiClient()
      pipelineWsRef.current = runPipeline(
        {
          video_url: videoUrl,
          lecture_title: lec.title,
          course_name: detail?.courseName || '',
          week_label: lec.weekLabel
        },
        (msg: PipelineMessage) => {
          if (msg.type === 'progress') {
            setPipeline((p) =>
              p && {
                ...p,
                stage: msg.stage,
                progress: msg.progress,
                message: msg.message
              }
            )
          } else if (msg.type === 'complete') {
            const complete = msg as PipelineComplete
            setPipeline((p) =>
              p && {
                ...p,
                result: complete,
                error: complete.success ? null : complete.error
              }
            )
          } else if (msg.type === 'error') {
            setPipeline((p) => p && { ...p, error: msg.message })
          }
        }
      )
    } catch (e) {
      setPipeline((p) =>
        p && { ...p, error: e instanceof Error ? e.message : '알 수 없는 오류' }
      )
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
      {/* 파이프라인 모달 */}
      {pipeline && (
        <PipelineModal state={pipeline} onClose={() => {
          if (pipelineWsRef.current) {
            pipelineWsRef.current.close()
            pipelineWsRef.current = null
          }
          setPipeline(null)
        }} />
      )}

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
        {!pythonReady && (
          <p className="mt-1 text-xs text-yellow-500">
            Python 코어 미실행 — 다운로드/요약 기능 비활성화
          </p>
        )}
      </div>

      {/* 재생 에러 배너 */}
      {playError && (
        <div className="mx-6 mt-4 flex items-center justify-between rounded-lg bg-red-50 px-4 py-3 dark:bg-red-900/20">
          <span className="text-sm text-red-600 dark:text-red-400">재생 오류: {playError}</span>
          <button
            onClick={() => setPlayError(null)}
            className="ml-4 text-xs text-red-400 hover:text-red-600"
          >
            닫기
          </button>
        </div>
      )}

      {/* 주차별 강의 목록 */}
      <div className="space-y-6 p-6">
        {detail.weeks
          .filter((w) => w.videoLectures.length > 0)
          .map((week) => (
            <div
              key={week.weekNumber}
              className="rounded-xl border bg-white dark:border-gray-700 dark:bg-gray-800"
            >
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
                {week.videoLectures.map((lec) => (
                  <div key={lec.fullUrl} className="flex items-center justify-between px-5 py-3">
                    <div className="min-w-0 flex-1">
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
                          {lec.isUpcoming
                            ? '예정'
                            : lec.completion === 'completed'
                              ? '\u2713'
                              : '\u25CB'}
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

                    <div className="ml-4 flex items-center gap-2">
                      {lec.duration && (
                        <span className="text-xs text-gray-400">{lec.duration}</span>
                      )}
                      {!lec.isUpcoming && lec.completion !== 'completed' && (
                        <button
                          onClick={() => handlePlay(lec)}
                          disabled={playing !== null || pipeline !== null}
                          className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {playing === lec.fullUrl ? '재생 중...' : '재생'}
                        </button>
                      )}
                      {!lec.isUpcoming && pythonReady && (
                        <button
                          onClick={() => handleProcess(lec)}
                          disabled={playing !== null || pipeline !== null}
                          className="rounded-lg bg-purple-600 px-3 py-1 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                        >
                          처리
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
