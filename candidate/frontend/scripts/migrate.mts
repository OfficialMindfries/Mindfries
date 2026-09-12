// Applies supabase/migrations/*.sql to a Postgres database, in filename order.
// Ported from internal-admin/frontend/scripts/migrate.mts, verbatim except
// the path in the missing-DATABASE_URL message — this and the admin app
// share one Supabase project, so schema_migrations is the same shared
// bookkeeping table either script reads: running this here will correctly
// see 0001–0004 as already applied and only touch 0005_candidate_users.sql.
//
//   npx --yes tsx scripts/migrate.mts --dry-run    # say what would run
//   npx --yes tsx scripts/migrate.mts              # apply pending migrations
//   npx --yes tsx scripts/migrate.mts --seed       # ...then supabase/seeds/*.sql
//
// Needs DATABASE_URL: a direct Postgres connection string. The Supabase
// service-role key is NOT enough — it authenticates to PostgREST, which only
// reads and writes rows in tables that already exist. Creating tables is DDL,
// and DDL needs the database itself.
//
//   Supabase dashboard → Project Settings → Database → Connection string → URI
//
// Each file runs inside its own transaction, so a file that fails leaves no
// half-applied schema behind. Applied filenames are recorded in
// schema_migrations, so running this twice is a no-op rather than a second
// attempt — which matters for the seeds, where re-running is not free.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const MIGRATIONS = path.join(REPO, "supabase/migrations");
const SEEDS = path.join(REPO, "supabase/seeds");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const withSeeds = args.has("--seed");

// .env is read by hand: this is a plain Node script, not a Next process.
function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const p = path.join(HERE, "..", file);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const value = m[2].trim().replace(/^["'](.*)["']$/, "$1");
      if (value && !process.env[m[1]]) process.env[m[1]] = value;
    }
  }
}

/** Hide the password before anything reaches a log. */
function safeUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "<unparseable DATABASE_URL>";
  }
}

const sqlFiles = (dir: string) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".sql")).sort() : [];

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      [
        "DATABASE_URL is not set.",
        "",
        "The service-role key can't create tables — it only talks to PostgREST,",
        "which reads and writes rows in tables that already exist. Creating them",
        "is DDL, which needs a direct Postgres connection.",
        "",
        "  Supabase dashboard → Project Settings → Database → Connection string → URI",
        "",
        "Add it to candidate/frontend/.env.local (gitignored):",
        "",
        "  DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres",
        "",
        "Use the Session pooler URI if your network blocks direct IPv6.",
      ].join("\n"),
    );
    process.exit(1);
  }

  const pending = sqlFiles(MIGRATIONS);
  if (pending.length === 0) {
    console.error(`No .sql files in ${MIGRATIONS}`);
    process.exit(1);
  }

  const client = new Client({
    connectionString: url,
    // Supabase terminates TLS with a cert this client doesn't have a root for.
    // The connection is still encrypted; it just isn't verified.
    ssl: { rejectUnauthorized: false },
  });

  console.log(`→ ${safeUrl(url)}`);
  await client.connect();

  try {
    await client.query(`
      create table if not exists schema_migrations (
        filename    text primary key,
        applied_at  timestamptz not null default now()
      )
    `);
    const { rows } = await client.query<{ filename: string }>("select filename from schema_migrations");
    const done = new Set(rows.map((r) => r.filename));

    const todo = [
      ...pending.filter((f) => !done.has(f)).map((f) => ({ dir: MIGRATIONS, file: f, label: f })),
      ...(withSeeds
        ? sqlFiles(SEEDS).filter((f) => !done.has(`seeds/${f}`)).map((f) => ({ dir: SEEDS, file: f, label: `seeds/${f}` }))
        : []),
    ];

    for (const f of pending.filter((f) => done.has(f))) console.log(`  = ${f} (already applied)`);
    if (todo.length === 0) {
      console.log("\nNothing to do — the database is up to date.");
      return;
    }

    console.log(`\n${dryRun ? "Would apply" : "Applying"} ${todo.length} file(s):`);
    for (const { label } of todo) console.log(`  + ${label}`);
    if (dryRun) return;

    for (const { dir, file, label } of todo) {
      const sql = readFileSync(path.join(dir, file), "utf8");
      process.stdout.write(`\n  ${label} ... `);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (filename) values ($1)", [label]);
        await client.query("commit");
        console.log("ok");
      } catch (e) {
        await client.query("rollback");
        console.log("FAILED (rolled back)");
        throw e;
      }
    }

    // Say what actually exists now, rather than claiming success.
    const { rows: tables } = await client.query<{ table_name: string; n: string }>(`
      select c.relname as table_name, coalesce(s.n_live_tup, 0)::text as n
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
      left join pg_stat_user_tables s on s.relid = c.oid
      where ns.nspname = 'public' and c.relkind = 'r'
      order by c.relname
    `);
    console.log("\nTables in public:");
    for (const t of tables) console.log(`  ${t.table_name.padEnd(24)} ~${t.n} rows`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
