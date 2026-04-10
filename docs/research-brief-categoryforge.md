# Research Brief: CategoryForge

Дата: 2026-04-09

Метод: анализ актуального кода репозитория + verification signals (`build`, `tsc`, `lint`, `tests`) + внешние official sources по релевантным классам продуктов.

Использованные рамки:
- `coding-standards`: maintainability, cohesion, complexity, consistency
- `verification-loop`: build/type/lint/test reality check
- `security-review`: API exposure, secrets, abuse surfaces, operational risk
- `audit`: UX/performance/anti-pattern review на уровне реализации

## 1. Executive Summary

CategoryForge уже выглядит не как toy demo, а как рабочая retrieval + generation система: есть typed env/config, Postgres + Qdrant, hybrid retrieval, reranking, structured query parsing и structured combo generation. Это дает проекту реальную техническую основу.

Но продукт сейчас застрял между двумя идентичностями:
- как search/research engine по open-source
- как idea/inspiration product для новых продуктов

Технически сильнее всего реализован слой retrieval. Слабее всего реализованы слой продукта и feedback loop. Проект уже умеет искать и комбинировать, но пока плохо превращает это в устойчивое пользовательское value loop: onboarding остается холодным, поиск не объясняет свою полезность, сохранение идей не превращено в shared/server-side memory, а quality loop для ranking/generation почти не замкнут.

Главный вывод: ближайший ROI даст не “еще один AI feature”, а перевод проекта из engine-centric продукта в insight-centric продукт. То есть из “мы умеем искать и генерировать” в “мы reliably показываем, почему именно этот repo и эта комбинация worth building”.

## 2. Scorecard

| Dimension | Score (0-5) | Evaluation | Evidence |
|---|---:|---|---|
| Technical foundation | 3.5 | Основа крепкая: Next 16, React 19, typed env, Drizzle schema, Qdrant hybrid retrieval, reranker, нормальные quality gates. Слабые места: in-memory rate limiting, limited observability, некоторые README/API docs уже устарели. | `src/services/search.ts`, `src/lib/qdrant.ts`, `src/env.ts`, `npm run build`, `npx tsc --noEmit`, `npm run test -- --coverage` |
| Search quality moat | 3.0 | Есть реальная retrieval architecture, а не один prompt. Но веса, fusion и fallback-поведение в основном эвристические; primitives почти не превращены в product surface; нет eval loop по relevance. | `src/services/search.ts:25-83`, `src/lib/qdrant.ts:122-173`, `src/lib/openai.ts:38-67` |
| Idea-generation quality | 2.5 | Structured generation и 6 scoring dimensions уже есть. Но prompt все еще беден по repo context: почти нет maturity/fit signals, а `steps` и другие полезные поля мало используются в UI. | `src/lib/openai.ts:69-107`, `src/db/schema.ts:64-97`, `app/_home-content.tsx` |
| UX conversion | 2.0 | Hero visually polished, но first-run value path слабый: мало actionability до первого поиска, trust metrics partly aspirational, loading-heavy flow, saved ideas mostly local-only consumption. | `app/_home-content.tsx:182-271`, `src/components/ForgeSpinner.tsx:16-149`, `app/ideas/page.tsx:38-95` |
| Market differentiation | 2.5 | CategoryForge не конкурирует на широте against AI app builders. Его шанс в wedge “repo intelligence -> buildable product ideas”. Этот wedge есть в коде, но пока слабо артикулирован в UX и positioning. | Internal architecture + competitor sources below |

## 3. Current-State Model of the Product

### What the product actually is today

CategoryForge сегодня делает 5 последовательных вещей:

1. Парсит пользовательский запрос в structured intent.
2. Ищет релевантные репозитории локально и в GitHub.
3. Сливает lexical, vector и GitHub results.
4. Переранжирует shortlist.
5. Генерирует 3 комбинированные product ideas.

Это не “AI chat for repos” и не “GitHub trends dashboard”. Это pipeline:

`intent parser -> hybrid retrieval -> GitHub fallback -> reranker -> idea generator -> combo persistence`

### Data flow

- Query parsing: `parseQuery()` выделяет `anchor_terms`, `capability_terms`, `intent_type`, `query_type`, `required_entities`, `github_queries` (`src/lib/openai.ts:17-67`).
- Retrieval: `search()` запускает Postgres FTS и Qdrant vector search параллельно, затем при слабом recall/intent-driven need подтягивает live GitHub results (`src/services/search.ts:10-83`).
- Persistence: live GitHub results дописываются в Postgres и Qdrant (`src/services/search.ts:171-229`).
- Generation: `generateCombos()` строит structured combos по top repos (`src/lib/openai.ts:69-107`).
- Combo storage: search endpoint может сохранять generated combos в таблицу `combos` (`app/api/ideas/search/route.ts:26-107`).
- Saved ideas consumption: страница `/ideas` по-прежнему построена вокруг localStorage hook (`src/lib/use-saved-ideas.ts:18-67`, `app/ideas/page.tsx:38-95`).

### Persistence model

- `repos`: canonical searchable repo catalog с `capabilities`, `primitives`, `stars`, `starsDelta30d`, `trendScore`, generated `fts` column (`src/db/schema.ts:25-62`).
- `combos`: generated ideas с `steps`, `repoRoles`, `scores`, `whyFit`, `firstUser`, `demo72h`, `saved`, `queryText` (`src/db/schema.ts:64-97`).
- `scanLog`: ingestion runs (`src/db/schema.ts:99-108`).

## 4. Technical Evaluation

### What is solid

1. **Hybrid retrieval is real and layered**
   - `search()` делает parallel FTS + vector retrieval, потом адаптивно включает GitHub fallback и reranking (`src/services/search.ts:25-83`).
   - Это намного сильнее, чем single-vector-search или prompt-only discovery.

2. **The schema anticipates richer product behavior than the UI exposes**
   - `repos` уже хранит `capabilities`, `primitives`, trend-related fields.
   - `combos` уже хранит `steps`, `repoRoles`, `whyFit`, `firstUser`, `keyRisks`, `scores`.
   - То есть большая часть “будущего продукта” уже частично смоделирована на data level (`src/db/schema.ts:25-97`).

3. **Verification baseline is good**
   - `npm run build` проходит.
   - `npx tsc --noEmit` проходит.
   - `npm run test -- --coverage` проходит: `49 passed`, `5 skipped`, `95.26% statements`, `94.79% lines`.
   - Ограничение: branches = `79%`, то есть ниже желаемого 80%.

### Code-grounded findings

1. **Retrieval quality relies on heuristics more than measured relevance**
   - `search()` использует ручные веса и adaptive heuristics, но в проекте нет relevance dataset, offline evals или feedback-derived tuning (`src/services/search.ts:51-64`).
   - Implication: engine выглядит sophisticated, но moat пока не защищен измерением качества.

2. **Generation prompt still underuses repo metadata**
   - В prompt подается максимум 10 repos; summary включает только `slug`, `description` и до 5 `capabilities` (`src/lib/openai.ts:74-82`).
   - Не подаются `stars`, `language`, `topics density`, `freshness`, `trendScore`, `primitives`, `readme quality`.
   - Implication: model генерирует правдоподобные идеи, но с ограниченным signal budget.

3. **Primitives are stored, indexed, but barely productized**
   - `primitives` есть в schema, ingestion, search docs и Qdrant payload (`src/db/schema.ts:40-41`, `src/services/ingest.ts:25-27`, `src/lib/qdrant.ts:98-107`).
   - Но user-facing flow практически не использует их как primary interaction surface.
   - Implication: у продукта уже есть потенциальный differentiator, который не вынесен в UX.

4. **Trending data model is ahead of actual pipeline**
   - `starsDelta30d` есть в schema (`src/db/schema.ts:37`), но ingestion populates only `trendScore` from OSSInsight and never computes/stores `starsDelta30d` (`src/services/ingest.ts:29-57`).
   - Implication: если строить growth/trending narratives, данные частично декларативны, а не operational.

