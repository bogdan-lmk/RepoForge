# CategoryForge Homepage: Expert UX/PM Analysis

*Independent analysis based on codebase audit, competitive research, and UX best practices*

---

## Executive Summary

Your diagnosis is largely correct: the homepage has a "dead room" problem. But the solution space is narrower than the 5 variants suggest. After auditing the codebase, DB schema, API surface, and researching competitor patterns, I recommend a focused 2-phase approach that maximizes impact while respecting the actual data constraints of the system.

**TL;DR of my recommendations:**
1. Phase 1: Inspiration Chips + Dice button (your Variants A+D, modified)
2. Phase 2: Showcase Cards from real combos (your Variant B, modified)
3. Skip Variants C and E for now (argued below)

---

## Part 1: What Your Research Gets Right

### The "dead room" diagnosis is accurate

The homepage flow is: land → see aurora + animated title → see SearchBar with typewriter → think "what do I type?" → leave. The typewriter shows 6 abstract prompts that cycle every ~4 seconds total per phrase. Research from NN/g confirms that suggestion pills positioned near the input field are noticed "at the exact moment users are most likely to engage with them." Your current typewriter effect is decorative, not interactive — it shows ideas but doesn't let the user act on them with a single click.

### The three patterns you identified are real

- **Action Chips (ChatGPT pattern):** When unauthenticated users visit ChatGPT, they see pill-shaped suggestions directly beneath the input. This is the most validated pattern for reducing the 0→1 cognitive load barrier.
- **Trending/Social Proof (Perplexity pattern):** Perplexity's Discover feed shows human-curated prompts as "an easy way to engage with the product, even when you don't have a prompt of your own."
- **Scenario Cards (Notion AI pattern):** People respond to solutions, not features. "Build a RAG chatbot" > "Semantic search engine."

### The 6 current placeholders are weak

They're all formatted identically ("X for Y..."), they're static (hardcoded in `SearchBar.tsx` line 6-13), they don't reflect real user behavior, and they don't create urgency or curiosity. They function as decoration, not as conversion levers.

---

## Part 2: What Your Research Gets Wrong (or Overstates)

### Variant C (Trending Repos) is premature

**Your assumption:** "Trending data is already available via `/api/repos/trending`"

**Reality check:** The trending endpoint returns repos sorted by `trendScore`, but this data is seeded via a manual `POST /api/ingest` call that pulls from OSSInsight. There's no cron job, no automatic refresh. The `starsDelta30d` field exists but there's no evidence it's being regularly updated. The "trending" data is actually a snapshot from whenever `npm run db:seed` was last run.

Showing "meta-llama +342 today" on the homepage requires **live, reliable trending data**. If the numbers are stale (or wrong), it destroys trust faster than having no numbers at all. The trending page (`/app/trending/page.tsx`) already exists as a separate route — duplicating it on the homepage before the data pipeline is reliable creates a maintenance burden with trust risk.

**Recommendation:** Skip Variant C until you have automated daily ingestion (a cron that runs `/api/ingest` + a mechanism to compute real daily deltas). Revisit after Phase 2.

### Variant E (Category Grid) solves the wrong problem

The category grid ("AI/ML", "Chatbots", "DevTools"...) is a taxonomy-first approach. It works for products with a large catalog where users browse (like a marketplace or app store). CategoryForge is a **generative tool** — the user describes what they want and AI creates combinations. Presenting fixed categories fights the core UX metaphor of "describe anything, we'll forge it."

More practically: the mapping of `category → preset query` would be arbitrary and static. There's no `categories` table in the schema, no tagging system on combos beyond `capabilities` (which are free-text AI-generated strings, not a controlled vocabulary). Building this requires inventing a taxonomy that doesn't exist in the data model.

**Recommendation:** Skip Variant E entirely. It's an information architecture solution to a conversion problem.

### The "Live Idea Feed" (Variant B) has a data quality gate

Your plan: `SELECT * FROM combos ORDER BY created_at DESC LIMIT 6`.

The issue: combos are generated per-search-session and stored with whatever `queryText` the user typed. There's no moderation, no quality filter, no `is_featured` field. If someone searches "asdfasdf" or "test test test", that combo could appear on your homepage. The `combos` table has a `saved` boolean, but that reflects individual user saves (client-side via `useSavedIdeas`), not editorial curation.

This doesn't kill Variant B — it means you need a curation mechanism before shipping it. More on this below.

---

## Part 3: Recommended Implementation Plan

### Phase 1: Inspiration Chips + Dice (1-2 days)

