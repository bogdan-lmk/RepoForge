# Category Forge v2

AI-powered tool that searches GitHub repositories, indexes them with semantic search, and generates product ideas by combining repos together.

## What it does

1. **Ingest** — pulls repos from GitHub via API + Octokit, embeds descriptions with OpenAI, stores vectors in Qdrant
2. **Search** — semantic search over indexed repos (vector similarity via Qdrant)
3. **Ideas** — AI generates product ideas by combining found repos, scores them across 6 dimensions, provides 72h demo plans
4. **Save** — save favorite combos to Postgres

## Tech Stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS 4, Framer Motion
- **Backend:** Next.js API routes, Drizzle ORM, PostgreSQL 16
- **AI:** OpenAI API (embeddings + chat), Vercel AI SDK
- **Search:** Qdrant vector database
- **Infra:** Docker Compose (Postgres + Qdrant)

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/your-username/category-forge-v2.git
cd category-forge-v2
npm install
```

### 2. Start databases

```bash
docker compose up -d
```

This starts:
- PostgreSQL on port `5433`
- Qdrant on port `6335`

### 3. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in your keys:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `QDRANT_URL` | yes | Qdrant URL |
| `OPENAI_API_KEY` | yes | OpenAI API key |
| `OPENAI_MODEL` | no | Chat model (default: `gpt-4o`) |
| `OPENAI_EMBEDDING_MODEL` | no | Embedding model (default: `text-embedding-3-small`) |
| `GITHUB_TOKEN` | no | GitHub PAT for repo ingestion |

### 4. Run migrations

```bash
npx drizzle-kit push
```

### 5. Start dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
├── app/api/            # API routes (ideas, combos, repos, ingest)
├── src/
│   ├── components/     # UI components (SearchBar, RepoCard, IdeaCard, etc.)
│   ├── core/           # Types, schemas, mappers
│   ├── data/           # Static data (fun facts)
│   ├── db/             # Drizzle schema & client
│   ├── lib/            # External API clients (GitHub, OpenAI, Qdrant, etc.)
│   ├── services/       # Business logic (ingest, search)
│   └── env.ts          # Environment validation (zod + t3-env)
├── drizzle/            # Migration files
├── docker-compose.yml  # Postgres + Qdrant
└── public/icons/       # Static assets
```

## API Endpoints

| Route | Method | Description |
|---|---|---|
| `/api/ideas/search?q=` | GET | Semantic search for repos + generate combo ideas |
| `/api/combos` | POST | Save a combo idea |
| `/api/repos` | GET | List indexed repos |
| `/api/ingest` | POST | Trigger repo ingestion |

## Scripts

```bash
npm run dev       # Dev server
npm run build     # Production build
npm run start     # Start production server
npm run lint      # ESLint
```

## License

Private
