"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Nav } from "@/components/Nav";
import { TrendingFeatured, TrendingRow } from "@/components/TrendingCard";
import { BackgroundGrid } from "@/components/BackgroundGrid";

interface TrendingRepo {
  slug: string;
  name: string;
  description: string | null;
  language: string | null;
  stars: number | null;
  starsDelta30d: number | null;
  trendScore: string | null;
  sourceRank: number | null;
  capabilities: string[];
  primitives: string[];
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
} as const;

const featuredItem = (i: number) => ({
  hidden: { opacity: 0, y: 24, scale: 0.95 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 280, damping: 26, delay: i * 0.1 },
  },
});

const rowItem = {
  hidden: { opacity: 0, x: -12 },
  show: {
    opacity: 1,
    x: 0,
    transition: { type: "spring" as const, stiffness: 300, damping: 28 },
  },
} as const;

export default function TrendingPage() {
  const [repos, setRepos] = useState<TrendingRepo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/repos/trending")
      .then((r) => r.json())
      .then((json) => {
        setRepos(json.data ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const featured = repos.slice(0, 3);
  const rest = repos.slice(3);

  return (
    <div className="relative flex min-h-screen flex-col">
      <BackgroundGrid />
      <div className="relative z-10 flex min-h-screen flex-col">
        <Nav />

        <div className="mx-auto w-full max-w-[1200px] px-6 pt-20 pb-12 md:pt-24">
          <motion.div
            className="mb-10 flex flex-col gap-2"
            variants={fadeUp}
            initial="hidden"
            animate="show"
          >
            <h1 className="text-[28px] font-semibold text-fg">
              Trending Repos
            </h1>
            <p className="text-sm text-fg-muted">
              Hot open-source projects, updated daily from OSSInsight
            </p>
          </motion.div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="size-6 animate-spin rounded-full border-2 border-teal border-t-transparent" />
            </div>
          ) : repos.length === 0 ? (
            <motion.div
              className="flex flex-col items-center gap-4 py-20"
              variants={fadeUp}
              initial="hidden"
              animate="show"
            >
              <p className="text-fg-muted">
                No trending repos found. Run an ingest first.
              </p>
            </motion.div>
          ) : (
            <>
              {featured.length > 0 && (
                <div className="mb-3 grid grid-cols-3 gap-4">
                  {featured.map((r, i) => (
                    <motion.div
                      key={r.slug}
                      variants={featuredItem(i)}
                      initial="hidden"
                      animate="show"
                      className={i === 0 ? "col-span-2" : ""}
                    >
                      <TrendingFeatured
                        slug={r.slug}
                        description={r.description}
                        language={r.language}
                        stars={r.stars}
                        starsDelta30d={r.starsDelta30d}
                        rank={i + 1}
                      />
                    </motion.div>
                  ))}
                </div>
              )}

              {rest.length > 0 && (
                <motion.div
                  className="mt-2 flex flex-col divide-y divide-border-subtle"
                  initial="hidden"
                  animate="show"
                  transition={{ staggerChildren: 0.04, delayChildren: 0.35 }}
                >
                  {rest.map((r) => (
                    <motion.div key={r.slug} variants={rowItem}>
                      <TrendingRow
                        slug={r.slug}
                        description={r.description}
                        language={r.language}
                        stars={r.stars}
                        starsDelta30d={r.starsDelta30d}
                        rank={repos.indexOf(r) + 1}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
