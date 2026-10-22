import Link from "next/link"
import { ArrowLeft, Compass } from "lucide-react"

export default function NotFound() {
  return (
    <div className="wallpaper grid min-h-dvh place-items-center px-4">
      <div className="glass-1 max-w-md rounded-[24px] p-7 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand/10 text-brand"><Compass size={22} /></span>
        <h1 className="mt-4 text-[22px] font-medium tracking-[-.01em]">Page not found</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">That page doesn&apos;t exist in this workspace. Try Ctrl K search from the overview.</p>
        <Link href="/" className="press pulse mt-5 inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white">
          <ArrowLeft size={14} />Back to overview
        </Link>
      </div>
    </div>
  )
}
