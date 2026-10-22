# Porting plan: `trevyn-app` → `apps/web`

> **Goal:** move every page and shared component of the Vite prototype (`trevyn-app/`) into the Next.js glass app (`apps/web/`). Keep the prototype's behaviour and demo data exactly, and restyle everything to the glass design language.
> **Sources of truth:**
> - [DASHBOARD_DESIGN_SPEC.md](DASHBOARD_DESIGN_SPEC.md): layout and charts.
> - [GLASS_DESIGN_LANGUAGE.md](GLASS_DESIGN_LANGUAGE.md): surfaces, navigation, motion.
> - [trevyn_complete_project_context (1).md](<trevyn_complete_project_context (1).md>): domain, §20 API, §23 demo script.
>
> **Status on 21 Oct 2026:** `apps/web` has the shell plus the Overview. Every other route falls through to the `[...slug]` "not ported yet" placeholder. This plan covers the remaining 22 routes.

---

## Progress (22 Oct 2026)

| Phase | Status |
|---|---|
| **0 · foundations** | ✅ Done: shadcn select / slider / checkbox / radio-group / table / label + `@dnd-kit/core`; `components/kit/*`; P1 charts (`flow-map`, `timing`, `progress`); store rewrite (findings + policy, runs, launch / gate / stop, repair loop, one merged run script); `lib/demo/*` + getters in `lib/data.ts`; nav (Testing flyout, project menu, Policies); `npm run check:legacy`; DEMO markers. *Skipped:* the `/dev/kit` gallery page |
| **1 · demo path** | ✅ Done: `/runs/new`, `/plans`, `/runs/live`, `/runs`, `/findings`, `/findings/[id]`, `/board`, `/repair`, `/regression`, `/approvals`. `scripts/e2e_demo_path.py` passes 20/20 (wizard → policy block → launch → gate → finding evidence and challenge → board policy → repair → regression → approvals, plus mobile no-scroll), with no console errors |
| 2 · planning | ✅ Done: `/planner`, `/projects` |
| 3 · quality engineering | ✅ Done: `/ui-testing`, `/api-testing`, `/perf`, `/security`, `/compat`, `/network` (with a Platform view) |
| 4 · intelligence and admin | ✅ Done: `/analytics`, `/integrations`, `/policies`, `/settings` (with Appearance) |
| 5 · React Flow, cleanup | ✅ Done: `FlowMap` runs on `@xyflow/react` with the same props; the `[...slug]` placeholder is replaced by `app/not-found.tsx`. The live platform pipeline (pastel) and loop strip are back on the Overview |

**Prototypes removed (22 Oct):** `trevyn-app/` and `trevyn-frontend/` were deleted after the port; references to them below are historical (code comments still say "ported from trevyn-app/…" for provenance).

**Decisions applied:** D1 (dark `StagePanel`, one per page), D2 (FlowMap stays SVG until P5), D4 (non-DEF-142 findings show "Sample evidence"), D5 (Geist light numerals). D3 applied: `/ui-testing` and `/api-testing`. **Desktop only** (product decision, 22 Oct): mobile layouts are no longer tested.

**Lessons learned during P1:**
- shadcn's `CommandDialog` needs an explicit `<Command>` child, or the palette crashes on open.
- SVG presentation attributes can't read CSS variables. Set fonts through `style`.
- Next 16 keeps visited pages mounted but hidden, so tests must check *visible* text.
- In Playwright's sync API, read `location.pathname`; `page.url` goes stale.

---

## 0. Summary

| | |
|---|---|
| **What moves** | 9 page files (2,404 lines) covering 23 routes, 5 component libraries (41 exports, 3 of them unused), 1 store, 1 data file |
| **Why it isn't a copy-paste** | Different router (react-router → App Router), language (JSX → TSX), colour tokens (≈ 450 class/var uses change meaning), UI kit (hand-rolled → shadcn/ui on Base UI), and state (two stores → one live store) |
| **Order** | Phase 0 foundations → Phase 1 the §23 demo path → Phases 2–4 everything else → Phase 5 React Flow and cleanup |
| **Parallelism** | One person does Phase 0. After that, the work splits into 4 independent tracks (§7) |
| **Done when** | Every prototype route exists in `apps/web`, every interaction in §6 works, the legacy-token guard (§8.2) passes, and the `[...slug]` placeholder is deleted |

---

## 1. Inventory of the prototype

### 1.1 Pages and routes

| Prototype file | Exports → routes | Lines | Interactive weight |
|---|---|---|---|
| `pages/Overview.jsx` | `Overview` `/`, `Projects` `/projects`, `RunsTable` (shared) | 118 | Low: **Overview already replaced** in web |
| `pages/Board.jsx` | `Board` `/board`, `FindingsList` `/findings`, `FindingDetail` `/findings/:id` | 219 | **High**: drag and drop, filters, evidence tabs, challenge modal |
| `pages/Runs.jsx` | `Runs` `/runs`, `NewRun` `/runs/new`, `LiveRun` `/runs/live` | 257 | **High**: 5-step wizard, scripted live run with an approval gate |
| `pages/Plans.jsx` | `Plans` `/plans`, `Planner` `/planner`, `Regression` `/regression` | 105 | Medium: generate flow, autonomy slider driving a scatter |
| `pages/Repair.jsx` | `Repair` `/repair`, `Analytics` `/analytics` | 208 | **High**: patch approval → regression → graph flips to verified |
| `pages/Quality.jsx` | `UiTesting` `/ui`, `ApiTesting` `/api`, `Perf` `/perf`, `Security` `/security`, `Compat` `/compat` | 274 | Low to medium: mostly charts, trace frame picker |
| `pages/Network.jsx` | `Network` `/network`, `HAR` (shared data) | 134 | Medium: selectable service map |
| `pages/Admin.jsx` | `Approvals` `/approvals`, `Integrations` `/integrations`, `Policies` `/policies`, `Settings` `/settings` | 122 | Medium: approve/reject, allowlist validation |
| `App.jsx` | Shell: sidebar, palette, notifications, header, demo banner | 174 | **Already replaced** by the glass shell |

### 1.2 Shared components

