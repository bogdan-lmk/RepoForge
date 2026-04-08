import { db, repos } from "@/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { ScoreBar } from "@/components/ScoreBar";
import { BackgroundGrid } from "@/components/BackgroundGrid";
import { RepoDetailAnimator } from "@/components/RepoDetailAnimator";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function RepoDetailPage({ params }: Props) {
  const { slug } = await params;
  const decoded = decodeURIComponent(slug);

  const rows = await db
    .select()
    .from(repos)
    .where(eq(repos.slug, decoded))
    .limit(1);

  if (!rows.length) notFound();
  const repo = rows[0];

  return (
    <div className="relative flex min-h-screen flex-col">
      <BackgroundGrid />
      <div className="relative z-10 flex min-h-screen flex-col">
        <Nav />

        <RepoDetailAnimator
          language={repo.language}
          slug={repo.slug}
          description={repo.description}
          stars={repo.stars?.toLocaleString() ?? "0"}
          sourceRank={repo.sourceRank?.toString() ?? "0"}
          capabilities={repo.capabilities ?? []}
          sourceRankRaw={repo.sourceRank ?? 0}
          url={repo.url}
        />
      </div>
    </div>
  );
}
