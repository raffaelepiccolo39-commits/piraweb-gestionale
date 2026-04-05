---
name: UI/UX Audit Findings — April 2026
description: Full audit of all pages and components. Covers contrast, consistency, responsiveness, accessibility, and UX flow issues found on 2026-04-03.
type: project
---

Key recurring issues discovered in the full audit of the PiraWeb gestionale app:

1. **Spinner color inconsistency** — Loading spinners use `border-indigo-600` instead of `border-pw-accent` across multiple pages (dashboard, clients, cashflow, analytics, presenze).
2. **Dark mode badge/alert contamination** — Dozens of badges and alert boxes use `bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300` style patterns. The app is permanently dark (no light mode), so the light-mode variants (`bg-green-100`, `bg-red-50`) render as near-white backgrounds on top of black — a major contrast/visual contamination bug.
3. **Chart tooltips** — Recharts Tooltip contentStyle uses `backgroundColor: 'var(--color-white, #fff)'` — renders as white box on black page. Should use dark surface colors.
4. **Chart grid lines** — CartesianGrid stroke is `#e5e7eb` (light gray, light-mode), invisible on dark background. Should be `rgba(240,237,230,0.08)`.
5. **Focus state on toggle buttons** — Period selector pills, tab toggles, weekly nav arrows lack accessible focus rings.
6. **Mobile header** — Header has no page title on mobile (empty flex-1 div). Users have no context of which page they are on.
7. **Mobile sidebar** — Sidebar z-index (40) could conflict with header z-index (30) on some transitions.
8. **Team status badges in header** — On narrow screens with 4 badges (al lavoro / in pausa / usciti / assenti) they overflow or wrap.
9. **AttendanceCalendar table** — 31-column table overflows on any screen. `overflow-x-auto` exists but sticky first column uses `bg-pw-surface` which doesn't match hover state.
10. **ReportTable** — Same horizontal scroll issue. No min-width guard on the table.
11. **Password toggle button** (login + settings create-user) — Missing `aria-label` for screen readers.
12. **`alert()` calls** in client-detail page for contract errors — Should use in-UI toast/error display.
13. **Dark mode toggle** in header imports but app is already always dark — the toggle adds the `dark` class but the design system doesn't actually use `dark:` variants consistently (many components mix both).
14. **Settings team row overflow** — On mobile, the team member row has avatar + name + select + pencil + status button all in one flex row: guaranteed to overflow on small screens.
15. **Font application inconsistency** — `font-[var(--font-syne)]` applied inline on h1s instead of using a utility class. Some headings missing the font override.
16. **Button touch targets** — `size="sm"` buttons use `py-1.5` = ~28px height, below the 44px minimum for mobile.
17. **ClockButtons** — Large action buttons (p-5) are good for touch, but timeline section uses very small icons (14px) and text (text-[10px]) that are hard to read.
18. **PaymentCalendar** — Default empty payment state uses `bg-white dark:bg-gray-800` — white appears on dark theme. Should use `bg-pw-surface-2`.
19. **Cashflow P&L banners** — Text truncates (`truncate` class) on margin banner for large numbers on mobile.
20. **AI page result copy button** — Uses `bg-white dark:bg-gray-700` — white appears in dark mode.

**Why:** Captured during full audit. Use these findings to guide targeted fixes without re-reading all files.
**How to apply:** When user asks for fixes, reference these specific issues by number for efficient scoping.
