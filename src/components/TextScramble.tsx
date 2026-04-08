"use client"

import { useEffect, useState, useCallback } from "react"

interface TextScrambleProps {
  children: string
  duration?: number
  speed?: number
  characterSet?: string
  trigger?: boolean
  className?: string
  as?: "p" | "span" | "div"
  onScrambleComplete?: () => void
}

const DEFAULT_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*!?/\\|"

export function TextScramble({
  children,
  duration = 0.8,
  speed = 0.04,
  characterSet = DEFAULT_CHARS,
  trigger = true,
  className,
  as: Component = "p",
  onScrambleComplete,
}: TextScrambleProps) {
  const [output, setOutput] = useState(children)
  const [isAnimating, setIsAnimating] = useState(false)

  const scramble = useCallback(() => {
    if (!trigger) return

    const target = children
    let frame = 0
    const totalFrames = Math.floor(duration / speed)
    const chars = target.split("")

    setIsAnimating(true)

    const interval = setInterval(() => {
      frame++
      const progress = frame / totalFrames

      const result = chars.map((char, i) => {
        if (char === " ") return " "
        if (progress > (i + 1) / chars.length) return target[i]
        return characterSet[Math.floor(Math.random() * characterSet.length)]
      })

      setOutput(result.join(""))

      if (frame >= totalFrames) {
        clearInterval(interval)
        setOutput(target)
        setIsAnimating(false)
        onScrambleComplete?.()
      }
    }, speed * 1000)

    return () => clearInterval(interval)
  }, [children, duration, speed, characterSet, trigger, onScrambleComplete])

  useEffect(() => {
    const cleanup = scramble()
    return () => cleanup?.()
  }, [scramble])

  return (
    <Component className={className}>
      {output}
    </Component>
  )
}
