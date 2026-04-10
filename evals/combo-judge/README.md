# Combo Judge

Repo artifacts for prompt-variant evaluation of combo generation.

## Contents

- `queries.jsonl`: curated combo-worthy query set, currently `37` queries.
- `rubric.md`: fixed pairwise judging rubric.
- `prompt-variants/`: prompt baselines and candidate variants (`baseline`, `variant-a`, `variant-b`).
- `human-overrides.json`: optional manual corrections applied after model judging.

## Human overrides

`human-overrides.json` is a JSON array. Each entry targets one `queryId` and can override the final verdict, rationale, or selected rubric scores.

Example:

```json
[
  {
    "queryId": "c_capability_rag",
    "verdict": "candidate_wins",
    "rationale": "Human reviewer judged the candidate more repo-grounded.",
    "candidate": {
      "repo_fit": 5,
      "clarity": 5
    }
  }
]
```

Run with the default override file:

```bash
npm run eval:combos -- --baseline=baseline --candidate=variant-b
```

Use a custom override file:

```bash
npm run eval:combos -- --baseline=baseline --candidate=variant-b --overrides=/absolute/path/to/overrides.json
```
