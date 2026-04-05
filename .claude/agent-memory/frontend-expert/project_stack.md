---
name: Project Stack and Conventions
description: Tech stack, styling approach, component patterns, and design tokens for piraweb-gestionale
type: project
---

Next.js 16 gestionale app (Italian agency management tool). Dark-themed SaaS dashboard.

**Styling:** Tailwind v4 with `@import "tailwindcss"` and `@theme inline {}` custom tokens. No CSS Modules, no styled-components.

**Design tokens (all prefixed `pw-`):**
- `pw-bg` (#000), `pw-surface` (#141414), `pw-surface-2` (#1a1a1a), `pw-surface-3` (#222)
- `pw-border`, `pw-border-hover`
- `pw-text`, `pw-text-muted`, `pw-text-dim`
- `pw-accent` (#c8f55a lime-green), `pw-accent-hover`
- `pw-purple` (#8c7af5), `pw-gold` (#d4af37)

**Fonts:** Inter (sans), Syne (heading), Bebas (display)

**Key UI components:** Card/CardContent/CardHeader, Badge, Button (variant: primary/outline/ghost/danger, size: sm/md), Modal (size: sm/md/lg/xl), EmptyState

**Layout:** Fixed sidebar (w-64 expanded, w-16 collapsed) + sticky header (h-14). Dashboard layout in `src/app/(dashboard)/layout.tsx`. Mobile sidebar = overlay with backdrop.

**Charts:** Recharts — ResponsiveContainer wrapping BarChart / LineChart

**Auth:** Supabase, role-based (`admin`, `content_creator`, `social_media_manager`). `useAuth()` hook.

**Why:** Internal gestionale for Italian digital agency. Admin-only sections: cashflow, analytics, presenze report.
**How to apply:** Always use pw-* tokens, never raw hex or Tailwind color scales for brand colors. Match dark-theme patterns.
