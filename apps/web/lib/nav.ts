import {
  Activity, Bug, ChartColumn, CirclePlay, Columns3, FolderKanban, Gauge, Globe, House, Inbox, Layers, ListChecks, Lock, Network, Plug, Plus,
  Radio, Repeat, Settings, Shield, Sparkles, Waypoints, Wrench, type LucideIcon,
} from "lucide-react"

export type NavItem = { href: string; label: string; icon: LucideIcon; tint?: string }
export type NavGroup = { label: string; icon: LucideIcon; items: NavItem[] }

// Rail: main capsule. Groups with items open the flyout sheet instead of navigating.
export const RAIL_MAIN: (NavItem | NavGroup)[] = [
  { href: "/", label: "Overview", icon: House },
  {
    label: "Testing", icon: CirclePlay, items: [
      { href: "/runs", label: "Test runs", icon: CirclePlay, tint: "linear-gradient(135deg,#5fd6c4,#0b8a7c)" },
      { href: "/runs/new", label: "New test run", icon: Plus, tint: "linear-gradient(135deg,#7ea6ff,#2457e6)" },
      { href: "/runs/live", label: "Live run", icon: Radio, tint: "linear-gradient(135deg,#ffcf7d,#d27408)" },
      { href: "/plans", label: "Test plans", icon: ListChecks, tint: "linear-gradient(135deg,#b6a4ff,#7457ea)" },
      { href: "/regression", label: "Regression suite", icon: Repeat, tint: "linear-gradient(135deg,#8fe0a9,#15935a)" },
    ],
  },
  { href: "/findings", label: "Findings", icon: Bug },
  { href: "/approvals", label: "Approvals", icon: Inbox },
  {
    label: "Quality engineering", icon: Activity, items: [
      { href: "/ui-testing", label: "Browser & UI", icon: Globe, tint: "linear-gradient(135deg,#5b8cff,#2457e6)" },
      { href: "/api-testing", label: "API & integration", icon: Plug, tint: "linear-gradient(135deg,#6fd3ff,#0ea5e9)" },
      { href: "/perf", label: "Performance", icon: Gauge, tint: "linear-gradient(135deg,#ffb27d,#f97316)" },
      { href: "/security", label: "Security", icon: Shield, tint: "linear-gradient(135deg,#ff9ac9,#e11d74)" },
      { href: "/compat", label: "Compatibility", icon: Layers, tint: "linear-gradient(135deg,#b6c2d6,#64748b)" },
      { href: "/network", label: "Network & traces", icon: Network, tint: "linear-gradient(135deg,#9a8cff,#4f46e5)" },
    ],
  },
  {
    label: "Intelligence", icon: Sparkles, items: [
      { href: "/planner", label: "AI test planner", icon: Sparkles, tint: "linear-gradient(135deg,#b6a4ff,#7457ea)" },
      { href: "/repair", label: "Repair assistant", icon: Wrench, tint: "linear-gradient(135deg,#5fd6c4,#0b8a7c)" },
      { href: "/analytics", label: "Analytics", icon: ChartColumn, tint: "linear-gradient(135deg,#7ea6ff,#2457e6)" },
    ],
  },
]

export const RAIL_UTILITY: NavItem[] = [
  { href: "/integrations", label: "Integrations", icon: Waypoints },
  { href: "/policies", label: "Policies & access", icon: Lock },
  { href: "/settings", label: "Settings", icon: Settings },
]

// Section tabs under the greeting; Shift+1..4 switches between them.
export const SECTION_TABS: NavItem[] = [
  { href: "/", label: "Overview", icon: House },
  { href: "/board", label: "Board", icon: Columns3 },
  { href: "/runs", label: "Runs", icon: CirclePlay },
  { href: "/analytics", label: "Analytics", icon: ChartColumn },
]

export const isGroup = (x: NavItem | NavGroup): x is NavGroup => "items" in x

/** active = exact match, or a prefix match that no more specific sibling claims */
export function activeHref(path: string | null, hrefs: string[]) {
  if (!path) return null
  return hrefs.filter((h) => (h === "/" ? path === "/" : path === h || path.startsWith(h + "/"))).sort((a, b) => b.length - a.length)[0] ?? null
}

export const ALL_PAGES: NavItem[] = [
  ...RAIL_MAIN.flatMap((x) => (isGroup(x) ? x.items : [x])),
  { href: "/board", label: "Findings board", icon: Columns3 },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  ...RAIL_UTILITY,
]
