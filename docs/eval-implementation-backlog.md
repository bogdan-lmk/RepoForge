# Eval Implementation Backlog

Дата: 2026-04-10

Цель: превратить CategoryForge из feature-driven проекта в evaluation-driven систему, где каждый заметный change проходит цикл:

`baseline -> variant -> measurement -> keep/kill`

Документ покрывает первые 4 `P0` утилиты:

1. `Event Spine`
2. `Query Lab`
3. `Retrieval Bench`
4. `Combo Judge`

## Общие правила

- Не начинать фичу без baseline.
- Все internal eval-инструменты живут отдельно от public UX.
- Любой eval-run должен оставлять артефакт: `json` summary + human-readable markdown report.
- Минимум ручной магии: запросы, judged labels, rubric и режимы запуска должны быть версионируемыми.
- Сначала file-backed artifacts, потом DB-backed expansions, если это реально нужно.

## Sprint 1: Event Spine

### Outcome

Появляется минимальная событийная шина, которая позволяет считать базовую воронку:

`search_started -> results_rendered -> repo_opened -> combo_expanded -> combo_saved`

### Scope

#### DB

Добавить таблицу `events`:

```sql
events
- id serial pk
- session_id text not null
- event_type text not null
- query_text text null
- repo_slug text null
- combo_id integer null
- page text null
- source text null
- payload jsonb default '{}'
- created_at timestamptz default now()
```

Индексы:
- `(event_type, created_at desc)`
- `(session_id, created_at desc)`
- `(combo_id)`
- `(repo_slug)`

#### Server

Добавить helper:
- `src/services/events.ts`

Функции:
- `trackEvent(input)`
- `trackEvents(input[])`
- `getSessionId(req)`

Добавить route:
- `app/api/events/route.ts`

Поведение:
- `POST` принимает батч до `20` событий
- zod validation
- rate limit
- whitelist `event_type`
- не принимать произвольные поля верхнего уровня, только `payload`

#### Client

Добавить lightweight client tracker:
- `src/lib/analytics.ts`

Функции:
- `enqueueEvent`
- `flushEvents`
- `getOrCreateSessionId`

Первый набор событий:
- `search_started`
- `results_rendered`
- `search_failed`
- `repo_opened`
- `combo_expanded`
- `combo_saved`
- `query_retried`

Точки интеграции:
- [app/_home-content.tsx](/Users/bogdan/Desktop/projects/GitHub/category-forge-v2/app/_home-content.tsx)
- [src/components/RepoCard.tsx](/Users/bogdan/Desktop/projects/GitHub/category-forge-v2/src/components/RepoCard.tsx)
- [src/components/IdeaCard.tsx](/Users/bogdan/Desktop/projects/GitHub/category-forge-v2/src/components/IdeaCard.tsx)

#### Scripts

Добавить:
- `scripts/report-events.ts`

Команда:
- `npm run metrics:funnel`

Выход:
- markdown report с funnel counts за окно `24h`

### Deliverables

- migration для `events`
- `/api/events`
- client batching tracker
- первый funnel report

### Success Metric

- 95%+ search sessions имеют `search_started`
- 90%+ successful sessions имеют `results_rendered`
- можно посчитать `repo_opened/search_started`, `combo_saved/results_rendered`

### DoD

- события пишутся стабильно
- нет unbounded payload growth
- есть первый baseline report за локальные тестовые сессии

---

## Sprint 2: Query Lab

### Outcome

Появляется versioned benchmark set для поиска: одинаковые запросы, одинаковые expected results, одинаковый baseline.

### Scope

#### Repo Artifacts

Добавить каталог:

```text
evals/query-lab/
  queries.jsonl
  README.md
  schema.ts
```

`queries.jsonl` формат:

```json
{
  "id": "q_capability_rag_python",
  "query": "python framework for rag chatbot",
  "query_type": "capability_search",
  "must_have": ["langchain-ai/langchain", "run-llama/llama_index"],
  "good_candidates": ["chroma-core/chroma", "milvus-io/milvus"],
  "bad_candidates": ["facebook/react"],
  "notes": "Should surface retrieval/orchestration infra, not generic web frameworks"
}
```

Категории запросов:
- specific tool
- capability search
- exploration
- alternative
- comparison
- trend/discovery

Первый target:
- `50` запросов
- минимум `10` на category

#### Server / Service

Расширить search service так, чтобы его можно было вызывать в eval-режиме с параметрами:
- `mode`
- `disableGithubFallback`
- `disableRerank`
- `limit`

Не через public route. Нужен internal entrypoint:
- `src/services/eval/search-eval.ts`

#### Scripts

Добавить:
- `scripts/run-query-lab.ts`

Команды:
- `npm run eval:queries`
- `npm run eval:queries -- --mode=hybrid`

Артефакты:

```text
artifacts/evals/query-lab/
  latest-summary.json
  latest-summary.md
  runs/<timestamp>.json
```

Считаемые метрики:
- `precision@5`
- `precision@10`
- `MRR`
- `nDCG@10`
- `first_relevant_rank`

### Deliverables

- file-backed query benchmark
- runnable eval script
- baseline report for current default search

### Success Metric

- есть baseline summary по текущему search pipeline
- любой search change можно прогнать одной командой

### DoD

- query set reviewable в git
- script падает на malformed query specs
- baseline артефакты закоммичены или reproducible локально

---

## Sprint 3: Retrieval Bench

### Outcome

Можно честно сравнивать retrieval режимы и удалять те, что не дают value.

### Scope

#### Service Refactor

