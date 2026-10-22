# Trevyn: Light Glass Design Language

> **What this is:** the visual and interaction layer for the Trevyn dashboard. It takes the distinctive ideas from the reference reels and turns them into a **light glassmorphism** system with click effects and live behaviour.
> **Builds on:** [DASHBOARD_DESIGN_SPEC.md](DASHBOARD_DESIGN_SPEC.md), which keeps the Coinly layout, chart specs, data contract and stack. This file **replaces** these parts of it:
> - §1 principle 5 ("surfaces flat")
> - §2.1 surface colours
> - §2.3 shadows
> - §4.1 rail
> - §4.2 top bar
> - §4.13 palette backdrop
>
> **Stack:** Next.js · React · TypeScript · Tailwind v4 · shadcn/ui · `motion` · React Flow (deck slide 6).

---

## Part A: What makes each reference different

### A.1 The references

| Ref | Screens | One-line identity |
|---|---|---|
| **R1 · Vertix** | Finance overview, Rewards Program | Light app framed like a window, black segmented top nav, **orange gradient hero cards**, hatched bars |
| **R2 · My Profile & Projects** | Profile, Messages & Inbox | **Sage-tinted canvas**, **dark floating capsule rail**, pastel **folder-tab cards**, toast pills |
| **R3 · James dashboard** | Today / Assignments | **Coloured band with a curved notch** holding the sidebar, solid indigo promo card, progress rings |
| **R4 · Lin / "Pane"** (`@_code_and_chill_`) | Home, Tasks board, Settings, pink re-theme | **Dark glass over a wallpaper**, **dynamic island**, activity rings, glass-slot bar charts, live re-theming |

### A.2 Backgrounds (none of them is a flat colour)

| Ref | Background technique | What it does |
|---|---|---|
| R1 | The app sits in a **rounded white "window"** floating on a slightly darker grey page, with a visible outer margin and radius | The product looks like an object, not a web page |
| R2 | The whole canvas is **tinted sage/mint** (not grey), and white cards sit on top | Gives a calm, branded mood with almost no effort |
| R3 | A **saturated indigo band** runs down the left edge with a **curved, liquid notch** cut where the active nav item sits | The nav becomes part of the background shape |
| R4 | A **wallpaper** (Ash, Sand, Sage, Aurora, Smoke, Tide, Bloom, Ember, Grove, Dusk) sits behind **frosted panels**. *"The whole app re-tints through its glass."* | The background is user-chosen identity, and every panel picks it up |

**Takeaway:** the background is a **layer with content of its own**, such as a gradient, tint or shape, and the panels let it show through.

### A.3 Navigation (none of them uses a standard sidebar)

| Pattern | Seen in | Description |
|---|---|---|
| **Detached rail capsules** | R1, R4 | The icon rail floats with margin on all sides and is split into **separate pill groups** (brand / main / utility) with gaps between them |
| **Dark capsule rail on a light page** | R2 | A near-black vertical pill with white icons, where the active item is a white circle. It gives a strong visual anchor |
| **Notched band rail** | R3 | The active item sits in a curved cut-out of a coloured band |
| **Centred segmented top nav** | R1, R2 | A pill bar of tabs in the top-centre with a filled active tab (black in R1, dark with icons in R2) |
| **Dynamic island** | R4 | An Apple-style black pill at the top centre that **morphs** between states, for example "Focus started — notifications are held" turning into a `Focus 24:56` timer |
| **Floating action cluster** | R4 | Search, +, theme and bell grouped in one glass pill at the top right |
| **Floating secondary-nav sheet** | R4 Settings | Sub-navigation opens as a glass panel *next to* the rail, with colourful iOS-style squircle icons |
| **Toast pills for navigation** | R2 | A bottom-centre dark pill confirms keyboard navigation ("Navigated to Messages & Inbox") |
| **Shortcut hint pill** | R2 | A bottom-right pill reads "PiP: Shift to Dashboard 2", showing that views can be switched from the keyboard |

### A.4 Cards and data display

| Pattern | Seen in | Notes |
|---|---|---|
| **Gradient hero card with a giant number** | R1 Rewards | Orange-to-red gradient, `12,342 points` at about 56px, a white progress bar and a white pill CTA |
| **Hatched (striped) bars** | R1 Profit & Loss | Diagonal stripes for one series next to solid black bars, which gives a second series without a second colour |
| **Folder-tab cards** | R2 Ongoing Projects | A pastel coloured strip on top (yellow, blue or pink) holding the date and tag, with white content below |
| **Activity rings** | R3, R4 | Concentric progress rings with a legend of coloured bars and "3/8"-style fractions |
| **Glass-slot bar chart** | R4 "This week" | Each day has a full-height translucent slot, and the bar fills up inside it |
| **Stat pills** | R4 | Tiny glass tiles such as `Done today 3/8`, with a large numerator and a small muted denominator |
| **Greeting header** | R1, R3, R4 | "Good morning, Lin" with a status sentence: "4 meetings and 6 tasks left today" |
| **Project chips and priority tags** | R3, R4 | A coloured-dot chip for the project plus a flag tag (`Urgent` in red, `High` in orange) |
| **Done = struck through** | R4 | The checkbox fills with the accent, and the row text gets a strikethrough and dims |
| **Kanban on glass** | R4 Tasks | Columns have a coloured dot and count pill. Cards show a chip, tag, due date, a progress bar with "2/3", and an avatar |
| **Board / List toggle and filter pills** | R4 | Segmented toggle plus dropdown pills ("All projects", "Mine only" with avatar, "Any priority") and search |
| **Colour-filled primary CTA with glow** | R4 | `Next: 11:00 AM` and `Join` have an accent fill with a soft outer glow of the same hue |