| Library | Exports used by pages | Unused (drop) |
|---|---|---|
| `components/ui.jsx` | `cx` `Pill` `Tag` `Sev` `Type` `Status` `hue` `Avatar` `Label` `Panel` `KpiRow` `ConfRing` `Bar` `Check` `Note` `Btn` `Switch` `PageHead` `Table` `LineChart` `HBars` `Spark` | none |
| `components/net.jsx` | `FlowMap` (8 uses on 6 pages) `Waterfall` `StackedArea` `Histogram` | none |
| `components/rcharts.jsx` | `Perforation` `Barcode` `Stepper` `Pipeline` `ResultBar` `secs` `DurBar` `Gantt` `LiveSpark` | **`Columns`, `HealthRing`, `SevStrip`** |
| `components/qcharts.jsx` | `DotRange` `StackBars` `Heatmap` (latency) `Donut` | none |
| `components/icharts.jsx` | `Sankey` `Heatmap` (weekday × hour) `RiskScatter` `PairBars` | none |
| `pages/Network.jsx` | local `Donut` (duplicate of `qcharts.Donut`) | merge into one |

Two different components are both named `Heatmap`. They get distinct names in the port (§3.4).

### 1.3 State and data

- **`store.jsx`:** holds `findings` with `moveFinding`, `runs` with `setRuns`, `approvals` with `setApprovals`, `patch` (`pending | running | done`) with `setPatch`, and a custom `toast(msg, tone)`.
- **`data.js`:** `PEOPLE`, `COLS` / `colName`, `FINDINGS` (11), `RUNS` (6), `APPROVALS` (5), `NOTIFS`, and `days(n)`.
- **Inline constants:** about 40 constant blocks live inside page files. Examples: `PLAN`, `REG`, `TIMELINE`, `LOG`, `EVID`, `HAR`, `EPS`, `API_N/E`, `ATK_N/E`, `NODES/EDGES/INFO`, `DIFF`, `PROMPT`, `rcGraph`, `FLOW_COLS`, `HEAT`, `EV_NODES/EDGES`, `INT`, `ROLES/PERMS/RB`, `MATRIX`, `FRAMES`.

### 1.4 What `apps/web` already has

| Area | Already in web | Reuse in the port |
|---|---|---|
| Shell | Rail with flyouts, island, cluster, command menu, notifications, appearance, mobile nav, section tabs, shortcut pill | Extend the nav (§5.2) and switch the command menu to store findings |
| Primitives | `components/dashboard/bits.tsx`: `Card`, `Tag`, `PriorityTag`, `ProjectChip`, `RangeToggle`, `GlassTooltip`, `shortDate` | Promote to `components/kit/` (task 0.3) |
| Effects | `FxProvider` (spotlight, pulse), `CountUp`, `RollingNumber`, `Stagger/Item` | Use as is |
| State | `lib/live.tsx`: run, flash queue, events, approvals, loop, `approve/undo/request` | Becomes **the** store (task 0.5) |
| Data | `lib/data.ts` with `getDashboardSummary()`, `lib/types.ts` | Grow into `lib/demo/*` plus getters (task 0.6) |
| shadcn | button, card, chart, command, dialog, dropdown-menu, input, input-group, popover, sheet, skeleton, switch, tabs, textarea, toggle, toggle-group, tooltip | Add select, slider, checkbox, radio-group, table, label (task 0.2) |

---

## 2. Rules every ported file follows

1. **TypeScript, no `any` in props.** Each chart or kit component gets a typed props object. Data shapes live in `lib/types.ts`.
2. **Server page, client view.** `app/(workspace)/<route>/page.tsx` is a server component. It awaits the demo getter and renders `<XView data={…} />` from `components/<area>/x-view.tsx` (`"use client"`). This is the Overview's pattern, and it keeps the data seam where the FastAPI call will go.
3. **Shared entities come from the live store, never local copies.** Findings, runs, approvals, patch state and the live run log are shared. Page-local UI state (selected tab, wizard step, slider) stays in `useState`.
4. **No legacy tokens.** Use the translation table in §3.2. The guard script (§8.2) must pass before merge.
5. **Glass budget.**
   - At most about 12 blurred surfaces per screen.
   - A page with many tiles (Integrations has 13, Projects 5+) uses **one** `glass-1` container with `glass-inset` tiles inside.
   - Table rows are never glass.
6. **Interaction parity first, flair second.** Port the behaviour 1:1 (§6). Add glass effects (`spot`, `pulse`, `press`, motion entrances) only where §4 says to.
7. **Cache Components rules.** Read `Date.now()` / `new Date()` (no args), `usePathname`, `useSearchParams` and `params` either after mount, through `useSyncExternalStore` with a `null` server snapshot, or inside `<Suspense>`. Format dates with `timeZone: "UTC"` to avoid hydration mismatch.
8. **Honest demo labelling.** Anything scripted (the live run, the planner "generate", regression "run") stays visibly marked DEMO, as §23 of the context doc requires.

---

## 3. Translation tables

### 3.1 Framework

| Prototype | `apps/web` |
|---|---|
| `HashRouter` routes in `App.jsx` | Folders under `app/(workspace)/…/page.tsx`. A static folder beats the `[...slug]` catch-all, so pages can land one at a time |
| `<Link to="/x">` | `<Link href="/x">` from `next/link` |
| `useNavigate()` → `nav("/x")` | `useRouter()` → `router.push("/x")` |
| `useParams()` in `FindingDetail` | Server page: `const { id } = await props.params` inside `<Suspense>`, plus `generateStaticParams()` over demo finding IDs |
| Query-less filters | Read `?type=`, `?suite=`, `?date=` from `searchParams`; the Overview already links with them |
| `useStore().toast(msg, tone)` | `toast()` from `sonner`, with tone as a leading dot via `toast(msg, { icon: <Dot tone="bad" /> })`, or a small `notify(msg, tone)` helper in `lib/notify.tsx` |
| Fixed-overlay modals (`chal`, `rc`) | shadcn `Dialog` with `glass-2` content |
| `<select>`, `<input type=range>`, `<input type=checkbox>`, radio labels | shadcn `Select`, `Slider`, `Checkbox`, `RadioGroup` |
| `.inp` text inputs / textareas | shadcn `Input` / `Textarea` with a `glass-inset` class |
| `.th` / `.td` tables | shadcn `Table` wrapped by `kit/DataTable` (task 0.3) |
| `navigator.clipboard` | Unchanged; the failure toast stays |

### 3.2 Colour and style tokens

