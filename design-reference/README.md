# Handoff: PiraWeb Gestionale — Redesign "Clarity Workspace"

## Overview
Redesign completo del linguaggio visivo del gestionale PiraWeb: nuova shell (sidebar + header), dashboard, liste e pagine di dettaglio per Task, Progetti, Clienti, CRM, Cashflow, Timesheet, Calendario, Chat, Impostazioni + stati trasversali (empty, loading, modali, toast). Tweak live per tema chiaro/scuro, accent color, larghezza sidebar e radius.

## About the Design Files
I file in questo bundle sono **riferimenti di design creati in HTML/React (Babel standalone)**: prototipi che mostrano l'aspetto e il comportamento desiderato, **non codice di produzione da copiare direttamente**.

Il compito e' **ricreare questi design nell'ambiente esistente della piattaforma PiraWeb**, usando i pattern, le librerie e la struttura gia' in uso nel codebase (Next.js + React + Tailwind v4 + Radix UI).

Il file `design-tokens.css` e' invece **codice pronto** da importare cosi' com'e'.

## Fidelity
**High-fidelity.** Colori, tipografia, spaziatura e interazioni sono finali. Replicare pixel-perfect.

## Design Tokens (source of truth)
Tutti i valori sono in `design-tokens.css` (CSS variables + snippet Tailwind pronto).

### Colori - Light
| Token | Hex | Uso |
|---|---|---|
| `--pw-navy` | `#0A263A` | Primary: pulsanti, sidebar attiva, header nav |
| `--pw-navy-deep` | `#061722` | Hover primary |
| `--pw-gold` | `#D4A800` | Accent: KPI, highlight, barra attiva sidebar |
| `--pw-gold-hover` | `#B8930A` | Hover accent |
| `--pw-gold-soft` | `#FDF7D8` | Background chip accent |
| `--pw-gold-soft-fg` | `#8A6D00` | Testo su chip accent |
| `--pw-red` | `#E0431A` | Danger, deadline in ritardo |
| `--pw-bg` | `#F6F7F9` | Background app |
| `--pw-surface` | `#FFFFFF` | Card, sidebar, header |
| `--pw-surface-soft` | `#FAFBFC` | Input, table header, hover |
| `--pw-surface-hi` | `#F0F2F5` | Skeleton, progress track |
| `--pw-border` | `#E5E7EB` | Divider default |
| `--pw-border-strong` | `#D1D5DB` | Divider rinforzato |
| `--pw-text` | `#0B1F2F` | Testo primario |
| `--pw-text-muted` | `#4B5563` | Testo secondario |
| `--pw-text-dim` | `#6B7280` | Label, meta |
| `--pw-text-faint` | `#9CA3AF` | Placeholder, micro labels |
| `--pw-success` | `#059669` | Stato positivo |
| `--pw-info` | `#2563EB` | Link, info neutrale |

### Colori - Dark (attivare con `<html data-theme="dark">`)
bg `#0B1220` · surface `#111A2C` · border `#1F2E48` · text `#E8ECF4` — vedere tokens per gli altri.

### Tipografia
- **Sans body**: Inter — weights 400/500/600/700
- **Headings**: Syne — weights 500/600/700, `letter-spacing: -0.3px` a -0.8px
- **Mono (numeri, KPI)**: JetBrains Mono — weights 400/500/600

Scale:
| Nome | Size | Weight | LH | LS |
|---|---|---|---|---|
| display | 32 | 600 | 1.15 | -0.8 |
| h1 (page) | 28 | 600 | 1.2 | -0.5 |
| h2 (section) | 18 | 600 | 1.3 | -0.3 |
| h3 (card) | 14 | 600 | 1.3 | 0 |
| stat (KPI) | 26 | 600 Syne | 1 | -0.5 |
| body | 14 | 400-500 | 1.55 | 0 |
| body-sm | 13 | 400-500 | 1.5 | 0 |
| caption | 12 | 400 | 1.4 | 0 |
| micro | 10 | 700 | 1.4 | +0.8 UPPER |

### Spacing
Base 4: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48.
Padding card default **18-20**. Padding pagina **28 top/32 laterale** (desktop).

### Radius
`sm 6` · `md 8` · `lg 10` · `xl 12`. Tweak disponibili: sharp (4/6/8/10) · normal · soft (8/12/14/18).

### Shadows
- `pw-sm`: `0 1px 2px rgba(10,31,47,0.05)`
- `pw-md`: `0 4px 12px rgba(10,31,47,0.08)`
- `pw-lg`: `0 12px 40px rgba(10,31,47,0.12)` — dropdown, tweak panel
- `pw-xl`: `0 20px 60px rgba(10,31,47,0.18)` — modal

### Layout
Sidebar width **240** (narrow 200 / wide 280) · Header height **56** · Breakpoint mobile **< 760px**.

### Motion
Ease-out standard: `cubic-bezier(0.2, 0.9, 0.3, 1)` · 160ms (fade) · 220ms (slide/scale).

## Shell (sidebar + header)

