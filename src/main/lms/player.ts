/**
 * 영상 재생 + 출석 처리.
 * Python core의 src/player/background_player.py 포팅.
 *
 * Electron Chromium은 H.264을 기본 지원하므로
 * VP8 WebM 더미 영상 생성/인터셉트 로직은 제거됨.
 */

import { BrowserWindow } from 'electron'
import { PlaybackState } from './types'

// ── 상수 ─────────────────────────────────────────────────────────
const POLL_INTERVAL = 1000 // ms
const FRAME_FIND_TIMEOUT = 30 // 초
const PLAY_TIMEOUT = 20000 // ms
const END_THRESHOLD = 3 // 초
const REPORT_INTERVAL = 30 // 초

const DIALOG_SEL = '.confirm-msg-box'
const RESTART_BTN = '.confirm-cancel-btn'
const PLAY_BTN = '.vc-front-screen-play-btn'
const VIDEO_SEL = 'video.vc-vplay-video1'

type ProgressCallback = (state: PlaybackState) => void
type LogFn = (msg: string) => void

/**
 * 강의를 백그라운드 재생하고 출석 처리한다.
 *
 * Plan A: video DOM 폴링 (LTI 세션 내 자동 진도 보고)
 * Plan B: 진도 API 직접 호출 (플레이어 로드 실패 시)
 */
export async function playLecture(
  win: BrowserWindow,
  lectureUrl: string,
  onProgress?: ProgressCallback,
  fallbackDuration = 0,
  logFn?: LogFn
): Promise<PlaybackState> {
  const log = logFn || ((): void => {})
  const state: PlaybackState = { current: 0, duration: 0, ended: false, error: null }
  const wc = win.webContents

  // 1. 강의 페이지로 이동
  log(`[1] 강의 페이지 이동: ${lectureUrl}`)
  await win.loadURL(lectureUrl)
  log(`    → 현재 URL: ${wc.getURL()}`)

  // 2. commons.ssu.ac.kr iframe 내부의 플레이어 프레임 탐색
  log('[2] 플레이어 프레임 탐색 중...')
  const playerFrameId = await findPlayerFrame(wc)

  if (playerFrameId === null) {
    log('    → 실패: commons.ssu.ac.kr frame 없음')

    // learningx 플레이어 감지
    const isLearningx = await wc.executeJavaScript(`
      (function() {
        var f = document.querySelector('iframe[name="tool_content"]');
        return f && f.src && f.src.includes('learningx');
      })()
    `)
    if (isLearningx) {
      const lxUrl = await wc.executeJavaScript(`
        document.querySelector('iframe[name="tool_content"]').src
      `)
      log(`    → learningx 플레이어 감지: ${lxUrl}`)
      return playViaLearningxApi(wc, lxUrl, onProgress, log, fallbackDuration)
    }

    state.error = '비디오 프레임을 찾지 못했습니다.'
    return state
  }

  // frame URL 스냅샷 (나중에 Plan B에서 사용)
  const playerUrl = await getFrameUrl(wc, playerFrameId)
  log(`    → 성공: ${playerUrl}`)

  // 3. 이어보기 다이얼로그 처리
  await sleep(1000)
  const dismissed = await dismissDialog(wc, playerFrameId)
  log(`[3] 이어보기 다이얼로그: ${dismissed ? '처리됨' : '없음'}`)

  // 4. 재생 버튼 클릭
  log(`[4] 재생 버튼(${PLAY_BTN}) 클릭 시도...`)
  const clicked = await clickPlay(wc, playerFrameId)
  log(`    → ${clicked ? '클릭 성공' : '버튼 없음 또는 타임아웃'}`)

  await sleep(1000)
  await dismissDialog(wc, playerFrameId)

  // 5. video 태그가 있는 frame 탐색
  log('[5] video 태그 frame 재스캔 중...')
  const videoFrameId = await findVideoFrame(wc)

  if (videoFrameId === null) {
    log('    → video frame 없음. 진도 API 직접 호출 방식으로 전환...')
    return playViaProgressApi(wc, playerUrl, onProgress, log, fallbackDuration)
  }
  log('    → video frame 발견')

  // 6. video duration 대기
  log(`[6] video duration 대기 (최대 ${PLAY_TIMEOUT / 1000}초)...`)
  const startTime = Date.now()
  while (Date.now() - startTime < PLAY_TIMEOUT) {
    const info = await getVideoState(wc, videoFrameId)
    if (info && info.duration > 0) {
      log(`    → 영상 시작 확인: duration=${info.duration.toFixed(1)}s`)
      break
    }
    await sleep(500)
  }

  const initInfo = await getVideoState(wc, videoFrameId)
  if (!initInfo || initInfo.duration <= 0) {
    state.error = '영상이 시작되지 않았습니다.'
    return state
  }

  // 7. 재생 완료까지 폴링
  log('[7] 재생 루프 시작')
  while (true) {
    const info = await getVideoState(wc, videoFrameId)
    if (!info) {
      log('[7] video state가 null — frame 언로드됨')
      break
    }

    state.current = info.current
    state.duration = info.duration
    state.ended = info.ended

    onProgress?.(state)

    if (info.ended) {
      log('[7] 영상 ended=true — 완료')
      break
    }

    if (state.duration > 0 && state.current >= state.duration - END_THRESHOLD) {
      state.ended = true
      onProgress?.(state)
      log('[7] 재생 완료 기준 도달')
      break
    }

    // 일시정지 상태면 강제 재생
    if (info.paused) {
      log('[7] 일시정지 감지 → 강제 재생')
      await ensurePlaying(wc, videoFrameId)
    }

    await sleep(POLL_INTERVAL)
  }

  // 8. 완료 보고
  if (state.ended && playerUrl) {
    await reportCompletion(wc, playerUrl, state.duration, log)
  }

  return state
}

