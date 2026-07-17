# AGENT.md

이 파일은 에이전트(Claude)가 이 프로젝트에서 작업할 때 참고하는 상시 문서입니다.
사실만 기록하며, 아직 구현되지 않은 것은 "미구현/계획"으로 명시합니다.

- **최초 작성**: 2026-07-05
- **최종 업데이트**: 2026-07-17 (개인보고서 서식 추가 + 보고서 엔진의 미니멀 서식·□ 대항목 지원)
- **대상 저장소**: `c:\Users\krs47\Documents\RS-Ground`

> **이 프로젝트가 존재하는 이유**: `RSA Personal Agent`(`c:\Users\krs47\Documents\RSA Personal Agent`, remote `github.com/1212krs/RSA-Ground`)를 전면 재구축하기로 하면서, 실제 작업은 이 폴더(`RS-Ground`)에서 처음부터 새로 시작하기로 함(2026-07-05). `RSA Personal Agent`는 참고용으로 그대로 두고 더 이상 수정하지 않는다.
> **작업 방식**: 화면을 한 번에 다 만들지 않고 **기능을 하나씩 붙여나가는 방식**으로 진행하며, 매 단계에서 "확장성"(새 화면·기능을 최소 변경으로 추가할 수 있는 구조)을 우선한다.
> **진행 상태(2026-07-05 기준)**: 로그인 화면 + 메인 대시보드(홈) 프론트엔드까지 완성. 그 외 사이드바 항목(지식/AI 채팅/보고서/에이전트/일정/할 일/메모/설정)은 라우트만 뚫어놓은 자리표시자 상태. **백엔드는 아직 없음** — 개발 중 화면 확인용 가짜 로그인만 존재.

---

## 1. 프로젝트 개요

- **제품명**: package name은 `rs-ground` (v0.1.0). 화면 표기(사이드바)는 `RSA Personal Agent`에서 그대로 가져온 "Rsa Project" (아직 정리 안 됨 — 나중에 통일 필요).
- **한 줄 설명**: 문서, 근거 기반 채팅, 보고서 초안, 일정·할 일·메모, 에이전트 카탈로그를 연결할 예정인 개인 업무 플랫폼의 **프론트엔드 뼈대**. 현재는 로그인 화면과 홈 대시보드만 실제로 구현됨.
- **디자인 출처**: `RSA Personal Agent`의 기존 로그인/대시보드 디자인(다크 테마, "Your data runs the world" 랜딩)을 그대로 재사용하기로 결정(2026-07-05, 사용자 확인).
- **참고 문서**: 사람이 읽기 위한 진행 기록은 [DEVLOG.md](DEVLOG.md)에 개념 설명 포함해서 정리되어 있음(요청자가 개발 초보자라 실무 설명 목적).

---

## 2. 기술 스택 (검증됨)

- **런타임/빌드**: Vite + React (`package.json`에 `latest`로 지정 — 재현성 측면에서 나중에 버전 고정 권장, `RSA Personal Agent`와 동일한 이슈).
- **언어**: JavaScript (JSX), ESM (`"type": "module"`). TypeScript 미사용.
- **라우팅**: `react-router-dom` (2026-07-05 도입 결정 — 화면을 계속 추가할 예정이라 주소 기반 라우팅이 필요하다고 판단).
- **아이콘**: `lucide-react`.
- **테스트**: `vitest` + `@testing-library/react` + `@testing-library/user-event` + `jsdom` (2026-07-05 추가). 실행: `npm test`.
- **스타일**: 순수 CSS. Tailwind 등 프레임워크 미사용 — **컴포넌트/페이지별로 `.css` 파일을 옆에 두는 방식**으로 분리(2026-07-05 결정, 예전 `RSA Personal Agent`의 파일 하나짜리 `styles.css`(500줄+) 문제를 피하기 위함).
- **아직 미사용(RSA Personal Agent에는 있었지만 여기서는 뺌)**: `pdfjs-dist`, `exceljs`, `jszip`, `unpdf` 등 문서 파싱 라이브러리. 지식(문서) 탭을 실제로 만들 때 필요한 만큼만 다시 추가할 예정 — 지금 단계에서 쓰지 않는 코드를 미리 넣지 않는다는 원칙.

---

## 3. 실행 / 검증 방법

```powershell
npm.cmd install
npm.cmd run dev      # http://127.0.0.1:5173 (포트 고정: strictPort)
npm.cmd run build    # 프로덕션 빌드 검증
npm.cmd run preview  # 빌드 결과 미리보기
npm.cmd run test     # vitest 실행 (라우팅 가드 2개 + 로그인 폼 전환 1개, 총 3개 테스트)
```

- **로그인은 이제 진짜다(2026-07-10).** 가짜 `mockAuth`는 제거됨. 백엔드 `backend/auth/`가 아이디+비밀번호(사람별 계정)를 검사하고 **출입증(토큰)** 을 발급한다(토큰-헤더 방식, 쿠키 아님 — 배포 시 다른 출처 대응). 백엔드가 `/api/rag`·`/api/report`·`/api/store` 요청에 유효 토큰이 없으면 401로 막는다. **그래서 dev에서도 백엔드를 띄우고 로그인해야 기능이 동작한다.** 공개 회원가입 없음 — 계정은 `cd backend && ./venv/Scripts/python.exe -m auth.manage add <아이디> <비번> "<표시이름>"`로 만든다. (현재 로컬 `data/app.db`에 `admin`/`admin1234` 존재 — 비번 변경 권장.)
- 포트를 5173으로 고정한 이유: 포트가 바뀌면 origin이 달라져 `localStorage` 데이터(할 일/메모)가 분리되어 사라진 것처럼 보이기 때문.
- **지식 탭·보고서 탭을 쓰려면 백엔드 API 서버도 따로 띄워야 한다.** (2026-07-08 갱신) `npm run dev`만으로는 안 되고, 별도 터미널에서:
  ```powershell
  cd backend
  ./venv/Scripts/python.exe -m uvicorn main:app --reload --port 8000
  ```
  `main:app`은 RAG API + 보고서 API를 한 서버로 합친 진입점(`backend/main.py`)이다. 예전 명령(`uvicorn rag.api:app`)도 여전히 동작하지만 그 경우 보고서 API가 빠진다. Vite dev 서버가 `/api/rag/*`·`/api/report/*` 요청을 이 서버(8000번 포트)로 프록시한다(`vite.config.js`의 `server.proxy`).
- **보고서 탭 AI 생성을 쓰려면** `backend/.env`에 `ANTHROPIC_API_KEY=`를 추가한다(`.env.example` 참고). 키가 없어도 화면·다운로드는 동작하며, 이때는 규칙 기반 "대체 생성기"가 자리표시 초안을 만든다(화면에 표시됨).

---

## 4. 코드 구조 (검증됨, 2026-07-05 기준)

