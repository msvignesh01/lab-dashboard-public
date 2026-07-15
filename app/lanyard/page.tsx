import type { Metadata } from "next"
import { LanyardStudio } from "@/components/lanyard-studio"

export const metadata: Metadata = {
  title: "Lanyard studio",
  description: "Design and preview your Fabrication Lab 3D lanyard credential.",
}

export default function Page() {
  return <LanyardStudio />
}
