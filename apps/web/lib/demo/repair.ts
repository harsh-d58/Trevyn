// Repair assistant demo data, ported from trevyn-app/src/pages/Repair.jsx.
import type { FlowEdgeData, FlowNodeData } from "./findings"

export const DIFF: ["h" | "a" | "d" | "", string][] = [
  ["h", "@@ -41,9 +41,16 @@ def create_order(cart, user, request):"], ["", " def create_order(cart, user, request):"],
  ["d", "-    order = Order.create(cart=cart, user=user)"], ["a", "+    key = request.headers.get(\"Idempotency-Key\")"], ["a", "+    if key:"],
  ["a", "+        existing = Order.find_by_key(user.id, key)"], ["a", "+        if existing:"], ["a", "+            return existing"],
  ["a", "+    order = Order.create(cart=cart, user=user, idempotency_key=key)"], ["", "     charge(order)"], ["", "     return order"],
]

export const REPAIR_PROMPT = `Fix duplicate order creation in orders/service.py.
Evidence: RUN-0412 HAR shows two POST /api/orders without Idempotency-Key, 431 ms apart.
Constraint: keep the public API unchanged.
Acceptance: CHECKOUT-014 and CHECKOUT-015 pass.`

export const CHANGE_REQUEST = "Also add a unique DB constraint on (user_id, idempotency_key)."

/** Root-cause propagation for DEF-142: edges switch to the verified path once the patch is live */
export const RC_INFO: Record<string, [string, string]> = {
  client: ["checkout.js · submitOrder()", "Client aborts after 450 ms and retries the same POST without an Idempotency-Key header."],
  api: ["POST /api/orders", "RUN-0412 HAR: two requests 431 ms apart, both 201 Created, distinct order ids."],
  svc: ["orders-svc · create_order()", "Root cause. No idempotency check before Order.create, so every retry inserts a new order."],
  guard: ["Order.find_by_key()", "The patch (+7 −1). Returns the existing order when the key repeats for the same user."],
  db: ["orders table", "DB diff after one click: +2 rows for user u_8841 with the same cart hash."],
  pay: ["payments-sandbox · charge()", "Charged twice in sandbox (2 × $84.20). Refund evidence is attached to the finding."],
}
export const rcGraph = (ok: boolean): { nodes: FlowNodeData[]; edges: FlowEdgeData[] } => ({
  nodes: [
    { id: "client", label: "Client retry", sub: "timeout 450 ms", x: 110, y: 160, k: "warn" },
    { id: "api", label: "POST /api/orders", sub: ok ? "1 × 201 · 1 replay" : "2 × 201 Created", x: 330, y: 160, k: "acc" },
    { id: "svc", label: "create_order()", sub: ok ? "orders-svc · guarded" : "orders-svc · no guard", x: 560, y: 160, k: ok ? "det" : "bad" },
    { id: "guard", label: "Idempotency guard", sub: ok ? "live · AP-31" : "proposed · +7 −1", x: 560, y: 290, k: ok ? "det" : "human" },
    { id: "db", label: "orders table", sub: ok ? "+1 row" : "+2 rows · duplicate", x: 800, y: 90, k: ok ? "det" : "bad" },
    { id: "pay", label: "charge()", sub: ok ? "1 × $84.20" : "2 × $84.20", x: 800, y: 230, k: ok ? "det" : "bad" },
  ],
  edges: [
    { from: "client", to: "api", l: ok ? "retry · same key" : "retry ×2 · no key", k: "warn", s: 1.6 },
    { from: "api", to: "svc", l: ok ? "2 calls · 1 create" : "2 × create", k: ok ? "det" : "bad", w: ok ? 1.6 : 2.6 },
    { from: "svc", to: "guard", l: ok ? "find_by_key · hit" : "patched edge", k: ok ? "det" : "human", s: 1.4 },
    { from: "svc", to: "db", l: ok ? "INSERT ×1" : "INSERT ×2", k: ok ? "det" : "bad", w: ok ? 1.6 : 2.6 },
    { from: "svc", to: "pay", l: ok ? "charge ×1" : "charge ×2", k: ok ? "det" : "bad", w: ok ? 1.6 : 2.6 },
  ],
})
/** regression tests passed per suite: [suite, before, after, total] */
export const REPAIR_SUITES: [string, number, number, number][] = [["Checkout", 10, 12, 12], ["Orders API", 8, 9, 9], ["Payments", 8, 8, 8], ["Cart", 7, 7, 7], ["Auth", 6, 6, 6], ["Security", 4, 4, 4]]