```
src/
  main.jsx                        React 진입점. ErrorBoundary → BrowserRouter → AuthProvider → App 순서로 감쌈
  App.jsx                         라우트 정의 (React.lazy + Suspense로 페이지별 지연 로딩)
  api.js / utils.js / data.js     서버 요청 함수 / 공용 유틸(uid) / 데모 데이터(할 일·일정)
  ragApi.js                       RAG API(backend/rag/api.py) 요청 함수 — /api/rag/documents 업로드·목록 조회 + chat()(/api/rag/chat 질의응답)
  ticketApi.js                    '할 일' 칸반 보드 API(backend/todo/api.py) 요청 함수 — 티켓 CRUD + move(드래그앤드롭) (2026-07-11 추가)
  reportApi.js                    보고서 API(backend/report/api.py) 요청 함수 — 서식 목록/AI 생성/hwpx 다운로드
  context/
    AuthContext.jsx               로그인 상태(user/loading) 전역 관리, 새로고침 시 /api/auth/me로 세션 확인
  layouts/
    AppLayout.jsx, navConfig.js   사이드바+상단바 공통 틀, 사이드바 항목 목록(NAV_ITEMS 등)과 라우트 경로가 여기서 하나로 관리됨
  components/
    protected-route/              로그인 안 하면 /login으로 돌려보내는 가드
    sidebar/, topbar/              공통 UI
    command-palette/               Ctrl/⌘+K 검색 팔레트
    toast/                         알림 토스트
    error-boundary/                렌더링 오류 시 폴백 화면 (main.jsx에서 최상위를 감쌈)
  pages/
    login/LoginPage.jsx            랜딩 히어로 + 로그인 폼 (내부 state로 전환, 별도 라우트 아님)
    dashboard/DashboardPage.jsx    홈(캘린더/할 일/메모) — 실제 완성된 보호 페이지
    knowledge/KnowledgePage.jsx    지식 탭 — 문서 업로드(.txt/.md/.pdf/.docx/.hwpx) + 임베딩 색인 + 색인된 문서 목록 (2026-07-07 추가). 임베딩 지도(UMAP)는 2026-07-10 제거됨.
    reports/ReportsPage.jsx        보고서 탭 — 서식 선택 → 제목·내용·참고파일로 AI 본문 생성 → 섹션 편집·미리보기 → hwpx 다운로드 (2026-07-08 추가)
    chat/ChatPage.jsx              AI 채팅/회계챗 — 근거 기반 질의응답 (2026-07-08 추가). URL 파라미터 ?scope=회계 로 검색 분야를 걸어 회계챗/AI챗을 겸함(전체=필터 없음).
    agents/AgentsPage.jsx          에이전트 허브 — 분야별 전용 챗 카드(회계챗·예산챗 등). agentsConfig.js가 에이전트 목록(=데이터). 카드 클릭 시 /chat?scope=... 로 이동 (2026-07-08 추가, 2026-07-13 예산챗 추가).
    coming-soon/ComingSoonPage.jsx 미완성 사이드바 항목용 공용 자리표시자
    not-found/NotFoundPage.jsx     알 수 없는 주소(`*`) 처리
  hooks/useStoredState.js          localStorage 동기화 state 훅
  test/setup.js                   vitest용 jest-dom matcher 등록
vite.config.js                    react() + /api/{auth,rag,report,store} 프록시(→127.0.0.1:8000) + vitest 설정 (mockAuth는 2026-07-10 진짜 로그인으로 대체·제거)
backend/
  main.py                         통합 진입점 — rag 앱에 보고서 라우터를 합쳐 한 서버로 띄움 (2026-07-08 추가). 실행 명령은 3장 참고.
  rag/api.py                      RAG용 FastAPI 서버. POST/GET /api/rag/documents (업로드 시 전체 재색인), POST /api/rag/chat (근거 기반 질의응답). (umap 엔드포인트는 2026-07-10 제거)
  rag/chat.py                     질의응답 엔진 (2026-07-08 추가) — 질문 임베딩→store.query(카테고리 필터)→Claude(claude-sonnet-5, urllib) 근거 기반 답변. 키 없으면 근거만 반환(fallback).
  auth/                           로그인 시스템 (2026-07-10 추가) — store.py(SQLite users/sessions, pbkdf2), api.py(login/logout/me + AuthMiddleware 문지기 + require_user), manage.py(계정 CLI). 토큰-헤더 방식.
  security.py                     보안 하드닝 (2026-07-10, 외부 커밋) — TrustedHostMiddleware(RSG_ALLOWED_HOSTS), body 크기 제한, 보안 헤더, 입력 검증.
  report/                         보고서 생성 패키지 (2026-07-08 추가) — engine.py(hwpx 마커 치환·조립, 표준 라이브러리만),
                                  composer.py(Claude API urllib 직접 호출 + 대체 생성기 + 지침 3계층),
                                  extractors.py(참고파일 텍스트 추출 — txt/md/csv/hwp/hwpx/docx, .hwp OLE 파서 자체 구현),
                                  api.py(APIRouter: GET /api/report/templates·status, POST /api/report/compose·generate),
                                  templates/(서식 hwpx + 지침 md 세트 — "서식이름.hwpx"+"서식이름.md" 쌍, "_공통지침.md"는 전체 공통.
                                  마커 규약(2026-07-17 개정): 필수={{TITLE}}, ○ {{ITEM}}, - {{SUB}} / 선택={{OVERVIEW}}, □ {{HEAD}}(대항목 단계),
                                  표 3종({{TBL_CAPTION}}/{{TH}}/{{TD}} — 셋 다 있거나 셋 다 없어야 함). 선택 마커 보유 여부는 features로
                                  /api/report/templates에 노출되고 프론트가 개요·표 UI를 서식별로 숨긴다)
  todo/                           '할 일' 칸반 보드 패키지 (2026-07-11 추가) — store.py(SQLite tickets 테이블, position 실수 정렬),
                                  api.py(APIRouter: 티켓 CRUD + PATCH /api/todo/tickets/{id}/move로 상태·순서·시작일/종료일 자동화)
```

