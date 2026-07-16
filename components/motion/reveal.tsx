"use client"

import { createElement, type ReactNode } from "react"
import { useReducedMotion } from "motion/react"
import { AnimatedGroup, type PresetType } from "@/components/motion-primitives/animated-group"
import { TextEffect } from "@/components/motion-primitives/text-effect"

type Tag = keyof React.JSX.IntrinsicElements

interface RevealProps {
  children: ReactNode
  className?: string
  as?: Tag
  /** Motion preset for the staggered children (default: blur-slide). */
  preset?: PresetType
  /** Reveal on scroll-into-view instead of on mount. */
  triggerOnView?: boolean
  amount?: number | "some" | "all"
}

/**
 * Staggered entrance reveal that degrades to a plain element when the viewer
 * prefers reduced motion. Wraps the design's motion-primitives so the whole
 * system can be tuned in one place.
 */
export function Reveal({
  children,
  className,
  as = "div",
  preset = "blur-slide",
  triggerOnView = false,
  amount = 0.3,
}: RevealProps) {
  const reduced = useReducedMotion()

  if (reduced) {
    return createElement(as, { className }, children)
  }

  return (
    <AnimatedGroup
      as={as}
      className={className}
      preset={preset}
      triggerOnView={triggerOnView}
      viewportOptions={{ once: true, amount }}
    >
      {children}
    </AnimatedGroup>
  )
}

interface RevealTextProps {
  children: string
  className?: string
  as?: Tag
  per?: "word" | "char" | "line"
  delay?: number
  triggerOnView?: boolean
}

/**
 * Signature per-segment "fade-in-blur" text reveal, reduced-motion aware.
 */
export function RevealText({
  children,
  className,
  as = "p",
  per = "word",
  delay = 0,
  triggerOnView = false,
}: RevealTextProps) {
  const reduced = useReducedMotion()

  if (reduced) {
    return createElement(as, { className }, children)
  }

  return (
    <TextEffect as={as} per={per} preset="fade-in-blur" className={className} delay={delay} triggerOnView={triggerOnView}>
      {children}
    </TextEffect>
  )
}
