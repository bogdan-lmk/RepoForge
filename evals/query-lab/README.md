# Query Lab

File-backed judged benchmark for CategoryForge search quality.

## Format

Each line in `queries.jsonl` is one JSON object:

```json
{
  "id": "q_capability_rag_python",
  "query": "python framework for rag chatbot",
  "query_type": "capability_search",
  "must_have": ["langchain-ai/langchain"],
  "good_candidates": ["chroma-core/chroma", "run-llama/llama_index"],
  "bad_candidates": ["facebook/react"],
  "notes": "Should surface RAG infra, not generic frontend frameworks"
}
```

## Query Types

- `specific_tool`
- `capability_search`
- `exploration`
- `alternative`
- `comparison`
- `trend_discovery`

## Evaluation Rules

- `must_have` repos receive the strongest gain in nDCG.
- `good_candidates` count as relevant, but lower gain.
- `bad_candidates` do not affect nDCG directly, but are tracked via `badInTop5`.

## Usage

Run:

```bash
npm run eval:queries
```

Optional:

```bash
npm run eval:queries -- --limit=5
```
