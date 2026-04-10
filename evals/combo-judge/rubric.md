# Combo Judge Rubric

Each candidate output is scored from `1-5` on five criteria:

- `repo_fit`: The idea clearly uses the surfaced repos in roles they can realistically play.
- `novelty`: The combination feels non-obvious, not a generic wrapper around popular tools.
- `clarity`: The thesis, formula, and actionability are easy to understand quickly.
- `theoretical_plausibility`: The combination could plausibly work in theory without magical leaps.
- `signal_value`: The output helps the user notice a worthwhile pattern, category, or repo combination.

Pairwise verdict:

- `baseline_wins`
- `candidate_wins`
- `tie`

Decision rules:

- Keep candidate only if pairwise win rate is at least `60%`.
- Kill candidate if `repo_fit` average drops or `clarity` average drops by more than `0.2`.
- Investigate manually if novelty rises but plausibility or repo fit fall.
