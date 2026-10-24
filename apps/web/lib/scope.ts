// Project and run selection shared by server pages and the live store.
// Without a run cookie, server pages resolve the selected project's latest run.
export const SCOPE_COOKIE = "trevyn_run"
export const PROJECT_COOKIE = "trevyn_project"

/** `?run=` (or `&run=`) for an API path; empty when no run is selected */
export const runParam = (run: string | null | undefined, joiner: "?" | "&" = "?") => (run ? `${joiner}run=${encodeURIComponent(run)}` : "")

export function writeScopeCookie(run: string | null) {
  document.cookie = run ? `${SCOPE_COOKIE}=${encodeURIComponent(run)}; path=/; max-age=2592000; samesite=lax` : `${SCOPE_COOKIE}=; path=/; max-age=0`
}

export function writeProjectCookie(project: string | null) {
  document.cookie = project ? `${PROJECT_COOKIE}=${encodeURIComponent(project)}; path=/; max-age=2592000; samesite=lax` : `${PROJECT_COOKIE}=; path=/; max-age=0`
}

export function withRun(path: string, run: string | null) {
  return path + runParam(run, path.includes("?") ? "&" : "?")
}