- **라우트 구성**(`App.jsx`): `/login`(공개) · `/`·`/calendar`·`/todos`·`/memos`(보호, 모두 같은 `WorkspacePage` — 경로가 활성 탭을 결정) · `/knowledge`(보호, `KnowledgePage`) · `/reports`(보호, `ReportsPage`) · `/chat`(보호, `ChatPage`) · `/agents`(보호, `AgentsPage`) · `/study`(보호, `StudyPage`) · `/meeting`(보호, `MeetingPage`) · `PENDING_NAV`에 남은 경로(`/settings`)는 `ComingSoonPage`로 연결 · `*`는 `NotFoundPage`. (예전엔 `/`만 `DashboardPage`, 나머지는 `ComingSoonPage`였으나 워크스페이스 전환·공부 노트·회의록 추가로 대체됨 — 이 섹션이 한동안 갱신되지 않아 실제 코드와 어긋나 있었음, 2026-07-11 바로잡음.)
- **다크 배경 페이지**: `AppLayout.jsx`의 `NO_TOPBAR_PATHS`(`/`, `/agents`, `/knowledge`, `/reports`, `/chat`)에 경로를 넣으면 상단바가 사라지고 `.main-area.main-dark`(검정 배경)가 적용된다. 각 페이지는 `.oa`(대시보드)/`.kb`(지식)/`.rp`(보고서)/`.ai`(채팅)/`.ag`(에이전트) 처럼 자기 스코프에 다크 팔레트 CSS 변수를 정의하는 컨벤션(로그인 페이지의 `.nx`와 동일 패턴).
- **새 화면을 추가하는 규칙**: ① `layouts/navConfig.js`의 해당 항목을 `PENDING_NAV` 대상에서 뺀다 ② `pages/새화면/` 폴더에 실제 컴포넌트+css 작성 ③ `App.jsx`의 `PENDING_NAV.map(...)` 줄 위/아래에 전용 `<Route>`를 추가하고 `lazy(() => import(...))`로 불러온다.

---

## 5. 현재 실제로 동작하는 기능 (검증됨)

- 랜딩 화면(다크 히어로 + 기능 타일 5개) → Login 버튼 → 로그인 폼(아이디/비밀번호) 전환.
- 가짜 로그인(mock) 성공 시 홈 대시보드로 이동: 6월 캘린더(정적 이벤트 표시), 할 일 목록(완료 토글, `localStorage` 저장), 빠른 메모(저장/목록, `localStorage` 저장).
- 사이드바 내비게이션(활성 상태 표시) + 상단바(검색 트리거, 빠른 추가) + Ctrl/⌘+K 커맨드 팔레트(Esc로 닫힘, `role="dialog"`).
- 로그인 가드(`ProtectedRoute`): 미로그인 시 `/`, `/knowledge` 등 보호 경로 접근 불가, `/login`으로 리다이렉트.
- 새로고침해도 로그인 유지: `AuthContext`가 마운트 시 `/api/auth/me`를 다시 호출해 세션 쿠키 기준으로 판단(현재는 mock 쿠키 기준으로 검증됨, 실제 백엔드에서 재검증 필요).
- 404 화면(`NotFoundPage`), 렌더링 오류 시 `ErrorBoundary` 폴백 화면.
- 페이지 단위 코드 분할(lazy loading) — 빌드 결과물에서 `LoginPage`/`DashboardPage`/`ComingSoonPage`/`NotFoundPage`가 각각 별도 JS/CSS 청크로 생성됨을 확인.
- 아이콘 전용 버튼(로그아웃, 검색, 할 일 체크 등)에 `aria-label` 부여. 클릭 동작이 없던 달력 날짜 칸은 `<button>`이 아닌 `<div>`로 처리(가짜 버튼 제거).
- 모바일(≤760px) 대응: 사이드바가 오프캔버스로 전환되고 햄버거 메뉴로 열림. 대시보드 카드가 뷰포트 높이에 잘리던 버그를 발견해 수정함(2026-07-05).
- 자동 테스트 3개(vitest): 미로그인 시 `/` 접근 시 로그인 화면 노출, 알 수 없는 주소는 404, Login 버튼 클릭 시 폼 노출.
- **지식 탭(`/knowledge`, 2026-07-07 추가)**: `.txt`/`.md`/`.pdf`/`.docx`/`.hwpx` 파일을 내 PC에서 선택해 업로드하면 대/중/소분류(선택 입력) 메타데이터와 함께 `backend/rag/api.py`로 전송 → 서버가 저장·텍스트 추출·재색인(청킹→임베딩→ChromaDB)까지 수행하고 결과(청크 수)를 반환. 색인된 문서 목록(분류 배지 + 청크 수)을 조회해 보여줌. **RAG API 서버(uvicorn, 8000번 포트)가 떠 있어야 동작** — 3장 참고. curl/Python `requests`로 업로드·목록 조회 API 검증 완료(한글 파일명·카테고리, PDF/DOCX/HWPX 실제 파일 포함).
- **보고서 탭(`/reports`, 2026-07-08 추가)**: 서식(계획보고서/결과보고서/업무보고/보도자료/개인보고서) 선택 → 제목·간단한 내용 입력 + 참고 파일(txt/md/csv/hwp/hwpx/docx, 최대 3개) 첨부 → Claude가 서식 목차에 맞춰 본문 JSON 생성(개조식, 서식별 작성 지침 자동 반영) → 섹션별 편집·표 위치 조정·미리보기 → 진짜 `.hwpx` 파일 다운로드(한글에서 열림). API 키 없으면 대체 생성기로 흐름 유지. 서식 추가는 `backend/report/templates/`에 마커 규약을 지킨 hwpx(+지침 md) 파일만 넣으면 됨 — 코드 수정 불필요. **개인보고서 서식(2026-07-17 추가)**: 제목 상자 + □(대항목)/○(항목)/-(세부) 3단계 개조식의 미니멀 서식(개요 상자·표 없음, 단일 '본문' 섹션). 정리 안 된 글을 통째로 넣으면 `_공통지침.md`+`개인보고서.md` 지침으로 보고용 3단계 구조로 재구성하는 용도. 이를 위해 엔진이 선택 마커(features) 체계와 head 레벨을 지원하게 됨(엔진·컴포저·프론트 오프라인 검증 완료, 기존 4개 서식 회귀 통과). **엔진(조립·추출·프롬프트)은 업무 PC에서 오프라인 검증 완료, FastAPI 라우터 실행 검증은 개발 PC에서 필요** (venv에서 `uvicorn main:app` 후 탭 전체 흐름 확인).
- **'할 일' 탭(`/todos`, 2026-07-11 추가) — 티켓 기반 칸반 보드**: 기존의 완료 체크만 되는 평면 리스트를 좌측 Backlog 사이드바 + 우측 3컬럼(TODO/In Progress/Done) 보드로 교체. 티켓 CRUD(제목·설명·우선순위·계획시작일·계획종료일), 네이티브 HTML5 드래그앤드롭으로 컬럼 이동·순서 변경, 검색, "이번주 업무"/"일정 초과 업무" 필터. 컬럼 이동에 따라 **시작일(startedAt)·종료일(completedAt)은 서버가 자동 기록**(TODO 진입 시 시작일, DONE 진입 시 종료일, 역방향 이동 시 초기화) — 계획일(사용자 입력)과 실제일(시스템 기록)을 분리 관리. Done 컬럼은 종료일 기준 24시간 이내 티켓만 노출(그 이후는 삭제하지 않고 DB에만 남음). 상세는 [docs/PRD.md](docs/PRD.md) 참고.

