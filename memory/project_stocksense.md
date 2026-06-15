---
name: stocksense-web-app
description: StockSense AI full-stack web application built in June 2025
metadata:
  type: project
---

Built a complete full-stack StockSense AI web app (separate from the existing Electron app in /stocksense/).

**Location:** `/c/Users/samte/stocksense-ai/frontend` (Next.js) and `/c/Users/samte/stocksense-ai/backend` (Express)

**Why:** User requested a full web app with Vercel/Railway deployment replacing the Electron desktop app.

**Stack:**
- Frontend: Next.js 16 (App Router), Tailwind, Recharts, Tabler icons, Sonner toasts
- Backend: Express + TypeScript, Yahoo Finance, Finnhub, Anthropic SDK
- DB: Supabase (PostgreSQL + Realtime)
- AI: claude-haiku-4-5-20251001

**Key files:**
- `supabase/schema.sql` — full DB schema with RLS policies
- `frontend/lib/api.ts` — all backend API calls including SSE streaming
- `backend/src/services/claude.ts` — all AI functions including streaming chat
- `.github/workflows/deploy.yml` — CI/CD to Vercel + Railway

**How to apply:** When working on this project, the two apps coexist — the Electron app in `/stocksense/` is separate from the web app in `/frontend/` and `/backend/`.
