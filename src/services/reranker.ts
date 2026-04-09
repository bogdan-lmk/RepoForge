import { pipeline } from "@huggingface/transformers";
import type { RepoDoc } from "@/core/types";
import { logger } from "@/lib/logger";

const MODEL_ID = "Xenova/ms-marco-MiniLM-L-6-v2";
let rerankerInstance: ((text: string, options: { topk: number }) => Promise<Array<{ label: string; score: number }>>) | null = null;
let loadPromise: Promise<void> | null = null;

async function loadModel() {
  if (rerankerInstance) return;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const clf = await pipeline("text-classification", MODEL_ID, { dtype: "fp32" });
        rerankerInstance = clf as unknown as typeof rerankerInstance;
      } catch (e) {
        loadPromise = null;
        throw e;
      }
    })();
  }
  await loadPromise;
}

function buildDocText(repo: RepoDoc): string {
  const parts = [repo.slug, repo.name];
  if (repo.description) parts.push(repo.description);
  if (repo.topics?.length) parts.push(repo.topics.join(" "));
  return parts.join(" ").slice(0, 300);
}

export async function rerank(
  query: string,
  candidates: RepoDoc[],
  topK = 15,
): Promise<RepoDoc[]> {
  if (candidates.length === 0) return [];

  try {
    await loadModel();

    const results = await Promise.all(
      candidates.map(async (c) => {
        const text = `${query}</s></s>${buildDocText(c)}`;
        const output = await rerankerInstance!(text, { topk: 1 });
        const score = output[0].score;
        return { doc: c, rerankScore: score };
      }),
    );

    results.sort((a, b) => b.rerankScore - a.rerankScore);

    return results.slice(0, topK).map(({ doc, rerankScore }) => ({
      ...doc,
      score: rerankScore,
      source: doc.source ? `${doc.source}+rerank` : "rerank",
    }));
  } catch (e) {
    logger.warn({ err: e }, "Cross-encoder reranking failed, returning original order");
    return candidates.slice(0, topK);
  }
}
