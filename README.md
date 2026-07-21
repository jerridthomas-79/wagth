# We're All Going to Hell

WAGTH is a mobile-first adult party game built for GitHub Pages on the frontend and Supabase on the backend.

## What is in this first implementation

- A branded React + TypeScript + Vite shell with the approved color palette
- Create and join room flows with four-character room codes
- A live Supabase-backed game flow when `.env.local` is configured, with a local mock fallback for multi-tab testing
- One full round loop: Presenter selection, response collection, wait-for-all gate, anonymous judging, point award, and Presenter rotation
- Supabase migration and seed source files for the real backend
- Vitest coverage around room codes and the first room lifecycle

## Local development

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env.local` if you are wiring the real Supabase client.
3. Run `pnpm dev`.

## Backend status

When `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in `.env.local`, the client authenticates anonymously against the live Supabase project and drives the game through RPC calls. Without those values, the UI falls back to the local mock service so the game loop can still be tested immediately in multiple tabs.