### A.5 Personalisation (R4 Settings)

- **Theme:** Light / Dark / Auto segmented control.
- **Wallpaper picker:** 10 thumbnail tiles. The selected one gets an accent ring and check badge.
- **Accent picker:** colour swatches. Changing it re-tints every ring, bar, button and checkbox, as the blue and pink screenshots show.
- **Glass:** Clear or Tinted. **Reduce transparency:** solid surfaces, no frost.

### A.6 Motion and click effects visible in the screenshots

- The island **morphs** between message and timer states.
- Navigation actions trigger toast pills.
- Accent colour changes **propagate live** across the app.
- Checkboxes fill and the text strikes through.
- The board has drag affordances such as avatars and progress bars.
- The cursor is captured mid-click on rail items and Pause / End buttons, which suggests visible press states.

---

## Part B: The Trevyn light glass system

### B.1 Principles

1. **The wallpaper carries the brand.** The canvas is a pale **prism wallpaper** of soft blobs. It reuses the background of deck slides 3, 9 and 10 and the prism metaphor ("TREVYN intelligence layer"). Blob hues *are* the legend: violet for AI, blue for accent, teal for deterministic and peach for human.
2. **Frost, don't fog.** Panels are milky white glass. They are see-through enough to pick up the wallpaper tint and opaque enough that text keeps full contrast.
3. **Three depths only.** Wallpaper, then glass cards, then floating chrome (rail, island, cluster, popovers). Each depth has more blur, more opacity and a stronger shadow.
4. **Nav floats, content sits.** Navigation is detached capsules with margin all around. Content cards sit on the grid.
5. **One dark object.** The **dynamic island** is the only dark element in the light UI, so the eye always finds live status.
6. **Every click answers.** Each press produces at least one of: scale, light pulse, morph, toast, or count change.
7. **Colour means something.** Accent is for interaction. Violet, teal and amber are for provenance. Red and orange are for urgency. Decorative colour lives only in the wallpaper and the hero gradient.

### B.2 Wallpapers

| Preset | Base | Blobs (position · colour · opacity) | Mood |
|---|---|---|---|
| **Prism** (default) | `#EEF2FA` | TL `#C9C1FF` .55 · TR `#C3D8FF` .60 · BL `#BFEDE2` .50 · BR `#FFE0C4` .45 | Deck-matched |
| **Mist** | `#EEF1F6` | `#D5DEEE` · `#E4E9F3` · `#D9E3F0` | Neutral and quiet |
| **Sage** | `#EEF4EF` | `#CFE8D8` · `#DDEFE5` · `#E8F1D9` | R2 mood |
| **Dawn** | `#F6F1F2` | `#FFD9C9` · `#E9D6FF` · `#FFE9C9` | Warm demo days |
| **Solid** | `#F4F6FA` | none | Used by "Reduce transparency" |

- **Build:** one `position: fixed` layer behind the app, made of 4 `radial-gradient()`s at 40–55% radius. It is a single paint, with no blurred DOM blobs.
- **Grain:** add a 3% SVG noise overlay (`feTurbulence`, data URI) on top to stop gradient banding and make the frost read as a material.
- **Drift:** the layer translates slowly (±24px over 40s, alternate). It parallaxes ±8px toward the pointer.
- **Reduced motion:** both drift and parallax turn off when `prefers-reduced-motion` is set.

### B.3 Glass tiers

| Tier | Use | Fill | Blur / saturate | Border | Shadow |
|---|---|---|---|---|---|
| `glass-1` | Content cards, kanban columns | `rgba(255,255,255,.58)` | `20px` / `170%` | `1px rgba(255,255,255,.75)` | card |
| `glass-2` | Rail, top cluster, filter pills, popovers, flyouts | `rgba(255,255,255,.72)` | `28px` / `180%` | `1px rgba(255,255,255,.85)` | float |
| `glass-inset` | Slots inside cards (bar tracks, inputs, stat pills, kanban cards) | `rgba(255,255,255,.45)` | none (inherits parent frost) | `1px rgba(15,37,87,.06)` | none |
| `island` | Dynamic island, toasts, shortcut pill | `rgba(11,26,61,.86)` | `24px` / `150%` | `1px rgba(255,255,255,.08)` | float and glow |
| `tinted` (setting) | Raises `glass-1` to `.74` and `glass-2` to `.84` | | | | |
| `solid` (setting) | `#FFFFFF`, no backdrop-filter | | | | |

**The edge recipe** is what makes it read as glass rather than just translucent:

1. An inner top highlight: `inset 0 1px 0 rgba(255,255,255,.95)`.
2. A faint outer hairline: `0 0 0 1px rgba(15,37,87,.05)`.
3. A soft drop shadow tinted navy, never black.

