# study-helper-app: LMS 학습 도우미 데스크톱 앱

숭실대학교 Canvas LMS의 강의 출석 재생, 다운로드, STT, AI 요약을 GUI로 제공하는 Electron 데스크톱 앱.
Python 코어([study-helper](https://github.com/TaeGyumKim/study-helper))를 FastAPI 서버로 실행하여 연동한다.

## 실행 방법

```bash
# 개발 모드
env -u ELECTRON_RUN_AS_NODE npx electron-vite dev

# 빌드
npm run build               # electron-vite 빌드
npm run build:win            # Windows NSIS 인스톨러
npm run build:mac            # macOS DMG

# 테스트
npm run test                 # 단위 테스트 (vitest)
npm run test:e2e             # E2E 테스트 (Playwright Electron)

# 릴리스
npm run release:patch        # 1.0.0 → 1.0.1 + tag push → CI 빌드 → GitHub Release
npm run release:minor        # 1.0.0 → 1.1.0
```

**주의**: `ELECTRON_RUN_AS_NODE=1` 환경변수가 설정되어 있으면 Electron이 Node.js로 동작하여 앱이 실행되지 않는다. `env -u ELECTRON_RUN_AS_NODE`으로 해제할 것.

## 기술 스택

- **Electron 31** + **React 18** + **TypeScript** + **Tailwind CSS**
- **electron-vite**: main/preload/renderer 빌드
- **electron-builder**: NSIS(Win) / DMG(macOS) 패키징
- **Playwright**: E2E 테스트 (Electron 모드)
- **vitest**: 단위 테스트

## 프로젝트 구조

```
study-helper-app/
├── src/
│   ├── main/                          # Electron main process
│   │   ├── index.ts                   # 앱 진입점, safeStorage, macOS 메뉴
│   │   ├── ipc.ts                     # IPC 핸들러 (LMS 자동화)
│   │   ├── python.ts                  # Python 코어 프로세스 관리
│   │   └── lms/
│   │       ├── auth.ts                # SSO 로그인
│   │       ├── courses.ts             # 과목 목록 스크래핑
│   │       ├── lectures.ts            # 강의 상세 스크래핑
│   │       ├── player.ts              # 백그라운드 재생 (출석)
│   │       ├── extractor.ts           # 영상 URL 추출
│   │       ├── utils.ts               # 공용 유틸 (waitForSelector)
│   │       └── types.ts               # 데이터 모델
│   ├── preload/
│   │   ├── index.ts                   # contextBridge API 노출
│   │   └── index.d.ts                 # Window.electronAPI 타입 선언
│   └── renderer/src/
│       ├── App.tsx                    # 라우팅
│       ├── store.ts                   # 글로벌 과목/상세 캐시
│       ├── api/client.ts              # Python API 클라이언트
│       └── pages/
│           ├── Login.tsx              # 로그인 + 자동 로그인 + safeStorage
│           ├── Onboarding.tsx         # 최초 설정 위저드 (4단계)
│           ├── Courses.tsx            # 과목 목록 (캐시 활용)
│           ├── CourseDetail.tsx        # 강의 상세 + 재생/처리 버튼
│           └── Settings.tsx           # 전체 설정 관리
├── tests/
│   ├── types.test.ts                  # 단위 테스트 (17개)
│   └── e2e.test.ts                    # E2E 테스트 (14개, Playwright)
├── scripts/
│   └── build-core.py                  # PyInstaller 번들링 + ffmpeg 다운로드
├── .github/workflows/
│   ├── ci.yml                         # main push → 빌드 + 타입체크 + 테스트
│   └── build.yml                      # v* 태그 → 빌드 + GitHub Release
├── electron-builder.yml               # 패키징 설정
├── vitest.config.ts                   # 단위 테스트 설정
└── vitest.e2e.config.ts               # E2E 테스트 설정
```

## 사용자 흐름

```
최초 사용자: 로그인 → 온보딩 (다운로드/STT/AI/텔레그램 설정) → 과목 목록
재방문 사용자: 앱 실행 → 자동 로그인 → 과목 목록 (캐시 즉시)
과목 → 강의 상세: 캐시 우선 표시 → 백그라운드 갱신
강의 [재생]: 출석 처리 (hidden BrowserWindow)
강의 [처리]: 다운로드 → STT → AI 요약 (WebSocket 파이프라인)
```

## Python 코어 연동

- `src/main/python.ts`가 `study-helper`의 FastAPI 서버를 child process로 실행
- 개발 모드: 형제 디렉토리 `../study-helper`에서 `python -m src.api.server`
- 프로덕션: PyInstaller 번들(`python-core/study-helper-core[.exe]`)
- 통신: HTTP + WebSocket (Bearer 토큰 인증, `randomBytes(32)`)
- Python 없이도 LMS 자동화(로그인/출석)는 동작

## 보안 주의사항

- `.env`, `credentials.enc` — 절대 커밋 금지 (`.gitignore`에 등록됨)
- `safeStorage`로 로그인 정보 암호화 저장 (`userData/credentials.enc`)
- IPC `get-api-info`에서 sender origin 검증 (`file://` 또는 `http://localhost:`)
- LMS BrowserWindow: `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`
- `executeJavaScript`에 사용자 입력 주입 시 반드시 `JSON.stringify` 사용

## Git 커밋 규칙

형식: `type: 한국어 설명` — 첫 줄 70자 이내

| type | 용도 |
|------|------|
| feat | 새 기능 |
| fix | 버그 수정 |
| refactor | 리팩토링 |
| chore | 빌드/설정/의존성 |
| docs | 문서 |

## CI/CD

```
main push / PR → ci.yml (빌드 + 타입체크 + 단위 테스트)
v* 태그 push   → build.yml (Win/macOS 빌드 → GitHub Release)
```

릴리스: `npm run release:patch` → tag push → CI 자동 빌드 → Release에 exe/dmg 업로드
