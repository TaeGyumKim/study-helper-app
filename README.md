# Study Helper App

LMS 학습 도우미 데스크톱 앱 (Electron + React + TypeScript)

## 아키텍처

```
Electron (TypeScript)          Python Core (FastAPI)
├── LMS 브라우저 자동화         ├── 다운로드 스트리밍
├── React UI                   ├── mp3 변환 (ffmpeg)
└── 프로세스 관리               ├── STT (faster-whisper)
                               ├── AI 요약 (Gemini/OpenAI)
                               └── 텔레그램 알림
```

Python 코어: [study-helper](https://github.com/TaeGyumKim/study-helper)

## 개발 환경

```bash
npm install
npm run dev    # Electron + Vite dev server
```

개발 모드에서는 형제 디렉토리의 `study-helper` 프로젝트를 Python 코어로 사용합니다.

## 빌드

```bash
npm run build:win    # Windows
npm run build:mac    # macOS
```
