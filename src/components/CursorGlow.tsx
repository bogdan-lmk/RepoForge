"use client";

import { useEffect } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
} from "framer-motion";

export function CursorGlow() {
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);

  const springX = useSpring(cursorX, { stiffness: 150, damping: 15, mass: 0.5 });
  const springY = useSpring(cursorY, { stiffness: 150, damping: 15, mass: 0.5 });

  useEffect(() => {
    const move = (e: MouseEvent) => {
      cursorX.set(e.clientX);
      cursorY.set(e.clientY);
    };
    window.addEventListener("mousemove", move, { passive: true });
    return () => window.removeEventListener("mousemove", move);
  }, [cursorX, cursorY]);

  return (
    <motion.div
      className="pointer-events-none fixed left-0 top-0 z-50 h-[300px] w-[300px] rounded-full"
      style={{
        background: "radial-gradient(circle, rgba(20,184,166,0.06) 0%, transparent 70%)",
        x: springX,
        y: springY,
        translateX: "-50%",
        translateY: "-50%",
      }}
    />
  );
}
