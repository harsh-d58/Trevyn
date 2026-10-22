import type { Metadata } from "next"
import { DM_Serif_Display, Geist, Geist_Mono } from "next/font/google"
import { Providers } from "@/components/providers"
import { PREFS_SCRIPT } from "@/lib/prefs"
import "./globals.css"

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] })
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] })
const display = DM_Serif_Display({ variable: "--font-display", subsets: ["latin"], weight: "400" })

export const metadata: Metadata = {
  title: { default: "Trevyn", template: "Trevyn · %s" },
  description: "Autonomous QA engineering: discover, verify, repair, deliver with confidence.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable} ${display.variable} antialiased`}>
      <head>
        {/* apply saved wallpaper / accent / glass before first paint */}
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
