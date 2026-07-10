# 배포 가이드 (DEPLOY.md)

이 문서는 RS-Ground를 인터넷에 올려 팀원이 접속하게 만드는 절차를 **초보자 눈높이**로 정리한 것이다.
한 번 세팅해두면, 그 뒤로는 `git push`만 해도 자동으로 새 버전이 배포된다.

> ✅ **로그인(문) 구현됨 — 배포 후 계정을 꼭 만들 것.**
> 이제 진짜 로그인 시스템이 있다(아이디+비밀번호, 사람별 계정). 백엔드가 출입증(토큰) 없는
> 요청을 401로 막으므로, 계정이 없으면 아무도 API를 못 쓴다(비용 보호됨).
> 단, **공개 회원가입은 없다.** 배포 후 아래 6절처럼 `python -m auth.manage add`로 팀원 계정을
> 직접 만들어야 로그인할 수 있다. 계정을 하나도 안 만들면 아무도 못 들어간다(그만큼 안전).

---

## 1. 전체 그림

```
[팀원 브라우저]
      │
      ▼
[화면 = 프론트엔드]  ──API 요청──▶  [두뇌 = 백엔드]
 Vercel (무료)                       Render (유료 소액, 영구 디스크)
 React 정적 빌드                     FastAPI + ChromaDB(벡터DB)
 env: VITE_API_BASE                  env: ANTHROPIC_API_KEY, UPSTAGE_API_KEY,
                                          FRONTEND_ORIGINS, RSG_ALLOWED_HOSTS, RSG_DATA_DIR
```

- **화면(Vercel)**: 그냥 HTML/JS 파일 덩어리라 무료로 올린다.
- **두뇌(Render)**: 파이썬 서버 + 벡터DB. 24시간 돌아야 하고 데이터를 디스크에 저장해야 해서 유료(소액).

---

## 2. 준비물

- GitHub에 이 저장소가 올라가 있을 것 (`github.com/1212krs/RS-Ground`).
- API 키 2개:
  - `ANTHROPIC_API_KEY` — Claude(채팅·보고서 생성)
  - `UPSTAGE_API_KEY` — 임베딩(문서 벡터화, 재색인에 필요)
- Render 계정, Vercel 계정 (둘 다 GitHub로 가입 가능).

---

## 3. 백엔드 배포 (Render)

1. Render 대시보드 → **New +** → **Blueprint** 선택.
2. 이 GitHub 저장소를 연결하면 루트의 [`render.yaml`](../render.yaml)을 자동으로 읽어 서비스를 구성한다.
3. **환경변수(비밀 키) 입력** — `render.yaml`에서 `sync: false`로 둔 값들은 대시보드에서 직접 넣어야 한다:
   - `ANTHROPIC_API_KEY` = (내 Claude 키)
   - `UPSTAGE_API_KEY` = (내 Upstage 키)
   - `FRONTEND_ORIGINS` = 아직 비워둠 (4번에서 Vercel 주소가 정해지면 채운다)
4. 배포를 시작하면 라이브러리 설치(chromadb 등, 몇 분 소요) 후 서버가 뜬다.
   배포 주소가 생긴다. 예: `https://rs-ground-api.onrender.com` → 이 주소를 적어둔다.
   - ⚠️ **곧바로 `RSG_ALLOWED_HOSTS`도 입력**한다: 이 주소의 **호스트만**(예:
     `rs-ground-api.onrender.com`, `https://`·`/` 없이). 이 값이 없으면 보안 미들웨어
     (TrustedHostMiddleware)가 **모든 요청을 400으로 막아** 로그인조차 안 된다. Save→재배포.
5. **첫 재색인(벡터DB 만들기)** — 이 시점의 서버에는 아직 벡터DB가 비어 있다. 원본 문서(`data/raw`,
   git에 포함됨)로 벡터DB를 만들어야 한다. Render 서비스의 **Shell** 탭에서 한 번 실행:
   ```bash
   python -m rag.pipeline index
   ```
   - `data/raw`의 문서를 청킹→임베딩→ChromaDB 저장한다. (Upstage 임베딩 비용이 조금 발생)
   - 결과는 영구 디스크(`/var/data`)에 저장되어 재배포해도 유지된다.
   - 이 명령은 **문서를 새로 추가했을 때만** 다시 실행한다(코드 배포 때마다 하지 않는다 — 비용/시간 낭비).
6. **로그인 계정 만들기** — 같은 **Shell** 탭에서 팀원 계정을 만든다(공개 회원가입은 없다):
   ```bash
   python -m auth.manage add <아이디> <비밀번호> "<표시이름>"
   python -m auth.manage list        # 만든 계정 확인
   ```
   - 계정 정보(users)와 워크스페이스 데이터는 영구 디스크의 `app.db`에 저장되어 재배포해도 유지된다.
   - 비밀번호 변경: `python -m auth.manage passwd <아이디> <새 비번>`, 삭제: `... delete <아이디>`.

---

## 4. 프론트엔드 배포 (Vercel)

1. Vercel 대시보드 → **Add New → Project** → 이 GitHub 저장소를 Import.
2. Vercel이 Vite 프로젝트를 자동 인식한다(Build: `npm run build`, Output: `dist`). 루트의
   [`vercel.json`](../vercel.json)이 화면 주소(react-router) 새로고침 시 404를 막아준다.
