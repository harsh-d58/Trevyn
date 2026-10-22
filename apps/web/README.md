# Trevyn web dashboard (`apps/web`)

The Trevyn QA dashboard in the deck's frontend stack: **Next.js 16 · React 19 · TypeScript · Tailwind v4 · shadcn/ui (Base UI) · Recharts · motion**.

The design is specified in [`../../DASHBOARD_DESIGN_SPEC.md`](../../DASHBOARD_DESIGN_SPEC.md), which covers layout and charts in the Coinly style. The light glass layer is in [`../../GLASS_DESIGN_LANGUAGE.md`](../../GLASS_DESIGN_LANGUAGE.md).

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # type-checks and prerenders; must stay green
npm run lint
```

## Status

- **Built:**
  - All 23 prototype routes from [PORTING_PLAN.md](../../PORTING_PLAN.md), plus the live platform pipeline on the Overview. Maps use React Flow (`components/charts/flow-map.tsx`).
  - The app is desktop-only.
  - `npm run check:legacy` guards against prototype tokens that render wrong.
  - `python scripts/e2e_demo_path.py` walks the demo story; `python scripts/sweep_routes.py` loads every route and checks errors, overflow and links. Both run against `next start -p 3210`.
- **Demo data:** all data is labelled `STAGING · DEMO`.
  - `lib/data.ts` getters are the FastAPI seams (project context §20).
  - `lib/live.tsx` plays one scripted run (`lib/demo/runs.ts` `LIVE_SCRIPT`) in place of the SSE stream.

## Layout

| Path | What it is |
|---|---|
| `app/globals.css` | Tokens (legend colours, `--brand` accent), glass tiers, wallpaper presets, spotlight/pulse effects |
| `app/(workspace)/` | Workspace layout (live store + shell), Overview `page.tsx`, blur-in `template.tsx`, placeholder `[...slug]` |
| `components/shell/` | Wallpaper, rail, island, top bar, command menu, appearance, section tabs |
| `components/dashboard/` | Overview cards: KPIs, hero, loop rings, review queue, charts, folder-tab runs |
| `components/fx/` | Delegated spotlight and click-pulse listener, count-up and rolling digits, stagger |
| `components/ui/` | shadcn/ui primitives (generated; Base UI uses a `render` prop instead of `asChild`) |
| `lib/types.ts` | Mirrors the Pydantic contract; replace with `openapi-typescript` output later |
| `lib/live.tsx` | The single store: findings (+ Verified policy), runs, approvals, live run (launch / gate / stop), repair loop |
| `lib/prefs.ts` | Wallpaper, accent and glass preferences (localStorage plus `data-*` on `<html>`) |

## Conventions

- **Cache Components is on.** Read clock or URL values (`Date.now()`, `usePathname()`, `params`) in one of three ways: after mount, through `useSyncExternalStore` with a `null` server snapshot, or inside `<Suspense>`. Anything else fails the build.
- **Legend colours are fixed.** `ai` is violet, `det` is teal and `human` is amber; never use them for categories. Interactive colour is `brand`.
- **Effects are class-based.** Add `spot` for the cursor spotlight, `pulse` for the click light pulse (`pulse-on-dark` on dark surfaces), and `press` / `press-icon` for press scale.
