/**
 * Python Core API 클라이언트.
 *
 * Electron preload에서 가져온 접속 정보로 Python FastAPI 서버에 요청한다.
 */

let _baseUrl = ''
let _token = ''

/** API 클라이언트를 초기화한다. Electron preload에서 접속 정보를 가져온다. */
export async function initApiClient(): Promise<void> {
  const info = await window.electronAPI.getApiInfo()
  _baseUrl = `http://127.0.0.1:${info.port}`
  _token = info.token
}

/** 인증 헤더가 포함된 fetch 래퍼. */
async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers)
  if (_token) {
    headers.set('Authorization', `Bearer ${_token}`)
  }
  headers.set('Content-Type', 'application/json')

  const res = await fetch(`${_baseUrl}${path}`, { ...options, headers })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API ${res.status}: ${body}`)
  }
  return res
}

// ── Health ────────────────────────────────────────────────────

export async function checkHealth(): Promise<boolean> {
  try {
    await apiFetch('/health')
    return true
  } catch {
    return false
  }
}

export async function getVersion(): Promise<string> {
  const res = await apiFetch('/version')
  const data = await res.json()
  return data.version
}

// ── Config ───────────────────────────────────────────────────

export async function getSettings(): Promise<Record<string, string>> {
  const res = await apiFetch('/config')
  return res.json()
}

export async function updateSettings(settings: Record<string, unknown>): Promise<void> {
  await apiFetch('/config', { method: 'PUT', body: JSON.stringify(settings) })
}

export async function updateTelegram(settings: Record<string, unknown>): Promise<void> {
  await apiFetch('/config/telegram', { method: 'PUT', body: JSON.stringify(settings) })
}

export async function verifyTelegram(
  botToken: string,
  chatId: string
): Promise<{ ok: boolean; error: string }> {
  const res = await apiFetch('/config/telegram/verify', {
    method: 'POST',
    body: JSON.stringify({ bot_token: botToken, chat_id: chatId })
  })
  return res.json()
}

export async function hasCredentials(): Promise<boolean> {
  const res = await apiFetch('/config/credentials')
  const data = await res.json()
  return data.has_credentials
}

// ── Download Pipeline ────────────────────────────────────────

export interface PipelineProgress {
  type: 'progress'
  stage: string
  progress: number
  current: number
  total: number
  message: string
}

export interface PipelineComplete {
  type: 'complete'
  success: boolean
  mp4_path: string | null
  mp3_path: string | null
  txt_path: string | null
  summary_path: string | null
  error: string
  stage_errors: Record<string, string>
}

export type PipelineMessage = PipelineProgress | PipelineComplete | { type: 'error'; message: string }

/**
 * 다운로드 파이프라인을 WebSocket으로 실행한다.
 * 진행 상태 메시지를 콜백으로 전달한다.
 */
export function runPipeline(
  request: Record<string, unknown>,
  onMessage: (msg: PipelineMessage) => void
): WebSocket {
  const port = new URL(_baseUrl).port || '18090'
  const wsUrl = `ws://127.0.0.1:${port}/download/pipeline`
  const ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    // 토큰 인증 (서버가 첫 메시지로 토큰을 요구)
    if (_token) {
      ws.send(JSON.stringify({ token: _token }))
    }
    ws.send(JSON.stringify(request))
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data) as PipelineMessage
      onMessage(msg)
      if (msg.type === 'complete' || msg.type === 'error') {
        ws.close()
      }
    } catch (e) {
      onMessage({ type: 'error', message: `응답 파싱 오류: ${e instanceof Error ? e.message : e}` })
      ws.close()
    }
  }

  ws.onerror = () => {
    onMessage({ type: 'error', message: '파이프라인 연결 오류' })
  }

  return ws
}

// ── Notifications ────────────────────────────────────────────

export async function sendNotification(params: {
  course_name: string
  week_label?: string
  lecture_title?: string
  message_type: string
  failed?: boolean
}): Promise<{ ok: boolean }> {
  const res = await apiFetch('/notify/telegram', {
    method: 'POST',
    body: JSON.stringify(params)
  })
  return res.json()
}
