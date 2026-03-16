/**
 * 영상 URL 추출.
 * Python core의 src/downloader/video_downloader.py extract_video_url 포팅.
 */

import { BrowserWindow } from 'electron'

const POLL_TIMEOUT = 60000 // 60초

/**
 * LMS 강의 페이지에서 mp4 URL을 추출한다.
 *
 * Plan A: video 태그 src 폴링
 * Plan B: Network 요청에서 mp4 URL 캡처
 * Plan C: content.php XML 파싱
 */
export async function extractVideoUrl(
  win: BrowserWindow,
  lectureUrl: string
): Promise<string | null> {
  const wc = win.webContents
  let capturedUrl: string | null = null

  const excludePatterns = ['preloader.mp4', 'preview.mp4', 'thumbnail.mp4']

  function isValidMp4(url: string): boolean {
    return url.includes('.mp4') && !excludePatterns.some((p) => url.includes(p))
  }

  // Network intercept로 mp4 URL 캡처
  const onRequest = (
    details: Electron.OnBeforeRequestListenerDetails,
    callback: (response: Electron.CallbackResponse) => void
  ): void => {
    if (isValidMp4(details.url) && !capturedUrl) {
      capturedUrl = details.url
    }
    callback({})
  }
  wc.session.webRequest.onBeforeRequest({ urls: ['*://*/*.mp4*'] }, onRequest)

  // content.php 응답에서 미디어 URL 파싱
  const onCompleted = async (details: Electron.OnCompletedListenerDetails): Promise<void> => {
    if (
      details.url.includes('content.php') &&
      details.url.includes('commons.ssu.ac.kr') &&
      !capturedUrl
    ) {
      try {
        // content.php의 XML 응답을 파싱하기 위해 fetch
        const mediaUrl = await wc.executeJavaScript(`
          fetch(${JSON.stringify(details.url)})
            .then(r => r.text())
            .then(text => {
              var parser = new DOMParser();
              var doc = parser.parseFromString(text, 'text/xml');
              // desktop > html5 > media_uri 우선
              var paths = [
                'content_playing_info > main_media > desktop > html5 > media_uri',
                'content_playing_info > main_media > mobile > html5 > media_uri',
              ];
              for (var path of paths) {
                var el = doc.querySelector(path);
                if (el && el.textContent && el.textContent.trim() && !el.textContent.includes('[')) {
                  return el.textContent.trim();
                }
              }
              // service_root > media > media_uri[method=progressive]
              var mediaUri = doc.querySelector('service_root > media > media_uri[method="progressive"]');
              if (mediaUri && mediaUri.textContent) {
                var tpl = mediaUri.textContent.trim();
                if (tpl.includes('[MEDIA_FILE]')) {
                  var mainMedia = doc.querySelector('story_list > story > main_media_list > main_media');
                  if (mainMedia && mainMedia.textContent) {
                    return tpl.replace('[MEDIA_FILE]', mainMedia.textContent.trim());
                  }
                } else if (!tpl.includes('[')) {
                  return tpl;
                }
              }
              return null;
            })
            .catch(() => null)
        `)
        if (mediaUrl && !capturedUrl) {
          capturedUrl = mediaUrl
        }
      } catch {
        // 파싱 실패 무시
      }
    }
  }
  wc.session.webRequest.onCompleted({ urls: ['*://commons.ssu.ac.kr/*content.php*'] }, onCompleted)

  try {
    // 강의 페이지 로드
    await win.loadURL(lectureUrl)

    // content.php 파싱 대기 (최대 10초)
    for (let i = 0; i < 20; i++) {
      await sleep(500)
      if (capturedUrl) return capturedUrl
    }

    // Plan A: iframe 내 video 태그 src 폴링
    const start = Date.now()
    while (Date.now() - start < POLL_TIMEOUT) {
      if (capturedUrl) return capturedUrl

      const videoSrc = await wc.executeJavaScript(`
        (function() {
          // tool_content iframe 내부의 모든 iframe에서 video 태그 검색
          var tool = document.querySelector('iframe[name="tool_content"]');
          if (!tool || !tool.contentDocument) return null;
          var iframes = tool.contentDocument.querySelectorAll('iframe');
          for (var i = 0; i < iframes.length; i++) {
            try {
              var doc = iframes[i].contentDocument;
              if (!doc) continue;
              // vc-vplay-video1 우선
              var v = doc.querySelector('video.vc-vplay-video1');
              if (v && v.src && v.src.startsWith('http') && v.src.includes('.mp4')) return v.src;
              // fallback: 모든 video 태그
              var videos = doc.querySelectorAll('video');
              for (var j = 0; j < videos.length; j++) {
                var src = videos[j].src || videos[j].currentSrc || '';
                if (src.startsWith('http') && src.includes('.mp4')) return src;
              }
            } catch(e) {}
          }
          return null;
        })()
      `)
      if (videoSrc) return videoSrc
      await sleep(500)
    }

    return capturedUrl
  } finally {
    // 리스너 정리
    wc.session.webRequest.onBeforeRequest(null as never)
    wc.session.webRequest.onCompleted(null as never)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
