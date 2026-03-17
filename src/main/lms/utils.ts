/**
 * LMS 자동화 공통 유틸리티.
 */

/** DOM 셀렉터가 나타날 때까지 대기 (polling). */
export async function waitForSelector(
  wc: Electron.WebContents,
  selector: string,
  timeout = 30000
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const found = await wc.executeJavaScript(
        `!!document.querySelector(${JSON.stringify(selector)})`
      )
      if (found) return
    } catch {
      // 페이지 전환 중일 수 있음
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Selector "${selector}" not found within ${timeout}ms`)
}
