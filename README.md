# Clóset Digital

A personal wardrobe app with AI-powered outfit recommendations. Users photograph their clothes, the app auto-tags them via computer vision, and then suggests outfits based on occasion, weather, and personal style — all from a mobile-first interface.

## Features

- **Smart wardrobe** — add garments with automatic tagging (category, type, color, style, season) via Claude Haiku vision; optional in-browser background removal
- **Outfit recommendations** — rule-based engine + Claude Sonnet suggest outfits by occasion and real-time weather (Open-Meteo); supports pinning 1–2 fixed garments
- **Manual outfit builder** — drag-and-drop style selection with AI opinion on any combination
- **Calendar & planning** — log outfits as *used* or *planned* for future days; multiple outfits per day; monthly stats (favorite garment, forgotten pieces)
- **Outfit history** — full calendar view with per-day details, estado toggle, and delete
- **Closet filters** — filter by category and color client-side with instant results
- **Google OAuth** — single sign-on via Supabase Auth

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database | Supabase (Postgres + Row-Level Security) |
| Auth | Supabase Auth — Google OAuth |
| Storage | Supabase Storage (garment photos) |
| AI | Anthropic Claude API (Haiku for tagging & opinions, Sonnet for recommendations) |
| Weather | Open-Meteo (no API key required) |
| Background removal | `@imgly/background-removal` — runs entirely in the browser |
| Deployment | Vercel |

## Architecture highlights

- **Two-layer recommendation engine** — deterministic rules filter garments by category, style compatibility, and recent usage; Claude Sonnet then selects the final outfit and validates its own output programmatically (re-runs on invalid JSON)
- **Centralised taxonomy** — all categories, types, colors, styles, and seasons live in `lib/taxonomia.ts`; a single source of truth consumed by the UI, the AI prompt, and Zod validation
- **Color-faithful tagging** — the original (non-background-removed) photo is sent to the vision model alongside the processed image to preserve accurate color information

## Local setup

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project with Google OAuth configured
- An [Anthropic](https://console.anthropic.com) API key

### Environment variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `ANTHROPIC_API_KEY` | Anthropic API key |

### Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Notes

Personal project — private use (~2 users). Not accepting contributions.
