# CategoryForge: Deep Insights & New Evaluation

*Second-pass analysis — things the initial review missed*

---

## Insight 1: The Real Problem Isn't the Homepage — It's the Combo Quality Pipeline

The homepage "dead room" is a symptom. The root cause is deeper: **even when users DO search, the generated combos are mediocre because the AI prompt is underspecified.**

Evidence from `src/lib/openai.ts`:

- The generation prompt mentions only 3 scoring dimensions (novelty, composable_fit, narrative_clarity), but the schema expects 6. The AI is hallucinating scores for `accessibility_wedge`, `time_to_demo`, and `category_upside` with zero guidance.
- The AI sees only 10 repos max, with only their first 5 capabilities. No star counts, no language, no readme content. It's generating product ideas blind to technical maturity, ecosystem fit, and real-world adoption signals.
- There's no scoring rubric. What makes novelty 0.8 vs 0.3? The AI guesses every time, producing inconsistent scores across sessions.

**Why this matters for the homepage:** If you build Showcase Cards (Variant B) and the featured combos have vague theses and random-feeling scores, users will click "Try this →", get similarly vague results, and bounce. The homepage features are only as good as the content they surface.

**Recommendation before Phase 2:** Fix the generation prompt. Add:
1. All 6 scoring dimensions with explicit rubrics (e.g., "timeToDemo: 0.9 = single afternoon with boilerplate; 0.3 = weeks of custom integration")
2. Repo metadata in the prompt (stars, language, last commit) so the AI can assess maturity
3. 2-3 few-shot examples of excellent combos
4. Explicit instruction on `demo72h` format (step 1/2/3 with time estimates)

This is a prerequisite for everything else. Without it, the homepage is marketing a product that underdelivers.

---

## Insight 2: You Have a Hidden "Primitives" Asset That Nobody Can Access

The DB stores two types of AI-extracted metadata per repo: `capabilities` (high-level: "real-time notifications", "authentication") and `primitives` (low-level: "poll API periodically", "webhook handler", "JWT validation").

Capabilities are used in search ranking and displayed in UI. Primitives are stored in the DB and indexed in Qdrant embeddings, but **never used in search logic and barely shown in UI**.

This is significant because primitives represent the actual building blocks of software. A user who thinks "I need something that does webhook handling + queue processing" is describing primitives, not capabilities. But the search system can't match on primitives — it only uses capabilities in FTS.

**New homepage feature idea (not in original 5 variants):**

**"Primitive Mixer"** — Instead of typing a query, the user selects 2-3 primitives from a visual palette, and the system finds repos that contain those primitives and generates combos.

Implementation: `SELECT * FROM repos WHERE primitives @> ARRAY['webhook-handler', 'queue-processing']` (JSONB containment query). This is already queryable with the existing schema.

This is more powerful than category chips because it lets users think in technical building blocks rather than abstract product categories. It's also unique — no competitor does this.

---

## Insight 3: The `steps` Field Is Generated But Never Shown

Every combo has a `steps` array — an AI-generated implementation roadmap. This data is persisted to the database but completely invisible in the UI.

- `IdeaCard` doesn't show steps
- `ComboCard` (saved ideas page) doesn't show steps
- There's no combo detail page at all

This is your most valuable generated content sitting unused. The `demo72h` field (shown as a small badge "72h demo plan") is just a text summary, but `steps` is the actual actionable plan.

**Impact on homepage:** If the Showcase Cards showed "4 steps to build this" with a preview of step 1, it would be dramatically more compelling than just a title + thesis. It transforms the card from "here's an idea" to "here's a plan."

---

## Insight 4: The Save System Is Client-Only, Making Showcase Cards Impossible to Curate from Real Usage

The `useSavedIdeas` hook stores saves in `localStorage`. The combos table has a `saved` boolean, but looking at the code:

- Homepage `handleSave` calls the localStorage hook, not the API
- The `PATCH /api/combos/[id]` endpoint exists and toggles `saved`, but it's never called from the homepage
- The homepage doesn't even have combo IDs — the search response (`ComboResult` interface at line 102 in page.tsx) doesn't include `id`

This means: **server-side save counts are always 0.** You can't build "most-saved combos" or any social proof feature from the DB because nobody's saves reach the server.

**Fix needed:** The search API already persists combos to DB and returns them with IDs. The homepage `ComboResult` interface needs to include `id`, and the save action needs to call `PATCH /api/combos/{id}` in addition to localStorage.

This is a prerequisite for any data-driven homepage curation (featured by popularity, trending combos, etc.).

---

## Insight 5: The `starsDelta30d` Data Pipeline Is Broken

The schema has `starsDelta30d` and it's displayed on the trending page with a mini bar chart. But looking at `ingestTrending()`:

- OSSInsight returns `stars` count
- The ingest function stores `trendScore` (from OSSInsight's own trending metric)
- But `starsDelta30d` is **never calculated or populated** during ingestion

The trending cards on `/trending` show this field, which means they're showing 0 or null for every repo. The mini bar chart is rendering empty data.

**Impact:** If you add Variant C (Trending Repos on homepage) with "+342 today" badges, you'll be showing zeros. This data needs to be calculated — either by storing historical star counts and computing deltas, or by using GitHub's stargazers API to calculate recent growth.

---

## Insight 6: The ForgeSpinner Tells You Users Wait a Long Time

The ForgeSpinner component has:
- 4 progress steps shown sequentially
- A rotating "fun facts" system that cycles every 20 seconds
- 60 fun facts in `src/data/fun-facts.ts`

If you built a 20-second rotation cycle and stockpiled 60 facts, you expected users to wait **minutes**, not seconds. The trust metric "< 2s Idea generation" on the homepage is misleading.

**New insight for homepage:** Instead of hiding the wait time, leverage it. The "Forging..." state could show a preview of what's happening:

- "Found 12 repos matching 'RAG chatbot'..."
- "Analyzing capabilities of langchain, chromadb, fastapi..."
- "Generating 3 product combinations..."

This turns dead wait time into engagement. It's the Domino's Pizza Tracker pattern — showing progress makes waits feel 30-40% shorter (research from MIT Sloan).

---

## Insight 7: There's No Feedback Loop, and It's the Biggest Long-Term Gap

Currently:
- No tracking of which search results users click
- No tracking of which combos users save (server-side)
- No tracking of search queries (beyond what's stored in `combos.queryText`)
- No "was this useful?" mechanism
- No A/B testing infrastructure

The RRF weights (FTS: 1.4, Vector: 1.2, GitHub: 1.0) are hardcoded based on intuition. There's no way to know if they're optimal.

**For the homepage specifically:** Without a feedback loop, you can't evolve from "hardcoded chips" (Phase 1) to "data-driven chips" (what people actually search for). You're stuck curating manually forever.

**Minimum viable feedback:** Log every search query, every combo view, and every save action to a `events` table. Schema:

```sql
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL, -- 'search' | 'combo_view' | 'combo_save' | 'chip_click'
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

This gives you: popular queries (for chips), popular combos (for showcase), and conversion funnel data (search → view → save).

---

## Insight 8: The `fun-facts.ts` Data File Might Be Dead Code

The agent found that `fun-facts.ts` is "never referenced anywhere." If the ForgeSpinner imports fun facts from a different source or has them inline, this 60-item data file is dead code. Worth verifying and cleaning up.

---

## Evaluation: Revised Feature Priority

Based on these deeper findings, here's a revised priority that accounts for pipeline quality:

### Tier 0: Fix the Foundation (before any homepage features)

1. **Fix combo generation prompt** — Add all 6 scoring rubrics, repo metadata, few-shot examples. This improves every combo generated going forward, including ones shown on homepage.

2. **Wire server-side saves** — Add combo `id` to search response, call PATCH on save. This enables future data-driven features.

3. **Add basic event logging** — Search queries, combo views, saves. Table + simple INSERT. No analytics dashboard yet, just data collection.

### Tier 1: Quick Wins (original Phase 1, still valid)

4. **Inspiration Chips** — 5-6 curated pills below SearchBar
5. **Dice button** — Random prompt generator
6. **Fix trust metrics** — Real numbers from DB

### Tier 2: Showcase (original Phase 2, but now with better data)

7. **Add `is_featured` to combos** — DB migration
8. **Showcase Cards** — 3 featured combos with steps preview
9. **Show steps in combo detail** — Surface the hidden implementation roadmap

### Tier 3: Differentiation (new ideas)

10. **Primitive Mixer** — Select building blocks, find matching repos
11. **Progressive ForgeSpinner** — Show real-time search progress, not generic steps
12. **Search history** — Show last 3-5 queries as quick-access chips

### Deferred

- Trending on homepage (data pipeline not ready)
- Category grid (wrong pattern for generative tool)
- Full feedback loop analytics (build after you have event data)

---

## Key Differences from Initial Analysis

| Topic | Initial Analysis Said | Deep Dive Reveals |
|-------|----------------------|-------------------|
| Variant B (Showcase) | "Needs is_featured field" | Also needs server-side saves working + better combo quality first |
| Variant C (Trending) | "Skip until data pipeline" | Also: starsDelta30d is never populated, trending data is actually broken |
| Trust metrics | "Replace with real numbers" | "< 2s" is actively misleading given ForgeSpinner design |
| Combo quality | Not analyzed | Prompt is underspecified, scores are inconsistent, steps are hidden |
| Save system | Assumed it works | Client-only, server DB has zero saves, blocks data-driven features |
| Primitives | Not mentioned | Major untapped asset for unique homepage feature |
| Feedback loop | Mentioned briefly | Most critical long-term gap, blocks evolution from manual to data-driven |
