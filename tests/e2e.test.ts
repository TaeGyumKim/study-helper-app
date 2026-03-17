/**
 * Study Helper App E2E 테스트.
 *
 * Electron 앱을 실행하여 로그인 → 과목 목록 → 강의 상세까지 자동 검증한다.
 * .env 파일에서 LMS 계정 정보를 읽어 실제 SSO 로그인을 수행한다.
 *
 * LMS_USER_ID / LMS_PASSWORD 환경변수가 없으면 테스트를 스킵한다.
 */

import { _electron as electron, type ElectronApplication, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolve } from 'path'
import { config } from 'dotenv'

// study-helper/.env에서 계정 정보 로드
config({ path: resolve(__dirname, '..', '..', 'study-helper', '.env'), quiet: true })

const LMS_USER_ID = process.env.LMS_USER_ID || ''
const LMS_PASSWORD = process.env.LMS_PASSWORD || ''
const hasCredentials = !!LMS_USER_ID && !!LMS_PASSWORD

if (!hasCredentials) {
  console.warn('[E2E] LMS_USER_ID / LMS_PASSWORD 환경변수가 없어 E2E 테스트를 스킵합니다.')
}

// 계정 없으면 전체 스킵
const describeE2E = hasCredentials ? describe : describe.skip

// ── 헬퍼 함수 ─────────────────────────────────────────────────

/** 셀렉터가 보일 때까지 대기. */
async function waitVisible(page: Page, selector: string, timeout = 10_000): Promise<void> {
  await page.locator(selector).first().waitFor({ state: 'visible', timeout })
}

/** 텍스트가 포함된 요소가 보일 때까지 대기. */
async function waitText(page: Page, text: string, timeout = 10_000): Promise<void> {
  await page.getByText(text).first().waitFor({ state: 'visible', timeout })
}

// ── 테스트 셋업 ──────────────────────────────────────────────

let app: ElectronApplication
let page: Page

beforeAll(async () => {
  if (!hasCredentials) return

  // electron-vite 빌드
  const { execSync } = await import('child_process')
  execSync('npx electron-vite build', {
    cwd: resolve(__dirname, '..'),
    stdio: 'pipe',
    timeout: 30_000
  })

  // ELECTRON_RUN_AS_NODE를 완전 제거한 env 생성
  const cleanEnv: Record<string, string | undefined> = { ...process.env, NODE_ENV: 'test' }
  delete cleanEnv.ELECTRON_RUN_AS_NODE

  // Electron 앱 실행
  app = await electron.launch({
    args: [resolve(__dirname, '..')],
    env: cleanEnv
  })

  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
}, 60_000)

afterAll(async () => {
  if (app) {
    await app.close()
  }
})

// ── 테스트 케이스 ─────────────────────────────────────────────

describeE2E('E2E: 앱 실행', () => {
  it('앱 창이 열린다', async () => {
    const title = await page.title()
    expect(title).toBeTruthy()
    expect(app.windows().length).toBeGreaterThanOrEqual(1)
  })

  it('로그인 화면이 표시된다', async () => {
    await waitVisible(page, 'input[placeholder="학번 입력"]')
    await waitVisible(page, 'input[placeholder="비밀번호 입력"]')
    await waitText(page, '로그인')
  })
})

describeE2E('E2E: 로그인', () => {
  it('빈 입력으로 로그인 시도 시 에러', async () => {
    await page.getByRole('button', { name: '로그인' }).click()
    await waitText(page, '학번과 비밀번호를 모두 입력하세요.', 3_000)
  })

  it('실제 계정으로 로그인 성공', async () => {
    await page.locator('input[placeholder="학번 입력"]').fill(LMS_USER_ID)
    await page.locator('input[placeholder="비밀번호 입력"]').fill(LMS_PASSWORD)
    await page.locator('button', { hasText: '로그인' }).click()

    // SSO 로그인 + 리다이렉트 + 과목 로딩까지 최대 90초
    await page.waitForFunction(
      () => {
        const body = document.body?.textContent || ''
        return (
          body.includes('수강 과목') ||
          body.includes('과목 목록 불러오는 중') ||
          body.includes('강의 정보 로딩 중')
        )
      },
      undefined,
      { timeout: 90_000 }
    )
  }, 120_000)
})