5. **Saved ideas are still split-brain**
   - Search endpoint сохраняет combos в DB и возвращает id (`app/api/ideas/search/route.ts:33-89`).
   - Но `/ideas` built around localStorage hook (`src/lib/use-saved-ideas.ts`, `app/ideas/page.tsx`).
   - Implication: продукт пока не формирует общую память, social proof и shared curation loop.

6. **Security posture improved, but operationally limited**
   - `ingest` и `reindex` теперь защищены bearer secret + rate limiting (`app/api/ingest/route.ts:10-31`, `app/api/reindex/route.ts:27-89`).
   - Но rate limiting in-memory (`src/core/route-guards.ts:14-79`) не масштабируется across instances/regions.
   - Implication: для MVP это приемлемо, для hosted multi-instance production нет.

7. **Observability is thin**
   - Есть `logger` и `scanLog`, но нет полноценной event model для query -> click -> save -> reuse funnel.
   - Implication: project cannot yet tune search quality or UX conversion from actual behavior.

### Reliability and maintainability

- Maintainability: хорошая feature/domain split architecture (`services/`, `lib/`, `db/`, `core/`).
- Reliability: most important flows have graceful fallbacks (`Promise.allSettled`, rerank fallback, dense fallback).
- Weak spot: some documentation is stale against actual API semantics. README still lists `/api/ideas/search?q=` as `GET`, while current product flow uses `POST` as primary mutation path.

## 5. Product / UX Evaluation

### Current UX model

Homepage today optimizes for visual intrigue more than activation:

- animated hero
- decorative aurora / glow / motion
- single large search box
- trust metrics
- feature checklist

This is aesthetically coherent, but conversion-relevant guidance is thin.

### Where UX works

1. **The product is immediately legible as “AI + GitHub + ideas”**
   - The hero, search bar, and results split between repos and ideas communicate the core concept fast.

2. **Results screen has a good dual-panel mental model**
   - Repos on one side, ideas on the other gives users both evidence and synthesis.

3. **Loading state explains process stages**
   - Spinner explicitly names parse/search/generate/score phases (`src/components/ForgeSpinner.tsx:16-21`).

### Where UX underperforms

1. **Cold start is still under-instrumented**
   - Hero has no strong preset entry points or scenario-first prompts; users must invent a prompt from scratch (`app/_home-content.tsx:203-231`).

2. **Trust metrics overstate certainty**
   - `50k+ repos indexed` and `<2s idea generation` are hard-coded hero claims (`app/_home-content.tsx:234-245`), while actual flow can involve live GitHub fetch, embeddings, LLM generation and visible multi-step waiting.

3. **Hidden high-value output**
   - `steps`, `whyFit`, `firstUser`, `keyRisks`, `supportingPrimitives` are generated/stored but not central in the homepage results experience.

4. **Save is not a strong product moment**
   - There is a save action, but the downstream experience still feels personal/local rather than networked/editorial/shared.

5. **Loading state is informative but passive**
   - ForgeSpinner shows stage labels and fun facts (`src/components/ForgeSpinner.tsx:16-149`), but not real query-specific progress or interim evidence.

### UX implication

CategoryForge currently helps a motivated user after they search, but does too little to help an uncertain user know what is worth searching for.

## 6. Market / Competitor Evaluation

### Competitive class 1: AI app builders

