"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Nav } from "@/components/Nav";
import { ComboCard } from "@/components/ComboCard";
import { EmptyState } from "@/components/EmptyState";
import { BackgroundGrid } from "@/components/BackgroundGrid";
import { useSavedIdeas } from "@/lib/use-saved-ideas";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.2 },
  },
} as const;

const item = {
  hidden: { opacity: 0, x: -16 },
  show: {
    opacity: 1,
    x: 0,
    transition: { type: "spring", stiffness: 300, damping: 28 },
  },
  exit: {
    opacity: 0,
    x: 16,
    scale: 0.95,
    transition: { duration: 0.2 },
  },
} as const;

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
} as const;

export default function IdeasPage() {
  const { saved, unsave } = useSavedIdeas();

  return (
    <div className="relative flex min-h-screen flex-col">
      <BackgroundGrid />
      <div className="relative z-10 flex min-h-screen flex-col">
        <Nav />

        <div className="flex flex-col gap-8 px-20 pt-20 pb-12 md:pt-24">
          <motion.div
            className="flex flex-col gap-2"
            variants={fadeUp}
            initial="hidden"
            animate="show"
          >
            <h1 className="text-[28px] font-semibold text-fg">My Ideas</h1>
            <p className="text-sm text-fg-muted">
              Product ideas you saved for later
            </p>
          </motion.div>

          {saved.length === 0 ? (
            <motion.div
              className="pt-20"
              variants={fadeUp}
              initial="hidden"
              animate="show"
            >
              <EmptyState />
            </motion.div>
          ) : (
            <AnimatePresence mode="popLayout">
              <motion.div
                className="flex flex-col gap-4"
                variants={container}
                initial="hidden"
                animate="show"
              >
                {saved.map((c) => (
                  <motion.div key={c.id} variants={item} layout exit={item.exit}>
                    <ComboCard
                      title={c.title}
                      description={c.thesis}
                      tags={c.capabilities}
                      scores={c.scores}
                      saved
                      onSave={() => unsave(c.id)}
                    />
                  </motion.div>
                ))}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
