type PlainFinding = { headline: string; explanation: string; location?: string }

const accessibility: Record<string, [string, string]> = {
  "Scrollable region must have keyboard access": ["Some content cannot be reached by keyboard", "People who do not use a mouse may miss this content."],
  "<li> elements must be contained in a <ul> or <ol>": ["A list is not structured correctly", "Screen readers may announce the list incorrectly."],
  "Links must have discernible text": ["Some links have no clear name", "People using screen readers may not know where these links go."],
  "Elements must meet minimum color contrast ratio thresholds": ["Some text is hard to read", "The text may be difficult to see, especially for people with low vision."],
  "Buttons must have discernible text": ["Some buttons have no clear label", "People using screen readers may not know what these buttons do."],
  "Images must have alternative text": ["Some images have no text description", "Screen readers cannot describe those images to visitors."],
  "<html> element must have a lang attribute": ["The page does not declare its language", "Screen readers may pronounce the page incorrectly."],
  "Frames must have an accessible name": ["Embedded content has no clear label", "People using screen readers may not know what the embedded content is."],
  "Form elements must have labels": ["Some form fields have no label", "Visitors may not know what information to enter."],
}

const security: Record<string, [string, string]> = {
  "Missing Content-Security-Policy header": ["A browser security policy is missing", "A Content Security Policy can limit what untrusted scripts are allowed to load."],
  "Content Security Policy (CSP) Header Not Set": ["A browser security policy is missing", "A Content Security Policy can limit what untrusted scripts are allowed to load."],
  "Missing X-Content-Type-Options: nosniff": ["A browser file-type protection is missing", "Browsers are not instructed to reject unexpected file types."],
  "X-Content-Type-Options Header Missing": ["A browser file-type protection is missing", "Browsers are not instructed to reject unexpected file types."],
  "Page can be framed (clickjacking)": ["Other websites can embed this page", "That can make deceptive clicks easier. Check whether embedding is intended."],
  "Missing Anti-clickjacking Header": ["Other websites can embed this page", "That can make deceptive clicks easier. Check whether embedding is intended."],
  "Missing Strict-Transport-Security header": ["Browsers are not told to always use HTTPS", "Returning visitors may not be automatically protected by an HTTPS-only rule."],
  "User Controllable HTML Element Attribute (Potential XSS)": ["A possible script injection risk needs review", "A security scan found user-controlled page content. This does not by itself prove an exploitable issue."],
  "Cross-Domain Misconfiguration": ["Cross-site access rules need review", "Check which other websites are allowed to read this site's responses."],
  "Sub Resource Integrity Attribute Missing": ["An external file has no integrity check", "An integrity check helps detect unexpected changes to files loaded from elsewhere."],
  "Retrieved from Cache": ["A response may be stored in a cache", "Check whether this response contains anything that should stay private."],
  "Re-examine Cache-control Directives": ["Cache settings need review", "Check whether browsers should keep copies of this response."],
  "Information Disclosure - Suspicious Comments": ["Page comments may reveal information", "Review comments sent to visitors for details that should stay private."],
  "Modern Web Application": ["The scanner identified a modern web app", "This is an informational observation, not a specific security problem."],
}

function pageLocation(raw: string): string {
  try { return new URL(raw).pathname || "/" } catch { return raw }
}

export function plainFinding(f: { title: string; type: string }): PlainFinding {
  const title = f.title.trim()
  const known = (f.type === "accessibility" ? accessibility : f.type === "security" ? security : {})[title]
  if (known) return { headline: known[0], explanation: known[1] }

  const budget = /^(LCP|TTFB|CLS|INP) budget exceeded on (.+)$/i.exec(title)
  if (budget) {
    const copy: Record<string, [string, string]> = {
      LCP: ["Main content appears slowly", "Visitors may wait longer to see the main part of the page."],
      TTFB: ["The site starts responding slowly", "The browser waits longer before it can start loading this content."],
      CLS: ["Content moves while the page loads", "Text or buttons may shift while someone is reading or clicking."],
      INP: ["The page responds slowly to interaction", "Clicks or taps may feel delayed."],
    }
    const [headline, explanation] = copy[budget[1].toUpperCase()]
    return { headline, explanation, location: pageLocation(budget[2]) }
  }

  const dependency = /^(.+)@([^@:]+):\s*(.+)$/.exec(title)
  if (f.type === "security" && dependency) {
    return { headline: `A dependency has a security advisory: ${dependency[1]}`, explanation: "Review whether the affected version and feature are used, then update or mitigate it." }
  }
  if (/^JavaScript errors in the console/i.test(title)) {
    return { headline: "The page reported browser errors", explanation: "Some resources or page features may not work as expected." }
  }

  const explanation: Record<string, string> = {
    accessibility: "An accessibility check found a barrier that may affect how people use the page.",
    security: "A security check flagged this for review. Open the evidence before deciding how it affects users.",
    perf: "A measured loading or response time was outside its target.",
    ui: "A browser test recorded this behavior. Open the details to compare what was expected and observed.",
    api: "An API check found a difference between expected and observed behavior.",
    compat: "The behavior may differ between browsers or devices.",
  }
  return { headline: title, explanation: explanation[f.type] ?? "Open the evidence to see what happened and where." }
}
