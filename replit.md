# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── mobile/             # FocusGuard Expo mobile app
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## FocusGuard Mobile App (`artifacts/mobile`)

A full-featured screen-time blocker app built with Expo + Supabase.

### Tech Stack
- **Framework**: Expo (SDK 54) + Expo Router (file-based routing)
- **Auth**: Supabase (email/password)
- **State**: React Context + AsyncStorage
- **UI**: React Native, react-native-reanimated, @expo/vector-icons
- **Theme**: Dark mode — charcoal background (#0E0F11), electric teal accent (#00D4AA)

### Environment Variables (Secrets)
- `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key

### Features Built

**Phase 1 — Auth**
- Sign In / Sign Up with email+password (8+ char validation)
- Mock "Continue with Google" button
- Session persistence via AsyncStorage + Supabase client

**Phase 2 — Onboarding** (`app/onboarding.tsx`)
- 3-screen horizontal scroll: Intro, Challenge preview, Permissions
- Dot pagination indicators
- Skip option; sets `hasCompletedOnboarding` in AsyncStorage

**Phase 3 — Hard-Mode Blocker** (`components/BlockOverlay.tsx`)
- Full-screen modal overlay
- 120-character unlock paragraph with real-time validation
- Any typo resets progress (no copy/paste: `contextMenuHidden`)
- Progress bar + character counter
- On success: increments `wallOfShameCount` in AsyncStorage

**Phase 4 — 4-Tab UI**
- `(tabs)/index.tsx` — Dashboard: stats, focus mode toggle, app usage bars, Wall of Shame
- `(tabs)/settings.tsx` — Managed Apps: expansion tile per app with lock duration, unlock goals, time limit pickers
- `(tabs)/focus-zones.tsx` — Focus Zones CRUD: create/edit/delete time range schedules with day picker and color picker
- `(tabs)/limits.tsx` — App Limits: daily budget sliders + test blocker overlay trigger

### Navigation Flow
```
index.tsx (router)
  ├── /onboarding   (first launch only, AsyncStorage flag)
  ├── /auth         (no session)
  └── /(tabs)       (authenticated)
        ├── index         (Dashboard)
        ├── settings      (Managed Apps)
        ├── focus-zones   (Focus Zones)
        └── limits        (App Limits)
```

### Key Files
- `lib/supabase.ts` — Supabase client (AsyncStorage session)
- `context/AuthContext.tsx` — Auth state provider + hooks
- `constants/colors.ts` — Full dark-mode color palette

---

## Packages

### `artifacts/api-server` (`@workspace/api-server`)
Express 5 API server. Routes live in `src/routes/`.

### `lib/db` (`@workspace/db`)
Database layer using Drizzle ORM with PostgreSQL.

### `lib/api-spec` (`@workspace/api-spec`)
Owns the OpenAPI 3.1 spec and Orval codegen config.
Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)
Generated Zod schemas from the OpenAPI spec.

### `lib/api-client-react` (`@workspace/api-client-react`)
Generated React Query hooks and fetch client.

### `scripts` (`@workspace/scripts`)
Utility scripts. Run via `pnpm --filter @workspace/scripts run <script>`.