---

## 6. 중요한 한계 / 미구현 (사실 기반)

- **인증은 2026-07-10부터 진짜다.** `backend/auth/`가 아이디+비번(사람별 계정, pbkdf2 해시)으로 검사하고 토큰을 발급하며, `AuthMiddleware`가 `/api/rag`·`/api/report`·`/api/store`를 토큰 없이는 401로 막는다. 공개 회원가입은 없고 계정은 `auth.manage add` CLI로 만든다. (옛 `mockAuth`는 제거됨.) **배포 주의**: 보안 미들웨어가 `RSG_ALLOWED_HOSTS`(응답 허용 도메인)를 요구 — 미설정 시 모든 요청 400. 계정 자체가 없으면 아무도 못 들어간다.
- 설정만 아직 `ComingSoonPage` 자리표시자. 일정·할 일·메모는 `WorkspacePage`(워크스페이스 셸)로 실제 구현됨 — 상세는 [docs/PRD-Calendar.md](docs/PRD-Calendar.md)(일정·메모), [docs/PRD.md](docs/PRD.md)(할 일 칸반 보드) 참고.
- **할 일 칸반의 알려진 제한(2026-07-11)**: Done에서 24시간이 지난 티켓은 보드에서만 숨겨지고 자동 삭제 배치는 없음(DB에 계속 남음). 기존에 있던 평면 할 일 데이터(`/api/store/todos` KV, `ground-todos` localStorage 이관분)는 신규 `tickets` 테이블로 마이그레이션하지 않음 — 새 보드는 빈 상태로 시작한다. 백엔드의 범용 KV 스토어(`backend/store/`)에 남아있는 `todos` 키는 더 이상 프론트에서 읽지 않지만 엔드포인트 자체는 정리하지 않고 그대로 둠.
- AI 채팅/에이전트(회계챗)는 지식 탭에 올린 문서를 근거로만 답한다. 답변 생성엔 `ANTHROPIC_API_KEY` 필요(없으면 근거 조각만 보여주는 fallback). 대화 기록은 저장되지 않음(새로고침 시 초기화), 답변 마크다운은 아직 서식 렌더링 없이 줄바꿈만 보존.
- 문서 업로드는 `.txt`/`.md`/`.pdf`/`.docx`/`.hwpx` 가능(2026-07-07 확장). XLSX, 옛 바이너리 `.hwp`(구버전, hwpx 아님), 이미지 기반 스캔 PDF(OCR 필요)는 아직 미지원.
- 접근성 점검은 자동 검사 수준(아이콘 버튼 `aria-label`)만 했고, 스크린리더 수동 청취·전체 키보드 탭 순서 감사는 하지 않음.
- 테스트는 스모크 테스트 3개뿐. 컴포넌트 단위 테스트, 대시보드 상호작용(할 일 토글, 메모 저장) 테스트는 없음.
- `package.json` 의존성이 대부분 `latest` → 빌드 재현성 위험(버전 고정 권장, `RSA Personal Agent`와 동일한 이슈).
- 사이드바 표기가 "Rsa Project"로 남아있음(제품명 정리 필요).
- `RS-Ground` 폴더에 이 세션에서 생성하지 않은 `gonggong_hwpxskills-main/`(한글 문서 처리 관련 Skill로 추정) 폴더가 존재하며, git에는 추가하지 않고 커밋 대상에서 제외해둔 상태(사용자 확인 대기).

---

## 7. RAG 파이프라인 (2026-07-07, **전체 파이프라인 실제 API로 끝까지 검증 완료**)

사용자가 RAG(문서 검색 기반) 기능을 다음 작업으로 결정. 설계 검토를 거쳐 **[docs/PRD-RAG.md](docs/PRD-RAG.md)** 에 상세 요구사항을 확정하고, 이어서 `backend/rag/`에 실제 코드를 구현함. 핵심 사항:

