"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

interface SparklesCoreProps {
  className?: string
  background?: string
  minSize?: number
  maxSize?: number
  particleCount?: number
  particleColor?: string
  particleDensity?: number
}

interface Particle {
  x: number
  y: number
  size: number
  duration: number
  delay: number
  opacity: number
}

function generateParticles(count: number, width: number, height: number, minSize: number, maxSize: number): Particle[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    size: Math.random() * (maxSize - minSize) + minSize,
    duration: Math.random() * 3 + 2,
    delay: Math.random() * 2,
    opacity: Math.random() * 0.6 + 0.2,
  }))
}

export function SparklesCore({
  className,
  background = "transparent",
  minSize = 0.4,
  maxSize = 1.4,
  particleCount = 30,
  particleColor = "#2dd4bf",
}: SparklesCoreProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [particles, setParticles] = useState<Particle[]>([])

  const init = useCallback(() => {
    if (!containerRef.current) return
    const { clientWidth: w, clientHeight: h } = containerRef.current
    setParticles(generateParticles(particleCount, w, h, minSize, maxSize))
  }, [particleCount, minSize, maxSize])

  useEffect(() => {
    init()
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(init)
    ro.observe(el)
    return () => ro.disconnect()
  }, [init])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ background, position: "relative", overflow: "hidden" }}
    >
      <AnimatePresence>
        {particles.map((p, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, p.opacity, 0],
              scale: [0, 1, 0],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            style={{
              position: "absolute",
              left: p.x,
              top: p.y,
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              backgroundColor: particleColor,
              pointerEvents: "none",
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
