import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const hoursArg = process.argv.find((arg) => arg.startsWith("--window-hours="));
const windowHours = Number(hoursArg?.split("=")[1] ?? "24");

if (!Number.isFinite(windowHours) || windowHours <= 0) {
  console.error("window-hours must be a positive number");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

try {
  const [summary] = await sql`
    WITH recent AS (
      SELECT *
      FROM events
      WHERE created_at >= now() - (${windowHours} * interval '1 hour')
    )
    SELECT
      COUNT(*) FILTER (WHERE event_type = 'search_started')::int AS search_started,
      COUNT(*) FILTER (WHERE event_type = 'query_retried')::int AS query_retried,
      COUNT(*) FILTER (WHERE event_type = 'results_rendered')::int AS results_rendered,
      COUNT(*) FILTER (WHERE event_type = 'search_failed')::int AS search_failed,
      COUNT(*) FILTER (WHERE event_type = 'repo_opened')::int AS repo_opened,
      COUNT(*) FILTER (WHERE event_type = 'combo_expanded')::int AS combo_expanded,
      COUNT(*) FILTER (WHERE event_type = 'combo_saved')::int AS combo_saved,
      COUNT(DISTINCT CASE WHEN event_type IN ('search_started', 'query_retried') THEN session_id END)::int AS search_sessions,
      COUNT(DISTINCT CASE WHEN event_type = 'results_rendered' THEN session_id END)::int AS result_sessions,
      COUNT(DISTINCT CASE WHEN event_type = 'repo_opened' THEN session_id END)::int AS repo_sessions,
      COUNT(DISTINCT CASE WHEN event_type = 'combo_saved' THEN session_id END)::int AS save_sessions
    FROM recent
  `;

  const started = summary.search_started + summary.query_retried;
  const resultsRate = started > 0 ? ((summary.results_rendered / started) * 100).toFixed(1) : "0.0";
  const repoOpenRate = started > 0 ? ((summary.repo_opened / started) * 100).toFixed(1) : "0.0";
  const saveRate = summary.results_rendered > 0
    ? ((summary.combo_saved / summary.results_rendered) * 100).toFixed(1)
    : "0.0";

  console.log(`# Event Funnel (${windowHours}h)`);
  console.log("");
  console.log(`- Search started: ${started}`);
  console.log(`- Results rendered: ${summary.results_rendered} (${resultsRate}% of searches)`);
  console.log(`- Search failed: ${summary.search_failed}`);
  console.log(`- Repo opened: ${summary.repo_opened} (${repoOpenRate}% of searches)`);
  console.log(`- Combo expanded: ${summary.combo_expanded}`);
  console.log(`- Combo saved: ${summary.combo_saved} (${saveRate}% of results)`);
  console.log("");
  console.log("## Distinct sessions");
  console.log(`- Search sessions: ${summary.search_sessions}`);
  console.log(`- Result sessions: ${summary.result_sessions}`);
  console.log(`- Repo sessions: ${summary.repo_sessions}`);
  console.log(`- Save sessions: ${summary.save_sessions}`);
} finally {
  await sql.end({ timeout: 1 });
}