**Silent failures:** these classes compile without error but render wrong in the new theme. The counts are prototype occurrences.

| Prototype | Meaning there | In web it would… | Replace with |
|---|---|---|---|
| `text-muted` (149) | grey text | **almost invisible**: `--muted` is a 5% tint background | `text-muted-foreground` |
| `bg-accent`, `text-accent`, `border-accent`, `ring-accent` (58) | brand blue | **render a 10% tint**: shadcn `--accent` is the hover wash | `bg-brand`, `text-brand`, `border-brand`, `ring-brand` |
| `var(--muted)` in SVG fills/strokes (20) | grey | 5% tint | `var(--muted-foreground)` |
| `var(--accent)` in SVG/inline (10) | brand blue | 10% tint | `var(--brand)` |
| `bg-surface` (72) | white card | does nothing | `glass-1` (card), `glass-inset` (nested tile), `bg-white` (inside SVG nodes) |
| `bg-surface2` (36) | light grey well | does nothing | `glass-inset` or `bg-black/[.04]` |
| `var(--surface)` / `var(--surface2)` in SVG (17) | white / grey | undefined | `#fff` / `rgb(15 37 87 / .05)` |
| `border-line` (84), `var(--line)` (9) | hairline | does nothing / undefined | `border-border`, `var(--border)` |
| `text-fg` (10), `var(--fg)` (5) | ink | does nothing | `text-foreground`, `var(--foreground)` |
| `bg-fg`, `text-bg`, `bg-bg` | inverted | does nothing | `bg-ink text-white` / `bg-background` |
| `shadow-card` (19), `shadow-lift` (7) | elevation | does nothing | built into `glass-1`; lift = `hover:shadow-(--shadow-float)` |
| `font-display` on numbers (14) | DM Serif numerals | serif digits | `font-light tabular` (Geist light, glass spec §2.2). DM Serif stays only for the wordmark |
| `.lab-grid` | dot grid | missing | drop; the wallpaper replaces it |
| `.anim-in` | slide-in keyframe | missing | `motion` `initial/animate`, or `[animation:slidein_.2s_ease-out]` (keyframe already in `globals.css`) |
| `.flow` (animated dashed edge) | FlowMap edges | **missing keyframe** | add `@keyframes dash` + `.flow` to `globals.css` (task 0.1) |

**Unchanged (same names exist in web):** `ai`, `det`, `human`, `ok`, `warn`, `bad`, `navy` as `bg-*` / `text-*` / `border-*` and `var(--*)`. The `--h` hue trick in `Avatar` also stays.

**Dark "stage" hex colours** (`#0b1a3d`, `#12285a`, `#45dcc6`, `#ff8080`, …) stay as they are. They move into a `StagePanel` component (§3.3).

### 3.3 Primitives (`ui.jsx` → `components/kit/`)

| Prototype | Web target | Notes |
|---|---|---|
| `cx` | `cn` from `@/lib/utils` | |
| `Panel title extra flush` | `kit/Card` (promoted from `bits.tsx`), adding a `flush` prop (no body padding, rows run edge to edge) | Prototype titles have a diamond plus mono uppercase label; glass titles are 13.5px semibold with an optional caption |
| `PageHead eyebrow title sub children` | `kit/PageHeader` | Eyebrow is brand 11px uppercase; title is Geist 28/500 navy; actions are glass pills |
| `KpiRow items=[label,value,caption,tone]` (8 uses) | `kit/StatStrip` | Same tuple API so call sites port unchanged. Glass cards, `CountUp` when the value is numeric, caption coloured by tone, optional seeded `Sparkline`. Distinct from Overview's numeric-delta `KpiCard` |
| `Btn variant=default/primary/human/danger size=sm` | shadcn `Button`, extending its `cva` in `components/ui/button.tsx` with `glass`, `brand`, `human`, `danger` variants (pill, `press pulse`) | The prototype's `Btn` + `Link` nesting becomes `<Button render={<Link href…/>}>` (Base UI `render` prop) |
| `Pill tone dot pulse` | `kit/Pill` | Tones: ok, bad, warn, acc→**brand**, ai, det, human, mut |
| `Tag k` | `kit/Tag` (already in `bits.tsx`) | |
| `Sev s`, `Type t`, `Status s` | `kit/Severity`, `kit/FindingTypePill`, `kit/RunStatus` | Types lower-cased (§3.5) |
| `Avatar k size` | `kit/Avatar` | Same hue hash; ring-2 white |
| `Label` | `kit/MonoLabel` | |
| `ConfRing p size` | `kit/ConfRing` | Same SVG; stroke `--ai`; track `rgb(15 37 87/.08)` |
| `Bar p c` | `kit/Meter` | motion width fill on view (like `FailingSuites`) |
| `HBars rows` | `kit/HBars` | Built on `Meter` |
| `Check k` | `kit/CheckLine` | |
| `Note tone icon` | `kit/Note` | Tinted glass: `bg-ai/8 border-ai/25` etc. |
| `Switch` | shadcn `Switch` | API differs: `checked`/`onCheckedChange` |
| `Table head` | `kit/DataTable` on shadcn `Table` | Glass card body, hover row `bg-white/60`, mono header labels. Clickable rows: first cell is a `Link`, row gets `cursor-pointer` + `onClick` (keyboard-reachable through the link) |
| `Spark v color` | `charts/Sparkline` | Same SVG |
| `LineChart …thr thrL` | `charts/TrendLine` (Recharts `LineChart` + `ReferenceLine` + `GlassTooltip`) | Keeps the single linear scale (`min/max/step`) |
| New | `kit/StagePanel` | Dark navy section used 5×: eyebrow (mono), title, legend chips, body, optional footer stat strip. Its title switches from DM Serif to Geist 24/500 |

### 3.4 Charts and visuals (`components/charts/`)

**Keep custom SVG** where the prototype's chart is bespoke and already disciplined (single scale, labelled axes). **Move to Recharts** where it's a standard cartesian chart that gains the shared glass tooltip.

