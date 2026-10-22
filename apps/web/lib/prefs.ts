"use client"
// Appearance preferences (GLASS_DESIGN_LANGUAGE.md C.16). Stored per viewer in localStorage and
// mirrored as data-* attributes on <html>, which globals.css reads. PREFS_SCRIPT applies them pre-paint.
import { useSyncExternalStore } from "react"

export const WALLPAPERS = ["prism", "mist", "sage", "dawn", "solid"] as const
export const ACCENTS = { blue: "#2457e6", indigo: "#4f46e5", navy: "#0f2557", sky: "#0284c7", rose: "#e11d48" } as const
export const GLASS = ["clear", "tinted", "solid"] as const

export type Prefs = { wall: (typeof WALLPAPERS)[number]; accent: keyof typeof ACCENTS; glass: (typeof GLASS)[number] }
const DEFAULTS: Prefs = { wall: "prism", accent: "blue", glass: "clear" }
const KEY = "trevyn.prefs"

export const PREFS_SCRIPT = `try{var p=JSON.parse(localStorage.getItem("${KEY}")||"{}"),d=document.documentElement;for(var k in p)d.setAttribute("data-"+k,p[k])}catch(e){}`

let current: Prefs | null = null
const listeners = new Set<() => void>()

function read(): Prefs {
  if (!current) {
    const d = document.documentElement.dataset
    current = { wall: (d.wall as Prefs["wall"]) ?? DEFAULTS.wall, accent: (d.accent as Prefs["accent"]) ?? DEFAULTS.accent, glass: (d.glass as Prefs["glass"]) ?? DEFAULTS.glass }
  }
  return current
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  current = { ...read(), [key]: value }
  document.documentElement.setAttribute(`data-${key}`, value)
  try { localStorage.setItem(KEY, JSON.stringify(current)) } catch {}
  listeners.forEach((l) => l())
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l) },
    read,
    () => DEFAULTS,
  )
}
