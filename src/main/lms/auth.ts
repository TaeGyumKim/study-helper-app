/**
 * LMS SSO 로그인.
 * Python core의 src/auth/login.py 포팅.
 */

import { BrowserWindow } from 'electron'

const LOGIN_TIMEOUT = 30000

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
    // 로그인 버튼 클릭 (있으면)
    await wc.executeJavaScript(`
      (function() {
        var btn = document.querySelector('.login_btn a');
        if (btn) btn.click();
      })();
    `)
    await waitForLoad(win)

    // 학번/비밀번호 입력
    await wc.executeJavaScript(`
      (function() {
        var uid = document.querySelector('input#userid');
        var pwd = document.querySelector('input#pwd');
        if (uid) { uid.value = ''; uid.value = ${JSON.stringify(username)}; uid.dispatchEvent(new Event('input')); }
        if (pwd) { pwd.value = ''; pwd.value = ${JSON.stringify(password)}; pwd.dispatchEvent(new Event('input')); }
      })();
    `)

    // 로그인 버튼 클릭 + 네비게이션 대기
    await Promise.all([
      waitForNavigation(win),
      wc.executeJavaScript(`
        (function() {
          var btn = document.querySelector('a.btn_login');
          if (btn) btn.click();
        })();
      `)
    ])

    // 로그인 결과 확인
    const currentUrl = wc.getURL()
    if (currentUrl.includes('login')) {
      return false
    }

    await waitForLoad(win)
    return true
  } catch {
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
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      win.webContents.removeListener('did-finish-load', onLoad)
      reject(new Error('Navigation timeout'))
    }, timeout)

    const onLoad = (): void => {
      clearTimeout(timer)
      resolve()
    }
    win.webContents.once('did-finish-load', onLoad)
  })
}