**What:** 5-6 clickable pill buttons below the SearchBar + a dice/shuffle button inside the SearchBar.

**Why this first:**
- Lowest effort, highest immediate impact on the cold-start problem
- No new API endpoints needed
- No data quality concerns (curated by you)
- Validated by ChatGPT, v0.dev, and every major AI product homepage
- Research shows suggestion pills are the #1 pattern for reducing cognitive load at the input moment

**Implementation specifics:**

1. **Inspiration Chips** — Add a new section below the `<SearchBar>` in `app/page.tsx` (after line 248, inside the hero motion.main). Render 5-6 pill buttons:

```
✦ RAG chatbot with local LLM    ✦ Open-source billing platform
✦ AI code review for PRs         ✦ Real-time data dashboard
✦ Voice assistant SDK             ✦ Developer portfolio builder
```

On click: set the SearchBar query to the chip text and trigger `handleSearch()`. The SearchBar already accepts `defaultValue` and exposes `onSearch` — you need to either lift state or add a ref-based `setQuery` method.

**Data source for chips:** Start with a hardcoded array in `app/page.tsx`. These should be curated prompts that you know produce good results (test them manually first). Later, you can add a `GET /api/prompts/featured` endpoint that queries:

```sql
SELECT queryText, COUNT(*) as cnt
FROM combos
WHERE queryText IS NOT NULL
  AND LENGTH(queryText) > 10
GROUP BY queryText
ORDER BY cnt DESC
LIMIT 12
```

...and manually curate from that list.

2. **Dice Button (🎲)** — Add a shuffle button to the left of "Forge →" in `SearchBar.tsx`. On click: pick a random prompt from a pool of ~20 curated queries and fill the input. Add a brief CSS rotation animation on the icon.

The prompt pool can combine:
- 10 manually curated high-quality queries
- Random combination of `{trending_repo_name} + {vertical}` (if trending data is fresh)

**What NOT to do:** Don't generate random combos from `capabilities` + `primitives` fields — these are AI-extracted free-text and combining two random ones produces gibberish ("code-splitting + webhook-handling product").

**Animation:** Chips should fade in with the same stagger pattern as trust metrics (delay 2.8s, after trust metrics finish). This maintains the cinematic reveal without adding visual noise to the critical first 2 seconds.

---

### Phase 2: Showcase Cards (1 week after Phase 1)

**What:** 3 curated combo cards displayed below the trust metrics section, showing real AI-generated product ideas.

**Why second:**
- Requires adding an `is_featured` boolean to the `combos` table (DB migration)
- Requires building a lightweight curation mechanism
- Higher visual impact but more complex than chips
- This is the v0.dev "community gallery" pattern — powerful but needs quality data

**Implementation specifics:**

1. **DB migration:** Add `is_featured BOOLEAN DEFAULT FALSE` to `combos` table. Create index on `(is_featured, created_at)`.

2. **New API endpoint:** `GET /api/combos/featured?limit=3`

```sql
SELECT * FROM combos
WHERE is_featured = true
ORDER BY created_at DESC
LIMIT 3
```

3. **Curation workflow:** For now, manually set `is_featured = true` via a SQL query or a simple admin script after testing that the combo looks good. Later, build an admin UI or a CLI command.

4. **Showcase Card component:** A new `<ShowcaseCard>` that displays:
   - Combo title (as headline)
   - Thesis (1-line description)
   - Average score (rendered as a small badge, e.g., "8.7")
   - 2-3 capability tags
   - "Try this →" CTA button

On "Try this →" click: populate SearchBar with the combo's `queryText` and trigger search. The user gets their own fresh generation based on the same prompt.

5. **Layout:** Horizontal scroll on mobile, 3-column grid on desktop. Position between trust metrics and the feature checklist. Same stagger animation pattern.

**Key design decision:** These cards should NOT link to the combo detail page. They should re-trigger a fresh search. This is critical — the user should feel like they're getting their own personalized result, not viewing someone else's cached output. This is the difference between a "gallery" (passive browsing) and an "inspiration engine" (active creation).

---

## Part 4: What I'd Change About the Existing Homepage

Beyond the new features, a few observations from the codebase audit:

### The trust metrics are aspirational, not verified