- **스택**: 업스테이지 임베딩 API(이원 모델 — 문서는 `embedding-passage`, 질문은 `embedding-query`, 4096차원) + ChromaDB(로컬 영속, **컬렉션 생성 시 cosine 지정 필수 — 생성 후 변경 불가**). (UMAP/Plotly 시각화는 2026-07-10 제거.)
- **형태**: `backend/rag/` 핵심 로직(청킹/임베딩/저장) + `backend/rag/api.py`(FastAPI, 지식 탭 연동용) + `backend/rag/pipeline.py`(CLI, 배치 색인·검색용). 둘 다 같은 핵심 함수를 재사용.
- **React 연동(2026-07-07 완료)**: 지식 탭(`/knowledge`, `KnowledgePage.jsx`)에서 문서 업로드 → `ragApi.js` → Vite 프록시(`/api/rag` → `127.0.0.1:8000`) → `rag/api.py`가 파일 저장 후 `data/raw/` 전체를 재색인(청킹→임베딩→ChromaDB reset+upsert). 업로드 폼에 대/중/소분류 선택 입력 필드 있음(비우면 미분류). 목록 조회(`GET /api/rag/documents`)는 ChromaDB 메타데이터를 source별로 집계해서 반환. (재색인은 메모리 절약을 위해 배치 200개씩 임베딩→저장한다.)
- **문서 형식 확장(2026-07-07)**: `backend/rag/extractors.py` 신규 — `.txt`/`.md`는 그대로 읽고, `.pdf`(pdfplumber)·`.docx`(python-docx)·`.hwpx`(zip+XML 직접 파싱, OWPML `hp:p`/`hp:t` 태그를 문단 단위로 재구성)에서 텍스트를 추출해 동일한 청킹 파이프라인에 태움. **HWPX는 외부 프로그램(한글) 의존 없이 순수 Python으로 파싱** — 서버에서 안정적으로 돌아가게 하려고 COM 자동화 대신 이 방식을 선택. 이 컴퓨터에 설치된 한글 프로그램으로 실제 HWPX/DOCX/PDF 샘플을 만들어 각각 추출 결과를 검증(문단 구분·한글 내용 정확히 보존 확인), CLI 파이프라인과 업로드 API 양쪽에서 실제 파일로 재검증 완료. **미지원**: XLSX, 옛 바이너리 `.hwp`(hwpx 아님), 스캔 이미지 PDF(OCR 없음).
- **실행 환경**: `backend/venv`(Python 3.11.9, pyenv), 의존성은 `backend/requirements.txt`에 버전 고정. 실행: `cd backend && ./venv/Scripts/python.exe -m rag.pipeline index` (색인) / `... rag.pipeline search "질문"` (검색).
- **코드 구조**: `config.py`(설정) · `chunker.py`(문단 우선 청킹 + 메타데이터, 폴더 계층을 `category_l1/l2/l3`로 자동 추출) · `embedder.py`(업스테이지 API + SQLite 캐시, `embed_passages`/`embed_query` 분리) · `store.py`(ChromaDB, cosine, `{source}::{chunk_index}` 결정적 ID + upsert, 분류 `where` 필터) · `pipeline.py`(CLI, 배치 색인 + `search --l1/--l2/--l3`로 분류 필터링).
- **문서 분류 원칙(2026-07-07 결정)**: 문서를 미리 손으로 분류하지 않는다 — 성격이 다른 문서는 임베딩 거리로 자동 분리됨. 대신 `data/raw/` 밑에 **폴더 계층으로만 자연스럽게 정리**(예: `기술/AI/AI챗봇/기획서.md`)하면 `chunker.py`가 상위 3단계를 자동으로 대/중/소분류 메타데이터로 뽑아 나중에 검색 필터링(`--l1/--l2/--l3`)에 쓸 수 있음. 상세: [docs/PRD-RAG.md](docs/PRD-RAG.md) 4.1절.
- **초기 테스트 문서**: 실제 문서가 없어 프로젝트 자체 문서(AGENT.md/DEVLOG.md/PRD-RAG.md)를 `data/raw/`에 복사해 사용 — 나중에 실제 문서로 교체 가능.
- **재색인 안전성**: `run_index()`는 매번 `reset_collection()`으로 ChromaDB 컬렉션을 통째로 비우고 다시 채운다 — 문서가 삭제·축소돼도 오래된 청크가 안 남게 하기 위함(source별 부분 삭제 대신 전체 리셋을 선택; 임베딩은 SQLite 캐시가 막아줘서 API 비용 증가 없음). `chunker.py`의 `_split_long_paragraph`는 문장 분할 후에도 남는 초과분을 고정 길이로 강제 분할하는 하드 스플릿 안전장치가 있어 마침표 없는 표/URL/코드블록도 chunk_size를 크게 벗어나지 않음(오버랩만큼의 소폭 초과는 의도된 허용치).
- **전체 파이프라인 실행 검증 완료(2026-07-07, 실제 업스테이지 API 키로)**: `backend/.env`에 `UPSTAGE_API_KEY` 설정 후 `python -m rag.pipeline index` 실행 → 청크 51개 → 4096차원 벡터 51개 임베딩 → ChromaDB 저장 → UMAP+Plotly 시각화(`output/embedding_map.html`)까지 전부 성공. `search "청킹 전략은 어떻게 정했어"` 실행 시 실제로 관련 문서(prd-rag.md 청킹 섹션)가 최상위로 검색됨. **재실행 시 캐시 51/51 히트로 0.07초 만에 완료**(API 재호출 없음, PRD 성공 기준 충족), 컬렉션도 51개로 유지(중복 저장 없음).
- **버전 이슈 발견 및 수정**: `umap-learn 0.5.7`이 최신 `scikit-learn`(pip가 자동 설치한 1.9.0)과 `check_array(force_all_finite=...)` 인자 문제로 충돌 → `requirements.txt`에 `scikit-learn==1.5.2` 명시적으로 고정해 해결. (PRD에서 우려했던 "umap-learn↔의존성 버전 문제"가 실제로 발생한 사례.)
- **범위 제외**: LLM이 검색 결과를 근거로 답변을 작성하는 생성(Generation) 단계는 아직 없음(지금은 업로드→색인→목록 조회까지). XLSX 파싱도 아직 없음.
- **주의**: `.env`(UPSTAGE_API_KEY), `data/`, `output/`, `backend/venv`는 `.gitignore`에 등록됨 — 커밋 금지. `rag/api.py`는 인증이 전혀 없는 로컬 전용 서버라 외부에 노출하면 안 됨.

### 그 외 후보 (보류 중)

- AI 채팅 탭 — 지식 탭에 색인된 문서를 근거로 실제 LLM이 답변하는 화면(Generation 단계 필요).
- 다른 사이드바 항목(보고서/에이전트/일정/할 일/메모/설정) 실제 화면 전환.
- 진짜 백엔드(인증 서버 + DB) 설계·구현 — 시작되면 `mockAuth()` 제거.
- 제품명 통일("RS-Ground" vs "Rsa Project" vs 기타).

---

## 8. 사용자(요청자) 작업 방침

- **커뮤니케이션 언어: 한국어.**
- **요청자는 개발 초보자.** 기술적인 내용을 설명할 때는 항상 개념(무엇이고 왜 쓰는지)부터 설명한 뒤 실무 내용(구체적으로 뭘 했는지, 개선점)을 이어서 설명할 것.
- **DEVLOG.md를 작업이 끝날 때마다 갱신할 것.** 기술 스택/구현 기능을 사용자가 나중에 참고할 수 있도록 개념 설명과 함께 기록(사용자가 매번 요청하지 않아도 됨).
- **위험하거나 되돌리기 어려운 작업(강제 push, 커밋 없는 상태에서의 destructive 명령, git 전역 설정 변경 등)은 먼저 확인받을 것.** git 사용자 정보처럼 저장소 로컬 설정이 필요한 경우도 실행 전에 확인.
- 이 `AGENT.md`는 프로젝트 진행과 사용자 요청 내용을 반영해 **적절한 타이밍에 계속 업데이트**할 것(사용자가 매번 지시하지 않아도 됨). 큰 구조 변경, 기능 추가/삭제, 스택 변경, 새 요청 방침이 생기면 갱신하고 상단 "최종 업데이트" 날짜를 바꿀 것.

---

## 9. 변경 이력 (AGENT.md 자체)