| Prototype | Web file / name | Approach | Needed by phase |
|---|---|---|---|
| `FlowMap` | `charts/flow-map.tsx` → `FlowMap` | **SVG port in Phase 0**, unchanged props (`nodes, edges, w, h, dark, sel, onSelect, nw, nh, minW`). **Phase 5** swaps internals to React Flow + Dagre behind the same props | P1 (LiveRun, FindingDetail, Repair) |
| `Waterfall` | `charts/waterfall.tsx` | SVG/div port | P1 (FindingDetail) |
| `Gantt` | `charts/gantt.tsx` | div port | P1 (Runs) |
| `Pipeline` | `charts/pipeline.tsx` | div port in a glass card | P1 (LiveRun) |
| `Stepper` | `charts/stepper.tsx` | div port; active node = brand ring; motion rail fill | P1 (NewRun) |
| `ResultBar`, `DurBar`, `secs` | `charts/run-bars.tsx` | port | P1 (Runs) |
| `Perforation`, `Barcode` | `kit/ticket.tsx` | port; notch colour = card glass | P1 (NewRun, Board card) |
| `LiveSpark` | `charts/live-spark.tsx` | port (dark stage) | P1 (LiveRun) |
| `PairBars` | `charts/pair-bars.tsx` | port | P1 (Repair) |
| `RiskScatter` | `charts/risk-scatter.tsx` | port; animate threshold with motion | P2 (Planner) |
| `StackBars` | `charts/stack-bars.tsx` | port | P3 (UI, Security) |
| `DotRange` | `charts/dot-range.tsx` | port | P3 (API) |
| `Heatmap` (qcharts, latency) | `charts/latency-heatmap.tsx` → `LatencyHeatmap` | port, renamed | P3 (Perf) |
| `Donut` (qcharts) + Network's local `Donut` | `charts/donut.tsx` → one `Donut` with `children` centre | merged | P3 (Compat, Network) |
| `StackedArea` | `charts/stacked-area.tsx` | **Recharts** `AreaChart` with `stackId` | P3 (API, Network) |
| `Histogram` | `charts/histogram.tsx` | **Recharts** `BarChart` + `ReferenceLine` marks | P3 (Network) |
| `LineChart` | `charts/trend-line.tsx` → `TrendLine` | **Recharts** | P3/P4 (Perf, Analytics) |
| `Sankey` | `charts/sankey.tsx` | port | P4 (Analytics) |
| `Heatmap` (icharts, weekday × hour) | `charts/week-hour-heatmap.tsx` → `WeekHourHeatmap` | port, renamed | P4 (Analytics) |
| `Columns`, `HealthRing`, `SevStrip` | none | **drop** (never used) | |

### 3.5 State (`store.jsx` + `data.js` → `lib/live.tsx` + `lib/demo/*`)

| Prototype | Web | Change |
|---|---|---|
| `findings`, `moveFinding(id, col)` | `LiveState.findings: Finding[]`, `store.moveFinding(id, column) → { ok, reason? }` | **The policy check moves into the store:** Verified only from Regression rerun. Pages show the reason. The demo stream's DEF-143 is appended to `findings` so the island's link resolves |
| `runs`, `setRuns` | `LiveState.runs: RunSummary[]`, `store.launchRun(config)` | `launchRun` inserts the run, starts the scripted log (§3.6), blocks `env === "prod"` |
| `approvals`, `setApprovals` | already in store | Add `who`, `href` to `Approval`; add `store.reject(id)`; keep `approve/undo/request` |
| `patch`, `setPatch` | `LiveState.repair: { DEF-142: "pending" \| "running" \| "done" }`, `store.approveRepair("DEF-142")` | Owns the 2.2s regression timer, then `moveFinding(..., "regression")`, then resolves AP-31, then a toast. Overview, Board, Approvals and Repair all react |
| `toast` | `sonner` | §3.1 |
| `data.js` constants | `lib/demo/core.ts` | `PEOPLE`, `COLUMNS`, `FINDINGS` (+DEF-143), `RUNS`, `APPROVALS` merged with web's richer approval list, `NOTIFICATIONS` |
| `days(n)` (anchored to **Oct 16**) | `lib/demo/dates.ts` → `DEMO_TODAY = 2026-10-21`, `lastDays(n)` UTC | **All demo dates re-anchor to Oct 21**, so "Today", "Yesterday" and the 30-day ranges agree with the Overview |

**Type normalisation (`lib/types.ts`):** these align with context doc §15.

```ts
type FindingType = "ui" | "api" | "perf" | "security" | "compat"          // prototype used "UI" | "API" | "Perf" | "Security"
type BoardColumn = "triage" | "investigating" | "repair" | "approval" | "regression" | "verified"
type Verdict = "confirmed" | "likely" | "inconclusive" | "env_failure" | "setup_failure"   // §3/§17; prototype had `unc: true`
type Finding = { id; title; severity; type: FindingType; column: BoardColumn; verdict: Verdict; confidence; evidenceCount; owner; runId }
type RunSummary = { id; name; status: "running" | "passed" | "failed" | "warn" | "stopped"; passed; total; duration?; trigger; startedLabel }
```

### 3.6 One live run, not two

There are two scripted runs today:
- the web store's RUN-0413 script, which drives the island, stat pills and rings;
- the prototype `LiveRun`'s 17-step `LOG` with an approval gate.

They are merged into **one script in the store** so the island, Overview and `/runs/live` tell the same story.

- **New store fields:**
  - `run.log: { stage: 0-4; kind: Provenance | "bad" | "gate"; text }[]`
  - `run.stage`
  - `run.gate: "none" | "waiting" | "approved"`
  - `run.stopped`
- **Pacing:** the prototype `LOG` becomes the event script. Each entry advances `done` by its share of 46 tests, matching the prototype's `TP` / `EVID` thresholds.
- **The gate:** when the script reaches the gate entry, it sets `gate = "waiting"`, pauses, and flashes the island in its *Needs you* state with **Approve**. Approving from `/runs/live`, the island or the Approvals page resumes the run.
- **Stop:** `store.stopRun()` keeps the evidence collected so far, as the prototype's Stop button does.
- **On load:** the page opens mid-run, as the Overview does today. `/runs/live` shows the log so far and continues from there. Launching from the wizard starts a fresh `RUN-0414` from step 0.

---

## 4. Glass treatment per page type

