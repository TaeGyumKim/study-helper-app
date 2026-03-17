/**
 * LMS SSO 로그인.
 * Python core의 src/auth/login.py 포팅.
 */

import { BrowserWindow } from 'electron'
import { waitForSelector } from './utils'

const LOGIN_TIMEOUT = 30000
const isDev = process.env.NODE_ENV !== 'production'
const log = (...args: unknown[]): void => { if (isDev) console.log(...args) }

/**
 * SSO 로그인을 수행한다. 성공 시 true.
 */
export async function performLogin(
  win: BrowserWindow,
  username: string,
  password: string
): Promise<boolean> {
  const wc = win.webContents

  try {
    log('[Auth] 페이지 URL:', wc.getURL())

    // SSO 로그인 페이지로 이동이 필요한 경우 (메인 페이지의 로그인 버튼)
    const hasLoginBtn = await wc.executeJavaScript(`!!document.querySelector('.login_btn a')`)
    log('[Auth] .login_btn a 존재:', hasLoginBtn)

    if (hasLoginBtn) {
      await wc.executeJavaScript(`document.querySelector('.login_btn a').click()`)
      await waitForLoad(win)
      log('[Auth] 로그인 버튼 클릭 후 URL:', wc.getURL())
    }

    // SSO 로그인 폼이 로드될 때까지 대기
    await waitForSelector(wc, 'input#userid')
    log('[Auth] 로그인 폼 감지')

    // 학번/비밀번호 입력 — Playwright fill()과 동일하게 동작하도록
    // nativeInputValueSetter를 사용하여 React/Vue 등의 프레임워크도 지원
    await wc.executeJavaScript(`
      (function() {
        var uid = document.querySelector('input#userid');
        var pwd = document.querySelector('input#pwd');
        if (uid) {
          uid.focus();
          uid.value = ${JSON.stringify(username)};
          uid.dispatchEvent(new Event('input', { bubbles: true }));
          uid.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (pwd) {
          pwd.focus();
          pwd.value = ${JSON.stringify(password)};
          pwd.dispatchEvent(new Event('input', { bubbles: true }));
          pwd.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })();
    `)

    // 로그인 버튼 존재 확인
    const hasSubmitBtn = await wc.executeJavaScript(`!!document.querySelector('a.btn_login')`)
    log('[Auth] a.btn_login 존재:', hasSubmitBtn)

    if (!hasSubmitBtn) {
      console.error('[Auth] 로그인 버튼을 찾을 수 없음')
      // 대체 셀렉터 시도
      const altBtn = await wc.executeJavaScript(`
        !!(document.querySelector('button[type="submit"]') || document.querySelector('.btn_login') || document.querySelector('#loginSubmit'))
      `)
      log('[Auth] 대체 버튼 존재:', altBtn)
      if (!altBtn) return false
    }

    // 로그인 버튼 클릭 + 네비게이션 대기
    await Promise.all([
      waitForNavigation(win),
      wc.executeJavaScript(`
        (function() {
          var btn = document.querySelector('a.btn_login')
            || document.querySelector('button[type="submit"]')
            || document.querySelector('.btn_login');
          if (btn) btn.click();
        })();
      `)
    ])

    // 로그인 후 리다이렉트 체인 완료 대기
    // SSO → login/callback → 대시보드 순으로 여러 번 리다이렉트됨
    await waitForLoad(win)

    // callback 리다이렉트가 아직 진행 중일 수 있으므로 최종 URL 안정화 대기
    const finalUrl = await waitForUrlStable(win)
    log('[Auth] 최종 URL:', finalUrl)

    // SSO 로그인 페이지에 머물러 있으면 실패 (callback URL은 성공)
    if (finalUrl.includes('smartid.ssu.ac.kr') || finalUrl.includes('smln.asp')) {
      const errMsg = await wc.executeJavaScript(`
        (function() {
          var el = document.querySelector('.error_msg') || document.querySelector('.alert');
          return el ? el.textContent.trim() : '';
        })();
      `)
      if (errMsg) console.error('[Auth] 로그인 에러:', errMsg)
      return false
    }

    log('[Auth] 로그인 성공')
    return true
  } catch (e) {
    console.error('[Auth] 로그인 예외:', e instanceof Error ? e.message : 'unknown error')
    return false
  }
}

/**
 * 현재 페이지가 로그인 페이지이면 로그인을 수행한다.
 */
export async function ensureLoggedIn(
  win: BrowserWindow,
  username: string,
  password: string
): Promise<boolean> {
  const url = win.webContents.getURL()
  if (!url.includes('login')) return true
  return performLogin(win, username, password)
}

/** 페이지 로드 완료 대기 (타임아웃 30초). */
function waitForLoad(win: BrowserWindow, timeout = LOGIN_TIMEOUT): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout
    const check = (): void => {
      if (!win.webContents.isLoading()) {
        resolve()
        return
      }
      if (Date.now() > deadline) {
        reject(new Error('Page load timeout'))
        return
      }
      setTimeout(check, 200)
    }
    setTimeout(check, 500)
  })
}

/** 네비게이션 완료 대기. */
function waitForNavigation(win: BrowserWindow, timeout = LOGIN_TIMEOUT): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      win.webContents.removeListener('did-finish-load', onLoad)
      // 타임아웃이어도 URL이 변경되었으면 성공으로 처리
      resolve()
    }, timeout)

    const onLoad = (): void => {
      clearTimeout(timer)
      resolve()
    }
    win.webContents.once('did-finish-load', onLoad)
  })
}

/** URL이 안정화될 때까지 대기 (리다이렉트 체인 완료). */
function waitForUrlStable(win: BrowserWindow, timeout = LOGIN_TIMEOUT): Promise<string> {
  return new Promise((resolve) => {
    let lastUrl = win.webContents.getURL()
    let stableCount = 0
    const deadline = Date.now() + timeout

    const check = (): void => {
      const currentUrl = win.webContents.getURL()
      if (currentUrl === lastUrl && !win.webContents.isLoading()) {
        stableCount++
        if (stableCount >= 3) {
          resolve(currentUrl)
          return
        }
      } else {
        lastUrl = currentUrl
        stableCount = 0
      }
      if (Date.now() > deadline) {
        resolve(currentUrl)
        return
      }
      setTimeout(check, 500)
    }
    setTimeout(check, 1000)
  })
}

