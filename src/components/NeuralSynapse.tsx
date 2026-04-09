"use client"

import { useMemo } from "react"
import { motion } from "framer-motion"

interface NeuralSynapseProps {
  size?: number
  nodeCount?: number
  color?: string
  className?: string
}

interface Node {
  x: number
  y: number
  radius: number
}

function pseudoRandom(seed: number) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

function generateNodes(count: number, size: number): Node[] {
  const nodes: Node[] = []
  const cx = size / 2
  const cy = size / 2
  const maxR = size * 0.35

  for (let i = 0; i < count; i++) {
    const angleJitter = (pseudoRandom((i + 1) * 13.17 + size) - 0.5) * 0.8
    const dist = maxR * (0.3 + pseudoRandom((i + 1) * 37.91 + size) * 0.7)
    nodes.push({
      x: cx + Math.cos((Math.PI * 2 * i) / count + angleJitter) * dist,
      y: cy + Math.sin((Math.PI * 2 * i) / count + angleJitter) * dist,
      radius: 1.5 + pseudoRandom((i + 1) * 53.29 + size) * 2.5,
    })
  }

  return nodes
}

export function NeuralSynapse({
  size = 200,
  nodeCount = 12,
  color = "#2dd4bf",
  className,
}: NeuralSynapseProps) {
  const nodes = useMemo(() => generateNodes(nodeCount, size), [nodeCount, size])

  const connections = useMemo(() => {
    const conns: { from: Node; to: Node; delay: number; duration: number }[] = []
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x
        const dy = nodes[i].y - nodes[j].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < size * 0.35) {
          const seed = (i + 1) * 97 + (j + 1) * 193 + size
          conns.push({
            from: nodes[i],
            to: nodes[j],
            delay: pseudoRandom(seed) * 3,
            duration: 1.5 + pseudoRandom(seed * 1.7) * 2,
          })
        }
      }
    }
    return conns
  }, [nodes, size])

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      style={{ overflow: "visible" }}
    >
      {connections.map((conn, i) => {
        const dx = conn.to.x - conn.from.x
        const dy = conn.to.y - conn.from.y
        const len = Math.sqrt(dx * dx + dy * dy)
        return (
          <motion.line
            key={`line-${i}`}
            x1={conn.from.x}
            y1={conn.from.y}
            x2={conn.to.x}
            y2={conn.to.y}
            stroke={color}
            strokeWidth={0.5}
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{
              pathLength: [0, 1, 1, 0],
              opacity: [0, 0.4, 0.3, 0],
            }}
            transition={{
              pathLength: { duration: conn.duration, delay: conn.delay, repeat: Infinity, ease: "easeInOut" },
              opacity: { duration: conn.duration, delay: conn.delay, repeat: Infinity, ease: "easeInOut" },
            }}
            style={{ strokeDasharray: len, strokeDashoffset: 0 }}
          />
        )
      })}
      {nodes.map((node, i) => (
        (() => {
          const duration = 2 + pseudoRandom((i + 1) * 71.13 + size) * 2
          const delay = pseudoRandom((i + 1) * 83.41 + size) * 2
          return (
        <motion.circle
          key={`node-${i}`}
          cx={node.x}
          cy={node.y}
          r={node.radius}
          fill={color}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0.2, 0.8, 0.2],
            scale: [0.8, 1.2, 0.8],
          }}
          transition={{
            duration,
            delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
          )
        })()
      ))}
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={size * 0.08}
        fill="none"
        stroke={color}
        strokeWidth={0.5}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{
          scale: [0.8, 1.5, 0.8],
          opacity: [0.3, 0.1, 0.3],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={size * 0.15}
        fill="none"
        stroke={color}
        strokeWidth={0.3}
        initial={{ scale: 1, opacity: 0 }}
        animate={{
          scale: [1, 2, 1],
          opacity: [0.15, 0, 0.15],
        }}
        transition={{
          duration: 5,
          delay: 1,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </svg>
  )
}
