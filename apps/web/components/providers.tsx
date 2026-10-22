"use client"
import { MotionConfig } from "motion/react"
import { Toaster } from "sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { FxProvider } from "@/components/fx/fx-provider"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delay={150}>
        {children}
        <FxProvider />
        {/* Toasts are island-style dark pills at the bottom centre (GLASS_DESIGN_LANGUAGE.md C.15) */}
        <Toaster position="bottom-center" theme="light" gap={8} offset={20} mobileOffset={{ bottom: 64 }}
          style={{
            "--normal-bg": "rgb(11 26 61 / .9)", "--normal-text": "#e8eeff", "--normal-border": "rgb(255 255 255 / .08)", "--border-radius": "22px",
          } as React.CSSProperties}
          toastOptions={{
            classNames: {
              toast: "backdrop-blur-xl! shadow-[0_18px_44px_-16px_rgb(11_26_61/.55)]! font-sans!",
              description: "text-white/65!",
              actionButton: "rounded-full! bg-white! text-[#0b1a3d]! font-semibold!",
            },
          }} />
      </TooltipProvider>
    </MotionConfig>
  )
}
