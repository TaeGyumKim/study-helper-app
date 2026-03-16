import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { checkHealth, initApiClient } from '../api/client'

function Login(): JSX.Element {
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('Python 코어 시작 대기 중...')

  useEffect(() => {
    let cancelled = false

    async function init(): Promise<void> {
      try {
        await initApiClient()

        // 헬스 체크 (최대 30초 대기)
        for (let i = 0; i < 60; i++) {
          if (cancelled) return
          const ok = await checkHealth()
          if (ok) {
            setStatus('ready')
            setMessage('연결 완료!')
            // 1초 후 과목 목록으로 이동
            setTimeout(() => navigate('/courses'), 1000)
            return
          }
          await new Promise((r) => setTimeout(r, 500))
        }
        setStatus('error')
        setMessage('Python 코어에 연결할 수 없습니다.')
      } catch (e) {
        if (!cancelled) {
          setStatus('error')
          setMessage(`초기화 실패: ${e}`)
        }
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [navigate])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="mb-4 text-2xl font-bold text-gray-800 dark:text-white">Study Helper</h1>
        <div className="mb-4">
          {status === 'loading' && (
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          )}
          {status === 'ready' && <div className="text-2xl text-green-500">✓</div>}
          {status === 'error' && <div className="text-2xl text-red-500">✗</div>}
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>
      </div>
    </div>
  )
}

export default Login