// ── iframe 내부 실행 헬퍼 ────────────────────────────────────────

/**
 * tool_content 아래 commons.ssu.ac.kr frame을 찾는다.
 * Electron에서는 webFrame ID 기반으로 iframe을 식별한다.
 */
async function findPlayerFrame(wc: Electron.WebContents): Promise<number | null> {
  for (let i = 0; i < FRAME_FIND_TIMEOUT; i++) {
    const frameId = await wc.executeJavaScript(`
      (function() {
        var tool = document.querySelector('iframe[name="tool_content"]');
        if (!tool || !tool.contentDocument) return null;
        var iframes = tool.contentDocument.querySelectorAll('iframe');
        for (var i = 0; i < iframes.length; i++) {
          var src = iframes[i].src || '';
          if (src.includes('commons.ssu.ac.kr') && !src.includes('flashErrorPage')) {
            return i;  // iframe 인덱스
          }
        }
        return null;
      })()
    `)
    if (frameId !== null) return frameId
    await sleep(1000)
  }
  return null
}

async function findVideoFrame(wc: Electron.WebContents): Promise<number | null> {
  for (let i = 0; i < 10; i++) {
    const frameIdx = await wc.executeJavaScript(`
      (function() {
        var tool = document.querySelector('iframe[name="tool_content"]');
        if (!tool || !tool.contentDocument) return null;
        var iframes = tool.contentDocument.querySelectorAll('iframe');
        for (var i = 0; i < iframes.length; i++) {
          try {
            var doc = iframes[i].contentDocument;
            if (doc && doc.querySelectorAll('video').length > 0) return i;
          } catch(e) {}
        }
        return null;
      })()
    `)
    if (frameIdx !== null) return frameIdx
    await sleep(1000)
  }
  return null
}

async function getFrameUrl(wc: Electron.WebContents, frameIdx: number): Promise<string> {
  return wc.executeJavaScript(`
    (function() {
      var tool = document.querySelector('iframe[name="tool_content"]');
      if (!tool || !tool.contentDocument) return '';
      var iframes = tool.contentDocument.querySelectorAll('iframe');
      return iframes[${frameIdx}] ? iframes[${frameIdx}].src : '';
    })()
  `)
}