| Page pattern | Treatment |
|---|---|
| Page header | `kit/PageHeader`; actions as glass pills; one brand-glow primary CTA at most |
| KPI row | `kit/StatStrip` (glass, count-up) |
| Tables | One `glass-1` `Card flush` with `DataTable`; rows hover `bg-white/60` |
| Dark network maps (5 pages) | `kit/StagePanel`. **One per page at most** (see decision D1) |
| Forms (wizard, policies, settings) | `glass-inset` inputs; selected option cards use brand ring + `glass-2` |
| Modals | shadcn `Dialog` with `glass-2 rounded-3xl` |
| Many small tiles | One glass container, inset tiles (rule 5) |
| Charts | Inside `glass-1` cards; Recharts ones use `GlassTooltip`; custom SVG keeps native `<title>` tooltips |
| Motion | `Stagger`/`Item` page entrance; `Meter` bar fills on view; layout animation on list moves (board, approvals); nothing else animates continuously except FlowMap packets and the live log |

---

## 5. Route map and navigation

### 5.1 Routes

| # | Prototype route | Next path (`app/(workspace)/…`) | Source | Phase |
|---|---|---|---|---|
| 1 | `/` | `page.tsx` | (rebuilt) | ✅ done |
| 2 | `/runs/new` | `runs/new/page.tsx` | `Runs.NewRun` | **P1** |
| 3 | `/plans` | `plans/page.tsx` | `Plans.Plans` | **P1** |
| 4 | `/runs/live` | `runs/live/page.tsx` | `Runs.LiveRun` | **P1** |
| 5 | `/runs` | `runs/page.tsx` | `Runs.Runs` + `Overview.RunsTable` | **P1** |
| 6 | `/findings` | `findings/page.tsx` | `Board.FindingsList` | **P1** |
| 7 | `/findings/:id` | `findings/[id]/page.tsx` | `Board.FindingDetail` | **P1** |
| 8 | `/board` | `board/page.tsx` | `Board.Board` | **P1** |
| 9 | `/repair` | `repair/page.tsx` | `Repair.Repair` | **P1** |
| 10 | `/regression` | `regression/page.tsx` | `Plans.Regression` | **P1** |
| 11 | `/approvals` | `approvals/page.tsx` | `Admin.Approvals` | **P1** |
| 12 | `/planner` | `planner/page.tsx` | `Plans.Planner` | P2 |
| 13 | `/projects` | `projects/page.tsx` | `Overview.Projects` | P2 |
| 14 | `/ui` | `ui/page.tsx` | `Quality.UiTesting` | P3 |
| 15 | `/api` | `api/page.tsx` ⚠ see D3 | `Quality.ApiTesting` | P3 |
| 16 | `/perf` | `perf/page.tsx` | `Quality.Perf` | P3 |
| 17 | `/security` | `security/page.tsx` | `Quality.Security` | P3 |
| 18 | `/compat` | `compat/page.tsx` | `Quality.Compat` | P3 |
| 19 | `/network` | `network/page.tsx` | `Network.Network` + Overview topology | P3 |
| 20 | `/analytics` | `analytics/page.tsx` | `Repair.Analytics` | P4 |
| 21 | `/integrations` | `integrations/page.tsx` | `Admin.Integrations` | P4 |
| 22 | `/policies` | `policies/page.tsx` | `Admin.Policies` | P4 |
| 23 | `/settings` | `settings/page.tsx` | `Admin.Settings` + Appearance | P4 |

P1 is ordered by the §23 demo script: input → plan → live run → proof → repair → regression.

### 5.2 Navigation changes in web (task 0.7)

The prototype sidebar has destinations the glass rail doesn't yet reach.

- **New "Testing" flyout** in the main capsule: Test runs, New run, Test plans, Regression suite, Findings board. The plain "Test runs" icon is removed in favour of it.
- **Projects:** reached from the **workspace pill** (top left). It becomes a `DropdownMenu` listing the 5 demo projects plus **All projects → `/projects`**.
- **Policies & access:** added to the utility capsule (Integrations, Policies, Settings).
- **Command menu:** uses `store.findings` (live, including DEF-143) instead of the static list, and adds "New test run" and "Approve pending gate" actions.
- **Fix web links that point nowhere:**
  - `ActiveRuns` cards link to `/runs/${id}`; change them to `/runs/live` when running and `/runs?run=${id}` otherwise.
  - Island "View" for DEF-143 resolves once DEF-143 is in `findings`.
- **Provenance legend:** the prototype's legend banner (AI / DET / HUMAN dots) was dropped in web. Bring it back as `kit/Legend` in the `PageHeader` of pages that use those colours (Runs, Live run, Findings, Repair, Approvals).

---

## 6. Page-by-page port sheets (interaction parity checklists)

Each sheet lists what must still work after the port. Check every box before the PR merges.

### Phase 1 — the demo path

**P1.1 · `/runs/new` · Create test run** (`Runs.NewRun`, about 90 lines → `components/runs/new-run-view.tsx`)
- [ ] 5-step `Stepper`; clicking any step jumps to it; Back is disabled on step 1; Continue / Launch
- [ ] Step 1 fields bound to one state object (`INIT`); environment `Select` with "Production (blocked by policy)"
- [ ] Step 2 requirement `Textarea`, "Evidence-linked" / "1 ambiguity flagged" pills, ambiguity `Note`, attachments `DataTable`
- [ ] Step 3 mode cards (Black / Gray / White-box), selected = brand ring + "Selected" pill
- [ ] Step 4 suite rows with `Switch`; enabled rows tinted `det`
- [ ] Step 5 budget `Slider` (5–60, step 5), workers `Select` (1–4), two switches, policy pre-check lines (prod line turns `bad`)
- [ ] "Save draft" toast
- [ ] Launch with prod shows the policy toast and does nothing else; otherwise `store.launchRun(w)`, toast, then `router.push("/runs/live")`
- [ ] Manifest ticket aside updates live: env stamp, Perforation × 2, field list, mode, suite chips, budget, gate line, Barcode seeded by name+url+mode, lock note
- **Glass:** wizard and manifest are `glass-1`; the manifest gets `spot`; Stepper sits in `glass-2`.

**P1.2 · `/plans` · Generated test plan** (`Plans.Plans`)
- [ ] 7-stage pill pipeline (first 4 ✓ ok, rest brand) with arrows
- [ ] Plan `DataTable` (7 rows, 8 columns) with Severity and state pills
- [ ] "Plan validation" checks + "Quality over quantity" note
- [ ] "Approve & run" toast. "Edit plan" is a no-op in the prototype: **make it open `/planner`**