describeE2E('E2E: 과목 목록', () => {
  it('수강 과목 헤더가 표시된다', async () => {
    await page.waitForFunction(
      () => document.body?.textContent?.includes('수강 과목'),
      undefined,
      { timeout: 120_000 }
    )
    const header = page.locator('h1', { hasText: '수강 과목' })
    expect(await header.isVisible()).toBe(true)
  }, 150_000)

  it('과목 카드가 1개 이상 표시된다', async () => {
    await page.waitForSelector('[data-testid="course-card"], .grid button', { timeout: 10_000 })
    const cards = page.locator('.grid button')
    const count = await cards.count()
    expect(count).toBeGreaterThan(0)
    console.log(`  ✓ ${count}개 과목 로드됨`)
  })

  it('과목 카드에 학기 정보가 표시된다', async () => {
    const firstCard = page.locator('.grid button').first()
    const text = await firstCard.textContent()
    expect(text).toContain('학기')
  })

  it('미시청 카운트가 N / N 형식이다', async () => {
    const badges = page.locator('.grid button .rounded-full')
    const first = await badges.first().textContent()
    expect(first).toMatch(/\d+\s*\/\s*\d+/)
  })

  it('설정 버튼이 있다', async () => {
    const btn = page.locator('button', { hasText: '설정' })
    expect(await btn.isVisible()).toBe(true)
  })
})

describeE2E('E2E: 과목 상세 (강의 목록)', () => {
  it('첫 번째 과목 클릭 시 강의 목록 로드', async () => {
    const firstCard = page.locator('.grid button').first()
    const courseName = await firstCard.locator('h3').textContent()
    console.log(`  ✓ "${courseName}" 과목 진입`)

    await firstCard.click()

    await page.waitForFunction(
      () => {
        const h1 = document.querySelector('h1.text-lg')
        return h1 && h1.textContent && h1.textContent.length > 0
      },
      undefined,
      { timeout: 60_000 }
    )

    const headerText = await page.locator('h1.text-lg').textContent()
    expect(headerText).toBeTruthy()
    console.log(`  ✓ 과목 상세 로드: "${headerText}"`)
  }, 90_000)

  it('"← 과목 목록" 뒤로가기 링크가 있다', async () => {
    const backBtn = page.getByText('과목 목록').first()
    expect(await backBtn.isVisible()).toBe(true)
  })

  // TODO: 과목 상세 → 과목 목록 뒤로가기 시 fetchCourses 재호출로 인한 ERR_ABORTED 이슈
  // Courses.tsx에서 캐싱 또는 조건부 로딩 필요
  it.skip('과목 목록으로 돌아갈 수 있다', async () => {
    // placeholder
  })
})

describeE2E('E2E: Python 코어 연동', () => {
  it('Python API 서버 상태 확인', async () => {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 5_000 })
    } catch {
      const windows = app.windows()
      if (windows.length > 0) page = windows[0]
    }

    const status = await page.evaluate(async () => {
      const w = window as Window & { electronAPI?: { getPythonStatus: () => Promise<{ running: boolean; port: number }> } }
      try {
        return await w.electronAPI?.getPythonStatus() ?? { running: false, port: 0 }
      } catch {
        return { running: false, port: 0 }
      }
    })
    console.log('  ✓ Python 코어 상태:', status)
    expect(status.running).toBe(true)
  })

  it('Python API health check 통과 (인증 토큰 포함)', async () => {
    const result = await page.evaluate(async () => {
      const w = window as Window & { electronAPI?: { getApiInfo: () => Promise<{ port: number; token: string; running: boolean }> } }
      try {
        const info = await w.electronAPI?.getApiInfo()
        if (!info?.running || !info?.port) return { ok: false, reason: 'not running' }

        const res = await fetch(`http://127.0.0.1:${info.port}/health`, {
          headers: info.token ? { Authorization: `Bearer ${info.token}` } : {}
        })
        return { ok: res.ok, status: res.status }
      } catch (e) {
        return { ok: false, reason: String(e) }
      }
    })

    console.log('  ✓ Python API health:', result)
    expect(result.ok).toBe(true)
  })
})
