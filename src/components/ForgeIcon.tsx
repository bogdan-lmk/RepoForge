"use client"

import { useMemo } from "react"
import { motion } from "framer-motion"

interface ForgeIconProps {
  size?: number
  color?: string
  className?: string
}

const ORBIT_DURATIONS = [2.2, 2.5, 2.8, 3.1, 2.4, 2.7]

export function ForgeIcon({ size = 48, color = "#2dd4bf", className }: ForgeIconProps) {
  const orbits = useMemo(
    () =>
      [0, 1, 2, 3, 4, 5].map((i) => {
        const angle = (Math.PI * 2 * i) / 6
        return {
          cx: 24 + Math.cos(angle) * 20,
          cy: 16 + Math.sin(angle) * 16,
          duration: ORBIT_DURATIONS[i],
          delay: i * 0.3,
        }
      }),
    [],
  )

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
    >
      <motion.path
        d="M24 4C17.37 4 12 9.37 12 16C12 20.08 14.08 23.66 17.2 25.8C14.96 27.34 13.5 29.96 13.5 32.92C13.5 37.66 17.26 41.5 21.9 41.5"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: [0, 1], opacity: [0, 0.6] }}
        transition={{ duration: 2, repeat: Infinity, repeatDelay: 1, ease: "easeInOut" }}
      />
      <motion.path
        d="M24 4C30.63 4 36 9.37 36 16C36 20.08 33.92 23.66 30.8 25.8C33.04 27.34 34.5 29.96 34.5 32.92C34.5 37.66 30.74 41.5 26.1 41.5"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: [0, 1], opacity: [0, 0.6] }}
        transition={{ duration: 2, delay: 0.3, repeat: Infinity, repeatDelay: 1, ease: "easeInOut" }}
      />
      <motion.ellipse
        cx="24"
        cy="16"
        rx="5"
        ry="6"
        stroke={color}
        strokeWidth={1}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: [0.3, 0.7, 0.3], scale: [0.95, 1.05, 0.95] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.line
        x1="24"
        y1="22"
        x2="24"
        y2="30"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: [0, 1, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.line
        x1="20"
        y1="26"
        x2="28"
        y2="26"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: [0, 1, 0] }}
        transition={{ duration: 2, delay: 0.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.circle
        cx="24"
        cy="38"
        r="2"
        fill={color}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: [0, 0.8, 0], scale: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
      {orbits.map((o, i) => (
        <motion.circle
          key={i}
          cx={o.cx}
          cy={o.cy}
          r={1}
          fill={color}
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0, 0.6, 0],
            scale: [0.5, 1.2, 0.5],
          }}
          transition={{
            duration: o.duration,
            delay: o.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </svg>
  )
}
