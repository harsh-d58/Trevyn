"use client"
// Text wordmark avoids a failed image request when no custom logo asset is installed.
import Link from "next/link"

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" aria-label="Trevyn home" className={`press glass-2 h-11 items-center rounded-full px-4 ${className}`}>
      <span className="bg-[linear-gradient(90deg,var(--ai),var(--brand)_45%,var(--det))] bg-clip-text font-display text-[19px] font-extrabold tracking-[.06em] text-transparent">TREVYN</span>
    </Link>
  )
}