async function dismissDialog(wc: Electron.WebContents, frameIdx: number): Promise<boolean> {
  return wc.executeJavaScript(`
    (function() {
      try {
        var tool = document.querySelector('iframe[name="tool_content"]');
        var iframes = tool.contentDocument.querySelectorAll('iframe');
        var doc = iframes[${frameIdx}].contentDocument;
        var dialog = doc.querySelector('${DIALOG_SEL}');
        if (!dialog || dialog.style.display === 'none') return false;
        var btn = doc.querySelector('${RESTART_BTN}');
        if (btn) { btn.click(); return true; }
      } catch(e) {}
      return false;
    })()
  `)
}

async function clickPlay(wc: Electron.WebContents, frameIdx: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < PLAY_TIMEOUT) {
    const clicked = await wc.executeJavaScript(`
      (function() {
        try {
          var tool = document.querySelector('iframe[name="tool_content"]');
          var iframes = tool.contentDocument.querySelectorAll('iframe');
          var doc = iframes[${frameIdx}].contentDocument;
          var btn = doc.querySelector('${PLAY_BTN}');
          if (btn) { btn.click(); return true; }
        } catch(e) {}
        return false;
      })()
    `)
    if (clicked) return true
    await sleep(500)
  }
  return false
}

interface VideoInfo {
  current: number
  duration: number
  ended: boolean
  paused: boolean
}

async function getVideoState(
  wc: Electron.WebContents,
  frameIdx: number
): Promise<VideoInfo | null> {
  try {
    return await wc.executeJavaScript(`
      (function() {
        try {
          var tool = document.querySelector('iframe[name="tool_content"]');
          var iframes = tool.contentDocument.querySelectorAll('iframe');
          var doc = iframes[${frameIdx}].contentDocument;
          var v = doc.querySelector('${VIDEO_SEL}');
          if (!v) return null;
          return { current: v.currentTime, duration: v.duration || 0, ended: v.ended, paused: v.paused };
        } catch(e) { return null; }
      })()
    `)
  } catch {
    return null
  }
}

async function ensurePlaying(wc: Electron.WebContents, frameIdx: number): Promise<void> {
  await wc.executeJavaScript(`
    (function() {
      try {
        var tool = document.querySelector('iframe[name="tool_content"]');
        var iframes = tool.contentDocument.querySelectorAll('iframe');
        var doc = iframes[${frameIdx}].contentDocument;
        var v = doc.querySelector('${VIDEO_SEL}');
        if (v && v.paused && !v.ended) v.play();
      } catch(e) {}
    })()
  `)
}

// ── Plan B: 진도 API 직접 호출 ──────────────────────────────────

function parsePlayerUrl(
  playerUrl: string
): { contentId: string; duration: number; progressUrl: string } {
  try {
    const url = new URL(playerUrl)
    const duration = parseFloat(url.searchParams.get('endat') || '0')
    const targetUrl = url.searchParams.get('TargetUrl') || ''
    const contentId = url.pathname.replace(/\/$/, '').split('/').pop() || ''
    return { contentId, duration, progressUrl: decodeURIComponent(targetUrl) }
  } catch {
    return { contentId: '', duration: 0, progressUrl: '' }
  }
}

async function playViaProgressApi(
  wc: Electron.WebContents,
  playerUrl: string,
  onProgress: ProgressCallback | undefined,
  log: LogFn,
  fallbackDuration: number
): Promise<PlaybackState> {
  const state: PlaybackState = { current: 0, duration: 0, ended: false, error: null }
  const info = parsePlayerUrl(playerUrl)
  let duration = info.duration || fallbackDuration

  if (!info.progressUrl) {
    state.error = '진도 API URL을 파싱하지 못했습니다.'
    return state
  }
  if (duration <= 0) {
    state.error = '영상 길이를 알 수 없습니다.'
    return state
  }

  log(`[API] 진도 API 방식으로 재생 시뮬레이션 (duration=${duration.toFixed(1)}s)`)
  state.duration = duration
  let current = 0
  let nextReport = REPORT_INTERVAL

  while (current < duration) {
    await sleep(POLL_INTERVAL)
    current = Math.min(current + POLL_INTERVAL / 1000, duration)
    state.current = current
    onProgress?.(state)

    if (current >= nextReport || current >= duration) {
      const ts = Date.now()
      const totalPage = 15
      const cumPage = current >= duration ? totalPage : Math.ceil((current / duration) * totalPage)
      const sep = info.progressUrl.includes('?') ? '&' : '?'
      const reportUrl =
        `${info.progressUrl}${sep}` +
        `callback=jQuery111_${ts}` +
        `&state=3&duration=${duration}` +
        `&currentTime=${current.toFixed(2)}` +
        `&cumulativeTime=${current.toFixed(2)}` +
        `&page=${cumPage}&totalpage=${totalPage}` +
        `&cumulativePage=${cumPage}&_=${ts}`

      log(`[API] 진도 보고: ${Math.floor(current)}s/${Math.floor(duration)}s`)
      try {
        await wc.executeJavaScript(`
          fetch(${JSON.stringify(reportUrl)}, {
            headers: { 'Referer': 'https://commons.ssu.ac.kr/' }
          }).then(r => r.text()).catch(() => '')
        `)
      } catch {
        log('[API] 진도 보고 실패')
      }
      nextReport = current + REPORT_INTERVAL
    }
  }

  state.ended = true
  onProgress?.(state)

  // 100% 완료 보고
  await reportCompletion(wc, playerUrl, duration, log)
  return state
}

