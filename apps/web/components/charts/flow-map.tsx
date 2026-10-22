"use client"
// Node-link flow map on React Flow (@xyflow/react), as promised in the deck (PORTING_PLAN.md Phase 5).
// Same props as the original SVG port so every map switched over at once: nodes are placed by centre (x, y)
// in a w × h design space; edges keep the prototype look (halo, animated dashes, a travelling packet, label).
// Positions are authored per scene, so no auto-layout (Dagre) is needed yet.
import "@xyflow/react/dist/base.css"
import {
  Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from "@xyflow/react"
import { useCallback, useEffect, useMemo, useRef } from "react"
import type { FlowEdgeData, FlowNodeData, Tone } from "@/lib/demo/findings"
import { cn } from "@/lib/utils"

export type { FlowEdgeData, FlowNodeData }
const LIGHT: Record<Tone, string> = { ai: "var(--ai)", det: "var(--det)", human: "var(--human)", bad: "var(--bad)", warn: "var(--warn)", acc: "var(--brand)", mut: "#9aa6bf" }
const PASTEL: Record<Tone, string> = { ai: "#a78bfa", det: "#5cc8b2", human: "#f2b84b", bad: "#f27fae", warn: "#f2b84b", acc: "#8fa8ff", mut: "#b9b4cc" }
const DARK: Record<Tone, string> = { ai: "#b2a1ff", det: "#45dcc6", human: "#f7ae47", bad: "#ff8080", warn: "#f0c04a", acc: "#7fa3ff", mut: "#6f82ad" }
// SVG presentation attributes cannot read CSS variables, so fonts go through style
const MONO = "var(--font-mono), ui-monospace, monospace"

type TNode = Node<{ label: string; sub: string; color: string; dark?: boolean; on: boolean; nw: number; nh: number; onSelect?: (id: string) => void }, "trevyn">
type TEdge = Edge<{ color: string; width: number; speed: number; label?: string; dark?: boolean; bad: boolean }, "trevyn">

const SIDES = [["l", Position.Left], ["r", Position.Right], ["t", Position.Top], ["b", Position.Bottom]] as const
const hidden = { opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0, border: 0, background: "transparent" }

function TrevynNode({ id, data }: NodeProps<TNode>) {
  const { label, sub, color, dark, on, nw, nh, onSelect } = data
  return (
    <div
      onKeyDown={(e) => { if (onSelect && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(id) } }}
      role={onSelect ? "button" : undefined} tabIndex={onSelect ? 0 : undefined} aria-label={onSelect ? label : undefined} aria-pressed={onSelect ? on : undefined}
      style={{ width: nw, height: nh, borderColor: on ? color : undefined, boxShadow: on ? `0 0 0 4px color-mix(in srgb, ${color} 22%, transparent)` : undefined }}
      className={cn("flex items-center gap-2.5 rounded-xl border px-2.5 transition-[box-shadow,border-color,transform] duration-200",
        dark ? "border-[#2a4380] bg-[#12285a]" : "border-[rgb(15_37_87/.1)] bg-white/85",
        onSelect && "cursor-pointer outline-none hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-brand")}>
      {SIDES.map(([k, pos]) => <Handle key={"s" + k} id={"s" + k} type="source" position={pos} style={hidden} isConnectable={false} />)}
      {SIDES.map(([k, pos]) => <Handle key={"t" + k} id={"t" + k} type="target" position={pos} style={hidden} isConnectable={false} />)}
      <span className="grid size-[18px] shrink-0 place-items-center rounded-[5px]" style={{ background: `color-mix(in srgb, ${color} 20%, transparent)` }}>
        <i className="size-[7px] rounded-full" style={{ background: color }} />
      </span>
      <span className="min-w-0 leading-tight">
        <span title={label} className={cn("block truncate text-[12.5px] font-semibold", dark ? "text-[#eef2ff]" : "text-foreground")}>{label}</span>
        <span title={sub} className={cn("block truncate text-[10.5px]", dark ? "text-[#9fb0d8]" : "text-muted-foreground")} style={{ fontFamily: MONO }}>{sub}</span>
      </span>
    </div>
  )
}

function TrevynEdge({ sourceX, sourceY, targetX, targetY, data }: EdgeProps<TEdge>) {
  if (!data) return null
  const horiz = Math.abs(targetX - sourceX) > 10, mx = (sourceX + targetX) / 2, my = (sourceY + targetY) / 2
  const d = horiz ? `M${sourceX},${sourceY} C${mx},${sourceY} ${mx},${targetY} ${targetX},${targetY}` : `M${sourceX},${sourceY} L${targetX},${targetY}`
  return (
    <g>
      <path d={d} fill="none" stroke={data.color} strokeOpacity={data.dark ? 0.35 : 0.28} strokeWidth={data.width + 2} />
      <path d={d} fill="none" stroke={data.color} strokeWidth={data.width} strokeDasharray="3 9" className="flow" />
      <circle r={data.bad ? 3.6 : 3} fill={data.color}><animateMotion dur={`${data.speed}s`} repeatCount="indefinite" path={d} /></circle>
      {data.label && (
        <text x={mx} y={my - 7} textAnchor="middle" fontSize="10.5" fill={data.dark ? "#c3cff0" : "var(--muted-foreground)"}
          style={{ fontFamily: MONO, paintOrder: "stroke", stroke: data.dark ? "#0b1a3d" : "#f4f6fa", strokeWidth: 5 }}>{data.label}</text>
      )}
    </g>
  )
}

const nodeTypes = { trevyn: TrevynNode }
const edgeTypes = { trevyn: TrevynEdge }

type Props = {
  nodes: FlowNodeData[]; edges: FlowEdgeData[]; w?: number; h?: number; dark?: boolean
  sel?: string; onSelect?: (id: string) => void; nw?: number; nh?: number; minW?: number; label?: string
  /** soft lavender / pink / yellow palette for light panels */ pastel?: boolean
  /** cap on the scale factor (default 1) so node text matches the page type size on wide screens */ maxZoom?: number
}

function Canvas({ nodes, edges, w = 900, h = 380, dark, pastel, sel, onSelect, nw = 156, nh = 48, label = "Flow map", maxZoom = 1 }: Props) {
  const C = dark ? DARK : pastel ? PASTEL : LIGHT
  const ref = useRef<HTMLDivElement>(null)
  const { setViewport } = useReactFlow()

  const rfNodes = useMemo<TNode[]>(() => nodes.map((n) => ({
    id: n.id, type: "trevyn", position: { x: n.x - nw / 2, y: n.y - nh / 2 }, width: nw, height: nh,
    draggable: false, selectable: false, focusable: !!onSelect,
    data: { label: n.label, sub: n.sub, color: C[n.k ?? "mut"], dark, on: sel === n.id, nw, nh, onSelect },
  })), [nodes, nw, nh, C, dark, sel, onSelect])

  const rfEdges = useMemo<TEdge[]>(() => {
    const at = Object.fromEntries(nodes.map((n) => [n.id, n]))
    return edges.map((e, i) => {
      const a = at[e.from], b = at[e.to], dx = b.x - a.x, dy = b.y - a.y, horiz = Math.abs(dx) > 10
      const [s, t] = horiz ? (dx > 0 ? ["r", "l"] : ["l", "r"]) : dy > 0 ? ["b", "t"] : ["t", "b"]
      return {
        id: `${e.from}-${e.to}-${i}`, source: e.from, target: e.to, sourceHandle: "s" + s, targetHandle: "t" + t, type: "trevyn", selectable: false, focusable: false,
        data: { color: C[e.k ?? "mut"], width: e.w ?? 1.6, speed: e.s ?? 2.4, label: e.l, dark, bad: e.k === "bad" },
      }
    })
  }, [nodes, edges, C, dark])

  // show the whole authored w × h design space (like the SVG viewBox did), rescaled as the container resizes
  const fit = useCallback(() => {
    const el = ref.current
    if (!el?.clientWidth) return
    const zoom = Math.min(el.clientWidth / w, maxZoom)
    setViewport({ x: (el.clientWidth - w * zoom) / 2, y: 0, zoom })
  }, [setViewport, w, maxZoom])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit])

  return (
    <div ref={ref} role={onSelect ? "group" : "img"} aria-label={label} className="trevyn-flow h-full w-full">
      <ReactFlow
        nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        width={w} height={h} defaultViewport={{ x: 0, y: 0, zoom: 1 }} minZoom={0.1} maxZoom={4}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} nodesFocusable={!!onSelect} edgesFocusable={false}
        panOnDrag={false} panOnScroll={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false} preventScrolling={false}
        // a click handler keeps nodes pointer-interactive even though selection and dragging are off
        onInit={fit} // React Flow applies defaultViewport on init, after the first resize fit
        onNodeClick={onSelect ? (_, n) => onSelect(n.id) : undefined}
        style={{ background: "transparent" }}
      />
    </div>
  )
}

export function FlowMap(props: Props) {
  const { w = 900, h = 380, minW = 760, maxZoom = 1 } = props
  return (
    <div className="overflow-x-auto">
      {/* explicit width keeps aspect-ratio from shrinking it; max-height caps the scale (text stays page-sized) */}
      <div style={{ minWidth: minW, width: "100%", aspectRatio: `${w} / ${h}`, maxHeight: h * maxZoom }}>
        <ReactFlowProvider><Canvas {...props} /></ReactFlowProvider>
      </div>
    </div>
  )
}
