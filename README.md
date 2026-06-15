# Fennec SI

AI-powered stock portfolio tracker for NZ, ASX & US markets.

## Stack
- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS — deploy to Vercel
- **Backend**: Node.js + Express + TypeScript — deploy to Railway
- **Database**: Supabase (PostgreSQL + Realtime)
- **Auth**: Supabase Auth (Google OAuth + magic link)
- **AI**: Anthropic Claude API (claude-haiku-4-5-20251001)
- **Stock data**: Yahoo Finance (via backend proxy)
- **News**: Finnhub API
- **Email**: Resend

## Quick start

### 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com)
2. In the SQL editor, run `supabase/schema.sql`
3. Enable Google OAuth in Authentication → Providers
4. Enable Realtime for the `posts` table

### 2. Backend

```bash
cd backend
cp .env.example .env
# Fill in your keys in .env
npm install
npm run dev       # localhost:4000
```

**Required env vars (backend/.env):**
```
PORT=4000
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
ANTHROPIC_API_KEY=sk-ant-...
FINNHUB_API_KEY=your-key
RESEND_API_KEY=re_...
ALLOWED_ORIGINS=http://localhost:3000
```

### 3. Frontend

```bash
cd frontend
cp .env.local.example .env.local
# Fill in your Supabase URL and anon key, and the backend URL
npm install
npm run dev       # localhost:3000
```

**Required env vars (frontend/.env.local):**
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:4000
```

## Deployment

### Vercel (frontend)

```bash
# Install Vercel CLI
npm i -g vercel
cd frontend
vercel
# Set the same env vars in Vercel dashboard
```

### Railway (backend)

1. Create a new Railway project
2. Connect your GitHub repo
3. Set root directory to `backend`
4. Add env vars in Railway dashboard
5. Railway auto-detects the Dockerfile

### GitHub Actions CI/CD

Add these secrets to your GitHub repo:
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
- `RAILWAY_TOKEN`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`

Pushes to `main` automatically deploy both services.

## Architecture

```
browser
  │
  ├── Next.js (Vercel)
  │   ├── /app/portfolio      ← holdings + AI advisor
  │   ├── /app/top10          ← daily AI picks
  │   ├── /app/opportunities  ← personalised picks
  │   ├── /app/watchlist      ← stock watchlist
  │   ├── /app/news           ← Finnhub news feed
  │   ├── /app/newsletters    ← newsletter digests
  │   ├── /app/ipo            ← IPO calendar
  │   ├── /app/community      ← realtime community feed
  │   └── /app/alerts         ← price alerts
  │
  ├── Express API (Railway)
  │   ├── /api/prices         ← Yahoo Finance proxy
  │   ├── /api/ai/*           ← Claude API proxy (keeps keys server-side)
  │   ├── /api/news           ← Finnhub proxy
  │   ├── /api/import         ← CSV + screenshot import
  │   └── /api/alerts/check   ← alert checking
  │
  └── Supabase
      ├── PostgreSQL           ← all persistent data
      ├── Realtime             ← community feed live updates
      └── Auth                 ← Google OAuth + magic link
```

## Features

- **Portfolio**: Add holdings manually, import CSV (Hatch/Sharesies/IBKR), import screenshot via Claude Vision. AI BUY/HOLD/SELL signals per stock. Streaming AI advisor chat.
- **Top 10**: Daily AI-curated top picks across US/ASX/NZX. Cached 6hrs.
- **Opportunities**: 6 personalized picks based on your risk level, excluding holdings. Cached 4hrs per user.
- **Watchlist**: Full sortable table with live prices, P/E, market cap, dividend yield, 52W range.
- **News**: Finnhub news with sentiment analysis, AI deep-dive per article, portfolio-aware digest.
- **Newsletters**: Newsletter digests from popular sources, highlights stocks in your portfolio.
- **IPO Calendar**: Upcoming IPOs with AI STRONG_BUY/WATCH/SKIP recommendations.
- **Community**: Real-time posts feed via Supabase subscriptions. Like, post, leaderboard, trending tickers.
- **Alerts**: Price above/below alerts with email notifications via Resend.

## Free vs Pro

| Feature | Free | Pro ($9/mo) |
|---------|------|------------|
| AI analyses | 20/day | Unlimited |
| Portfolio tracking | ✓ | ✓ |
| Community posting | After 7 days | ✓ |
| Email notifications | ✗ | ✓ |
| Real-time alerts | ✗ | ✓ |
| Newsletter digest | ✗ | ✓ |
| IPO analysis | ✗ | ✓ |
