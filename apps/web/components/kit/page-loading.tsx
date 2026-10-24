// Live-mode placeholders (ANALYTICS.md §0): a page waiting for the API, and a card with nothing measured yet.
// Neither ever shows demo numbers.
import { PageHeader } from "./page-header"

export function PageLoading({ title, error }: { title: string; error?: string }) {
  return (
    <div className="grid gap-3.5">
      <PageHeader eyebrow="Live data" title={title} />
      {error ? <p role="alert" className="text-sm text-bad">{error}</p>
        : <div className="grid gap-3.5 md:grid-cols-2" aria-busy="true" aria-label={`Loading ${title}`}>
          {[0, 1, 2, 3].map((i) => <div key={i} className="glass-1 h-48 animate-pulse rounded-[22px]" />)}
        </div>}
    </div>
  )
}

/** What a card would show, and what produces that data. */
export function Empty({ what, why }: { what: string; why: string }) {
  return (
    <div className="grid place-items-center gap-1 py-8 text-center">
      <p className="text-[13px] font-medium">{what}</p>
      <p className="max-w-sm text-[12px] text-muted-foreground">{why}</p>
    </div>
  )
}