**P1.3 · `/runs/live` · Live run** (`Runs.LiveRun`, the biggest port → `components/runs/live-run-view.tsx` reading the store, §3.6)
- [ ] `StagePanel` "Worker network": `FlowMap dark` whose node/edge colours and labels derive from stage / gate / stopped / evidence count, exactly as `nodes` / `edges` are computed today
- [ ] Throughput `LiveSpark` (tests/min series `TP`)
- [ ] Footer strip: Workers, Queue depth, Egress, Evidence
- [ ] `Pipeline` with 5 stages, frac fill, state run / gate / stop / done, per-stage notes
- [ ] Run log: auto-scroll, timestamp column (UTC), `Tag` per line, gate line shows **Approve and continue** (human button), which turns into an "Approved by Alex Chen" pill
- [ ] Status pill: Running (pulse), Waiting for approval, Completed with findings, Stopped
- [ ] Results bar (passed / failed / inconclusive), 4 counters (light numerals)
- [ ] Evidence trail timeline (5 items light up at thresholds)
- [ ] "Stop run" (danger) disabled when done or stopped; toast
- [ ] When done: "Open finding DEF-142" CTA
- [ ] **New:** the island and Overview stay in sync (same store run)

**P1.4 · `/runs` · Run ledger** (`Runs.Runs` + `RunsTable`)
- [ ] `StatStrip` with 4 KPIs
- [ ] Ledger `DataTable`: id + name, `RunStatus`, `ResultBar`, `DurBar` (shared max) or "in progress", coloured trigger, started
- [ ] Row click: running → `/runs/live`, else `/findings/DEF-142` (keep), plus `?suite=` / `?date=` / `?run=` filtering and highlight (from Overview links)
- [ ] `Gantt` "Run timeline" with phase legend

**P1.5 · `/findings` · Findings list** (`Board.FindingsList`)
- [ ] Shared filter bar: search `Input` + type chips All / UI / API / Perf / Security (+ **Compat**) + count. Becomes `components/findings/use-finding-filter.tsx` and reads `?type=` initially
- [ ] `StatStrip` computed from the filtered list (open, high, inconclusive, average confidence)
- [ ] `DataTable` with ConfRing column; row → detail; "Board view" link

**P1.6 · `/findings/[id]` · Finding detail** (`Board.FindingDetail`)
- [ ] Unknown id falls back to the first finding (keep), or shows `notFound()` (see D4)
- [ ] Back link, eyebrow `id · type · RUN-0412`, actions Assign (toast), Mark needs review (toast), **Generate repair prompt → `/repair`**
- [ ] Pill row: severity, Confirmed/Inconclusive, type, AI confidence, column
- [ ] Bad `Note` summary
- [ ] Bug details `dl` + reproduction steps
- [ ] Evidence viewer `Tabs`: Screenshot (simulated order history with duplicate highlight), Timeline, Network (`Waterfall` of `HAR` + bad caption), Console (pre with red last line)
- [ ] Verification: expected 1 / observed 2, check lines, uncertainty `Note`
- [ ] Report history + **Challenge finding** `Dialog` (textarea pre-filled): submit appends a human entry, then after 1.5s a det entry and an ai toast
- [ ] "Failure propagation" `FlowMap` (light, 4 nodes)
- **Data:** the evidence content for DEF-142 moves to `lib/demo/findings.ts`. Other IDs show the same evidence (prototype behaviour); see D4.

**P1.7 · `/board` · Findings board** (`Board.Board`)
- [ ] Same filter bar
- [ ] 6 columns (`COLUMNS`), horizontal scroll, count pill
- [ ] **Drag and drop with `@dnd-kit/core`** (task 0.2):
  - The card lifts with `scale 1.03`, `rotate 1.5°` and a float shadow.
  - The target column glows with a dashed inset.
  - The keyboard sensor works.
- [ ] Drop runs `store.moveFinding()`:
  - On success, a toast reads "DEF-x moved to …" and the cards reflow with a layout animation.
  - On refusal, the card **shakes** back and a toast shows the reason ("Blocked by policy: a fix reaches Verified only after its regression rerun passes.").
- [ ] Evidence-ticket card: severity diamond, mono id, title, `ConfRing`, type and inconclusive pills, `Perforation`, 8-tick evidence meter, `Avatar`. Click or Enter opens the detail
- [ ] Header: "Sprint 14 · Oct 7 – Oct 20" eyebrow; "List view" and "New test run"
- **Glass:** columns are `glass-1`; cards are `glass-inset` (budget rule).

**P1.8 · `/repair` · Repair assistant** (`Repair.Repair`)
- [ ] `StagePanel` root-cause `FlowMap dark` with **selectable nodes**, an info bar from `RC_INFO`, and a title that flips after approval; the graph switches with `rcGraph(done)`
- [ ] Diff viewer (`DIFF`) with +7 / −1 pills
- [ ] Footer by state:
  - **pending:** policy lock text, "Request changes" `Dialog` (→ ai toast), and "Approve patch & rerun regression" (human)
  - **running:** pulse text
  - **done:** "Approved by Alex Chen · regression passed" pill
- [ ] Approve calls `store.approveRepair("DEF-142")`. That moves DEF-142 to Regression, resolves AP-31 (which the **Overview review queue and Approvals reflect too**), and toasts
- [ ] Before / after panel: placeholder, then running skeleton bars, then `PairBars` with Before/After cards and checks
- [ ] Diagnosis `Meter` 92% (ai); repair prompt `pre` + Copy (clipboard success/fail toasts)

**P1.9 · `/regression` · Regression suite** (`Plans.Regression`)
- [ ] `StatStrip`, "Run full suite": busy for 1.8s, then a warn toast
- [ ] `DataTable` with a 20-run history strip (`Hist` → `kit/RunHistoryStrip`) and status
- [ ] **New:** after `approveRepair`, CHECKOUT-014's last status shows passed (read the repair state from the store)

**P1.10 · `/approvals` · Approvals** (`Admin.Approvals`)
- [ ] List from `store.approvals`: Tag, category · id, title (link when `href`), why, Severity, Avatar, Reject / Approve
- [ ] Approve calls `store.approve` (same as the Overview queue, so rings update); Reject calls `store.reject`; toasts
- [ ] Empty state; 4 category count tiles (one glass container)
- [ ] **New:** the live-run gate shows up here as an approval while it's waiting

### Phase 2

