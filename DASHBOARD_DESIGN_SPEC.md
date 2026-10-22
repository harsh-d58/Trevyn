# Trevyn Dashboard — Design Language & Implementation Spec

> **Reference:** "Coinly — Spending Analytics Dashboard" by Orbix Studio (the screenshot), plus the motion and hover style from the other reference reels.
> **Goal:** Rebuild the Trevyn **Quality Overview** page with Coinly's visual language. Keep Trevyn's domain (runs, findings, approvals, evidence) and the deck's colour rule: **AI = violet, Deterministic = teal, Human approval = amber**.
> **Stack:** taken from *TREVYN_IM02_DimaagKaDahi.pdf*, slides 5–6.

---

## 0. TL;DR

| Coinly element | Becomes in Trevyn | Built with |
|---|---|---|
| Icon rail sidebar | Workspace rail (Overview, Runs, Findings, Approvals, Network, Settings) | Next.js `<Link>` + shadcn `Tooltip` + `motion` `layoutId` |
| Search pill `⌘K` | Command palette (pages, findings, runs, actions) | shadcn `Command` (cmdk) |
| "Move Money" pill | **New Test Run** split button | shadcn `DropdownMenu` + `Button` |
| 5 KPI cards | Tests executed · Pass rate · Confirmed findings · Regressions prevented · Pending approvals | shadcn `Card` + custom `KpiCard` |
| Balance Overview (dual line + volume bars) | **Run Health**: tests passed vs failed + runs/day bars | Recharts `ComposedChart` via shadcn `ChartContainer` |
| Spending by category (polar pie) | **Findings by category** (UI · API · Perf · Security · Compat) | Recharts `PieChart` with `activeShape` |
| Top spending merchants | **Top failing suites** | shadcn `Progress`-style bars + `motion` |
| Income vs Expense (tick gauge) | **Release gate**: pass rate vs 90% gate | Custom SVG `TickGauge` |
| Cash flow trend (spiky line) | **Execution throughput**: tests run per day | Recharts `AreaChart` + `ReferenceDot` |
| Date range pill / Export Report | Date range filter / Export evidence report (PDF) | shadcn `Popover` + `Calendar`; FastAPI export endpoint |

---

## 1. Design language: principles

What makes Coinly look premium, in the order it matters:

1. **Quiet canvas, loud data.** The background is a cool off-white, cards are pure white, and borders are hairlines. Colour appears only in the data (lines, wedges, bars, delta pills) and in small icon chips. Chrome is never coloured except for the single active item.
2. **Light numerals.** Large numbers use a *light/regular* weight, not bold. Size carries the hierarchy, so the page stays calm. This matters most for the "airy" feel.
3. **Pills everywhere.** Every control is a fully rounded pill: search, dropdowns, date range, export, delta badges and the active nav item. Cards use a medium radius (~14px), so the two shapes don't compete.
4. **Small labels, big values.** Card titles are 12px medium, captions are 10–11px muted, and values are 20–24px light. There is no middle size.
5. **Gradient only inside charts.** The polar pie, the gauge ticks and the line strokes carry soft gradients. Surfaces and buttons are always flat.
6. **One accent per chart.** Each chart has 1–2 hues at most. The 5-hue categorical palette appears only in the category wedge chart.
7. **Motion confirms, never decorates.** Hover lifts, crosshairs and wedge pops answer the cursor. Entrance animation runs once per page load and respects `prefers-reduced-motion`.

---

## 2. Design tokens

These extend the tokens already in `trevyn-app/src/index.css` and stay compatible with them. Coinly's softness is applied to Trevyn's existing palette.

