"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import { NeuralSynapse } from "./NeuralSynapse"
import { ForgeIcon } from "./ForgeIcon"
import { SparklesCore } from "./SparklesCore"
import { TextScramble } from "./TextScramble"
import { FUN_FACTS } from "@/data/fun-facts"

interface ForgeSpinnerProps {
  step?: number
  steps?: string[]
  title?: string
  subtitle?: string
}

const STEPS = [
  "Parsing your query",
  "Searching GitHub & local catalog",
  "Generating product ideas with AI",
  "Scoring & ranking",
]

const FACT_INTERVAL = 20000

function pickRandom(exclude: number): number {
  if (FUN_FACTS.length <= 1) return 0
  let next: number
  do {
    next = Math.floor(Math.random() * FUN_FACTS.length)
  } while (next === exclude)
  return next
}

export function ForgeSpinner({ step = 1, steps = STEPS, title = "Forging ideas...", subtitle = "Searching repos and combining them into product ideas" }: ForgeSpinnerProps) {
  const reduceMotion = useReducedMotion()
  const [factIndex, setFactIndex] = useState(() => Math.floor(Math.random() * FUN_FACTS.length))
  const [factKey, setFactKey] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const cycleFact = useCallback(() => {
    setFactIndex((prev) => {
      const next = pickRandom(prev)
      return next
    })
    setFactKey((k) => k + 1)
  }, [])

  useEffect(() => {
    if (reduceMotion) {
      return
    }
    intervalRef.current = setInterval(cycleFact, FACT_INTERVAL)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [cycleFact, reduceMotion])

  const currentFact = FUN_FACTS[factIndex]

  return (
    <div role="status" aria-live="polite" aria-label={`Forging ideas, step ${step + 1} of ${steps.length}`} className="relative flex flex-col items-center gap-6">
      <SparklesCore
        className="pointer-events-none absolute inset-0"
        particleCount={20}
        particleColor="#2dd4bf"
        minSize={0.3}
        maxSize={1}
      />

      <div className="relative flex items-center justify-center">
        <NeuralSynapse size={160} nodeCount={10} className="absolute opacity-40" />
        <div className="relative z-10">
          <ForgeIcon size={52} />
        </div>
      </div>

      <motion.h2
        className="text-xl font-medium text-fg"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        {title}
      </motion.h2>

      <motion.p
        className="text-sm text-fg-muted"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.3 }}
      >
        {subtitle}
      </motion.p>

      <div className="flex w-[400px] max-w-[90vw] flex-col gap-3 pt-4">
        {steps.map((label, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 + i * 0.15, duration: 0.35 }}
            className={cn(
              "flex items-center gap-3 transition-all duration-500",
              i + 1 <= step ? "text-teal" : "text-fg-muted",
            )}
            style={{ opacity: i + 1 <= step ? 1 : 0.4 }}
          >
            <div
              className={cn(
                "size-2 shrink-0 rounded transition-all duration-300",
                i + 1 < step
                  ? "bg-teal"
                  : i + 1 === step
                    ? "bg-teal animate-pulse"
                    : "bg-fg-muted/40",
              )}
            />
            <span className="font-mono text-[13px]">{label}</span>
          </motion.div>
        ))}
      </div>

      <div className="w-[400px] max-w-[90vw] border-t border-border/40 pt-6 mt-2">
        <AnimatePresence mode="wait">
          <motion.div
            key={factKey}
            initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <TextScramble
              duration={1.2}
              speed={0.03}
              characterSet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
              className="font-mono text-[13px] italic leading-relaxed text-fg-muted max-w-[380px]"
              as="p"
            >
              {currentFact.text}
            </TextScramble>
            {currentFact.person && (
              <motion.p
                className="mt-2 font-mono text-[11px] text-fg-muted/60 tracking-wide"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
              >
                — {currentFact.person}{currentFact.year ? `, ${currentFact.year}` : ""}
              </motion.p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