**P2.1 · `/planner` · AI test planner** (`Plans.Planner`)
- [ ] Request `Textarea`, context chips, "Generate plan": loading for 1.3s, then a generated list with Auto-run / Needs approval computed from the autonomy level
- [ ] Autonomy `Slider` (0–2) with a `Note` that updates
- [ ] `RiskScatter` reacting to the slider (threshold band and line animate)
- [ ] "Open in Test Plans" goes to `/plans`

**P2.2 · `/projects` · Projects** (`Overview.Projects`)
- [ ] 5 project cards (hue tile, env stamp, pass rate, `Sparkline`, open findings, last run); "New project" toast
- [ ] The workspace pill dropdown lists the same projects (task 0.7)

### Phase 3 — quality engineering

| Sheet | Must-keep interactions and visuals |
|---|---|
| **P3.1 `/ui`** | 5 browser cards (one container) with `Meter`; trace frame picker (6 frames, selected = brand ring, failed frames red border); actions list; selected-frame `dl`; `StackBars` page weight; LCP `Strip` (→ `StatStrip` compact variant) + `HBars` |
| **P3.2 `/api`** | `StatStrip`; endpoint call graph `FlowMap` (light, 15 nodes, `nw=186`); `StackedArea` status codes (Recharts); `DotRange` p50→p95 with SLO; endpoints `DataTable` with ✓/!/✗ icons and `Sparkline` |
| **P3.3 `/perf`** | Compact `StatStrip` (5); **two `TrendLine`s sharing the x axis** (VUs and p95 with thresholds); k6 thresholds list; cause `Note`; `HBars` queries/request; `LatencyHeatmap` with threshold row and VU footer; error-rate `TrendLine` |
| **P3.4 `/security`** | `StatStrip`; `StagePanel` attack-surface `FlowMap dark` (14 nodes) + footer stats; `StackBars` by OWASP category; findings `DataTable` |
| **P3.5 `/compat`** | 5×4 matrix table with Pass / Warn / Fail / N/A cells; `Donut` with centre %; legend counts; per-OS `Meter` list |
| **P3.6 `/network`** | `StatStrip`; service map `FlowMap` **selectable**, detail panel (throughput / p95 / errors, note, connection buttons that re-select); `Waterfall`; `StackedArea`; `Histogram` with p50/p95 marks; status `Donut`; top endpoints `DataTable` with `Meter`. **New:** a "Platform" / "App under test" `RangeToggle`. Platform shows the old Overview topology (`TOPO_N/E`) as a `StagePanel` driven by the live store |

### Phase 4 — intelligence and admin

| Sheet | Must-keep interactions and visuals |
|---|---|
| **P4.1 `/analytics`** | `StatStrip`; `Sankey` finding flow; `HBars` + 3 count tiles; two `TrendLine`s (pass rate, MTTR with target line); `StagePanel` claim→evidence `FlowMap dark` **selectable**, linked-list footer; `WeekHourHeatmap`; flaky tests table |
| **P4.2 `/integrations`** | 13 cards **in one glass container**, each with a hue tile, name, description, category pill, `Switch` (+ toast) |
| **P4.3 `/policies`** | Rego viewer (syntax-coloured spans → `ai` / `det` / muted); allowlist chips with remove (warn toast); add form with **hostname regex validation and prod/www blocking** (bad toasts); managed secrets list (masked); RBAC `Checkbox` matrix (Owner column disabled) |
| **P4.4 `/settings`** | Model provider `RadioGroup` cards; budget `Input` number; 3 notification `Switch`es; **Appearance section** embedding the existing `Appearance` component (glass spec C.16), plus a "Show shortcut hint again" reset |

---

## 7. Phases, tasks and parallel tracks

### Phase 0 — foundations (one owner; everything else depends on it)

| Task | Output | Done when |
|---|---|---|
| **0.1 Global CSS** | `@keyframes dash` + `.flow`; `.ticket-notch` helper | FlowMap packets and dashes animate |
| **0.2 Dependencies** | `npx shadcn@latest add select slider checkbox radio-group table label`; `npm i @dnd-kit/core @dnd-kit/utilities` | Build passes |
| **0.3 Kit** | `components/kit/*`: move `Card`, `Tag`, `PriorityTag`, `ProjectChip`, `RangeToggle`, `GlassTooltip` out of `dashboard/bits.tsx` (re-export for the Overview); add `PageHeader`, `StatStrip`, `Pill`, `Severity`, `FindingTypePill`, `RunStatus`, `Avatar`, `MonoLabel`, `ConfRing`, `Meter`, `HBars`, `CheckLine`, `Note`, `DataTable`, `StagePanel`, `Legend`, `ticket` (Perforation/Barcode), `RunHistoryStrip`; extend `Button` variants | A `/dev/kit` page (dev-only, `notFound()` in prod) shows every primitive |
| **0.4 P1 charts** | `charts/flow-map`, `waterfall`, `gantt`, `pipeline`, `stepper`, `run-bars`, `live-spark`, `pair-bars`, `sparkline`, `trend-line` | Shown on `/dev/kit` with prototype data |
| **0.5 Store** | Extend `lib/live.tsx`: `findings` + `moveFinding` (policy), `runs` + `launchRun`, `reject`, `repair` + `approveRepair`, the merged run script with `log/stage/gate/stopped` + `approveGate`/`stopRun` (§3.6) | Overview still behaves exactly as now; unit-check `moveFinding` refusals |
| **0.6 Demo data** | `lib/demo/{core,dates,runs,findings,plans,repair,quality,network,analytics,admin}.ts` (constants moved verbatim, typed); getters in `lib/data.ts` named after §20 endpoints (`getRuns`, `getRun`, `getFindings`, `getFinding`, `getPlan`, …) each with a `// GET /api/...` comment | No page imports `lib/demo/*` directly, only getters |
| **0.7 Navigation** | Testing flyout, workspace-pill project menu, Policies in the utility capsule, command menu from store, link fixes, `Legend` | All nav targets resolve (placeholder allowed until ported) |
| **0.8 Guard + shots** | `scripts/check-legacy.mjs` (§8.2) + `npm run check:legacy`; move the Playwright screenshot script into `apps/web/scripts/shots.py` with per-route targets | Both run locally |
| **0.9 Demo label** | Island and `/runs/live` show a `DEMO` marker while the scripted stream drives them | Visible at all times |