### 2.1 Colour

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F4F6FA` | App canvas (Coinly's cool grey) |
| `--surface` | `#FFFFFF` | Cards, top bar, rail |
| `--surface-2` | `#F1F3F8` | Hover fills, inputs, chart tracks |
| `--line` | `#E8EBF2` | Card borders, row dividers, gridlines |
| `--fg` | `#0D1A35` | Primary text (Trevyn navy-ink) |
| `--muted` | `#7A859C` | Captions, axis labels, "vs last 30 days" |
| `--navy` | `#0F2557` | Brand wordmark, headings |
| `--accent` | `#2457E6` | Active rail item, primary button, focus ring, links |
| `--accent-soft` | `#2457E6 / 10%` | Active backgrounds, selected rows |
| **Semantic: provenance (deck legend; never reuse for categories)** |||
| `--ai` | `#7457EA` | AI-driven: diagnoses, plans, confidence |
| `--det` | `#0B8A7C` | Deterministic: runs, executed tests, evidence |
| `--human` | `#D27408` | Human approval: approvals, review requests |
| **Semantic: outcome** |||
| `--ok` | `#15935A` | Passed, positive delta |
| `--warn` | `#B86F05` | Warnings, inconclusive |
| `--bad` | `#D03636` | Failed, negative delta, high severity (the "urgent red tag" from reel 3) |
| **Categorical (finding categories only)** |||
| `--cat-ui` | `#3B6FF5` | UI / Browser |
| `--cat-api` | `#38BDF8` | API & Integration |
| `--cat-perf` | `#FF8A5B` | Performance (Coinly's orange) |
| `--cat-sec` | `#EC6FB0` | Security |
| `--cat-compat` | `#94A3B8` | Compatibility |

**KPI icon chips** use the same hue at 12% opacity behind a 100% icon, for example `bg-det/12 text-det`.

### 2.2 Typography

| Role | Font | Size / weight / tracking | Example |
|---|---|---|---|
| Brand wordmark | DM Serif Display | 22px / 400 / `.06em` | **TREVYN** |
| Page title | Geist | 22px / 500 / `-0.01em` | Quality Overview |
| Page subtitle | Geist | 12px / 400 / muted | Track test health, findings and fixes |
| Card title | Geist | 12.5px / 500 | Run Health |
| Card caption | Geist | 10.5px / 400 / muted | vs last 30 days |
| **KPI value** | Geist | **24px / 300**, `tabular-nums` | 128 |
| Chart value header | Geist | 18px / 300, `tabular-nums` | 3,750 |
| Axis / legend | Geist | 10.5px / 400 / muted | Jan Feb Mar |
| IDs, timestamps | Geist Mono | 11px / 500 | RUN-0412 |
| Delta pill | Geist | 10.5px / 600 | +4.2% |

The Coinly page title is sans, so the dashboard uses Geist for titles. DM Serif stays for the wordmark and for marketing or report covers, to match the deck.

### 2.3 Shape, space, elevation

| Token | Value |
|---|---|
| `--radius-card` | `14px` |
| `--radius-pill` | `9999px` |
| `--radius-chip` | `10px` (KPI icon chip, 28×28) |
| Grid gap | `12px` (`gap-3`); page padding `24px`; card padding `16px` |
| `--shadow-card` | `0 1px 2px rgba(15,37,87,.04), 0 8px 24px -16px rgba(15,37,87,.18)` |
| `--shadow-lift` (hover) | `0 2px 4px rgba(15,37,87,.05), 0 16px 36px -18px rgba(15,37,87,.30)` |
| `--shadow-pop` (tooltip/popover) | `0 12px 32px -8px rgba(15,37,87,.22)` |

### 2.4 Motion

| Token | Value | Used for |
|---|---|---|
| `--ease-out` | `cubic-bezier(.22,1,.36,1)` | Entrances, lifts |
| `--ease-spring` | motion `spring({ stiffness: 420, damping: 32 })` | Rail indicator, wedge pop |
| `--dur-fast` | `120ms` | Hover colour and opacity |
| `--dur-base` | `200ms` | Lift, tooltip in |
| `--dur-slow` | `700ms` | Chart draw, count-up, bar fill |
| Stagger | `40ms` per card | Page entrance |

---

## 3. Layout

### 3.1 Grid (desktop ≥ 1280px)

```
┌────┬──────────────────────────────────────────────────────────────────────────┐
│ ◎  │ [🔍 Search or jump to…        ⌘K]           [＋ New Test Run ▾] (🔔) (AC)│  top bar 56px
│    ├──────────────────────────────────────────────────────────────────────────┤
│ ⌂  │ Quality Overview                         [📅 Sep 21 – Oct 21 ▾] [⤓ Export]│  header row
│ ▶  │ Track test health, findings and fixes                                    │
│ 🐞 │ ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐                                 │
│ ✓  │ │ KPI 1││ KPI 2││ KPI 3││ KPI 4││ KPI 5│   5 equal columns               │
│ ⛓  │ └──────┘└──────┘└──────┘└──────┘└──────┘                                 │
│    │ ┌───────────────────────────────┐┌──────────────────────┐                │
│ ⚙  │ │ Run Health (7/12)              ││ Findings by category │ (5/12)         │
│    │ │ dual line + volume bars        ││ polar pie + legend   │                │
│    │ └───────────────────────────────┘└──────────────────────┘                │
│    │ ┌──────────────┐┌──────────────┐┌──────────────────────┐                 │
│    │ │Top failing    ││ Release gate ││ Execution throughput │ (4/4/4 of 12)   │
│    │ │suites         ││ tick gauge   ││ spiky area           │                 │
│ AC │ └──────────────┘└──────────────┘└──────────────────────┘                 │
└────┴──────────────────────────────────────────────────────────────────────────┘
 64px rail
```

- Tailwind: `grid grid-cols-12 gap-3`. Row 2 is `col-span-7 / col-span-5`; row 3 is `col-span-4 ×3`.
- Row heights: KPI ≈ 96px, row 2 ≈ 300px, row 3 ≈ 260px. The page fits a 1440×900 viewport without scrolling, as Coinly does.

### 3.2 Responsive

| Breakpoint | Rail | KPIs | Row 2 | Row 3 |
|---|---|---|---|---|
| ≥1280 `xl` | 64px icon rail | 5 cols | 7 / 5 | 4 / 4 / 4 |
| 1024–1279 `lg` | 64px icon rail | 3 + 2 | 12 / 12 | 6 / 6, then 12 |
| 640–1023 `md` | Hidden, opens in shadcn `Sheet` | 2 cols | stacked | stacked |
| < 640 | `Sheet` | 1 col, horizontal snap-scroll strip | stacked | stacked |

---

## 4. Element-by-element design language

Each element has four parts: **Anatomy**, **Style**, **States and interactions**, and **Trevyn mapping**.

### 4.1 Icon rail (sidebar)

- **Anatomy:** brand mark at the top, then 6–7 circular icon buttons and the avatar at the bottom.
- **Style:** 64px wide, `--surface` background, right border `--line`. Buttons are 36×36 circles with 18px lucide icons in `--muted`.
- **Active:** a filled `--accent` circle with a white icon. In Coinly this is the periwinkle dot on "Analytics".
- **Hover:** the button gets a `--surface-2` fill, the icon turns `--fg`, and a shadcn `Tooltip` shows the label to the right (`side="right"`, 6px offset, 150ms delay).
- **Click:** the active circle *slides* to the new item. This uses a shared `motion.span layoutId="rail-active"` with a spring, so it does not jump.
- **Badge:** Approvals shows a small `--human` dot with a count when approvals are pending.
- **Keyboard:** `↑/↓` moves focus within the rail, and the focus ring is `2px --accent` with a 2px offset.

### 4.2 Top bar

- **Search pill:** about 260px, `--surface-2` fill, 32px tall, search icon and placeholder "Search or jump to…", with a `⌘K` / `Ctrl K` kbd chip on the right (white, hairline, mono 10px). Clicking or pressing `⌘K` opens the command palette (4.13).
- **Primary action pill:** "＋ New Test Run ▾" replaces "Move Money". It is a white pill with a hairline border and the same height as search. The caret opens a menu: *Smoke run · Full regression · From test plan… · Watch live run*.
- **Bell:** a 32px circular icon button. Unread state is a 7px `--bad` dot with a 2px white ring. Clicking opens a right-side shadcn `Sheet` with notifications tagged AI / DET / HUMAN.
- **Avatar:** a 32px circle that opens a `DropdownMenu` (profile, workspace switch, sign out).
- **Environment chip:** `STAGING · DEMO` in amber, after the breadcrumb. It stays from the current prototype because it matters for safety.

### 4.3 Page header row

- **Left:** title "Quality Overview" (22/500) and subtitle (12, muted) 2px below.
- **Right:**
  - **Date range pill:** calendar icon, `Sep 21, 2026 – Oct 21, 2026`, chevron. It opens a `Popover` with presets (*Last 7 / 30 / 90 days, This sprint, Custom…*) and a 2-month `Calendar` in range mode. Changing the range updates `?range=` in the URL, and every chart re-animates from its current values (not from zero).
  - **Export pill:** download icon and "Export Report". It calls `POST /api/v1/reports/export`, the button shows a spinner, and a `sonner` toast appears with a "Download PDF" action when the report is ready.
- **Press feedback on all pills:** `active:scale-[.97]` over 120ms.

### 4.4 KPI card (×5)

```
┌───────────────────────────────┐
│ (◉) Tests executed        ⋯   │  ← chip 28px · title 12.5/500 · kebab
│     vs last 30 days           │  ← caption 10.5 muted
│                               │
│ 128                ● +18.2%   │  ← value 24/300 · delta pill
└───────────────────────────────┘
```

- **Style:** white card, `--radius-card`, hairline border, `--shadow-card`, padding 14–16px.
- **Icon chip:** 28×28, radius 10, tinted with the metric's hue at 12%.
- **Delta pill:** a 6px dot plus a signed percentage on a tinted background. Green for good and red for bad, where *good* depends on the metric: fewer findings is green.
- **Values and mapping:**

| # | Title | Value | Chip hue | Delta logic | Click → |
|---|---|---|---|---|---|
| 1 | Tests executed | `128` | `--det` | up is good | `/runs` |
| 2 | Pass rate | `91.4%` | `--ok` | up is good | `/analytics` |
| 3 | Confirmed findings | `6` | `--bad` | down is good | `/findings?status=confirmed` |
| 4 | Regressions prevented | `4` | `--ai` | up is good | `/regression` |
| 5 | Pending approvals | `5` | `--human` | down is good | `/approvals` |

- **Interactions:**
  - **Mount:** the value counts up from 0 over 700ms with ease-out (`motion` `animate()` on a `MotionValue`, formatted with `Intl.NumberFormat`).
  - **Hover:** the card lifts `translateY(-2px)` and moves to `--shadow-lift`. The border tints to the chip hue at 30%. The kebab fades from 40% to 100% opacity, and the chip scales to 1.06.
  - **Hover on the delta pill:** a tooltip shows "+18 tests vs Aug 22 – Sep 20".
  - **Click:** the whole card is a link (`<Link>` wrapping the card, with `aria-label`). Pressing scales it to 0.98.
  - **Kebab menu:** *View details · Pin to top · Copy value*. The kebab stops click propagation.
- **Loading:** a shadcn `Skeleton` with the same anatomy (chip circle, two text bars, value bar).

### 4.5 Run Health: dual-line chart (from "Balance Overview")

- **Header:** title on the left and a "Last 30 days ▾" pill on the right (shadcn `Select`, compact pill style).
- **Series:**
  - **Tests passed:** a 2px line in `--det`. This is Coinly's orange line, recoloured to the provenance teal.
  - **Tests failed:** a 2px line in `--bad` at 85%.
  - **Runs per day:** thin bars (4px wide, radius 2) along the bottom 18% of the plot in `--line`. They mirror Coinly's faint volume histogram.
- **Axes:** no axis lines. Horizontal gridlines are `--line` and dashed `2 4`. Y ticks show 4–5 values, muted at 10.5px. X shows month or day labels, and the active label turns `--fg` and medium weight, as "May" does in Coinly.
- **Curve:** `type="monotone"`. Coinly's lines are slightly jagged, so with dense daily data use `"linear"`.
- **Interactions:**
  - **Hover:** a vertical crosshair (1px `--fg` at 15%) snaps to the nearest x. Each series gets a 4px dot with a 2px white ring. A tooltip card follows: white, radius 10, `--shadow-pop`, showing the date and two rows (colour dot, label, value), like Coinly's "May 2026 · Income $4,580".
  - **Hover on the bar under the cursor:** it darkens to `--muted` at 40%.
  - **Legend click:** toggles a series. The hidden series' legend item drops to 40% opacity, and the remaining line re-scales with a 400ms transition.
  - **Legend hover:** dims the other series to 25%.
  - **Click a point:** goes to `/runs?date=YYYY-MM-DD`.
  - **Mount:** lines draw left to right over 700ms. Recharts `isAnimationActive` with `animationDuration={700}` handles this.

### 4.6 Findings by category: polar pie (from "Spending by category")

- **Anatomy:** a pie of about 150px on the left and a legend list on the right. Legend rows have a colour dot, label and right-aligned percentage, separated by hairlines. Each row is 32px tall.
- **Style:** Coinly's pie is a *variable-radius* (polar-area) pie with gradient wedges, so each wedge's radius encodes its value.
  - Each wedge's outer radius is `minR + (value / max) × (maxR − minR)`, with the angle shared equally. This is done with a custom `shape` on a Recharts `Pie`, or as a raw SVG `PolarArea` component (~60 lines).
  - Each wedge fills with a `linearGradient` from `--cat-x` to `--cat-x` at 55%, with a 2px white stroke between wedges.
  - A faint `--surface-2` disc sits behind the pie.
- **Categories:** UI 42% · API 20% · Performance 15% · Security 13% · Compatibility 10%.
- **Interactions (linked brushing):**
  - **Hovering a wedge:** it pushes out 6px along its bisector with a spring, and the other wedges dim to 35%. The matching legend row gets a `--surface-2` fill and its label turns `--fg` and medium weight. A centre tooltip shows "UI · 5 findings · 2 high".
  - **Hovering a legend row:** produces the same highlight in reverse.
  - **Clicking a wedge or row:** goes to `/findings?type=ui`.
  - **Mount:** wedges sweep in clockwise over 600ms, staggered 60ms.
- **Accessibility:** the legend is the accessible representation. It is a `<ul>` with `aria-label="Findings by category"`, and each row is a link.

### 4.7 Top failing suites (from "Top spending merchants")

- **Anatomy (×3–4 rows):** a 24px circular logo (lucide icon on a tinted circle: Checkout `ShoppingCart`, Auth `KeyRound`, Catalog `LayoutGrid`, Payments `CreditCard`), the suite name, a right-aligned failure count with share "11 failures (52%)", and a progress bar below.
- **Bar:** 4px tall on a `--surface-2` track with fully rounded ends. Each row has its own hue, following Coinly's green, orange and purple rhythm, but recoloured to suite severity: `--bad`, `--cat-perf`, `--ai`.
- **Interactions:**
  - **Mount:** bars fill from 0 to their value over 700ms, staggered 80ms per row.
  - **Row hover:** a `--surface-2` background with a 10px radius inset, the bar thickens from 4px to 6px, and a chevron "›" slides in from the right (opacity 0→1, x −4→0).
  - **Click:** goes to `/runs?suite=checkout`.
- **Header pill:** "Last 30 days ▾", the same component as 4.5.

### 4.8 Release gate: tick gauge (from "Income vs Expense")

- **Anatomy:** a 180° semicircle made of about 48 radial *tick* segments (the comb look). The centre shows the caption "Pass rate" and the value **91.4%** (24/300). The footer shows "Passed 117" on the left and "Failed 11" on the right, muted, with values in `--fg`.
- **Style:**
  - Ticks are 2px wide and 14px long, with rounded caps, spaced every 3.75°.
  - Filled ticks (up to the value) use a gradient across the arc from `--det` at 60% to `--det`, matching the way Coinly's ticks shade from orange to peach.
  - Unfilled ticks are `--line`.
  - **Gate marker:** one tick at 90% that is longer (20px) and coloured `--human`, with a tiny label "Gate 90%". This is Trevyn's addition and the reason the chart exists.
- **Interactions:**
  - **Mount:** ticks light up one by one, about 12ms each, up to the value.
  - **Hover on the gauge:** shows a tooltip "Release gate: 90% · Current: 91.4% · Above gate by 1.4 pts".
  - **Hover on the gate tick:** it pulses once.
  - **Below gate:** filled ticks turn `--bad`, and a `--bad` pill "Below gate" appears in the header.
- **Build:** a custom SVG component (`TickGauge.tsx`) with no chart library. It is about 50 lines: map `i → angle`, then draw `<line>` elements.

### 4.9 Execution throughput: spiky area (from "Cash flow trend")

- **Header:** title, then a caption row reading "Tests executed" muted with a value of **3,750** (18/300).
- **Series:** daily tests executed as a 1.75px `--accent` line with an area fill from `--accent` at 14% down to 0 (vertical `linearGradient`). Use `type="linear"` to keep Coinly's sharp spikes.
- **Peak annotation:** a `ReferenceDot` is always visible at the maximum, with a small white tooltip card *pinned* above it: "Oct 10, 2026 · 412 tests". This mirrors Coinly's "Mar 10, 2026 $3,750.00".
- **Interactions:**
  - **Hover:** a crosshair and a moving dot. The pinned peak card fades to 40% so the two tooltips don't compete.
  - **Click a spike:** goes to the runs for that day.
  - **Mount:** the line draws in, and the peak card fades and slides up 4px after the line finishes, with a 700ms delay.

### 4.10 Card shell (shared by all chart cards)

- **Header:** title (12.5/500) on the left and a range pill or kebab on the right. Height is 36px with no divider line, following Coinly.
- **Body:** fills the remaining height. Charts sit in shadcn `ChartContainer`, which provides the CSS variables and the responsive container.
- **Hover:** a gentle `--shadow-lift` with *no* translate. Chart cards stay still so the crosshair doesn't jitter. Only KPI cards translate.
- **Empty state:** a centred muted icon, "No runs in this range", and a ghost "Change range" button.
- **Error state:** a `--bad` at 8% inset note, "Couldn't load run health · Retry".

### 4.11 Pills and buttons

| Variant | Style | Hover | Press |
|---|---|---|---|
| Pill / outline | white, hairline, 32px, 12px text, 12px x-padding | `--surface-2` fill | `scale(.97)` |
| Pill / primary | `--accent` fill, white text | brightness 110% | `scale(.97)` |
| Pill / human | `--human` fill, white text (approve actions) | brightness 110% | `scale(.97)` |
| Icon circle | 32px circle, muted icon | `--surface-2` and `--fg` icon | `scale(.94)` |
| Delta pill | 20px, tinted background, dot and value | none | none |
| Severity tag | 20px pill: **High** in red, Medium in amber, Low in grey | none | none |

All are built from shadcn `Button` and `Badge` with added `pill` / `icon` variants in `cva`.

### 4.12 Tooltip (charts and controls)

- White, radius 10, `--shadow-pop`, hairline border, 8×10 padding, 11.5px text.
- The title is muted 10.5px and rows have a colour dot, label and right-aligned `tabular-nums` value.
- Enter animation: fade with `translateY(4px → 0)` over 150ms. There is no exit animation.

### 4.13 Command palette (`⌘K`)

- Built on shadcn `CommandDialog`. It is 560px wide, radius 14, with a top input and grouped results: *Pages · Findings · Runs · Actions*.
- The selected row gets an `--accent-soft` fill and `--accent` text. `↵` navigates and `Esc` closes.
- The backdrop is `--fg` at 30% with an 8px `backdrop-blur`. That is the only blur in the system.

### 4.14 Page entrance

The header, KPI row, row 2 and row 3 fade in and move up from `y: 8` to `0`, with a 40ms stagger between cards. This runs once per navigation through a `motion` `variants` parent. It is skipped when `prefers-reduced-motion` is set, and the count-ups then show their final value immediately.

---

## 5. Tech stack mapping (from the deck)

### 5.1 Stack used, by deck layer

| Deck layer | Tool | Role in the dashboard |
|---|---|---|
| Frontend | **Next.js** (App Router) | Routes, server-rendered first paint, `searchParams` for range state |
| Frontend | **React + TypeScript** | Components, typed props, and API types generated from FastAPI's OpenAPI |
| Frontend | **Tailwind** (v4, `@theme`) | All tokens from §2 as CSS variables and utilities |
| Frontend | **shadcn/ui** | Card, Button, Badge, Tooltip, DropdownMenu, Popover, Calendar, Select, Command, Sheet, Skeleton, Sonner, **Chart** (wraps Recharts) |
| Frontend | **React Flow** | The live platform topology (Control plane → OPA → Orchestrator → Workers → Evidence) on `/network`, kept off the Overview so it matches Coinly's density |
| Backend | **FastAPI + Pydantic** | `/api/v1/dashboard/*` endpoints; Pydantic models are the contract |
| Backend | **JSON Schema** | OpenAPI → `openapi-typescript` → `types/api.ts` (no hand-written types) |
| Data & jobs | **PostgreSQL** | Aggregates from run events, findings and approvals |
| Data & jobs | **Redis** | Pub/sub for live run events and caching for dashboard aggregates (60s) |

### 5.2 Additions outside the deck (flag for team approval)

| Package | Why | Alternative if we stay strict |
|---|---|---|
| `motion` (Framer Motion) | Rail `layoutId` slide, count-ups, staggered entrance, wedge spring. Reel 1's stack used it. | `tw-animate-css` with CSS transitions. This loses the shared-layout slide and spring. |
| `recharts` | Comes with shadcn's Chart component, so it is effectively part of shadcn/ui | None needed |
| `geist` (font) | Next.js-native Geist and Geist Mono | `next/font/google` |

### 5.3 Project structure

```
trevyn-web/                          # Next.js app (replaces Vite trevyn-app per deck)
├─ app/
│  ├─ layout.tsx                     # fonts, <Toaster/>, TooltipProvider
│  ├─ globals.css                    # @import "tailwindcss"; @theme tokens (§2)
│  └─ (workspace)/
│     ├─ layout.tsx                  # <IconRail/> + <TopBar/> shell
│     ├─ page.tsx                    # Quality Overview (this spec), RSC
│     ├─ loading.tsx                 # Skeleton grid
│     ├─ runs/ findings/ approvals/ network/ …
├─ components/
│  ├─ ui/                            # shadcn generated (button, card, chart, command…)
│  ├─ shell/  icon-rail.tsx  top-bar.tsx  command-menu.tsx  notifications-sheet.tsx
│  └─ dashboard/
│     ├─ kpi-card.tsx                # §4.4
│     ├─ run-health-chart.tsx        # §4.5   "use client"
│     ├─ category-polar.tsx          # §4.6   "use client"
│     ├─ failing-suites.tsx          # §4.7
│     ├─ tick-gauge.tsx              # §4.8   pure SVG
│     ├─ throughput-chart.tsx        # §4.9   "use client"
│     ├─ chart-card.tsx              # §4.10  shell
│     ├─ date-range-pill.tsx         # §4.3
│     └─ count-up.tsx                # motion count-up
├─ lib/
│  ├─ api.ts                         # typed fetch wrapper (server + client)
│  ├─ use-run-events.ts              # SSE hook for live updates
│  └─ format.ts                      # Intl number/date/percent helpers
└─ types/api.ts                      # generated: npx openapi-typescript http://api/openapi.json
```

### 5.4 Data contract (FastAPI / Pydantic)

```python
# backend/app/api/dashboard.py
class Kpi(BaseModel):
    key: Literal["tests_executed", "pass_rate", "confirmed_findings", "regressions_prevented", "pending_approvals"]
    value: float
    delta_pct: float
    good_direction: Literal["up", "down"]
    sparkline: list[float] = []

class RunHealthPoint(BaseModel):
    date: date; passed: int; failed: int; runs: int

class CategorySlice(BaseModel):
    type: Literal["ui", "api", "perf", "security", "compat"]
    count: int; high: int

class SuiteFailure(BaseModel):
    suite: str; icon: str; failures: int; share: float

class GateStatus(BaseModel):
    pass_rate: float; gate: float = 90.0; passed: int; failed: int

class ThroughputPoint(BaseModel):
    date: date; tests: int

class DashboardSummary(BaseModel):
    range: Literal["7d", "30d", "90d", "sprint", "custom"]
    kpis: list[Kpi]
    run_health: list[RunHealthPoint]
    categories: list[CategorySlice]
    top_suites: list[SuiteFailure]
    gate: GateStatus
    throughput: list[ThroughputPoint]

@router.get("/dashboard/summary", response_model=DashboardSummary)
async def summary(range: str = "30d", start: date | None = None, end: date | None = None): ...

@router.get("/runs/events")            # text/event-stream: run.started | run.finished | finding.confirmed | approval.requested
async def run_events(): ...
```

There is one request per page load instead of six, and Redis caches it per `(project, range)` for 60s.

### 5.5 Data flow

```
Browser ──GET /?range=30d──▶ Next.js RSC page.tsx
                               └─ api.get('/dashboard/summary', {range}) ──▶ FastAPI ──▶ Postgres (cached in Redis)
                               └─ renders server shell + passes data as props to client charts
Date pill change ──▶ router.replace('?range=7d') ──▶ RSC re-render (Suspense keeps old UI, charts tween to new values)
Live: useRunEvents() ──EventSource /runs/events──▶ on run.finished → router.refresh(); toast "RUN-0413 finished · 44/46"
```

Range state lives in the URL, so views are shareable. No client data library is required.

### 5.6 Key component sketches

```tsx
// components/dashboard/kpi-card.tsx
"use client"
import Link from "next/link"
import { motion } from "motion/react"
import { MoreHorizontal, type LucideIcon } from "lucide-react"
import { Card } from "@/components/ui/card"
import { CountUp } from "./count-up"
import { cn } from "@/lib/utils"

type Props = { href: string; title: string; icon: LucideIcon; hue: "det" | "ok" | "bad" | "ai" | "human"
  value: number; format?: (n: number) => string; delta: number; goodDirection: "up" | "down" }

export function KpiCard({ href, title, icon: Icon, hue, value, format, delta, goodDirection }: Props) {
  const good = goodDirection === "up" ? delta >= 0 : delta <= 0
  return (
    <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
      <Link href={href} aria-label={`${title}: ${value}`}>
        <Card className={cn("group rounded-[14px] p-4 shadow-card transition-shadow hover:shadow-lift",
          `hover:border-${hue}/30`)}>
          <div className="flex items-start gap-2.5">
            <span className={cn("grid size-7 place-items-center rounded-[10px] transition-transform group-hover:scale-105", `bg-${hue}/12 text-${hue}`)}>
              <Icon size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium">{title}</div>
              <div className="text-[10.5px] text-muted">vs last 30 days</div>
            </div>
            <MoreHorizontal size={16} className="text-muted opacity-40 transition-opacity group-hover:opacity-100" />
          </div>
          <div className="mt-4 flex items-end justify-between">
            <CountUp to={value} format={format} className="text-2xl font-light tabular-nums" />
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
              good ? "bg-ok/12 text-ok" : "bg-bad/12 text-bad")}>
              <i className="size-1.5 rounded-full bg-current" />{delta > 0 ? "+" : ""}{delta.toFixed(1)}%
            </span>
          </div>
        </Card>
      </Link>
    </motion.div>
  )
}
```

> Tailwind v4 can't see dynamic class names like `` `bg-${hue}/12` ``. Use a `HUE` lookup map with literal class strings, as `TONE` does in the current `ui.jsx`. The sketch is shortened for readability.

```tsx
// components/shell/icon-rail.tsx: the sliding active indicator
{items.map(({ href, label, Icon }) => {
  const active = pathname === href
  return (
    <Tooltip key={href}>
      <TooltipTrigger asChild>
        <Link href={href} aria-current={active ? "page" : undefined}
          className="relative grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg">
          {active && <motion.span layoutId="rail-active" className="absolute inset-0 rounded-full bg-accent"
            transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
          <Icon size={18} className={cn("relative", active && "text-white")} />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
})}
```

### 5.7 Tailwind v4 theme block

```css
/* app/globals.css */
@import "tailwindcss";
@import "tw-animate-css"; /* shadcn default */

:root {
  --bg:#F4F6FA; --surface:#FFFFFF; --surface-2:#F1F3F8; --line:#E8EBF2;
  --fg:#0D1A35; --muted:#7A859C; --navy:#0F2557; --accent:#2457E6;
  --ai:#7457EA; --det:#0B8A7C; --human:#D27408; --ok:#15935A; --warn:#B86F05; --bad:#D03636;
  --cat-ui:#3B6FF5; --cat-api:#38BDF8; --cat-perf:#FF8A5B; --cat-sec:#EC6FB0; --cat-compat:#94A3B8;
  --radius:14px;
}
@theme inline {
  --color-bg:var(--bg); --color-surface:var(--surface); --color-surface-2:var(--surface-2); --color-line:var(--line);
  --color-fg:var(--fg); --color-muted:var(--muted); --color-navy:var(--navy); --color-accent:var(--accent);
  --color-ai:var(--ai); --color-det:var(--det); --color-human:var(--human);
  --color-ok:var(--ok); --color-warn:var(--warn); --color-bad:var(--bad);
  --color-cat-ui:var(--cat-ui); --color-cat-api:var(--cat-api); --color-cat-perf:var(--cat-perf);
  --color-cat-sec:var(--cat-sec); --color-cat-compat:var(--cat-compat);
  --font-sans:var(--font-geist-sans); --font-mono:var(--font-geist-mono); --font-display:"DM Serif Display", Georgia, serif;
  --shadow-card:0 1px 2px rgba(15,37,87,.04), 0 8px 24px -16px rgba(15,37,87,.18);
  --shadow-lift:0 2px 4px rgba(15,37,87,.05), 0 16px 36px -18px rgba(15,37,87,.30);
  --shadow-pop:0 12px 32px -8px rgba(15,37,87,.22);
  --ease-out:cubic-bezier(.22,1,.36,1);
}
body { @apply bg-bg text-fg font-sans antialiased; }
:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
@media (prefers-reduced-motion: reduce) { *{ animation:none!important; transition:none!important; } }
```

---

## 6. Accessibility checklist

- Text contrast: `--muted #7A859C` on white is about 3.9:1, which passes for ≥14px medium text only. Captions at 10.5px should use `#6B7590` (≥4.5:1). **Open decision:** darken `--muted` or keep it as is for chart axes only.
- Every chart has a text alternative: its legend list or a visually hidden `<table>` via `<ChartContainer accessibilityLayer>`.
- Colour is never the only signal. Deltas carry +/− signs, severity tags carry words, and the gate has a text label.
- Every hover interaction also works on `:focus-visible`, so wedges and legend rows are focusable links.
- Hit targets are at least 32px (pills) and 36px (rail).
- Motion is fully disabled under `prefers-reduced-motion`.

---

## 7. Migration note

The deck specifies **Next.js + TypeScript + shadcn/ui + React Flow**. The current `trevyn-app/` is **Vite + JavaScript + Tailwind 4 + lucide**, with no shadcn and no TypeScript. Options:

1. **Follow the deck (recommended for judging consistency):** scaffold `trevyn-web` with `npx create-next-app@latest --ts --tailwind --app`, then `npx shadcn@latest init`. Port `data.js`, `store.jsx` and the existing pages progressively, starting with this Overview.
2. **Stay on Vite for speed:** add TypeScript and shadcn to the existing Vite app (shadcn supports Vite) and implement this spec there. Update slide 6 or accept the mismatch.

Tokens in §2 / §5.7 are a superset of the current `index.css`, so either path keeps the existing pages visually consistent.

---

## 8. Build order

1. Tokens (`globals.css`) and fonts → shell (icon rail, top bar, command menu).
2. `ChartCard`, `KpiCard` and `CountUp`, using static data from `data.ts`.
3. Charts: Run Health → Throughput → Category polar → Tick gauge → Failing suites.
4. Date range pill with URL state, then the export button and toast.
5. FastAPI `/dashboard/summary` and generated types; swap static data for the API.
6. SSE live updates, then the motion polish pass and the reduced-motion and a11y pass.
