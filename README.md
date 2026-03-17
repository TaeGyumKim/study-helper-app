# Study Helper App

숭실대학교 LMS(canvas.ssu.ac.kr) 강의 출석 재생, 다운로드, AI 요약을 GUI로 제공하는 데스크톱 앱입니다.

---

## 기술 스택

![Electron](https://img.shields.io/badge/Electron-47848F?style=flat-square&logo=electron&logoColor=white) ![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white) ![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)

![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white) ![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white) ![Whisper](https://img.shields.io/badge/Whisper-412991?style=flat-square&logo=openai&logoColor=white) ![Google Gemini](https://img.shields.io/badge/Google_Gemini-8E75B2?style=flat-square&logo=googlegemini&logoColor=white) ![Telegram](https://img.shields.io/badge/Telegram-26A5E4?style=flat-square&logo=telegram&logoColor=white)

---

## 아키텍처

```
┌─────────────────────────────────────┐
│         Study Helper App (GUI)      │
│       Electron + React + Tailwind   │
│                                     │
│  ┌────────────┐  ┌───────────────┐  │
│  │ Main Proc  │  │   Renderer    │  │
│  │ LMS 자동화  │  │   React UI   │  │
│  └─────┬──────┘  └──────┬────────┘  │
│        │     IPC / API   │          │
│        └────────┬────────┘          │
│                 │ HTTP + WebSocket  │
│  ┌──────────────▼─────────────────┐ │
│  │      Python Core (FastAPI)     │ │
│  │      STT / AI 요약 / 텔레그램   │ │
│  └────────────────────────────────┘ │
└─────────────────────────────────────┘
```

Python 코어: [study-helper](https://github.com/TaeGyumKim/study-helper)

---

## 주요 기능

- **LMS 자동 로그인** — 숭실대 SSO 인증 자동 처리, 로그인 정보 암호화 저장
- **과목/강의 조회** — 수강 과목 및 주차별 강의 목록 병렬 로딩
- **출석 재생** — 영상/소리 출력 없이 백그라운드에서 강의 자동 재생
- **다운로드 → STT → AI 요약** — 원클릭 파이프라인 (진행률 표시)
- **텔레그램 알림** — 재생 완료, 마감 임박 등 알림 전송
- **온보딩 위저드** — 최초 실행 시 설정을 단계별로 안내
- **자동 로그인** — 재방문 시 저장된 정보로 바로 과목 목록 진입

---

## 다운로드

[최신 릴리즈](https://github.com/TaeGyumKim/study-helper-app/releases/latest)에서 플랫폼에 맞는 파일을 다운로드하세요.

| 플랫폼 | 파일 |
|--------|------|
| Windows | `Study Helper-{version}-setup.exe` |
| macOS (Intel) | `Study Helper-{version}-x64.dmg` |
| macOS (Apple Silicon) | `Study Helper-{version}-arm64.dmg` |

### 설치 방법

**Windows**: exe 파일 실행 → 설치 경로 선택 → 완료
**macOS**: dmg 열기 → Applications 폴더로 드래그

---

## 사용 방법

### 1. 로그인

학번과 비밀번호를 입력합니다. "로그인 정보 저장"을 체크하면 다음 실행 시 자동 로그인됩니다.

### 2. 초기 설정 (최초 1회)

처음 로그인하면 온보딩 위저드가 안내합니다:

| 단계 | 설정 내용 |
|------|----------|
| 1. 다운로드 | 다운로드 규칙 (영상/음성/둘 다), 저장 경로 |
| 2. STT | Whisper 모델 크기, 인식 언어 |
| 3. AI 요약 | Gemini/OpenAI 선택, API 키, 모델 |
| 4. 텔레그램 | 봇 토큰, Chat ID |

> 건너뛰기도 가능하며, 설정은 언제든 "설정" 메뉴에서 변경할 수 있습니다.

### 3. 과목 목록

수강 중인 과목이 카드 형태로 표시됩니다. 각 카드에는 미시청/전체 영상 수가 표시됩니다.

### 4. 강의 상세

과목을 선택하면 주차별 강의 목록이 나타납니다.

| 버튼 | 동작 |
|------|------|
| **재생** | 백그라운드에서 강의 재생 (출석 처리) |
| **처리** | 다운로드 → 오디오 변환 → STT → AI 요약 파이프라인 실행 |

---

## 시작 전 필요한 것

| 항목 | 설명 |
|------|------|
| 숭실대 LMS 계정 | 학번 + 비밀번호 |
| Gemini API 키 *(권장)* | AI 요약 사용 시 — [Google AI Studio](https://aistudio.google.com/)에서 무료 발급 |
| 텔레그램 봇 *(선택)* | 알림 수신 시 — [BotFather](https://t.me/BotFather)에서 발급 |

---

## 개발 환경

```bash
# 의존성 설치
npm install

# 개발 모드 (Electron + Vite dev server)
npm run dev

# 단위 테스트
npm run test

# E2E 테스트 (Playwright + Electron)
npm run test:e2e
```

개발 모드에서는 형제 디렉토리의 [study-helper](https://github.com/TaeGyumKim/study-helper) 프로젝트를 Python 코어로 사용합니다.

### 빌드

```bash
npm run build:win    # Windows NSIS 인스톨러
npm run build:mac    # macOS DMG
```

### 릴리스

```bash
npm run release:patch    # 1.0.0 → 1.0.1 + tag push → CI 자동 빌드 → GitHub Release
npm run release:minor    # 1.0.0 → 1.1.0
npm run release:major    # 1.0.0 → 2.0.0
```

---

## 주의사항

- 본 도구는 개인 학습 목적으로만 사용하세요.
- LMS 서비스 약관을 준수하여 사용하시기 바랍니다.
- 학번, 비밀번호, API 키는 OS 키체인(Electron safeStorage)으로 암호화 저장됩니다.

### 면책 조항

본 프로젝트는 개인 학습 편의를 위해 제작된 비공식 도구입니다.

- 사용으로 인해 발생하는 학사 불이익, 계정 제재, 데이터 손실 등 모든 결과에 대한 책임은 전적으로 사용자 본인에게 있습니다.
- 개발자는 어떠한 법적·도의적 책임도 지지 않습니다.
- 본 프로젝트는 [Claude AI](https://claude.ai)를 활용하여 개발되었습니다.

---

## 라이선스

[MIT](LICENSE)
