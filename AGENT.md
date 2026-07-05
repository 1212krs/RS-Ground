# AGENT.md

이 파일은 에이전트(Claude)가 이 프로젝트에서 작업할 때 참고하는 상시 문서입니다.
사실만 기록하며, 아직 구현되지 않은 것은 "미구현/계획"으로 명시합니다.

- **최초 작성**: 2026-07-05
- **최종 업데이트**: 2026-07-05
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

- **로그인은 현재 가짜(mock)다.** `vite.config.js`의 `mockAuth()` 플러그인이 dev 서버에서만 동작하며, 아이디/비밀번호를 실제로 검사하지 않고 무조건 로그인에 성공시킨다(쿠키 `rsg_mock_session` 발급). **진짜 백엔드가 생기면 이 플러그인을 통째로 지우고** `server.proxy`에 실제 백엔드 주소를 연결할 것.
- 이 mock은 `vite build` 결과물(정적 파일)에는 포함되지 않는다(Vite `configureServer` 훅은 dev 전용).
- 포트를 5173으로 고정한 이유: 포트가 바뀌면 origin이 달라져 `localStorage` 데이터(할 일/메모)가 분리되어 사라진 것처럼 보이기 때문.

---

## 4. 코드 구조 (검증됨, 2026-07-05 기준)

```
src/
  main.jsx                        React 진입점. ErrorBoundary → BrowserRouter → AuthProvider → App 순서로 감쌈
  App.jsx                         라우트 정의 (React.lazy + Suspense로 페이지별 지연 로딩)
  api.js / utils.js / data.js     서버 요청 함수 / 공용 유틸(uid) / 데모 데이터(할 일·일정)
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
    dashboard/DashboardPage.jsx    홈(캘린더/할 일/메모) — 유일하게 실제 완성된 보호 페이지
    coming-soon/ComingSoonPage.jsx 미완성 사이드바 항목용 공용 자리표시자
    not-found/NotFoundPage.jsx     알 수 없는 주소(`*`) 처리
  hooks/useStoredState.js          localStorage 동기화 state 훅
  test/setup.js                   vitest용 jest-dom matcher 등록
vite.config.js                    react() + mockAuth()(dev 전용 가짜 인증) + vitest 설정
```

- **라우트 구성**(`App.jsx`): `/login`(공개) · `/`(보호, `DashboardPage`) · `PENDING_NAV`에 나열된 경로(`/knowledge`, `/chat`, `/reports`, `/agents`, `/calendar`, `/todos`, `/memos`, `/settings`, 전부 보호)는 `ComingSoonPage`로 연결 · `*`는 `NotFoundPage`.
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

---

## 6. 중요한 한계 / 미구현 (사실 기반)

- **백엔드가 전혀 없다.** DB, 실제 인증, 문서 저장소 모두 미구현. `vite.config.js`의 `mockAuth()`는 비밀번호를 검사하지 않는 개발용 임시 장치이며 실제 보안이 아니다.
- 지식/AI 채팅/보고서/에이전트/일정/할 일(전체 화면)/메모(전체 화면)/설정 — 전부 `ComingSoonPage` 자리표시자만 있고 실제 화면 없음.
- 문서 업로드·파싱(PDF/HWPX/XLSX 등) 기능 자체가 아직 없음(관련 라이브러리도 설치 안 함).
- 접근성 점검은 자동 검사 수준(아이콘 버튼 `aria-label`)만 했고, 스크린리더 수동 청취·전체 키보드 탭 순서 감사는 하지 않음.
- 테스트는 스모크 테스트 3개뿐. 컴포넌트 단위 테스트, 대시보드 상호작용(할 일 토글, 메모 저장) 테스트는 없음.
- `package.json` 의존성이 대부분 `latest` → 빌드 재현성 위험(버전 고정 권장, `RSA Personal Agent`와 동일한 이슈).
- 사이드바 표기가 "Rsa Project"로 남아있음(제품명 정리 필요).
- `RS-Ground` 폴더에 이 세션에서 생성하지 않은 `gonggong_hwpxskills-main/`(한글 문서 처리 관련 Skill로 추정) 폴더가 존재하며, git에는 추가하지 않고 커밋 대상에서 제외해둔 상태(사용자 확인 대기).

---

## 7. 다음 단계 후보 (아직 결정 안 됨, 사용자와 논의 필요)

- 사이드바 항목 중 하나를 골라 실제 화면으로 전환(추천 순서: 지식 → AI 채팅 → 보고서 → 에이전트 → 일정/할 일/메모 개별 화면 → 설정).
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

- 2026-07-05: 최초 작성. `RSA Personal Agent`를 전면 재구축하기로 하면서 실제 작업 저장소를 `RS-Ground`로 새로 시작한 배경, 로그인+대시보드 프론트 구현, 가드/404/오류화면/lazy loading/접근성/테스트 보완, 개발용 가짜 로그인 추가까지의 현재 상태를 정리.