**GitHub Spark**
- GitHub positions Spark as an “all-in-one, AI-powered platform for building intelligent apps” with natural language, visual tools or code, plus instant previews and one-click deployment ([GitHub Spark](https://github.com/features/spark)).
- Spark explicitly promises frontend, backend, AI features, database connections and hosting in one environment ([GitHub Spark](https://github.com/features/spark)).

**v0**
- v0 positions itself as an AI agent for creating “real code and full-stack apps and agents,” with one-click deployment, diagnostics, backend support and integrated community/templates ([What is v0?](https://v0.app/docs), [Full-stack apps](https://v0.app/docs/full-stack-apps), [Templates](https://v0.app/docs/templates)).
- v0’s official docs show that discovery/community/remix are product-level primitives, not side features ([Templates](https://v0.app/docs/templates), [Community](https://v0.app/docs/community)).

**Lovable**
- Lovable’s homepage is explicit: “Create apps and websites by chatting with AI,” then “Start with an idea -> Watch it come to life -> Refine and ship” ([Lovable](https://lovable.dev/)).
- Lovable also exposes templates and a visible “discover apps” layer, reinforcing browse/remix social proof as part of the product ([Lovable](https://lovable.dev/), [Lovable ChatGPT app](https://lovable.dev/chatgpt-app)).

**What this means for CategoryForge**
- Competing head-on as a general “build apps with AI” product is a bad strategic trade.
- These products already own the broader promise: idea -> app -> deploy.

### Competitive class 2: repo / trend discovery tools

**OSSInsight**
- OSSInsight positions itself as a free analytics platform over “10 billion GitHub events in real time” and exposes trending repos, rankings, collections and APIs ([OSSInsight](https://ossinsight.io/), [OSSInsight Public API](https://ossinsight.io/docs/api)).
- It already owns the “what is happening on GitHub now” narrative better than CategoryForge.

**What this means for CategoryForge**
- Competing as a pure repo intelligence dashboard is also a weak wedge.
- CategoryForge should use repo/trend intelligence as input, not as the final user-facing promise.

### Competitive class 3: idea / inspiration interfaces

**Notion AI**
- Notion AI markets outcome-oriented use cases like “Go from brainstorm to roadmap”, “Automate weekly reporting”, “Triage product feedback”, and “Resolve support tickets in Slack”, emphasizing job-to-be-done framing rather than raw capability lists ([Notion AI](https://www.notion.com/product/ai)).
- It also pairs those use cases with trust and governance messaging such as enterprise search, admin controls, permissions, analytics, and explicit security/privacy commitments ([Notion AI](https://www.notion.com/product/ai)).

**What this means for CategoryForge**
- Users respond better to scenario-led framing than to technical-feature framing.
- CategoryForge should present “what you can build next from open source” rather than “semantic search over repos”.

### Current wedge

`open-source repo intelligence -> credible product combinations -> fast path to what to build`

### Missing wedge

`evidence-backed, buildable opportunity discovery`

Right now the product can generate ideas, but does not yet surface enough evidence to make those ideas feel reliably superior to a generic LLM brainstorm.

### Believable moat

The believable moat is not “AI ideas” by itself. It is:

- hybrid repo retrieval
- structured capability + primitive extraction
- reusable repo memory
- evidence-backed synthesis over the open-source graph

### Likely failure mode if nothing changes

The product gets perceived as “a beautiful GitHub + LLM idea generator”:
- too narrow to beat app builders on utility
- too shallow to beat GitHub analytics tools on data
- too generic to beat broad AI workspaces on user trust and workflow fit

## 7. Key Insights

### Insight 1
**Observation:** The strongest part of CategoryForge is retrieval architecture, not generation polish.

**Evidence:** Parallel FTS + vector retrieval, adaptive GitHub fallback, reranker, Qdrant hybrid query and persistence pipeline (`src/services/search.ts`, `src/lib/qdrant.ts`).

**Why it matters:** This is the one layer that already feels defensible versus generic AI products.

**Recommended move:** Reposition product language around evidence-backed discovery and surface retrieval evidence more explicitly in UX.

**Implication:** Продукт должен продавать не “AI magic”, а “better inputs -> better build decisions”.

### Insight 2
**Observation:** Idea quality is constrained less by model choice than by missing repo context in the prompt.

**Evidence:** `generateCombos()` currently feeds mostly `slug`, `description`, `capabilities`; it omits richer maturity and fit signals (`src/lib/openai.ts:74-100`).

**Why it matters:** Without better repo context, combo scores stay plausible but weakly grounded.

**Recommended move:** Enrich generation prompt with stars, language, trend/maturity signals, representative primitives, and repo-role examples.

**Implication:** Что улучшать первым: context budget для synthesis, а не новый model switch.

### Insight 3
**Observation:** The product already stores more value than it shows.

**Evidence:** `steps`, `whyFit`, `firstUser`, `keyRisks`, `supportingPrimitives` exist in `combos` schema, but are not first-class in the main user flow (`src/db/schema.ts:64-97`).

**Why it matters:** Hidden value looks like weak product quality from the user’s perspective.

**Recommended move:** Promote steps / wedge / risk / first-user fields into result cards or detail views.

**Implication:** Уже сгенерированная ценность должна стать видимой, прежде чем генерировать еще больше.

### Insight 4
**Observation:** Primitives are the best candidate for a real differentiated UX surface.

**Evidence:** `primitives` are extracted, stored, indexed and returned, but not central in search initiation or idea explanation (`src/services/ingest.ts`, `src/lib/qdrant.ts`, `app/api/ideas/search/route.ts`).

**Why it matters:** Competitors own “build apps from prompt”; fewer products own “discover buildable opportunity by technical building blocks”.

**Recommended move:** Add primitive-led discovery and use primitives to explain “why these repos fit together”.

**Implication:** Самый сильный differentiation lever уже есть в данных, а не в дизайне.

### Insight 5
**Observation:** UX currently asks too much from the user before showing proof of value.

**Evidence:** Hero is search-first with hard-coded trust metrics and limited guided entry; no strong scenario presets or evidence-rich examples on first screen (`app/_home-content.tsx:182-271`).

**Why it matters:** This depresses activation, especially for users who don’t arrive with a precise prompt.

**Recommended move:** Replace decorative-first onboarding with scenario-first entry points and evidence-rich showcase patterns.

**Implication:** Главная страница должна помогать выбрать направление, а не только ждать query.

### Insight 6
**Observation:** Saved ideas are not yet a real network/product memory.

**Evidence:** Combos can be persisted server-side, but `/ideas` still reads from localStorage (`app/api/ideas/search/route.ts`, `src/lib/use-saved-ideas.ts`, `app/ideas/page.tsx`).

**Why it matters:** Without server-side memory and event history, you can’t build curation, social proof, or optimization loops.

**Recommended move:** Unify save, revisit, and curation around one server-side source of truth.

**Implication:** Без общей памяти продукт не эволюционирует из личного scratchpad в compounding system.

### Insight 7
**Observation:** The project has a ranking engine but not a ranking evaluation discipline.

**Evidence:** Search weights and heuristics are hard-coded; there is no qrels/relevance dataset or user-behavior feedback loop. Qdrant’s own docs explicitly frame hybrid search quality as something to tune and evaluate, not assume ([Qdrant Search](https://qdrant.tech/documentation/search/), [Hybrid Search Revamped](https://qdrant.tech/articles/hybrid-search/)).

**Why it matters:** Without evals, every ranking improvement is intuition-driven and fragile.

**Recommended move:** Create a small judged query set and track precision@k / MRR / save-through-rate before changing fusion weights.

**Implication:** Search moat becomes real only when relevance is measured, not just architected.

### Insight 8
**Observation:** CategoryForge should not market itself like a general AI builder.

**Evidence:** GitHub Spark, v0 and Lovable already promise natural-language full-stack building, templates, publishing and community discovery at platform scale ([GitHub Spark](https://github.com/features/spark), [v0 Docs](https://v0.app/docs), [Lovable](https://lovable.dev/)).

**Why it matters:** A weaker copy of a broader category is strategically trapped.

**Recommended move:** Position CategoryForge as the upstream decision engine for what to build from open source, then optionally hand off execution to builders.

**Implication:** Winning path = “decide better before you build”, not “build everything with AI”.

## 8. Priority Roadmap

### Now

1. **Enrich combo generation context**
   - Add stars, language, primitives, trend indicators, repo-role hints and 1-2 high-quality combo examples to generation prompt.
   - Success metric: higher judged combo quality and clearer combo rationales.

2. **Surface evidence in the result experience**
   - Promote `steps`, `whyFit`, `firstUser`, `keyRisks`, `supportingPrimitives` in cards or detail views.
   - Success metric: better save rate per search and lower bounce after first result set.

3. **Replace cold-start hero with guided activation**
   - Add curated scenario chips and example flows tied to actual good queries/results.
   - Remove or replace hard-coded trust metrics with real or less brittle claims.
   - Success metric: higher search start rate from landing.

4. **Unify saves and revisit flow server-side**
   - Make saved ideas page and save state derive from one persistent source.
   - Success metric: real saved-combo history and curation-ready data.

### Next

1. **Build an evaluation harness for search quality**
   - Curate a small benchmark of representative queries and expected repos.
   - Track precision@k, MRR, save-through-rate, and combo acceptance signals.

2. **Turn primitives into a first-class interaction model**
   - Add primitive-led discovery or primitive-backed explanations in search and combo UX.

3. **Add event instrumentation**
   - Log search, result view, combo expansion, save, revisit.
   - Use one event schema to support both product analytics and ranking evaluation.

4. **Fix trend-data credibility**
   - Either compute `starsDelta30d` properly or stop implying live growth precision.

### Later

1. **Editorial / community layer**
   - Featured combo sets, reusable scenario libraries, query collections.

2. **Builder handoff**
   - Export stronger build plans or one-click handoff into coding/building environments.

3. **Opportunity intelligence**
   - Move from “combine repos” to “identify viable whitespace and build paths” using repo graph + trend + capability overlap.

## 9. Answers to the Three Core Questions

### 1. Где у проекта реальные сильные стороны?

- В retrieval architecture.
- В structured repo enrichment (`capabilities`, `primitives`).
- В already-typed and testable technical foundation.
- В том, что проект уже может стать evidence-backed discovery engine, а не просто LLM wrapper.

### 2. Что мешает ему стать отличимым продуктом?

- Product surface пока не догоняет data/model surface.
- UX still asks for a query before proving value.
- Saves, feedback and evaluation loops are underdeveloped.
- Positioning risks collapsing into the generic “AI app builder” category.

### 3. Какие улучшения дадут наибольший ROI в ближайшие 1-2 итерации?

- Better combo generation context.
- Stronger evidence-rich results UX.
- Scenario-first landing/onboarding.
- Unified server-side saves plus event instrumentation.

## Sources

### Codebase evidence

- `src/services/search.ts`
- `src/services/ingest.ts`
- `src/lib/openai.ts`
- `src/lib/qdrant.ts`
- `src/db/schema.ts`
- `app/_home-content.tsx`
- `src/components/ForgeSpinner.tsx`
- `src/lib/use-saved-ideas.ts`
- `app/ideas/page.tsx`
- `app/api/ideas/search/route.ts`
- `app/api/repos/search/route.ts`
- `app/api/ingest/route.ts`
- `app/api/reindex/route.ts`
- `src/core/route-guards.ts`

### External sources

- GitHub Spark: <https://github.com/features/spark>
- v0 Docs, “What is v0?”: <https://v0.app/docs>
- v0 Docs, “Full-stack apps”: <https://v0.app/docs/full-stack-apps>
- v0 Docs, “Templates”: <https://v0.app/docs/templates>
- v0 Docs, “Community”: <https://v0.app/docs/community>
- OSSInsight homepage: <https://ossinsight.io/>
- OSSInsight Public API: <https://ossinsight.io/docs/api>
- Lovable homepage: <https://lovable.dev/>
- Lovable ChatGPT app: <https://lovable.dev/chatgpt-app>
- Notion AI product page: <https://www.notion.com/product/ai>
- Qdrant Search docs: <https://qdrant.tech/documentation/search/>
- Qdrant hybrid search article: <https://qdrant.tech/articles/hybrid-search/>