### Sidebar
- Larghezza: 240px (variabile)
- BG: `--pw-surface`, border destro `--pw-border`
- Header logo: altezza 26px, padding `18px 20px 14px`
- Workspace switcher: tile con avatar 22px (navy + oro), nome "PiraWeb Agency", caption "12 membri · Pro", chevron a destra
- Nav sections: label uppercase 10/700 tracking 1.2, gap 18 tra sezioni
- Item nav:
  - Default: padding `7px 10px`, font 13/500, colore `--pw-text`, icona 16px `--pw-text-muted`
  - Active: background `--pw-navy`, text `#fff`, icona `--pw-gold` 16px 2px-stroke, barra oro a sinistra 3x(item_height-12)px, radius sm
  - Badge count: font 10/700, bg `--pw-surface-hi`, radius 10, padding `1px 6px`
  - Dot notifiche: 7x7 red
- User card footer: avatar 32 linear-gradient `135deg, #E0431A, #D4A800`, nome + ruolo, gear icon

### Header
- Altezza 56, BG `--pw-surface`, border-bottom `--pw-border`, padding `0 28px`
- Search input: max-width 480, padding `8px 12px`, bg `--pw-surface-soft`, border `--pw-border`, icona 14, placeholder "Cerca clienti, task, progetti...", kbd `cmd+K` a destra
- Bell icon 34x34 con red dot notifica

## Schermate principali

Per brevita' le descrizioni dettagliate sono **nel codice del prototipo** (JSX completamente commentato, componenti atomici riusabili). Ogni schermata segue questi principi:

### Dashboard (`DashboardPage`)
- `PageHeader` con eyebrow data, h1 "Buongiorno, Marco", subtitle con counts
- 4 **StatCard** affiancate: icona 32x32 radius sm + soft bg, label, valore Syne 26, delta con freccia verde/rossa, sparkline SVG 24h
- Grid `2fr 1fr`:
  - Card "Progetti in corso": header + table 5-col (progetto|deadline|stato|progresso|...)
  - Sidebar: Task urgenti + Team online

### Tasks (`TasksPage`)
- Toggle view list/kanban (segmented control)
- Tab filtri per stato con counter
- Lista: 7 colonne (check|titolo|progetto|priorita'|scadenza|owner avatar|...)
- Kanban: 4 colonne (todo/in_progress/review/done) con card draggable

### Projects list + detail
- Grid view: 3 colonne di card con tag colorato 40x40, type micro label, name h2, client, progress bar, team avatars sovrapposti, status chip, footer deadline+budget
- Detail: hero con tag 56, tabs (Panoramica/Task/File/Timeline/Budget), overview = progress card + tasks recent + budget + team

### Clients list + detail
- Stat bar 3 card (attivi/MRR/nuovi)
- Tabella 6-col
- Detail: hero con tag 64, sezioni progetti, attivita', metriche sidebar (MRR, LTV, totali)

### CRM (`CrmPage`)
- 5 colonne pipeline orizzontale (Lead/Qualificato/Proposta/Negoziazione/Chiusi) con totali Syne
- Card deal: tag, nome, valore mono, probabilita', progress bar

### Cashflow
- 4 StatCard + bar chart 6 mesi (entrate oro / uscite navy, height 220)
- 2 card: fatture in arrivo + spese ricorrenti con percentuali

### Timesheet
- Tabella settimanale (progetto x 7 giorni + totale)
- Celle attive: chip oro-soft mono 12/600

### Calendar
- Grid mensile 7-col, oggi evidenziato bg accent-soft
- Eventi come righe 10px colorate

### Chat
- Layout 3-col: channel list 260 | message area | (detail opzionale)
- Channels con `#`, DM con avatar + status dot
- Messaggi: avatar 36 + nome/time + testo

### Settings
- Sidebar nav interna 220px (Profilo/Workspace/Team/Fatturazione/Integrazioni/Notifiche)
- Card form con avatar upload + campi input

### Stati (empty/loading/modal/toast)
Vedi `pages-states.jsx` per implementazioni riutilizzabili: `<EmptyState>`, `<Skeleton>`, `<SkeletonCard>`, `<SkeletonRow>`, `<LoadingOverlay>`, `<Modal>` (sm/md/lg), `<Toast>` (success/info/error, auto-close 3.5s).

## Componenti atomici (da portare 1:1)
Definiti in `shell.jsx`:
- `<Chip tone={neutral|accent|blue|green|red}>` — pill 11/500, radius 6, padding `2px 8px`
- `<Btn variant={primary|accent|ghost|soft} icon={svgPath}>`
- `<Card padding={18}>` — surface + border + radius lg
- `<PageHeader eyebrow title subtitle actions>`
- `<I d={...} size={16} stroke={1.6}>` — icon renderer (48 path library in `ICONS`)

## Responsive
- **<760px**: sidebar diventa drawer con overlay (chiude su nav), header mostra hamburger, tutti i grid multi-colonna collassano a 1fr, padding orizzontale scende a 16

## Files inclusi in questo handoff
| File | Scopo |
|---|---|
| `design-tokens.css` | **Production-ready** — importa direttamente |
| `PiraWeb Prototipo.html` | Prototipo navigabile completo (entry point) |
| `shell.jsx` | Sidebar + Header + Shell + ThemeProvider + componenti atomici + icon library |
| `pages-core.jsx` | Dashboard, Tasks, Projects list, Project detail, EmptyState |
| `pages-business.jsx` | Clients + detail, CRM, Cashflow, Timesheet, Calendar, Chat, Settings |
| `pages-states.jsx` | Modal, Toast, Skeleton, LoadingOverlay, StatesPage demo |
| `app.jsx` | Router + TweaksPanel |
