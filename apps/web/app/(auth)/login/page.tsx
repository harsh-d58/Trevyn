import type { Metadata } from "next"
import { LoginForm } from "@/components/shell/login-form"

export const metadata: Metadata = { title: "Sign in" }

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <LoginForm />
    </main>
  )
}