| Shadow | Value |
|---|---|
| card | `inset 0 1px 0 rgba(255,255,255,.95), 0 0 0 1px rgba(15,37,87,.05), 0 10px 30px -14px rgba(15,37,87,.22)` |
| float | `inset 0 1px 0 rgba(255,255,255,1), 0 0 0 1px rgba(15,37,87,.06), 0 18px 44px -16px rgba(15,37,87,.30)` |
| glow-accent | `0 8px 24px -6px color-mix(in oklab, var(--accent) 55%, transparent)` |

### B.4 Shape and spacing

- **App frame (from R1):** the app does *not* touch the viewport. It has a 12px outer margin, and floating chrome sits inside that margin.
- **Radii:**
  - Floating chrome: fully rounded pills and capsules.
  - Cards: `22px`.
  - Inset slots: `14px`.
  - Kanban cards: `16px`.
  - Chips and tags: `8px`.
- **Gaps:** 14px between cards. Rail capsule groups sit 10px apart.

### B.5 Colour roles (additions to the previous spec's §2.1)

| Token | Value | Role |
|---|---|---|
| `--accent` | `#2457E6` (user-changeable) | Interactive: active nav, primary CTA, checkboxes, focus, selected wallpaper |
| `--accent-2` | `#7A8CFF` | Gradient partner for CTAs and the hero |
| `--ink` | `#0B1A3D` | Island, dark segmented active tab, "black" buttons (R1/R3 style) |
| `--urgent` | `#E5484D` | `Urgent` tag (flag icon) |
| `--high` | `#F08C2E` | `High` tag |
| `--hero-prism` | `linear-gradient(120deg, #2457E6 0%, #7457EA 38%, #0B8A7C 72%, #D27408 100%)` | Hero card only, taken from the deck's prism beams |

**Accent choices:** Blue (default), Indigo `#4F46E5`, Navy `#0F2557`, Sky `#0284C7`, Rose `#E11D48`. Violet, teal and amber are **excluded**, because they would collide with the AI, deterministic and human provenance colours.

---

## Part C: Components

### C.1 App shell

```
 12px margin ─────────────────────────────────────────────────────────────────────────
│ ┌──┐                    ╭──────────────────────────────╮        ╭──────────────────╮ │
│ │◆ │ brand capsule      │ ● RUN-0413 · 32/46 · 4:12    │ island │ 🔍  ＋  ◐  🔔·  (AC)│ │ cluster
│ └──┘                    ╰──────────────────────────────╯        ╰──────────────────╯ │
│ ┌──┐  Good morning, Alex                                        [＋ New run]  [▶ Watch live]
│ │⌂ │  Wednesday, Oct 21 · 1 run live · 5 approvals waiting for you                    │
│ │▶ │  ╭ Overview ╮ Board   Runs   Analytics           ← segmented section tabs          │
│ │🐞│  [Runs today 6] [Live 1] [Awaiting you 5]         ← stat pills                    │
│ │✓ │  ┌─────────────────────────┐┌──────────────┐┌──────────────────────────────┐    │
│ │◇ │  │ HERO · Release readiness ││ Today's loop ││ Review queue                  │    │
│ │⚡│  │ prism gradient · 91.4%   ││ 3 rings      ││ checkbox rows · Urgent/High   │    │
│ └──┘  └─────────────────────────┘└──────────────┘└──────────────────────────────┘    │
│ ┌──┐  ┌──────── Run Health (spec §4.5) ────────┐┌── Findings by category (§4.6) ──┐   │
│ │⚙ │  └────────────────────────────────────────┘└─────────────────────────────────┘   │
│ └──┘  ┌ Active runs (folder-tab cards ×3) ┐┌ This week (glass slots) ┐┌ Release gate ┐  │
│ (AC)  └───────────────────────────────────┘└─────────────────────────┘└──────────────┘  │
│                         ╭ Navigated to Findings ╮            ╭ ⇧1–4 switch views ╮      │
 ─────────────────────────────────────────────────────────────────────────────────────────
```

### C.2 Floating rail (detached capsules, R1/R4 with an R3 touch)

- **Structure:** three `glass-2` capsules, 56px wide, stacked with 10px gaps:
  1. **Brand capsule:** a 36px squircle using the prism gradient with a white Trevyn mark.
  2. **Main capsule:** Overview, Runs, Findings, Approvals, Quality Engineering ▸, Intelligence ▸.
  3. **Utility capsule:** Integrations, Settings, then the avatar at the bottom.
- **Active indicator:** a 40px **ink** (`--ink`) circle with a white icon (from R2). It slides between items with a shared `layoutId` spring.
- **R3 "liquid" touch:** while the indicator moves it briefly stretches vertically (`scaleY 1 → 1.25 → 1`) over the spring, so it reads like fluid.
- **Hover:** the icon nudges right by 2px. A glass label pill pops out to the right, sliding from x −4 and fading in over 140ms.
- **Groups with children (▸):** clicking opens the **flyout sheet** (C.3) instead of navigating.
- **Badges:** Approvals shows an amber count bubble at the top right. Findings shows a red dot when a new high-severity finding arrives, and the dot pulses twice.

### C.3 Flyout sheet (from R4 Settings)

