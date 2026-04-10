import { Suspense } from "react";
import { connection } from "next/server";
import HomeContent from "./_home-content";
import { getHomeMetrics } from "@/lib/home-metrics";

export default async function Home() {
  await connection();
  const stats = await getHomeMetrics();

  return (
    <Suspense>
      <HomeContent stats={stats} />
    </Suspense>
  );
}
