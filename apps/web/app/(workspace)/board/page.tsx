import type { Metadata } from "next"
import { BoardView } from "@/components/findings/board-view"

export const metadata: Metadata = { title: "Findings board" }

export default function BoardPage() {
  return <BoardView />
}