3. **환경변수 입력**:
   - `VITE_API_BASE` = 3번에서 적어둔 Render 백엔드 주소 (예: `https://rs-ground-api.onrender.com`)
     - ⚠️ 끝에 슬래시(`/`)를 붙이지 말 것.
4. Deploy. 배포되면 화면 주소가 생긴다. 예: `https://rs-ground.vercel.app` → 이 주소를 적어둔다.

---

## 5. 둘을 연결 (CORS 허용)

프론트(Vercel)와 백엔드(Render)는 주소가 다르므로, 백엔드가 프론트를 "친구 명단"에 넣어야
브라우저가 요청을 막지 않는다(CORS).

1. Render 대시보드 → 이 서비스 → 환경변수 → `FRONTEND_ORIGINS`에 4번의 Vercel 주소를 입력.
   예: `https://rs-ground.vercel.app`  (여러 개면 콤마로 구분)
2. 저장하면 Render가 자동 재배포된다. 이제 화면 ↔ 두뇌가 서로 대화할 수 있다.

여기까지 하면 팀원이 Vercel 주소로 접속해 앱을 쓸 수 있다(로그인 문제는 맨 위 경고 참고).

---

## 6. 이후의 개발 흐름 (한 번 세팅한 뒤로는 이게 전부)

- **코드 수정**: 그냥 `git push` → Vercel·Render가 **자동으로** 새 버전 배포. 신경 쓸 것 없음.
- **문서 추가/변경**: 새 문서를 `data/raw/`에 넣고 `git push` → Render **Shell**에서
  `python -m rag.pipeline index` 한 번 실행(벡터DB 갱신). 코드 배포와 분리된 수동 단계다.
- **아무것도 안 바꿈**: 벡터DB는 영구 디스크에 그대로 유지된다.

> 참고: 웹 화면의 문서 업로드 기능으로 올린 파일은 서버에서 **임시**다(재배포 시 사라짐).
> 문서를 영구히 추가하려면 위처럼 `data/raw`에 넣고 git으로 올린 뒤 재색인하는 방식을 쓴다.

---

## 7. 환경변수 정리

| 이름 | 어디에 | 무엇 | 예시 |
|------|--------|------|------|
| `ANTHROPIC_API_KEY` | Render | Claude 키(채팅·보고서) | `sk-ant-...` |
| `UPSTAGE_API_KEY` | Render | 임베딩 키(재색인용) | `up_...` |
| `FRONTEND_ORIGINS` | Render | CORS 허용할 프론트 주소 | `https://rs-ground.vercel.app` |
| `RSG_ALLOWED_HOSTS` | Render | **응답할 호스트(도메인)**. 없으면 모든 요청 400 | `rs-ground-api.onrender.com` |
| `RSG_DATA_DIR` | Render | 생성 데이터 저장 경로(영구 디스크) | `/var/data` (render.yaml에 이미 지정됨) |
| `PYTHON_VERSION` | Render | 파이썬 버전 | `3.11.9` (render.yaml에 이미 지정됨) |
| `VITE_API_BASE` | Vercel | 프론트가 부를 백엔드 주소 | `https://rs-ground-api.onrender.com` |

> 참고: `RSG_ALLOWED_HOSTS`(응답할 도메인)와 `FRONTEND_ORIGINS`(CORS 허용 출처)는 다른 것이다.
> 전자는 "이 주소로 온 요청에 답한다", 후자는 "이 화면(브라우저)의 요청을 허용한다". 둘 다 필요하다.

로컬(내 PC) 개발에서는 위 배포용 변수들이 **없어도** 지금까지와 똑같이 동작한다
(백엔드는 `backend/.env`의 API 키만 사용).

---

## 8. 현재 상태 / 운영 메모

- **배포 완료(2026-07-10):** 백엔드(Render, `https://rs-ground-api.onrender.com`) + 프론트(Vercel,
  `https://rs-ground.vercel.app`) 연결·로그인·재색인까지 동작. 이후 `git push`가 곧 자동배포.
- **임베딩 지도(UMAP) 기능은 제거됨** — Render Starter(512MB) 메모리로는 UMAP 계산이 OOM을
  내서 뺐다. 지식 탭은 문서 목록만 보여준다. 채팅·검색·보고서·워크스페이스는 영향 없음.
- **메모리 주의:** 512MB에서는 무거운 계산(대량 임베딩 등)이 OOM을 낼 수 있다. 재색인은 배치로
  나눠 처리하도록 되어 있어 현재 문서량은 문제없다. 문서가 크게 늘면 인스턴스 메모리 상향 고려.
- **AI 답변(Claude) 문제 시:** 채팅이 "근거만" 나오면 `ANTHROPIC_API_KEY`가 백엔드에 제대로
  전달됐는지 확인. Render **Logs**에 `[chat] LLM 미사용(...)` 줄로 실패 원인이 찍힌다
  (HTTP 401=키 오류, HTTP 404=모델 이름 문제 등).
- 세부 진행 기록은 `DEVLOG.md`(2026-07-10 항목들)와 `AGENT.md` 참고.
