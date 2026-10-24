"use client"
// TREVYN wordmark: public/trevyn-logo.png when present, otherwise a text fallback in the brand gradient.
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

export function Wordmark({ className = "" }: { className?: string }) {
  const [missing, setMissing] = useState(false)
  const img = useRef<HTMLImageElement>(null)
  useEffect(() => { // the image may have failed before React attached onError
    const el = img.current
    if (el?.complete && el.naturalWidth === 0) setMissing(true)
  }, [])
  return (
    <Link href="/" aria-label="Trevyn home" className={`press glass-2 h-11 items-center rounded-full px-4 ${className}`}>
      {missing ? (
        <span className="bg-[linear-gradient(90deg,var(--ai),var(--brand)_45%,var(--det))] bg-clip-text font-display text-[19px] font-extrabold tracking-[.06em] text-transparent">TREVYN</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={img} src="/trevyn-logo.png" alt="Trevyn" className="h-6 w-auto" onError={() => setMissing(true)} />
      )}
    </Link>
  )
}
