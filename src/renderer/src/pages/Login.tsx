import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

function Login(): JSX.Element {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

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
        navigate('/courses')
      } else {
        setStatus('error')
        setErrorMsg('로그인 실패. 학번과 비밀번호를 확인하세요.')
      }
    } catch (e) {
      setStatus('error')
      setErrorMsg(`오류: ${e}`)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Enter') handleLogin()
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

          {errorMsg && (
            <p className="text-sm text-red-500">{errorMsg}</p>
          )}

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
