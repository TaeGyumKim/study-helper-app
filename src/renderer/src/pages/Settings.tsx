import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getSettings,
  initApiClient,
  updateSettings,
  updateTelegram,
  verifyTelegram
} from '../api/client'

function Settings(): JSX.Element {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [pythonOk, setPythonOk] = useState(false)

  // 폼 상태
  const [downloadRule, setDownloadRule] = useState('both')
  const [downloadDir, setDownloadDir] = useState('')
  const [sttEnabled, setSttEnabled] = useState(false)
  const [whisperModel, setWhisperModel] = useState('base')
  const [sttLanguage, setSttLanguage] = useState('ko')
  const [aiEnabled, setAiEnabled] = useState(false)
  const [aiAgent, setAiAgent] = useState('gemini')
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash')
  const [apiKey, setApiKey] = useState('')
  const [summaryPromptExtra, setSummaryPromptExtra] = useState('')
  const [tgEnabled, setTgEnabled] = useState(false)
  const [tgToken, setTgToken] = useState('')
  const [tgChatId, setTgChatId] = useState('')
  const [tgAutoDelete, setTgAutoDelete] = useState(false)

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const status = await window.electronAPI.getPythonStatus()
        setPythonOk(status.running)
        if (status.running) {
          await initApiClient()
          const s = await getSettings()
          setDownloadRule(s.download_rule || 'both')
          setDownloadDir(s.download_dir || '')
          setSttEnabled(s.stt_enabled === 'true')
          setWhisperModel(s.whisper_model || 'base')
          setSttLanguage(s.stt_language || 'ko')
          setAiEnabled(s.ai_enabled === 'true')
          setAiAgent(s.ai_agent || 'gemini')
          setGeminiModel(s.gemini_model || 'gemini-2.5-flash')
          setSummaryPromptExtra(s.summary_prompt_extra || '')
          setTgEnabled(s.telegram_enabled === 'true')
          setTgChatId(s.telegram_chat_id || '')
          setTgAutoDelete(s.telegram_auto_delete === 'true')
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSave(): Promise<void> {
    setSaving(true)
    setMessage('')
    try {
      const payload: Record<string, unknown> = {
        download_rule: downloadRule,
        download_dir: downloadDir,
        stt_enabled: sttEnabled,
        whisper_model: whisperModel,
        stt_language: sttLanguage,
        ai_enabled: aiEnabled,
        ai_agent: aiAgent,
        gemini_model: geminiModel,
        summary_prompt_extra: summaryPromptExtra
      }
      if (apiKey) payload.api_key = apiKey
      await updateSettings(payload)

      const tgPayload: Record<string, unknown> = {
        enabled: tgEnabled,
        chat_id: tgChatId,
        auto_delete: tgAutoDelete
      }
      if (tgToken) tgPayload.bot_token = tgToken
      await updateTelegram(tgPayload)
      setMessage('설정이 저장되었습니다.')
    } catch (e) {
      setMessage(`저장 실패: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleTestTelegram(): Promise<void> {
    if (!tgToken || !tgChatId) {
      setMessage('봇 토큰과 Chat ID를 입력하세요.')
      return
    }
    try {
      const result = await verifyTelegram(tgToken, tgChatId)
      setMessage(result.ok ? '텔레그램 연결 성공!' : `실패: ${result.error}`)
    } catch (e) {
      setMessage(`테스트 실패: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="border-b bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
        <button
          onClick={() => navigate('/courses')}
          className="mb-2 text-sm text-blue-500 hover:underline"
        >
          &larr; 과목 목록
        </button>
        <h1 className="text-lg font-bold text-gray-800 dark:text-white">설정</h1>
      </div>

      {!pythonOk && (
        <div className="mx-6 mt-4 rounded-lg bg-yellow-50 p-4 text-sm text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
          Python 코어가 실행되지 않아 설정을 변경할 수 없습니다.
        </div>
      )}

      <div className="max-w-xl space-y-6 p-6">
        {/* 다운로드 */}
        <Section title="다운로드">
          <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
            다운로드 규칙
          </label>
          <select
            value={downloadRule}
            onChange={(e) => setDownloadRule(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value="video">영상만 (mp4)</option>
            <option value="audio">음성만 (mp3)</option>
            <option value="both">영상 + 음성</option>
          </select>

          <label className="mb-1 mt-3 block text-sm text-gray-600 dark:text-gray-400">
            다운로드 경로
          </label>
          <input
            type="text"
            value={downloadDir}
            onChange={(e) => setDownloadDir(e.target.value)}
            placeholder="비워두면 OS 기본 다운로드 폴더"
            className="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </Section>

        {/* STT */}
        <Section title="STT (음성 → 텍스트)">
          <Toggle label="STT 사용" checked={sttEnabled} onChange={setSttEnabled} />
          {sttEnabled && (
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                  Whisper 모델
                </label>
                <select
                  value={whisperModel}
                  onChange={(e) => setWhisperModel(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value="tiny">tiny (39MB, 빠름)</option>
                  <option value="base">base (74MB, 기본)</option>
                  <option value="small">small (122MB)</option>
                  <option value="medium">medium (385MB)</option>
                  <option value="large">large (750MB, 정확)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                  인식 언어
                </label>
                <select
                  value={sttLanguage}
                  onChange={(e) => setSttLanguage(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value="ko">한국어</option>
                  <option value="en">영어</option>
                  <option value="">자동 감지</option>
                </select>
              </div>
            </div>
          )}
        </Section>

        {/* AI 요약 */}
        <Section title="AI 요약">
          <Toggle label="AI 요약 사용" checked={aiEnabled} onChange={setAiEnabled} />
          {aiEnabled && (
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                  AI 엔진
                </label>
                <select
                  value={aiAgent}
                  onChange={(e) => setAiAgent(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value="gemini">Gemini</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>
              {aiAgent === 'gemini' && (
                <div>
                  <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                    Gemini 모델
                  </label>
                  <select
                    value={geminiModel}
                    onChange={(e) => setGeminiModel(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  >
                    <option value="gemini-2.5-flash">gemini-2.5-flash (무료)</option>
                    <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                    <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                    <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                  </select>
                </div>
              )}
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`${aiAgent === 'gemini' ? 'Google' : 'OpenAI'} API 키 입력`}
                className="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
              <div>
                <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
                  추가 요약 지시사항 (선택)
                </label>
                <textarea
                  value={summaryPromptExtra}
                  onChange={(e) => setSummaryPromptExtra(e.target.value)}
                  placeholder="기본 프롬프트에 추가될 지시사항 (예: 수식 위주로 정리)"
                  rows={3}
                  className="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>
          )}
        </Section>

        {/* 텔레그램 */}
        <Section title="텔레그램 알림">
          <Toggle label="텔레그램 알림 사용" checked={tgEnabled} onChange={setTgEnabled} />
          {tgEnabled && (
            <div className="mt-3 space-y-3">
              <input
                type="password"
                value={tgToken}
                onChange={(e) => setTgToken(e.target.value)}
                placeholder="봇 토큰 (BotFather에서 발급)"
                className="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
              <input
                type="text"
                value={tgChatId}
                onChange={(e) => setTgChatId(e.target.value)}
                placeholder="Chat ID (@userinfobot에서 확인)"
                className="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
              <Toggle
                label="요약 전송 후 파일 자동 삭제"
                checked={tgAutoDelete}
                onChange={setTgAutoDelete}
              />
              <button
                onClick={handleTestTelegram}
                className="rounded-lg bg-gray-200 px-3 py-1.5 text-sm hover:bg-gray-300 dark:bg-gray-700 dark:text-white"
              >
                연결 테스트
              </button>
            </div>
          )}
        </Section>

        {/* 저장 */}
        {message && (
          <p
            className={`text-sm ${message.includes('실패') ? 'text-red-500' : 'text-green-600'}`}
          >
            {message}
          </p>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !pythonOk}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? '저장 중...' : '설정 저장'}
        </button>
      </div>
    </div>
  )
}

function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="rounded-xl border bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="mb-3 font-semibold text-gray-800 dark:text-white">{title}</h2>
      {children}
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <label className="flex cursor-pointer items-center justify-between">
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <div
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </div>
    </label>
  )
}

export default Settings