async function playViaLearningxApi(
  wc: Electron.WebContents,
  learningxUrl: string,
  onProgress: ProgressCallback | undefined,
  log: LogFn,
  fallbackDuration: number
): Promise<PlaybackState> {
  const state: PlaybackState = { current: 0, duration: 0, ended: false, error: null }

  // item_id, course_id 추출
  const itemMatch = learningxUrl.match(/\/lecture_attendance\/items\/view\/(\d+)/)
  const courseMatch = wc.getURL().match(/\/courses\/(\d+)\//)
  if (!itemMatch || !courseMatch) {
    state.error = 'learningx URL 파싱 실패'
    return state
  }

  const itemId = itemMatch[1]
  const courseId = courseMatch[1]
  const apiUrl = `https://canvas.ssu.ac.kr/learningx/api/v1/courses/${courseId}/attendance_items/${itemId}`

  log(`[LX] API 호출: ${apiUrl}`)
  try {
    const result = await wc.executeJavaScript(`
      fetch(${JSON.stringify(apiUrl)}).then(r => r.json()).catch(e => ({ error: e.message }))
    `)
    if (result.error) {
      state.error = `learningx API 오류: ${result.error}`
      return state
    }

    const viewerUrl = result.viewer_url || ''
    const duration = parseFloat(result.item_content_data?.duration || '0') || fallbackDuration
    if (!viewerUrl) {
      state.error = 'learningx viewer_url 없음'
      return state
    }

    log(`[LX] viewer_url=${viewerUrl}`)
    return playViaProgressApi(wc, viewerUrl, onProgress, log, duration)
  } catch (e) {
    state.error = `learningx API 호출 실패: ${e}`
    return state
  }
}

async function reportCompletion(
  wc: Electron.WebContents,
  playerUrl: string,
  duration: number,
  log: LogFn
): Promise<void> {
  const info = parsePlayerUrl(playerUrl)
  if (!info.progressUrl || duration <= 0) return

  log(`[완료 보고] 100% 진도 전송 (duration=${duration.toFixed(1)}s)`)
  const ts = Date.now()
  const totalPage = 15
  const sep = info.progressUrl.includes('?') ? '&' : '?'
  const url =
    `${info.progressUrl}${sep}` +
    `callback=jQuery111_${ts}` +
    `&state=3&duration=${duration}` +
    `&currentTime=${duration.toFixed(2)}` +
    `&cumulativeTime=${duration.toFixed(2)}` +
    `&page=${totalPage}&totalpage=${totalPage}` +
    `&cumulativePage=${totalPage}&_=${ts}`

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await wc.executeJavaScript(`
        fetch(${JSON.stringify(url)}).then(async r => ({ s: r.status, b: await r.text() })).catch(e => ({ s: -1, b: e.message }))
      `)
      log(`[완료 보고] 응답: ${result.s}`)
      if (result.s === 200 && result.b.includes('"result":true')) return
    } catch {
      log('[완료 보고] 실패')
    }
    if (attempt < 2) await sleep(2000)
  }
  log('[완료 보고] 3회 시도 모두 실패')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