Вынести режимы поиска в явную конфигурацию:

- `fts-only`
- `vector-only`
- `hybrid`
- `hybrid+rerank`
- `hybrid+github-fallback`

Для этого:
- расширить [src/services/search.ts](/Users/bogdan/Desktop/projects/GitHub/category-forge-v2/src/services/search.ts)
- добавить `SearchMode` в `src/core/types.ts`
- сделать отдельный `runSearchMode(query, mode, options)`

#### Bench Runner

Добавить:
- `scripts/run-retrieval-bench.ts`

Команды:
- `npm run eval:retrieval`
- `npm run eval:retrieval -- --modes=fts-only,hybrid,hybrid+rerank`

Считаемые метрики:
- `P@5`
- `MRR`
- `nDCG@10`
- `median_latency_ms`
- `% queries improved vs baseline`
- `% queries degraded vs baseline`

#### Optional Internal UI

Не public page. Внутренний экран только если потребуется:
- `app/lab/retrieval/page.tsx`

Функция:
- сравнение mode A vs mode B по query set
- таблица improvements / regressions

UI делать только если CLI reports окажутся недостаточны.

### Deliverables

- явные search modes
- retrieval bench runner
- baseline vs variant compare report

### Success Metric

- любой change в ranking/weights/fallback можно сравнить against baseline за <5 минут

### Decision Rules

- keep режим только если:
  - `MRR` или `nDCG@10` растет минимум на `3%`
  - и latency не растет больше чем на `30%`

- kill режим если:
  - uplift < `3%`
  - или regressions на head queries > `10%`

### DoD

- search modes не ломают основной UX
- есть markdown compare report по всем режимам
- удален минимум один слабый режим или зафиксировано, почему все режимы пока нужны

---

## Sprint 4: Combo Judge

### Outcome

Prompt changes и combo logic перестают оцениваться “на ощущениях”.

### Scope

#### Repo Artifacts

Добавить:

```text
evals/combo-judge/
  queries.jsonl
  rubric.md
  prompt-variants/
    baseline.txt
    variant-a.txt
    variant-b.txt
```

`queries.jsonl`:
- `30-50` queries
- только те, где combo-generation реально имеет смысл

#### Rubric

Фиксируем 5 критериев:
- `repo_fit`
- `novelty`
- `clarity`
- `theoretical_plausibility`
- `signal_value`

Оценка:
- `1-5`

Pairwise verdict:
- `A wins`
- `B wins`
- `tie`

#### Service

Добавить internal generator entrypoint:
- `src/services/eval/combo-eval.ts`

Возможности:
- прогнать один и тот же query set через разные prompt variants
- сохранять raw outputs

Добавить judge:
- сначала `model-as-judge` в structured JSON
- затем optional human override file

#### Scripts

Добавить:
- `scripts/run-combo-judge.ts`

Команды:
- `npm run eval:combos`
- `npm run eval:combos -- --baseline=baseline --candidate=variant-a`

Артефакты:

```text
artifacts/evals/combo-judge/
  latest-summary.json
  latest-summary.md
  raw/<timestamp>/
```

Считаемые метрики:
- average rubric score
- pairwise win rate
- `clarity_floor`
- `repo_fit_floor`

### Deliverables

- prompt-variant system
- combo judge runner
- baseline vs candidate compare report

### Success Metric

- любой prompt change имеет pairwise result и rubric deltas

### Decision Rules

- keep candidate only if:
  - pairwise win rate `>= 60%`
  - `repo_fit` не падает
  - `clarity` не падает больше чем на `0.2`

- kill candidate if:
  - проигрывает 2 раунда подряд
  - или поднимает novelty ценой заметного падения plausibility

### DoD

- baseline prompt зафиксирован в repo
- candidate prompts сравнимы одной командой
- есть воспроизводимый summary report

---

## Cross-Sprint Technical Tasks

### Shared types

Добавить типы:
- `EventType`
- `SearchMode`
- `EvalQuery`
- `EvalRunSummary`
- `ComboJudgeScore`

Файлы:
- `src/core/types.ts`
- `src/core/schemas.ts`

### Shared report format

Все eval scripts должны генерировать:
- machine-readable `json`
- human-readable `md`

Обязательные поля summary:
- `run_id`
- `baseline`
- `candidate`
- `metrics`
- `decision`
- `notes`

### Shared commands

Обновить `package.json`:

- `metrics:funnel`
- `eval:queries`
- `eval:retrieval`
- `eval:combos`

---

## Proposed Order of Implementation

### Week 1

1. migration + `Event Spine`
2. client tracker
3. `metrics:funnel`

### Week 2

1. `Query Lab` artifacts
2. `eval:queries`
3. baseline retrieval report

### Week 3

1. `SearchMode` refactor
2. `eval:retrieval`
3. first keep/kill decision on search modes

### Week 4

1. combo rubric
2. prompt-variant system
3. `eval:combos`
4. first keep/kill decision on prompts

---

## Hard Gates

Нельзя переходить к следующему спринту, если:

- нет baseline report
- нет reproducible command
- нет explicit decision rule
- нет места, где сохраняется результат сравнения

---

## Immediate Next Actions

1. Создать migration для `events`
2. Добавить `src/services/events.ts`
3. Добавить `app/api/events/route.ts`
4. Подключить `search_started`, `results_rendered`, `combo_saved`
5. Добавить `scripts/report-events.ts`
6. Создать `evals/query-lab/queries.jsonl` с первыми `30` запросами
7. Добавить `scripts/run-query-lab.ts`
8. Зафиксировать baseline report

