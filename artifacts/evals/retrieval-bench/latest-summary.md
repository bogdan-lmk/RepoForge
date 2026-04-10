# Retrieval Bench

- Run ID: `2026-04-10T13-24-23.911Z`
- Baseline: `fts-only`

## Modes
- `fts-only` — P@5 0.0867, MRR 0.2559, nDCG@10 0.2164, median latency 2940.085ms, misses 18
- `vector-only` — P@5 0.12, MRR 0.35, nDCG@10 0.2881, median latency 2902.355ms, misses 15
- `hybrid` — P@5 0.1067, MRR 0.3108, nDCG@10 0.2499, median latency 2833.71ms, misses 13
- `hybrid+rerank` — P@5 0.0933, MRR 0.2913, nDCG@10 0.2275, median latency 3055.84ms, misses 13
- `hybrid+github-fallback` — P@5 0.1067, MRR 0.3181, nDCG@10 0.2744, median latency 4559.3ms, misses 13

## Comparisons
- `vector-only` — decision: keep; MRR Δ 36.7722%, nDCG Δ 33.1331%, latency Δ -1.2833%, improved 10, degraded 4; Candidate clears uplift threshold without exceeding latency budget.
- `hybrid` — decision: keep; MRR Δ 21.4537%, nDCG Δ 15.4806%, latency Δ -3.6181%, improved 11, degraded 4; Candidate clears uplift threshold without exceeding latency budget.
- `hybrid+rerank` — decision: keep; MRR Δ 13.8335%, nDCG Δ 5.1294%, latency Δ 3.9371%, improved 9, degraded 5; Candidate clears uplift threshold without exceeding latency budget.
- `hybrid+github-fallback` — decision: kill; MRR Δ 24.3064%, nDCG Δ 26.8022%, latency Δ 55.0737%, improved 10, degraded 3; Candidate exceeded the latency budget.