# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read AGENT.md first

**[AGENT.md](AGENT.md)** is the authoritative, continuously-updated project doc (in Korean) — read it at the start of every session before making changes. It tracks what's actually implemented vs. planned, architecture, and decision history. Update it after nontrivial changes (new features, stack changes, structural changes), including bumping the "최종 업데이트" date at the top.

Also update **[DEVLOG.md](DEVLOG.md)** after every completed task — write it beginner-friendly (concept explained before implementation detail), since the user is new to software development.

## Project overview

RS-Ground (`rs-ground`, v0.1.0) is a personal work platform frontend+backend: document RAG-based chat, AI-generated reports, a meeting-notes agent, and dashboard (calendar/todos/memos). It's a from-scratch rebuild of the earlier `RSA Personal Agent` project, built incrementally feature-by-feature.

- Frontend: Vite + React (JS/JSX, no TypeScript), `react-router-dom`, plain CSS (one `.css` file per component/page — no Tailwind).
- Backend: Python FastAPI (`backend/`), SQLite for auth/store/meeting data, ChromaDB for RAG vector storage.
- Deployed: frontend on Vercel, backend on Render (with persistent disk).

## Commands

```powershell
npm.cmd install
npm.cmd run dev      # frontend dev server, http://127.0.0.1:5173 (port fixed via strictPort — changing it splits localStorage data)
npm.cmd run build    # production build
npm.cmd run preview  # preview the build
npm.cmd run test     # vitest run (all tests, single run)
```

Backend (needed for knowledge/reports/chat/meeting/auth tabs — dev frontend alone is not enough):

```powershell
cd backend
./venv/Scripts/python.exe -m uvicorn main:app --reload --port 8000
```

`backend/main.py` is the combined entrypoint (auth + rag + report + meeting + store routers). Vite proxies `/api/*` to `127.0.0.1:8000` (see `vite.config.js`).

Account management (no public signup — accounts are created via CLI):

```powershell
cd backend && ./venv/Scripts/python.exe -m auth.manage add <id> <password> "<display name>"
```

Report/RAG generation needs `ANTHROPIC_API_KEY` / `UPSTAGE_API_KEY` in `backend/.env` (see `backend/.env.example`); without them, RAG chat falls back to evidence-only and report generation falls back to a rule-based composer.

## Architecture

### Frontend (`src/`)

- `main.jsx` → `ErrorBoundary` → `BrowserRouter` → `AuthProvider` → `App`.
- `App.jsx` defines all routes with `React.lazy` + `Suspense` per page.
- `context/AuthContext.jsx` — global auth state; re-validates via `/api/auth/me` on mount (token-header auth, not cookies — required for cross-origin deploy).
- `layouts/AppLayout.jsx` + `navConfig.js` — shared sidebar/topbar shell; `NAV_ITEMS`/`PENDING_NAV` define sidebar entries and which routes are still placeholder (`ComingSoonPage`). `NO_TOPBAR_PATHS` in `AppLayout.jsx` controls which pages get the dark full-bleed background.
- `pages/<feature>/` — one folder per screen, each with its own CSS scope class (e.g. `.oa` dashboard, `.kb` knowledge, `.rp` reports, `.ai` chat, `.ag` agents) defining its own dark-palette CSS variables.
- `*Api.js` files (`api.js`, `ragApi.js`, `reportApi.js`, `meetingApi.js`) — one per backend feature area, all going through `apiBase.js` for the base URL + auth headers.
- `hooks/useStoredState.js` — localStorage-synced state hook (dashboard todos/memos).

**Adding a new screen**: remove the route from `PENDING_NAV` in `navConfig.js` → build `pages/<name>/` → add a `<Route>` + `lazy(() => import(...))` in `App.jsx`.

### Backend (`backend/`)

Each feature is an isolated package with its own `store.py` (SQLite or ChromaDB persistence), `api.py` (FastAPI `APIRouter`), and business logic module, wired together in `main.py`:

- `auth/` — SQLite users/sessions (pbkdf2 hashes), token-header login/logout/me, `AuthMiddleware` gate (protects `/api/rag`, `/api/report`, `/api/store`, `/api/meeting`), `manage.py` CLI for account creation.
- `rag/` — RAG pipeline: `chunker.py` (paragraph-based chunking, folder-hierarchy → category_l1/l2/l3), `embedder.py` (Upstage embeddings + SQLite cache, passage/query models differ), `store.py` (ChromaDB, cosine, deterministic `{source}::{chunk_index}` IDs), `chat.py` (query → retrieval → Claude answer, evidence-only fallback without API key), `extractors.py` (txt/md/pdf/docx/hwpx text extraction — hwpx parsed as zip+XML, no external Hangul program dependency), `api.py` (upload/list/chat endpoints), `pipeline.py` (CLI for batch indexing/search).
- `report/` — hwpx report generation: `engine.py` (marker substitution/assembly, stdlib only), `composer.py` (Claude-based body generation with 3-layer instructions: base < common < template-specific, plus rule-based fallback), `extractors.py` (reference-file text extraction), `templates/` (each template is an `.hwpx` + matching `.md` instructions file pair — adding a template requires no code change).
- `meeting/` — meeting-notes agent: `analyzer.py` (single Claude call, JSON-schema-enforced output: mindmap + terms + action items + schedule candidates, no fallback), `store.py` (SQLite `meetings` table), `api.py`.
- `store/` — generic workspace data persistence (events/todos/memos) used by the dashboard and cross-feature integrations (e.g. meeting action items appending to todos/events).
- `security.py` — `TrustedHostMiddleware` (requires `RSG_ALLOWED_HOSTS` env — unset means all requests get 400), body size limits, security headers, input validation.

All backend feature dirs share one `venv` (`backend/venv`, Python 3.11.9) and one `requirements.txt` with pinned versions.

## Known constraints (see AGENT.md §6 for full, current list)

- Dependencies in `package.json` are mostly pinned to `latest` — reproducibility risk, not yet fixed.
- Test coverage is minimal (smoke tests only, `npm test`).
- Several sidebar sections (calendar, todos, memos, settings full pages) are still `ComingSoonPage` placeholders.
- Chat/report AI features degrade gracefully (evidence-only / rule-based) without API keys, rather than failing.
