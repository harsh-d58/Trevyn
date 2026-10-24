// Guard the live-only rendering path. Demo components remain available behind apiEnabled=false.
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "../apps/web")
const liveOnly = [
  "components/quality/run-result-view.tsx", "components/admin/live-admin.tsx",
  "lib/scope.ts", "lib/scope-server.ts",
  ...readdirSync(resolve(root, "components/quality")).filter((f) => f.startsWith("live-") && f.endsWith(".tsx"))
    .map((f) => `components/quality/${f}`),
]
const errors = []
for (const file of liveOnly) {
  const source = readFileSync(resolve(root, file), "utf8")
  if (/from\s+["']@\/lib\/(?:demo|data)(?:\/|["'])/.test(source)) errors.push(`${file}: imports demo data`)
  if (/ShopFlow|CHECKOUT-014|RUN-04/.test(source)) errors.push(`${file}: contains a demo fixture string`)
}
const workspace = readFileSync(resolve(root, "lib/live-data.ts"), "utf8")
const empty = workspace.match(/export async function emptyLiveWorkspace\(\)[\s\S]*?\n}/)?.[0] ?? ""
if (!empty || /demoWorkspace|getDashboardSummary|DEMO_/.test(empty)) errors.push("lib/live-data.ts: live empty state uses demo data")
if (errors.length) {
  process.stderr.write(errors.join("\n") + "\n")
  process.exitCode = 1
} else process.stdout.write("Live-only modules contain no demo fixtures.\n")