- A `glass-2` panel, 240px wide, anchored 10px to the right of the rail and vertically aligned to the clicked icon.
- It has a header with the group name and a list of items. Each item has a **28px colourful squircle icon** (iOS style, each with its own soft gradient), a label and a `›`.
- **Quality Engineering:** Browser & UI (blue), API (sky), Performance (orange), Security (rose), Compatibility (slate), Network & Traces (indigo).
- **Intelligence:** AI Test Planner (violet), Repair Assistant (teal), Analytics (blue).
- **Open:** scales from 0.96 to 1 with the origin at the rail and fades in. Items stagger in 25ms apart.
- **Close:** on outside click, Esc, or selection.
- **Keyboard:** `→` from the rail opens it, and `↑/↓` moves through items.

### C.4 Dynamic island (R4, the signature element)

The island is a black pill at the top centre. It morphs its **width, height and radius** with a spring (`stiffness 380, damping 30`) as Trevyn's state changes. The content crossfades with `AnimatePresence mode="popLayout"`.

| State | Compact content | Trigger | Width |
|---|---|---|---|
| **Idle** | Teal dot · "All quiet · last run 4m ago" | No live runs | 240 |
| **Running** | 16px progress ring (teal) · `RUN-0413` · `32/46` · elapsed `4:12` (ticking) | `run.started` SSE | 300 |
| **Finding** | Red dot pulse · "DEF-143 confirmed · High" · `View` | `finding.confirmed` | 340, then back to Running after 5s |
| **Needs you** | Amber dot · "Patch AP-32 needs review" · `Review` | `approval.requested` | 320 |
| **AI thinking** | Violet shimmer text · "Diagnosing checkout failure…" | Orchestrator step events | 300 |
| **Done** | ✓ draws in · "RUN-0413 passed 44/46" | `run.finished` | 280, then Idle after 6s |

- **Click to expand:** the island grows into a 420×220 **live panel** with the last 5 events (tagged AI / DET / HUMAN), a progress bar and buttons (`Open run`, `Stop`, `Mute 30m`). Clicking outside collapses it.
- **Queueing:** events queue, and each gets at least 2.5s on screen. Urgent states (Finding, Needs you) jump the queue.
- **"Mute 30m"** is Trevyn's version of R4's "notifications are held". The island shows a moon icon while muted.

### C.5 Top cluster (R4)

A `glass-2` pill containing Search (`⌘K`), ＋ (New run menu), the wallpaper/theme quick toggle (◐) and Bell, followed by the avatar.

- Icons are 34px circles.
- Hover gives the icon a `glass-inset` fill.
- Press scales to 0.92 with a light pulse (C.14).

### C.6 Greeting header and section tabs

- **Greeting:**
  - "Good morning, Alex" in Geist 30/500, tracking −0.02em.
  - Below it, a live status sentence in muted 13px, built from data: *"Wednesday, Oct 21 · 1 run live · 5 approvals waiting for you."*
  - Numbers in the sentence are **links**, so "5 approvals" goes to the review queue.
- **Section tabs:** a segmented `glass-2` pill (Overview · Board · Runs · Analytics).
  - The active tab is an **ink** pill with white text (from R1), and it slides between tabs with `layoutId`.
  - `⇧1–4` switches tabs, and the shortcut pill (C.15) teaches this.