- **"50k+ Repos indexed"** — The `repos` table likely has far fewer than 50k rows (seeded via OSSInsight trending, which returns 25 at a time). This number should either be real (query `SELECT COUNT(*) FROM repos`) or removed.
- **"<2s Idea generation"** — The search pipeline does FTS + vector search + conditional GitHub API + OpenAI generation. This frequently takes 5-15 seconds, not <2s. The ForgeSpinner component with its 4-step progress tracker and "fun facts" rotation confirms this is a long wait.
- **"6 Score dimensions"** — This is accurate but meaningless to a first-time user. Nobody cares about score dimensions before they've seen a single score.

**Recommendation:** Replace with metrics that build trust through specificity:
- Real repo count (dynamic, from API)
- Number of ideas generated (COUNT from combos table)
- Something about the AI model or data freshness

### The tagline undersells the product

Current: "Search GitHub repositories and forge them into product ideas with AI"

This is a feature description, not a value proposition. It tells you WHAT happens but not WHY you'd want it. Consider something like:
- "Turn open-source repos into startup ideas in seconds"
- "Find repos. Combine them. Ship products."

The current tagline also buries the most interesting part (product ideas) after the least interesting part (search GitHub repos).

### The feature checklist is low-value

The three items at the bottom ("Semantic search", "AI-powered combos", "72h demo plans") are internal feature names, not user benefits. "Semantic search" means nothing to someone who hasn't used the product. "72h demo plans" is actually the most compelling feature but it's listed last with the same weight as the others.

**Recommendation:** Either remove the checklist entirely (the chips + showcase cards will do more work) or rewrite as user outcomes: "Find hidden gems", "Get build-ready combos", "Ship a demo in 72 hours."

---

## Part 5: Implementation Priority Matrix

| Feature | Effort | Impact | Risk | Priority |
|---------|--------|--------|------|----------|
| Inspiration Chips (5-6 pills below search) | Low (1 day) | High | None | **P0 — Do first** |
| Dice/Shuffle button in SearchBar | Low (0.5 day) | Medium-High | None | **P0 — Do with chips** |
| Fix trust metrics to use real data | Low (0.5 day) | Medium | Low | **P1 — Quick win** |
| Rewrite tagline + feature checklist | Low (0.5 day) | Medium | Low | **P1 — Quick win** |
| Showcase Cards (3 featured combos) | Medium (2-3 days) | High | Medium (data quality) | **P2 — Phase 2** |
| `is_featured` migration + curation flow | Medium (1 day) | Enabling | Low | **P2 — Prerequisite for showcase** |
| `/api/prompts/featured` endpoint | Low (0.5 day) | Low (chips work without it) | None | **P3 — Nice to have** |
| Trending integration on homepage | High (3-5 days) | Medium | High (stale data) | **P4 — After data pipeline** |
| Category grid | Medium (2 days) | Low | Medium (no taxonomy) | **Skip** |

---

## Part 6: Competitive Context Summary

**What the best AI products do on their homepages:**

- **ChatGPT:** Suggestion pills ("Analyze data", "Summarize text", "Help me write") directly beneath the input. Minimal, action-oriented. No decoration.
- **v0.dev:** Community gallery of real generated outputs. Users see what others built and click "remix." The gallery IS the homepage.
- **Perplexity:** Discover feed with human-curated trending topics organized by category. Functions as both search tool and content destination.
- **Notion AI:** Scenario-based suggestions ("Draft a meeting agenda", "Summarize this doc") that map to real user workflows, not abstract capabilities.

**The common thread:** All of these reduce the distance from "I'm looking at an empty input" to "I'm getting value." They do this through clickable, pre-populated suggestions — not through decoration, animation, or trust metrics.

CategoryForge currently invests heavily in the decorative layer (Aurora, CursorGlow, animated title, typewriter effect) and underinvests in the actionable layer. The chips + showcase cards directly address this imbalance.

---

## Appendix: Technical Notes

**SearchBar integration for chips:**
The current SearchBar doesn't expose a way to programmatically set the query from outside. Options:
1. Lift `query` state to `page.tsx` and pass as controlled prop
2. Add a `ref` with `useImperativeHandle` to expose `setQuery()`
3. Use the existing `defaultValue` prop + remount with new key

Option 1 is cleanest for the chips use case since `handleSearch` is already in `page.tsx`.

**Combo showcase data shape:**
The `mapComboToApi()` mapper (used in `GET /api/combos`) already returns all fields needed for showcase cards: `title`, `thesis`, `capabilities`, `scores`, `queryText`. No new mapper needed.

**Animation budget:**
The hero section already has animations delayed up to 2.6s. Adding chips at 2.8s and showcase at 3.2s risks the user scrolling away before seeing them. Consider reducing existing delays by 30-40% to fit the new elements within a 2.5s total animation budget.