### Phases 1–5

| Phase | Scope | Exit criteria |
|---|---|---|
| **P1 · demo path** | P1.1–P1.10 | The §23 story runs end to end in web with no placeholder: New run → Plan → Live run (approve gate) → DEF-142 detail (challenge) → Repair (approve) → Regression → Approvals/Overview reflect it |
| **P2 · planning** | P2.1–P2.2 | |
| **P3 · quality engineering** | P3.1–P3.6 | Charts at prototype fidelity; Recharts ones have glass tooltips |
| **P4 · intelligence and admin** | P4.1–P4.4 | |
| **P5 · finish** | Swap `FlowMap` internals to **React Flow + Dagre** (`@xyflow/react`, `@dagrejs/dagre`) with the same props and custom node and animated edge types, as the deck promises; delete `app/(workspace)/[...slug]`; remove `/dev/kit` from production; final contrast/perf pass (glass spec Part E) | No placeholder route left; all 23 routes pass §8 |

### Parallel tracks (after Phase 0)

| Track | Phase 1 | Then |
|---|---|---|
| **A · Runs** | P1.1 New run, P1.3 Live run, P1.4 Runs | P3.6 Network |
| **B · Findings** | P1.5 Findings, P1.6 Finding detail, P1.7 Board | P3.1 UI, P3.5 Compat |
| **C · Repair loop** | P1.2 Plans, P1.8 Repair, P1.9 Regression, P1.10 Approvals | P2.1 Planner, P4.1 Analytics |
| **D · Platform** | Help Phase 0 (charts), then P2.2 Projects | P3.2 API, P3.3 Perf, P3.4 Security, P4.2–4.4 Admin, P5 React Flow |

Tracks A and C both touch the store (gate approval, repair). Agree on the task 0.5 API before splitting, and route any store change through one reviewer.

---

## 8. Verification

### 8.1 Per-PR checklist

- [ ] `npm run build`, `npm run lint` and `npm run check:legacy` are all green
- [ ] Every box in the page's §6 sheet is ticked
- [ ] Screenshots at 1440×900 and 390×844: no horizontal page scroll; compared side by side with the prototype (`cd trevyn-app && npm run dev`)
- [ ] Shared state goes through the store: actions on this page show up on the Overview, island, Approvals or Board where relevant
- [ ] Page `metadata.title` is set; keyboard can reach every action; `prefers-reduced-motion` turns off entrances and packets
- [ ] Glass budget holds (≤ about 12 blurred surfaces visible); scripted behaviour is labelled DEMO

### 8.2 Legacy-token guard (task 0.8)

```js
// apps/web/scripts/check-legacy.mjs: fails the build on prototype tokens that compile but render wrong
import { globSync, readFileSync } from "node:fs" // fs.globSync needs Node 22+ (team has Node 24)
const RULES = [
  [/\btext-muted(?!-foreground)\b/, "text-muted-foreground"],
  [/\b(bg|text|border|ring|fill|stroke)-accent\b/, "*-brand"],
  [/\bbg-surface2?\b|\bborder-line\b|\btext-fg\b|\bbg-fg\b|\btext-bg\b|\bbg-bg\b/, "see PORTING_PLAN §3.2"],
  [/\bshadow-(card|lift)\b/, "glass-1 / hover:shadow-(--shadow-float)"],
  [/var\(--(surface2?|line|fg|accent)\)/, "var(--border|--foreground|--brand) or literal"],
  [/var\(--muted\)/, "var(--muted-foreground)"],
  [/className="[^"]*\b(inp|th|td|lab-grid|anim-in)\b/, "shadcn Input / kit DataTable / motion"],
]
let bad = 0
for (const f of globSync("{app,components,lib}/**/*.{ts,tsx}", { exclude: (p) => p.includes("components/ui/") })) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    for (const [re, fix] of RULES) if (re.test(line)) { bad++; console.error(`${f}:${i + 1}  ${line.trim().slice(0, 90)}\n   → ${fix}`) }
  })
}
if (bad) { console.error(`\n${bad} legacy token(s). See PORTING_PLAN.md §3.2`); process.exit(1) }
```

`components/ui/` (shadcn-generated) is excluded because it legitimately uses shadcn's `accent` and `muted`.

---

## 9. Decisions for the team (with my recommendation)

| # | Question | Recommendation |
|---|---|---|
| **D1** | The glass spec says the island is the *only* dark object, but 5 prototype pages rely on dark navy "stage" panels for network maps. Keep them? | **Keep, as `StagePanel`, one per page.** Amend glass spec B.1.5 to say "the only dark *chrome*". The dark maps are the strongest visuals in the prototype and match the deck |
| **D2** | Swap `FlowMap` to React Flow now or later? | **Later (P5), behind the same props.** The SVG version works and is used 8 times; doing the swap first would block every track |
| **D3** | `app/(workspace)/api/page.tsx` serves the page at `/api`, and the FastAPI backend will also live under `/api/...` (§20). Same origin through a proxy will collide | **Rename the page route to `/api-testing`** (also `/ui` → `/ui-testing` for symmetry) and update nav. Alternatively keep `/api` and serve the backend from a separate origin |
| **D4** | `/findings/[id]` for IDs other than DEF-142 shows DEF-142's evidence (prototype shortcut) | **Keep for the demo**, but show a "Sample evidence (DEF-142)" label on non-142 findings so nothing is presented as real evidence it isn't (§23 honesty rule) |
| **D5** | Prototype numerals use DM Serif (`font-display`); the glass spec uses Geist light | **Geist light** everywhere; DM Serif only for the wordmark |
| **D6** | Delete `trevyn-app/` after P5? | **Keep it until the Stage-2 submission is done**; then archive it (tag a commit) rather than delete it |
| **D7** | `trevyn-frontend/index.html` (98 KB single-file prototype) | **Out of scope**: it predates `trevyn-app`, and everything in it is covered there. Confirm nobody needs something only it has |

---

## 10. Out of scope for this plan

- Real FastAPI/SSE integration. Getters and the store are the seams; wiring them is separate work.
- Authentication, RBAC enforcement and real OPA calls. The UI only *depicts* them, as the prototype does.
- Dark theme (glass spec lists it as "later").
- New features not in the prototype. The only additions are the ones listed as **New** in §6, which connect pages that already exist.