- **Right side CTAs:**
  - `＋ New run` is a white glass pill.
  - `▶ Watch live` is filled with the accent and has `glow-accent` (from R4's "Next: 11:00 AM"). Hover strengthens the glow, and press shrinks it.

### C.7 Stat pills (R4)

- Three `glass-inset` tiles, 64px tall: **Runs today 6**, **Live 1** (with a pulsing teal dot), **Awaiting you 5**.
- Each shows a 22px light number, a small muted denominator where relevant (`42/46`) and an 11px label.
- **Live updates:** numbers roll like an odometer when they change (per-digit `y` slide).
- **Click:** each tile filters the page below it.

### C.8 Hero card: Release readiness (R1 gradient hero, prism-coloured)

- **Surface:** `--hero-prism` gradient with a 22px radius. There is a 20% white "sheen" ellipse at the top left and a grain overlay.
- **Content:**
  - Eyebrow chip: `✦ Release 2.14.0` (white glass on gradient).
  - **Giant number:** `91.4%` at 56px weight 300, white, `tabular-nums`.
  - Caption: "pass rate · gate 90%".
  - A white progress bar on a 25%-white track, with a notch at 90%.
  - Footer: `Request release approval` (white pill with ink text) and "+1.2 pts this week" in 80% white.
- **Dynamism:**
  - The gradient position **drifts** slowly over a 18s loop between 0% and 100%.
  - The number counts up on mount.
  - When the pass rate drops below the gate, the gradient crossfades over 600ms to a warning version (`#D03636 → #F08C2E`) and the button becomes "View blockers".
- **Click effect on the CTA:** a light pulse from the click point, the button morphs into a spinner and then into a ✓ "Requested", and the island switches to the *Needs you* state for the release approver.

### C.9 Today's loop: activity rings (R3/R4)

Three concentric rings, 140px outer and 12px stroke with 4px gaps. They map to the deck's loop and legend.

| Ring | Colour | Meaning | Example |
|---|---|---|---|
| Outer | `--ai` violet | **Plan**: tests validated / planned | 16/18 |
| Middle | `--det` teal | **Prove**: failures reproduced / failures | 3/4 |
| Inner | `--human` amber | **Decide**: approvals cleared / requested | 2/7 |

- **Legend:** coloured vertical bars on the right with a label and a `16/18` fraction, as in R4.
- **Mount:** each ring draws (`pathLength 0 → value`), staggered 120ms apart.
- **Ring closed:** when a ring reaches 100%, it plays a single bright **sparkle sweep** (a conic highlight orbits once) and then a toast reads "Plan ring closed".
- **Linked hover:** hovering a ring thickens it to 14px and dims the others to 35%, and the matching legend row highlights. This also works the other way round.

### C.10 Review queue (R4 "My tasks" → approvals and findings)

- **Rows:** circle checkbox, title, project chip (dot plus label, such as `● ShopFlow`), meta (`Today`, `Oct 16`), and on the right a priority tag: `⚑ Urgent` (`--urgent` at 12%), `High` (`--high` at 12%), or `Low` (muted).
- **The checkbox means "approve / mark reviewed"**, and it plays a 5-step sequence:
  1. The circle fills with the accent and scales `0.85 → 1.1 → 1` (spring).
  2. A ✓ path draws in over 220ms.
  3. A **strikethrough line animates** across the title from left to right (`scaleX 0 → 1`, 260ms), and the row dims to 55%.
  4. After 700ms, the row **slides to the "Done" group** at the bottom using a layout animation, and the other rows close the gap.
  5. An **undo toast** appears: "Approved AP-31 · Undo" (5s).
- **Risky items:** if the item is a risky approval (`risk: high`), clicking opens a confirm popover first. Per the deck, humans decide and nothing high-impact is one tap.

### C.11 Active runs: folder-tab cards (R2)

- **Tab strip:** a 40px pastel strip on top, coloured by test type:
  - UI: `#DCE6FF`
  - API: `#D9F1FF`
  - Perf: `#FFE6D6`
  - Security: `#FFE1EE`
- The strip holds the date (`Oct 21, 2026`) and the trigger tag (`PR #318`).
- **Body:** a `glass-1` body with the run name, a `42/46` progress bar and avatars, plus a "Live" or "Report" pill.
- **Hover:** the tab strip **lifts 3px** like a folder tab being pulled, and the card shadow grows to *float*.
- **Click:** goes to the run detail. The card does a shared-element transition into the run page header (`layoutId={run.id}`).

### C.12 Glass-slot bar chart: This week (R4)

- **Slots:** each weekday is a full-height `glass-inset` slot (radius 14). The bar fills it from the bottom in an accent gradient (`--accent` to `--accent-2`).
- **Header:** `27` findings verified so far, with a delta chip `+4% vs last week`.
- **Today:** today's slot has an accent hairline border. Future days are empty slots with a dashed outline.
- **Mount:** bars rise one after another, staggered 50ms, with a spring overshoot.
- **Hover a slot:** the bar brightens, a value label pops above it and the slot border lights up.
- **Hatched segments (R1):** the top part of a bar is **diagonally hatched** for *inconclusive* findings (`repeating-linear-gradient(135deg, accent 0 2px, transparent 2px 6px)`). This gives the deck's **"explicit uncertainty"** novelty a visual form. Use the same hatch for inconclusive results in Run Health (previous spec §4.5).

### C.13 Board view (R4 Tasks → Findings board)

- **Columns:** `glass-1` columns using the existing `COLS` (Triage → Investigating → Repair proposed → Awaiting approval → Regression rerun → Verified). Each header has a coloured status dot, the name, a count pill and ＋.
- **Cards:** `glass-inset` cards (radius 16) with:
  - a project chip and severity tag
  - the title
  - an evidence count (📎 7)
  - the AI confidence ring (existing `ConfRing`)
  - an assignee avatar
  - a progress bar with `2/3` for the repair → regression stage
- **Filter bar:** a row of `glass-2` pills: `All projects ▾`, `(AC) Mine only`, `⚑ Any severity ▾`, a search field, and on the right a `Board | List` segmented toggle.
- **Drag:**
  - The card lifts with `scale 1.03`, `rotate 1.5°` and a float shadow, and the cursor becomes grabbing.
  - Other cards **reflow** with layout animation.
  - The target column gets a glowing dashed inset at 30% accent.
  - **Drop:** the card settles with a spring, and a toast reads "DEF-138 → Investigating".
  - **Gated columns:** dropping into *Awaiting approval* or *Verified* goes through the policy check (OPA). If the check refuses, the card **bounces back** with a horizontal shake (x: 0 → −6 → 6 → −3 → 0) and an inline reason appears ("Verified requires a passing regression run").

### C.14 Click effects library

| Effect | Where | Recipe |
|---|---|---|
| **Press** | Every button, pill, card link | `whileTap={{ scale: .97 }}` (icons `.92`), 120ms |
| **Light pulse** | Glass buttons, rail, island, CTAs | On pointerdown, add a 40px white circle at the click point that scales `0 → 8` (enough to cover the element) while opacity goes `.45 → 0` over 520ms, clipped by the element radius |
| **Cursor spotlight** | All `glass-1`/`glass-2` surfaces | A 260px white radial highlight follows the pointer (CSS vars `--mx/--my`) at 50% opacity, fading in on hover |
| **Edge light** | Cards on hover | The border brightens near the pointer: a gradient border masked to 1px, `radial-gradient(at --mx --my, accent 40%, transparent 50%)` |
| **Morph** | Button → spinner → ✓ | Width animates through `layout`, and the content crossfades |
| **Shared element** | Card → detail page | `layoutId` on the card and the detail header |
| **Count roll** | Stat pills, KPIs, island counters | Per-digit vertical slide, 300ms |
| **Shake** | Policy refusal, invalid form | x keyframes `[0,-6,6,-3,0]`, 320ms, and the border turns `--bad` |
| **Confetti-lite** | Ring closed, regression passed after a repair | A one-time 12-particle burst in the ring colours, 900ms. Rare by design |

### C.15 Toasts and shortcut pill (R2)

- **Toasts:** `island`-style dark pills at the bottom centre (shadcn **Sonner** with a custom class). Each has a leading semantic dot, the message, and an optional action ("Undo", "View"). They stack upward with a spring. Navigation via keyboard also shows a toast: "Navigated to Findings".
- **Shortcut pill:** a dark pill at the bottom right reading `⇧1–4 switch views · ⌘K search`. It shows for the first 3 sessions, after which it collapses to a `?` button that opens the shortcuts sheet.

### C.16 Appearance settings (R4)

These live at Settings → Appearance, in a `glass-1` card:

| Control | Options | Behaviour |
|---|---|---|
| Theme | Light (default) · Dark *(later)* · Auto | Segmented pill with a sliding active state |
| Wallpaper | Prism · Mist · Sage · Dawn · Solid | 5 thumbnail tiles (mini app previews). The selected tile gets an accent ring and ✓ badge. Selecting **crossfades** the wallpaper over 500ms |
| Accent | Blue · Indigo · Navy · Sky · Rose | Swatches. Changing it **animates the whole app** to the new colour over 400ms (`@property --accent`), as the blue and pink screenshots show |
| Glass | Clear · Tinted | Changes the opacity tiers (B.3) |
| Reduce transparency | Toggle | Solid surfaces with no backdrop-filter; also follows the OS `prefers-reduced-transparency` setting |
| Reduce motion | Toggle | Defaults to the OS setting |

Preferences are stored as `<html data-wall="prism" data-accent="blue" data-glass="tinted">`. They are saved in `localStorage` per viewer, wrapped in try/catch, and synced to `PATCH /api/v1/me/preferences` once auth exists.

### C.17 Page transitions

- **Route change:** content leaves with `opacity 1 → 0` and `filter blur(0 → 6px)` over 120ms, then enters with `blur(6px → 0)` and `y 8 → 0` over 220ms.
- **Stays mounted:** the rail, island and cluster never re-render, so the chrome feels physical.
- **Entrance stagger:** cards stagger in 40ms apart on first load only.

---

## Part D: Implementation in the deck's stack

### D.1 Tailwind v4 tokens and utilities (`app/globals.css`)

```css
@import "tailwindcss";
@import "tw-animate-css";

@property --accent { syntax: "<color>"; inherits: true; initial-value: #2457E6; }

:root {
  --wall-base:#EEF2FA; --blob-1:#C9C1FF; --blob-2:#C3D8FF; --blob-3:#BFEDE2; --blob-4:#FFE0C4;
  --g1:rgba(255,255,255,.58); --g2:rgba(255,255,255,.72); --gi:rgba(255,255,255,.45);
  --g-border:rgba(255,255,255,.78); --ink:#0B1A3D; --accent-2:#7A8CFF;
  --urgent:#E5484D; --high:#F08C2E;
  transition: --accent .4s var(--ease-out);
}
:root[data-wall="sage"] { --wall-base:#EEF4EF; --blob-1:#CFE8D8; --blob-2:#DDEFE5; --blob-3:#E8F1D9; --blob-4:#D7EBDD; }
:root[data-wall="dawn"] { --wall-base:#F6F1F2; --blob-1:#FFD9C9; --blob-2:#E9D6FF; --blob-3:#FFE9C9; --blob-4:#F7D7E4; }
:root[data-accent="rose"] { --accent:#E11D48; --accent-2:#FB7185; }
:root[data-glass="tinted"] { --g1:rgba(255,255,255,.74); --g2:rgba(255,255,255,.84); }

@utility wallpaper {
  background:
    radial-gradient(45% 55% at 8% 6%,  color-mix(in oklab, var(--blob-1) 55%, transparent), transparent 70%),
    radial-gradient(40% 50% at 96% 4%, color-mix(in oklab, var(--blob-2) 60%, transparent), transparent 70%),
    radial-gradient(45% 55% at 4% 98%, color-mix(in oklab, var(--blob-3) 50%, transparent), transparent 70%),
    radial-gradient(40% 50% at 98% 96%,color-mix(in oklab, var(--blob-4) 45%, transparent), transparent 70%),
    var(--wall-base);
}
@utility glass-1 {
  background: var(--g1); border: 1px solid var(--g-border);
  -webkit-backdrop-filter: blur(20px) saturate(170%); backdrop-filter: blur(20px) saturate(170%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.95), 0 0 0 1px rgba(15,37,87,.05), 0 10px 30px -14px rgba(15,37,87,.22);
}
@utility glass-2 {
  background: var(--g2); border: 1px solid rgba(255,255,255,.85);
  -webkit-backdrop-filter: blur(28px) saturate(180%); backdrop-filter: blur(28px) saturate(180%);
  box-shadow: inset 0 1px 0 #fff, 0 0 0 1px rgba(15,37,87,.06), 0 18px 44px -16px rgba(15,37,87,.30);
}
@utility glass-inset { background: var(--gi); border: 1px solid rgba(15,37,87,.06); }
@utility island {
  background: rgba(11,26,61,.86); color: #E8EEFF; border: 1px solid rgba(255,255,255,.08);
  -webkit-backdrop-filter: blur(24px) saturate(150%); backdrop-filter: blur(24px) saturate(150%);
  box-shadow: 0 18px 44px -16px rgba(11,26,61,.55);
}
@utility hatch { background-image: repeating-linear-gradient(135deg, currentColor 0 2px, transparent 2px 6px); }

/* spotlight: one delegated pointermove listener sets --mx/--my on the hovered .spot */
.spot { position: relative; isolation: isolate; }
.spot::before { content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none; z-index:-1;
  background: radial-gradient(260px circle at var(--mx,50%) var(--my,50%), rgba(255,255,255,.5), transparent 60%);
  opacity:0; transition:opacity .2s; }
.spot:hover::before { opacity:1; }

/* fallbacks */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  :root { --g1:rgba(255,255,255,.94); --g2:rgba(255,255,255,.97); }
}
:root[data-glass="solid"], :root.reduce-transparency { --g1:#fff; --g2:#fff; }
:root[data-glass="solid"] .glass-1, :root[data-glass="solid"] .glass-2 { backdrop-filter:none; -webkit-backdrop-filter:none; }
@media (prefers-reduced-transparency: reduce) { :root { --g1:#fff; --g2:#fff; } }
@media (prefers-reduced-motion: reduce) { *, ::before { animation:none!important; transition:none!important; } }
```

### D.2 Component map

| Element | File | Built from |
|---|---|---|
| Wallpaper and parallax | `components/shell/wallpaper.tsx` | `motion` `useSpring` on pointer, fixed `div.wallpaper` + grain |
| Floating rail | `components/shell/rail.tsx` | `Link`, shadcn `Tooltip`, `motion` `layoutId="rail-active"` |
| Flyout sheet | `components/shell/flyout.tsx` | shadcn `Popover` (`side="right"`), custom squircle icons |
| Dynamic island | `components/shell/island.tsx` | `motion.div layout` + `AnimatePresence`, `useRunEvents()` SSE hook, Zustand-free reducer |
| Top cluster | `components/shell/cluster.tsx` | shadcn `DropdownMenu`, `CommandDialog`, `Sheet` |
| Section tabs | `components/shell/section-tabs.tsx` | shadcn `Tabs` restyled, `layoutId="tab-active"` |
| Hero card | `components/dashboard/hero-readiness.tsx` | CSS gradient + `@keyframes drift`, `CountUp` |
| Rings | `components/dashboard/loop-rings.tsx` | SVG `motion.circle` `pathLength` |
| Review queue | `components/dashboard/review-queue.tsx` | `motion` `layout`, `LayoutGroup`, Sonner undo toast |
| Folder-tab cards | `components/dashboard/run-folder-card.tsx` | `Card` + `layoutId={run.id}` |
| Glass-slot bars | `components/dashboard/week-slots.tsx` | Plain flex + `motion` (no chart lib needed) |
| Board | `app/(workspace)/board/page.tsx` | `@dnd-kit/core` *(addition)* + `motion` layout |
| Press and light pulse | `components/fx/pressable.tsx` | `motion.button whileTap` + pulse span |
| Spotlight | `components/fx/spotlight-provider.tsx` | One `pointermove` listener on `document`, rAF-throttled |
| Toasts | `app/layout.tsx` | shadcn `Sonner` with `toastOptions.className="island rounded-full"` |
| Appearance | `app/(workspace)/settings/appearance/page.tsx` | shadcn `ToggleGroup`, `Switch`, `RadioGroup` (wallpaper tiles) |

### D.3 Key sketches

```tsx
// components/shell/island.tsx
"use client"
import { AnimatePresence, motion } from "motion/react"
import { useIsland } from "@/lib/use-island" // reduces SSE events → current state + queue

const WIDTH = { idle: 240, running: 300, finding: 340, approval: 320, thinking: 300, done: 280 } as const

export function Island() {
  const { state, expanded, toggle } = useIsland()
  return (
    <motion.button layout onClick={toggle} aria-live="polite"
      className="island fixed top-3 left-1/2 z-50 -translate-x-1/2 overflow-hidden"
      animate={{ width: expanded ? 420 : WIDTH[state.kind], height: expanded ? 220 : 36, borderRadius: expanded ? 28 : 999 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={expanded ? "panel" : state.kind}
          initial={{ opacity: 0, filter: "blur(4px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0, filter: "blur(4px)" }}
          className="flex h-full items-center gap-2 px-3.5 text-[12.5px]">
          {expanded ? <IslandPanel /> : <IslandCompact state={state} />}
        </motion.div>
      </AnimatePresence>
    </motion.button>
  )
}
```

```tsx
// components/fx/pressable.tsx: press, then light pulse from the click point
"use client"
import { motion } from "motion/react"
import { useState, type ComponentProps } from "react"

export function Pressable({ children, className, onPointerDown, ...p }: ComponentProps<typeof motion.button>) {
  const [pulses, setPulses] = useState<{ id: number; x: number; y: number }[]>([])
  return (
    <motion.button whileTap={{ scale: 0.97 }} transition={{ duration: 0.12 }} {...p}
      className={`relative overflow-hidden ${className ?? ""}`}
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setPulses((s) => [...s, { id: e.timeStamp, x: e.clientX - r.left, y: e.clientY - r.top }])
        onPointerDown?.(e)
      }}>
      {children}
      {pulses.map(({ id, x, y }) => (
        <motion.span key={id} aria-hidden className="pointer-events-none absolute size-10 rounded-full bg-white"
          style={{ left: x - 20, top: y - 20 }}
          initial={{ scale: 0, opacity: 0.45 }} animate={{ scale: 8, opacity: 0 }} transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
          onAnimationComplete={() => setPulses((s) => s.filter((q) => q.id !== id))} />
      ))}
    </motion.button>
  )
}
```

### D.4 Live data that drives the dynamism

All of the "alive" behaviour comes from the **SSE stream** in the previous spec §5.4 (`GET /api/v1/runs/events`). There is no fake animation loop.

| Event | Island | Stat pills | Other |
|---|---|---|---|
| `run.started` | → Running | Live +1 (roll) | New folder-tab card slides into Active runs |
| `run.progress` | Counter ticks, ring advances | | Progress bar on the card |
| `ai.step` | → AI thinking (violet shimmer) | | |
| `finding.confirmed` | → Finding (red pulse) | | Board card drops into Triage; red dot on rail |
| `approval.requested` | → Needs you (amber) | Awaiting you +1 | Row slides into the review queue |
| `run.finished` | → Done ✓ → Idle | Live −1 | Rings and the week chart update; `router.refresh()` for the aggregates |

### D.5 Stack additions to approve (on top of the previous spec §5.2)

| Package | Why | Strict-stack alternative |
|---|---|---|
| `motion` | Island morph, layout reflow, shared elements, springs | Already proposed in the previous spec |
| `@dnd-kit/core` | Accessible drag-and-drop for the board (keyboard and screen reader) | Native HTML5 DnD (no keyboard support, janky on touch) |

Everything else (Sonner, Tabs, ToggleGroup, Popover, Command, Sheet) is shadcn/ui.

---

## Part E: Guardrails

### E.1 Contrast on glass

- Body text (`--fg #0D1A35`) on `glass-1` over the brightest blob (`#FFE0C4` showing through at about 42%) is about **13:1** and passes.
- `--muted` on glass must be `≤ #6B7590` to stay at 4.5:1 or above. Use `#6B7590` for every caption on glass.
- White text is allowed **only** on the hero gradient (check the teal and amber ends: use 16px or larger at weight 500 there) and on the island and toasts.
- Status always carries a word or icon as well as colour (`⚑ Urgent`, `✓`, `Live`).

### E.2 Performance

- At most **about 12 blurred layers** per screen. Kanban cards, table rows and inset slots use `glass-inset` (no blur), and only columns blur.
- Never put `backdrop-filter` on an element that scrolls inside another blurred element. Blur the scroll container, not its children.
- The wallpaper is a single painted layer. Drift and parallax use `transform` only, and the layer gets `will-change: transform`.
- The spotlight uses **one** delegated listener with rAF throttling, writing CSS variables only. There are no React re-renders on mouse move.
- Disable the hero gradient drift and wallpaper parallax when the tab is hidden (`visibilitychange`) and under reduced motion.

### E.3 Accessibility of the dynamic parts

- The island is `aria-live="polite"`, and urgent states (Finding, Needs you) use `role="status"`. Expanding it is a real `<button>` with `aria-expanded`.
- Every drag action on the board has a keyboard equivalent: `Space` to lift, arrow keys to move, `Space` to drop. dnd-kit provides this.
- Toasts with actions stay at least 5s and pause on hover or focus.
- "Reduce transparency" and "Reduce motion" are first-class settings, not just OS fallbacks.

---

## Part F: Build order

1. `globals.css` tokens, the wallpaper and the glass utilities, plus the fallbacks (D.1).
2. Shell: floating rail and flyout, top cluster, section tabs, Sonner toasts and the shortcut pill.
3. Dynamic island with mocked events, then wire it to the SSE stream.
4. Overview: greeting, stat pills, hero, rings, review queue, folder-tab runs and week slots. The charts come from the previous spec.
5. The `Pressable` and spotlight FX layer, applied everywhere.
6. Board with dnd-kit, plus the policy-refusal shake.
7. Appearance settings (wallpaper, accent, glass, reduce transparency or motion).
8. Contrast and performance pass (Part E) on a mid-range laptop and in Safari.
