import { Suspense } from "react";
import { connection } from "next/server";
import HomeContent from "./_home-content";
import { getHomeMetrics } from "@/lib/home-metrics";
import { getFeaturedCombos } from "@/lib/featured-combos";

export default async function Home() {
  await connection();
  const [stats, featuredCombos] = await Promise.all([
    getHomeMetrics(),
    getFeaturedCombos(3),
  ]);

  return (
    <Suspense>
      <HomeContent stats={stats} featuredCombos={featuredCombos} />
    </Suspense>
  );
}
