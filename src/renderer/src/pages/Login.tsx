import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

function Login(): JSX.Element {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'auto' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // 저장된 로그인 정보 자동 로드
  useEffect(() => {
    async function tryAutoLogin(): Promise<void> {
      try {
        const cred = await window.electronAPI.loadCredentials()
        if (cred) {
          setUsername(cred.username)
          setPassword(cred.password)
          setRememberMe(true)

          // 자동 로그인 시도
          setStatus('auto')
          const ok = await window.electronAPI.login(cred.username, cred.password)
          if (ok) {
            navigate('/courses')
            return
          }
          setStatus('idle')
          setErrorMsg('저장된 정보로 자동 로그인 실패. 다시 시도하세요.')
        }
      } catch {
        setStatus('idle')
      }
    }
    tryAutoLogin()
  }, [navigate])

  async function handleLogin(): Promise<void> {
    if (!username.trim() || !password.trim()) {
      setErrorMsg('학번과 비밀번호를 모두 입력하세요.')
      setStatus('error')
      return
    }
    setStatus('loading')
    setErrorMsg('')
    try {
      const ok = await window.electronAPI.login(username.trim(), password)
      if (ok) {
        // 로그인 성공 시 정보 저장/삭제
        if (rememberMe) {
          await window.electronAPI.saveCredentials(username.trim(), password)
        } else {
          await window.electronAPI.clearCredentials()
        }
        navigate('/courses')
      } else {
        setStatus('error')
        setErrorMsg('로그인 실패. 학번과 비밀번호를 확인하세요.')
      }
    } catch (e) {
      setStatus('error')
      setErrorMsg(`오류: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter') handleLogin()
  }

  if (status === 'auto') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-sm text-gray-500 dark:text-gray-400">자동 로그인 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg dark:bg-gray-800">
        <h1 className="mb-1 text-center text-2xl font-bold text-gray-800 dark:text-white">
          Study Helper
        </h1>
        <p className="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">
          숭실대학교 LMS 학습 도우미
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              학번
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="학번 입력"
              disabled={status === 'loading'}
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="비밀번호 입력"
              disabled={status === 'loading'}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">로그인 정보 저장</span>
          </label>

          {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}

          <button
            onClick={handleLogin}
            disabled={status === 'loading'}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {status === 'loading' ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                로그인 중...
              </span>
            ) : (
              '로그인'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Login