- 2026-07-13: **'예산챗' 에이전트 추가.** 기존 설계("에이전트 = category_l1 필터 + 카드") 그대로 확장 — `agentsConfig.js` `AGENTS`에 `{id:'budget', scope:'예산'}` 카드 추가, `ChatPage.jsx` 추천 질문을 scope→목록 맵(`SUGGESTIONS`)으로 구조화하고 '예산' 항목 추가. 백엔드 변경 없음(검색 격리는 Chroma `where={"category_l1":"예산"}` 필터가 자동 처리 — 예산챗은 예산 문서만, 회계챗은 회계 문서만 검색하며 서로 섞이지 않음. 단, scope 없는 전체 AI챗은 설계 의도대로 전 분야 검색). 문서: 예산 교재(348쪽 스캔 PDF)를 회계 때와 동일하게 Upstage OCR(15쪽 배치, $3.48)로 변환해 `data/raw/예산/예산실무_2026_공통교재.md`로 저장·색인(예산 710조각, 전체 1,807조각). 격리 검증 완료(예산/회계 스코프 검색 시 각자 교재에서만 근거 검출). 원본 PDF·OCR 배치 캐시는 `_excluded_docs/`. — 티켓 기반 칸반 보드 구현.** 사용자가 참고 저장소(`claude-code-expert/todo-app`)의 PRD/REQUIREMENTS를 근거로 MVP 범위(FR-001~FR-008)를 제시 → 이 프로젝트 스택(FastAPI+SQLite, Vite+React JS)에 맞춰 [docs/PRD.md](docs/PRD.md) 작성 후 구현. **백엔드**: 신규 `backend/todo/`(`store.py`=SQLite `tickets` 테이블, position은 REAL로 두고 두 카드 사이 삽입 시 `(prev+next)/2`·간격<1이면 1024 간격 재정렬; `api.py`=`POST/GET/PATCH/DELETE /api/todo/tickets[/{id}]` + `PATCH /api/todo/tickets/{id}/move`가 상태·순서 변경과 시작일/종료일 자동화를 함께 처리). `main.py` 라우터 등록 + `auth/api.py` `PROTECTED_PREFIXES`에 `/api/todo` 추가. **프론트**: 신규 `src/ticketApi.js`, `src/pages/workspace/ticketUtils.js`(이번 주 범위·날짜 포맷), `TodosPanel.jsx`를 평면 리스트→칸반 보드로 전면 교체(Backlog 사이드바+3컬럼+상세모달, 네이티브 HTML5 DnD, 신규 라이브러리 없음 — `docs/PRD-Calendar.md`의 "의존성 추가 금지" 컨벤션 계승). `WorkspacePage.jsx`는 더 이상 `useServerState('todos', ...)`를 쓰지 않음(티켓은 전용 백엔드가 진실의 원천). `MeetingPage.jsx`의 액션 아이템 추가 기능도 `appendToStore('todos', ...)`(구 KV 스토어) 대신 `createTicket()`으로 전환. **버그 발견 및 수정**: `vite.config.js`의 dev 프록시가 `/api/auth`·`/api/rag`·`/api/report`·`/api/store`만 명시돼 있고 `/api/meeting`·`/api/study`·`/api/todo`가 누락돼 있었음(CLAUDE.md는 `/api/*` 전체를 프록시한다고 문서화했지만 실제 코드는 기능 추가 때마다 한 줄씩 나열하는 방식이라 계속 빠뜨리기 쉬웠음) → 접두어 하나(`/api`)로 단순화해 근본 수정. 검증: 백엔드 API 5종(생성/조회/수정/삭제/이동, 우선순위·날짜 검증 에러 포함) curl로 직접 확인, Playwright로 로그인→보드 진입→티켓 생성→드래그(Backlog→TODO, 시작일 자동 기록 확인)→상세 모달→삭제까지 전체 플로우 스크린샷 확보, `npm test`(11개) 통과. 검증용으로 만든 임시 계정(`qa_ticket_test`, `qa_ticket_ui`)과 테스트 티켓은 작업 후 정리함. **미구현**: Done 24시간 경과 티켓 자동 삭제, 기존 평면 할 일 데이터 마이그레이션(7장 참고).
- 2026-07-11: **공부 노트 — 노션식 리치 에디터(TipTap) 도입.** 마크다운 textarea+미리보기 → WYSIWYG 리치 에디터로 교체(사용자가 "색·볼드·표" 원함, 큰 라이브러리 도입 수락). **의존성 추가**: TipTap v3(`@tiptap/react`·`pm`·`starter-kit` + `extension-table`(TableKit) + `extension-text-style`(TextStyle/Color) + `extension-highlight`) — `package.json` `latest` 정책과 달리 lockfile로 고정됨. 프론트 신규 `src/pages/study/RichEditor.{jsx,css}`(툴바=굵게·기울임·밑줄·취소선·제목·목록·인용·코드·글자색·형광펜·표 삽입/행·열/삭제, `editable=false`면 읽기전용 뷰로 재사용). `StudyPage.jsx` edit/view가 textarea·`renderMarkdown` 대신 `<RichEditor>` 사용. **저장 형식 마크다운→HTML**(`content`에 HTML 저장). **보안**: 뷰는 `dangerouslySetInnerHTML` 대신 읽기전용 TipTap으로 렌더(ProseMirror가 스키마 밖 태그·스크립트 제거 → XSS 안전). **레거시 호환**: content가 HTML 아니면(`<`로 시작 안 하면) `src/markdown.js`의 `renderMarkdown`으로 1회 변환(파일 유지). 백엔드 `study/store.py`: `study_notes.plain` 컬럼 신규(+PRAGMA 마이그레이션), 저장 시 `_strip_html(content)`로 순수 텍스트 생성, **검색·미리보기·스니펫을 content(HTML) 대신 plain 기준**으로(태그·속성어 `color`/`span` 오탐 방지). `api.py` `CONTENT_LIMIT` 100k→500k(HTML 부피). 검증: 백엔드 실동작(HTML 저장→plain 검색 매칭, `color` 오탐 0건, 표 HTML 보존)·TipTap 명령어 헤드리스 확인(표·색·형광펜 HTML 출력)·build/test(11) 통과. **주의**: StudyPage 청크가 490KB(gzip 152KB)로 커짐(lazy 로드라 /study 방문 시에만). **범위 밖**: 이미지 삽입, 실시간 협업.
- 2026-07-11: **공부 노트 — 분류(카테고리) 먼저 만들기 흐름 추가.** 노트를 만들며 과목을 자유입력하던 방식 → "분류를 먼저 만들고 그 안에서 노트 시작"(노션식)으로 변경. 사용자 확정: 노트는 분류 필수(목록에서 선택), 분류 삭제는 비어 있을 때만. 백엔드: `study_subjects(id,name,created_at)` 표 신규 + `GET/POST /api/study/subjects`·`DELETE /api/study/subjects/{id}`(노트 있으면 409). **라우트 순서 주의**: `/subjects`를 `/{note_id}`보다 먼저 선언(안 그러면 "subjects"를 int로 파싱 시도). 노트 저장 시 subject 필수(빈값 400) + `_ensure_subject`로 분류 자동 등록. 프론트: 목록=분류별 보드(빈 분류 포함)+"분류 추가"+컬럼별 "+노트"+컬럼 삭제, 편집=과목 자유입력 → 분류 선택 드롭다운. 검증: 분류 CRUD·삭제 규칙·라우트 충돌·필수분류 백엔드 통과, build/test(11) 통과.
- 2026-07-11: **공부 노트 도구로 방향 전환 + 재구현(AI 미사용).** 처음엔 "공부 정리 에이전트"(Claude가 요약·마인드맵 생성, 아래 이력 참고)로 1차 구현했으나, 사용자가 목적을 "시험용 정리가 아니라 노션처럼 내 지식을 모아두는 도구 — 에디터로 쓰거나 파일 넣고 / 분류해 저장 / 검색해 찾기"로 재정의. **Claude·임베딩을 전부 제거**하고 `backend/study/` + `src/pages/study/`를 "노트 CRUD + 파일 첨부 + 키워드 검색"으로 개조. AI 키가 필요 없어 로컬에서 end-to-end 실검증 완료(회의록·기존 study는 유효 키가 없어 로컬 검증 불가였던 것과 대비). 확정 사항(사용자 선택): 마크다운 에디터+실시간 미리보기(경량 파서 `src/markdown.js` 직접 구현, 외부 라이브러리 없음), 파일은 원본 보관+텍스트 추출해 검색, 과목(단일)+태그(다중) 2단 분류, 과목별 보드 뷰(노션 참고). 백엔드: `study/analyzer.py` **삭제**, `store.py`=`study_notes(id,title,subject,tags,content(md),created_at,updated_at)` + `study_files(id,note_id,filename,stored_name,size,extracted_text,created_at)` 표(첨부 원본은 `config.DATA_DIR/study_files/`, 저장명은 `{note_id}_{uuid}`로 **서버 생성**→경로 탈출 차단), `search_notes`=제목·본문·태그·첨부텍스트 LIKE 검색, api=`GET /api/study?q=`(목록/검색)·`GET/POST/PUT/DELETE /api/study[/{id}]`·`POST /api/study/{id}/files`·`GET/DELETE /api/study/files/{fid}`(다운로드는 octet-stream+RFC5987 파일명). `extractors.py`·`security.py`(`MAX_STUDY_UPLOAD_BYTES`)·`main.py`·`PROTECTED_PREFIXES`는 유지. 프론트: `markdown.js`(escape 먼저→서식 변환, XSS 안전), `studyApi.js`(CRUD/검색/파일, 다운로드는 fetch+authHeaders→blob), `StudyPage.jsx`(list=검색창+과목 보드 / edit=마크다운 2단(입력·미리보기)+과목·태그 datalist+파일 첨부 / view=렌더+첨부 다운로드), `agentsConfig` 카드 문구 "공부 노트"로 변경. 검증: 백엔드 로그인 토큰으로 생성→수정→검색(본문·태그·첨부내용 3종)→첨부·다운로드(바이트 일치)→경로탈출 차단→삭제(디스크 정리) 전부 통과, 마크다운 XSS/인용문 확인, build/test(11) 통과. **범위 밖: 퀴즈/용어집/복습일정, 리치 WYSIWYG 에디터, 임베딩(semantic) 검색.**
- 2026-07-11: **[구버전 — 위 항목으로 대체됨] 공부 정리 에이전트(AI판) 1차.** Claude 1회 분석으로 요약·핵심포인트·마인드맵·과목·태그 생성(`output_config.format` JSON 스키마 강제, 회의록 패턴 복제). 같은 날 사용자 목적 재정의로 AI를 걷어내고 위 "공부 노트 도구"로 재구현함(analyzer.py 삭제, MindMap import 제거). 기록만 남김.
- 2026-07-10: **회의록 정리 에이전트 1차(코어) 구현.** 회의 전문(텍스트) → Claude 1회 분석 → 마인드맵(순수 SVG 3단계)·용어 설명·액션 아이템·일정 후보. 백엔드 신규 `backend/meeting/`(analyzer=Claude+`output_config.format` JSON 스키마 강제·`claude-sonnet-5`·전문 3만 자·fallback 없음, store=`meetings` 표 `config.DATA_DIR/app.db`, api=`POST /api/meeting/analyze`·`GET /api/meeting`·`GET/DELETE /api/meeting/{id}`). `main.py` 라우터 연결 + `auth/api.py` `PROTECTED_PREFIXES`에 `/api/meeting` 추가(보호). 프론트 신규 `meetingApi.js`·`pages/meeting/{MeetingPage,MindMap}.jsx`, `App.jsx` `/meeting` 라우트, `AppLayout` NO_TOPBAR 추가, `agentsConfig.APP_AGENTS`+`AgentsPage` 카드. ① 일정 연동: `schedule_items`/액션→`/api/store/{events,todos}` append(워크스페이스 데이터 모양 그대로). 검증: build/test(11)·백엔드 로드·스키마 오프라인 검증 통과. 실제 Claude 분석은 배포 서버(유효 키)에서 테스트 예정(로컬 키는 재발급 전 옛 키라 401). PRD-Meeting.md 참고. **2·3차(회의챗·hwpx·진행추적·용어집·PNG)는 미구현.**
- 2026-07-10: **인터넷 배포 완료 + 관련 수정.** 백엔드 Render(`rs-ground-api.onrender.com`, Starter/영구디스크 `/var/data`), 프론트 Vercel(`rs-ground.vercel.app`). 배포하며 나온 이슈들 해결: ① 워크스페이스 저장 DB(`store/api.py`)를 하드코딩 경로→`config.DATA_DIR/app.db`로 바꿔 영구 디스크에 저장(재배포에도 일정·할 일·메모 유지, auth와 같은 파일). ② **보안 하드닝**(별도 커밋 `Apply backend security hardening`, 외부 작업): `backend/security.py` 추가 — `TrustedHostMiddleware`(허용 호스트 env `RSG_ALLOWED_HOSTS`, **미설정 시 모든 요청 400** 주의), body 크기 제한, 보안 헤더, 입력 길이 검증, 세션 토큰 해시·TTL(`RSG_SESSION_TTL_DAYS`). ③ **임베딩 지도(UMAP) 기능 제거** — 512MB에서 UMAP 계산이 OOM(특히 실행 중 `POST /api/rag/umap`는 서버 다운 위험). 프론트 `EmbeddingMap.jsx`·지도 UI, 백엔드 umap 엔드포인트·`visualize.py`·config의 UMAP/VIZ 경로, `requirements`의 umap-learn/scikit-learn/plotly 삭제. 지식 탭은 문서 목록만. ④ 색인을 배치(200개)로 나눠 처리해 메모리 절감(`rag.pipeline`). 배포 환경변수: Render=`ANTHROPIC_API_KEY`/`UPSTAGE_API_KEY`/`FRONTEND_ORIGINS`/`RSG_ALLOWED_HOSTS`/`RSG_DATA_DIR`, Vercel=`VITE_API_BASE`. 상세 절차는 `docs/DEPLOY.md`.
- 2026-07-10: **배포 준비 5단계 — 로그인 완성.** 사람별 계정(아이디+비번) 로그인 구현. 백엔드 신규 `backend/auth/`(store=SQLite users/sessions + pbkdf2 해시, api=login/logout/me 라우터 + `AuthMiddleware` 문지기 + `require_user`, manage=계정 CLI, 의존성 0). `main.py`에 라우터·미들웨어 연결. 프론트: `apiBase.js`에 토큰 보관/`authHeaders()` 추가, `api.js`가 로그인 시 토큰 저장·요청마다 지참·401 시 토큰 삭제, 나머지 3 api 파일 fetch에 토큰 병합, `vite.config.js` mockAuth 제거+`/api/auth` 프록시. 쿠키 대신 토큰-헤더(다른 출처 대응). 검증: build/test(11) 통과 + 실서버·실계정(admin) end-to-end(로그인→토큰→보호 API 200, 무토큰 401). DEPLOY.md 경고 갱신. 상세 DEVLOG 2026-07-10. **다음: 6단계 실제 배포.**
- 2026-07-10: **배포 준비 1·2단계(진행 중).** 인터넷 배포 계획 수립 — 화면=Vercel, 백엔드=Render(영구 디스크). 임베딩 데이터는 옮기지 않고 서버에서 `python -m rag.pipeline index`로 재색인(원본 `data/raw`만 git에 있고 작음). ① 프론트 백엔드 주소를 `src/apiBase.js`의 `API_BASE`(=`import.meta.env.VITE_API_BASE`)로 스위치화, `/api`를 부르는 4파일이 이를 앞에 붙임(dev에선 빈 값이라 기존과 동일). ② CORS 허용 목록을 `rag/config.py`의 `allowed_origins()`로 통일 — 기본 localhost + 환경변수 `FRONTEND_ORIGINS`. `allow_credentials=True` 추가. 검증: `npm run build`/`npm test`(11개) 통과, 백엔드 앱 로드 정상. **남은 단계**: 3=render.yaml+영구디스크, 4=docs/DEPLOY.md, 5=로그인(현재 `mockAuth`는 dev 전용→배포 시 사라짐, 최소 잠금 필요), 6=GitHub 연결 자동배포. 상세는 DEVLOG 2026-07-10 참고.
- 2026-07-08: **보고서 탭 실제 구현.** `backend/report/` 패키지 신규(hwpx 조립 엔진 + Claude API 본문 생성 + 참고파일 추출 + FastAPI 라우터, 전부 표준 라이브러리 — 의존성 추가 없음), `backend/main.py`(rag+report 통합 진입점, 실행 명령 `uvicorn main:app`으로 변경), 프론트 `ReportsPage.jsx`+`reportApi.js` 추가, `/reports` 라우트·다크 배경·`/api/report` 프록시 연결. 서식은 "hwpx+지침 md 세트" 규약(`backend/report/templates/`), 지침은 3계층(기본<공통<서식)으로 AI 프롬프트에 주입. 엔진은 업무 PC에서 오프라인 검증 완료, FastAPI 실행 검증은 개발 PC 몫. `검토보고서.hwpx`는 업무 PC DRM 감염으로 이번에 제외(지침 md만 포함 — DRM 없는 hwpx를 templates에 넣으면 자동 등록).
- 2026-07-07 (이어서 6): 문서 업로드 지원 형식을 PDF/DOCX/HWPX까지 확장(`backend/rag/extractors.py` 신규). HWPX는 한글 프로그램 없이 순수 Python(zip+XML)으로 파싱하도록 구현해 서버 안정성 확보. 이 컴퓨터의 한글 프로그램으로 실제 테스트 샘플(hwpx/docx/pdf)을 만들어 추출 결과를 검증하고, CLI·업로드 API 양쪽에서 실제 파일로 재검증.
- 2026-07-07 (이어서 5): **지식 탭 실제 구현.** `backend/rag/api.py`(FastAPI) 신규 추가로 RAG 파이프라인을 웹에서 쓸 수 있게 열고, `src/pages/knowledge/KnowledgePage.jsx`에서 문서 업로드(.txt/.md, 분류 입력) + 색인 문서 목록 화면 구현. Vite에 `/api/rag` 프록시 추가(`vite.config.js`), `AppLayout.jsx`의 `NO_TOPBAR_PATHS`에 `/knowledge` 추가해 로그인 화면과 같은 검정 배경 적용. 사용자가 제시한 5색 브랜드 팔레트(보라/초록/오렌지/노랑/파랑, 로그인 화면 아이콘 색과 거의 동일)를 `.kb` 스코프 CSS 변수로 반영하되, 실제로는 blue(정보/카테고리 배지)·green(색인 완료 배지) 두 역할만 지금 화면에 필요한 만큼 적용(5색을 전부 남용하지 않음). curl 테스트 중 한글 파일명이 깨지는 걸 발견했는데 curl 자체의 인코딩 문제로 확인(Python `requests`로는 정상) — 실제 브라우저 업로드(FormData)는 영향 없음. 업로드 시마다 `data/raw/` 전체를 재색인하는 방식이라 지금 규모에선 API 비용 걱정 없음(임베딩 캐시가 계속 막아줌).
- 2026-07-07 (이어서 4): 사용자가 업스테이지 API 키를 `backend/.env`에 설정 → 전체 파이프라인(`index`/`search`)을 실제 API로 끝까지 실행해 PRD 성공 기준 전부 충족 확인. `umap-learn`↔`scikit-learn` 버전 충돌 발견해 `scikit-learn==1.5.2` 고정으로 수정.
- 2026-07-07 (이어서 3): 코드 리뷰로 발견된 버그 2건 수정 — ① `chunker.py`에 하드 스플릿 안전장치 추가(마침표 없는 문단이 chunk_size를 한없이 초과하던 문제, 실제 테스트 문서에서 최대 1246자 발생 확인 후 수정), ② `store.py`에 `reset_collection()` 추가해 재색인 시 삭제·축소된 문서의 오래된 청크가 남지 않게 함.
- 2026-07-07 (이어서 2): `chunker.py`/`store.py`/`pipeline.py`에 폴더 계층 기반 대/중/소분류(`category_l1/l2/l3`) 메타데이터와 검색 필터(`--l1/--l2/--l3`) 추가. 문서는 미리 분류하지 않고 폴더 정리만으로 분류 정보가 따라오게 하는 방식으로 결정.
- 2026-07-07 (이어서): RAG 파이프라인 코드 구현(`backend/rag/`) 완료. Python 3.11.9 venv, 청킹/임베딩 캐시/ChromaDB/UMAP+Plotly/CLI 전 모듈 작성. API 키 없이 가능한 범위(청킹, ChromaDB 컬렉션 생성)까지 검증, 실제 임베딩 호출은 업스테이지 API 키 필요.
- 2026-07-07: 다음 단계로 RAG 파이프라인 확정을 반영. 스택 검증(업스테이지 임베딩/ChromaDB/UMAP/Plotly) 결과와 상세 설계를 `docs/PRD-RAG.md`로 분리 작성하고, 7장을 "다음 단계 후보"에서 "다음 단계: RAG"로 갱신.
- 2026-07-05: 최초 작성. `RSA Personal Agent`를 전면 재구축하기로 하면서 실제 작업 저장소를 `RS-Ground`로 새로 시작한 배경, 로그인+대시보드 프론트 구현, 가드/404/오류화면/lazy loading/접근성/테스트 보완, 개발용 가짜 로그인 추가까지의 현재 상태를 정리.
