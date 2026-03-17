/**
 * 최초 로그인 후 환경 설정 온보딩 위저드.
 * 다운로드 → STT → AI 요약 → 텔레그램 순서로 설정을 안내한다.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  checkHealth,
  initApiClient,
  updateSettings,
  updateTelegram,
  verifyTelegram
} from '../api/client'

const STEPS = ['download', 'stt', 'ai', 'telegram', 'done'] as const
type Step = (typeof STEPS)[number]

function Onboarding(): JSX.Element {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('download')
  const [pythonOk, setPythonOk] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  // 다운로드 설정
  const [downloadRule, setDownloadRule] = useState('both')
  const [downloadDir, setDownloadDir] = useState('')

  // STT 설정
  const [sttEnabled, setSttEnabled] = useState(true)
  const [whisperModel, setWhisperModel] = useState('base')
  const [sttLanguage, setSttLanguage] = useState('ko')

  // AI 설정
  const [aiEnabled, setAiEnabled] = useState(true)
  const [aiAgent, setAiAgent] = useState('gemini')
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash')
  const [apiKey, setApiKey] = useState('')

  // 텔레그램 설정
  const [tgEnabled, setTgEnabled] = useState(false)
  const [tgToken, setTgToken] = useState('')
  const [tgChatId, setTgChatId] = useState('')

  useEffect(() => {
    window.electronAPI.getPythonStatus().then((s) => {
      setPythonOk(s.running)
      if (s.running) initApiClient().catch(() => {})
    })
  }, [])

  const stepIndex = STEPS.indexOf(step)
  const totalSteps = STEPS.length - 1 // 'done' 제외

  function next(): void {
    const idx = STEPS.indexOf(step)
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1])
  }

  function prev(): void {
    const idx = STEPS.indexOf(step)
    if (idx > 0) setStep(STEPS[idx - 1])
  }

  async function handleFinish(): Promise<void> {
    if (!pythonOk) {
      navigate('/courses')
      return
    }

    setSaving(true)
    setMessage('')
    try {
      await initApiClient()
      await updateSettings({
        download_rule: downloadRule,
        download_dir: downloadDir,
        stt_enabled: sttEnabled,
        whisper_model: whisperModel,
        stt_language: sttLanguage,
        ai_enabled: aiEnabled,
        ai_agent: aiAgent,
        gemini_model: geminiModel,
        ...(apiKey ? { api_key: apiKey } : {})
      })

      if (tgEnabled && tgToken) {
        await updateTelegram({
          enabled: tgEnabled,
          bot_token: tgToken,
          chat_id: tgChatId
        })
      }

      navigate('/courses')
    } catch (e) {
      setMessage(`설정 저장 실패: ${e instanceof Error ? e.message : String(e)}`)
      setSaving(false)
    }
  }

  async function handleTestTelegram(): Promise<void> {
    if (!tgToken || !tgChatId) return setMessage('봇 토큰과 Chat ID를 입력하세요.')
    try {
      const r = await verifyTelegram(tgToken, tgChatId)
      setMessage(r.ok ? '연결 성공!' : `실패: ${r.error}`)
    } catch (e) {
      setMessage(`실패: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (step === 'done') {
    return (
      <Wrapper>
        <div className="text-center">
          <div className="mb-4 text-4xl">🎉</div>
          <h2 className="mb-2 text-xl font-bold dark:text-white">설정 완료!</h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            과목 목록으로 이동합니다. 설정은 언제든 변경할 수 있습니다.
          </p>
          {message && <p className="mb-4 text-sm text-red-500">{message}</p>}
          <button
            onClick={handleFinish}
            disabled={saving}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '저장 중...' : '시작하기'}
          </button>
        </div>
      </Wrapper>
    )
  }

  return (
    <Wrapper>
      {/* 프로그레스 */}
      <div className="mb-6">
        <div className="mb-2 flex justify-between text-xs text-gray-400">
          <span>
            {stepIndex + 1} / {totalSteps}
          </span>
          <span>{stepLabel(step)}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="h-full rounded-full bg-blue-500 transition-all"
            style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {!pythonOk && (
        <div className="mb-4 rounded-lg bg-yellow-50 p-3 text-xs text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
          Python 코어가 실행되지 않아 일부 기능을 사용할 수 없습니다. 나중에 설정에서 변경 가능합니다.
        </div>
      )}

      {/* 스텝별 콘텐츠 */}
      {step === 'download' && (
        <StepContent title="다운로드 설정" desc="강의 영상을 어떻게 다운로드할지 설정합니다.">
          <Label>다운로드 규칙</Label>
          <select value={downloadRule} onChange={(e) => setDownloadRule(e.target.value)} className={selectClass}>
            <option value="video">영상만 (mp4)</option>
            <option value="audio">음성만 (mp3)</option>
            <option value="both">영상 + 음성</option>
          </select>
          <Label>다운로드 경로</Label>
          <input
            type="text"
            value={downloadDir}
            onChange={(e) => setDownloadDir(e.target.value)}
            placeholder="비워두면 OS 기본 다운로드 폴더"
            className={inputClass}
          />
        </StepContent>
      )}

      {step === 'stt' && (
        <StepContent title="음성 → 텍스트 (STT)" desc="강의 음성을 텍스트로 변환합니다. Whisper AI를 사용합니다.">
          <Toggle label="STT 사용" checked={sttEnabled} onChange={setSttEnabled} />
          {sttEnabled && (
            <div className="mt-3 space-y-3">
              <Label>Whisper 모델</Label>
              <select value={whisperModel} onChange={(e) => setWhisperModel(e.target.value)} className={selectClass}>
                <option value="tiny">tiny (39MB, 빠름)</option>
                <option value="base">base (74MB, 기본 권장)</option>
                <option value="small">small (122MB)</option>
                <option value="medium">medium (385MB)</option>
                <option value="large">large (750MB, 정확)</option>
              </select>
              <Label>인식 언어</Label>
              <select value={sttLanguage} onChange={(e) => setSttLanguage(e.target.value)} className={selectClass}>
                <option value="ko">한국어</option>
                <option value="en">영어</option>
                <option value="">자동 감지</option>
              </select>
            </div>
          )}
        </StepContent>
      )}

      {step === 'ai' && (
        <StepContent title="AI 요약" desc="STT 결과를 AI가 자동으로 요약합니다.">
          <Toggle label="AI 요약 사용" checked={aiEnabled} onChange={setAiEnabled} />
          {aiEnabled && (
            <div className="mt-3 space-y-3">
              <Label>AI 엔진</Label>
              <select value={aiAgent} onChange={(e) => setAiAgent(e.target.value)} className={selectClass}>
                <option value="gemini">Gemini (무료 가능)</option>
                <option value="openai">OpenAI</option>
              </select>
              {aiAgent === 'gemini' && (
                <>
                  <Label>Gemini 모델</Label>
                  <select value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)} className={selectClass}>
                    <option value="gemini-2.5-flash">gemini-2.5-flash (무료)</option>
                    <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                    <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                    <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                  </select>
                </>
              )}
              <Label>{aiAgent === 'gemini' ? 'Google' : 'OpenAI'} API 키</Label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="API 키 입력"
                className={inputClass}
              />
              <p className="text-xs text-gray-400">
                {aiAgent === 'gemini'
                  ? 'Google AI Studio에서 무료 발급 가능 (aistudio.google.com)'
                  : 'OpenAI Platform에서 발급 (platform.openai.com)'}
              </p>
            </div>
          )}
        </StepContent>
      )}

      {step === 'telegram' && (
        <StepContent title="텔레그램 알림" desc="강의 처리 완료, 마감 임박 등을 텔레그램으로 알려줍니다.">
          <Toggle label="텔레그램 알림 사용" checked={tgEnabled} onChange={setTgEnabled} />
          {tgEnabled && (
            <div className="mt-3 space-y-3">
              <Label>봇 토큰</Label>
              <input
                type="password"
                value={tgToken}
                onChange={(e) => setTgToken(e.target.value)}
                placeholder="BotFather에서 발급받은 토큰"
                className={inputClass}
              />
              <Label>Chat ID</Label>
              <input
                type="text"
                value={tgChatId}
                onChange={(e) => setTgChatId(e.target.value)}
                placeholder="@userinfobot에서 확인"
                className={inputClass}
              />
              {message && <p className="text-xs text-green-600">{message}</p>}
              <button onClick={handleTestTelegram} className="rounded-lg bg-gray-200 px-3 py-1.5 text-xs hover:bg-gray-300 dark:bg-gray-700 dark:text-white">
                연결 테스트
              </button>
            </div>
          )}
        </StepContent>
      )}

      {/* 네비게이션 */}
      <div className="mt-6 flex justify-between">
        {stepIndex > 0 ? (
          <button onClick={prev} className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
            이전
          </button>
        ) : (
          <button onClick={() => navigate('/courses')} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
            건너뛰기
          </button>
        )}
        <button onClick={next} className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700">
          다음
        </button>
      </div>
    </Wrapper>
  )
}

// ── 공용 컴포넌트 ────────────────────────────────────────────

function Wrapper({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg dark:bg-gray-800">
        {children}
      </div>
    </div>
  )
}

function StepContent({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <h2 className="mb-1 text-lg font-bold dark:text-white">{title}</h2>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{desc}</p>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }): JSX.Element {
  return <label className="block text-sm text-gray-600 dark:text-gray-400">{children}</label>
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <label className="flex cursor-pointer items-center justify-between">
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <div
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </div>
    </label>
  )
}

function stepLabel(step: Step): string {
  const labels: Record<Step, string> = { download: '다운로드', stt: 'STT', ai: 'AI 요약', telegram: '텔레그램', done: '완료' }
  return labels[step]
}

const inputClass = 'w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white'
const selectClass = inputClass

export default Onboarding
