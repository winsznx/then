/**
 * One SQL dialect everywhere: embedded Postgres (PGlite) for local runs and tests, Postgres when
 * hosted. Callers see a two-method interface and never a driver.
 */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<T[]>
  /** Runs `fn` in one transaction; rolls back if it throws. */
  transaction<T>(fn: (db: Db) => Promise<T>): Promise<T>
  close(): Promise<void>
}

export async function pgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite')
  const client = dataDir ? await PGlite.create(dataDir) : await PGlite.create()
  const wrap = (runner: { query: typeof client.query }): Db => ({
    async query<T>(text: string, params: readonly unknown[] = []) {
      const result = await runner.query<T>(text, params as unknown[])
      return result.rows
    },
    async transaction<T>(fn: (db: Db) => Promise<T>) {
      return client.transaction((tx) => fn(wrap(tx)))
    },
    close: () => client.close(),
  })
  return wrap(client)
}

export async function postgresDb(url: string): Promise<Db> {
  const { default: postgres } = await import('postgres')
  const sql = postgres(url, { max: 5, idle_timeout: 20, connect_timeout: 10, prepare: false })
  type Runner = { unsafe: (text: string, params?: never[]) => Promise<unknown> }
  const wrap = (runner: Runner, root: boolean): Db => ({
    async query<T>(text: string, params: readonly unknown[] = []) {
      return (await runner.unsafe(text, params as never[])) as T[]
    },
    async transaction<T>(fn: (db: Db) => Promise<T>) {
      if (!root) return fn(wrap(runner, false))
      return (await sql.begin((tx) => fn(wrap(tx as unknown as Runner, false)))) as T
    },
    close: () => sql.end({ timeout: 5 }),
  })
  return wrap(sql as unknown as Runner, true)
}

const MIGRATIONS: string[] = [
  `create table if not exists receipts_public (
    receipt_id text primary key,
    claim_hash text not null,
    verdict text not null,
    origin text not null,
    method_version text not null,
    chain text not null,
    claim_type text not null,
    token_address text not null,
    token_symbol text,
    as_of_date date not null,
    generated_at timestamptz not null,
    public_json jsonb not null,
    featured boolean not null default false,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists receipts_public_claim on receipts_public (claim_hash, generated_at desc)`,
  `create table if not exists receipts_private (
    receipt_id text primary key references receipts_public (receipt_id),
    bundle_json jsonb not null,
    credits_used integer not null,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists stamp_jobs (
    job_id text primary key,
    claim_hash text not null,
    status text not null,
    stages jsonb not null,
    receipt_id text,
    error text,
    client_key text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists challenge_cases (
    challenge_id text primary key,
    receipt_id text not null references receipts_public (receipt_id),
    claim_json jsonb not null,
    available_from timestamptz not null,
    daily_key date unique,
    daily_number integer unique,
    commitment text not null,
    salt text not null,
    integrity_hash text not null,
    created_at timestamptz not null
  )`,
  `create table if not exists challenge_attempts (
    attempt_id text primary key,
    challenge_id text not null references challenge_cases (challenge_id),
    session_id text not null,
    mode text not null,
    daily_key date,
    guess text not null,
    actual_verdict text not null,
    correct boolean not null,
    committed_at timestamptz not null,
    unique (challenge_id, session_id)
  )`,
  `create table if not exists challenge_shares (
    share_id text primary key,
    daily_number integer,
    correct boolean not null,
    streak integer not null,
    week_correct integer not null,
    week_played integer not null,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists corpus_runs (
    run_id text primary key,
    method_version text not null,
    label text not null,
    summary_json jsonb not null,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists corpus_rows (
    run_id text not null references corpus_runs (run_id),
    claim_id text not null,
    position integer not null,
    row_json jsonb not null,
    receipt_id text,
    primary key (run_id, claim_id)
  )`,
  `create table if not exists rate_limit_events (
    bucket text not null,
    key_hash text not null,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists rate_limit_lookup on rate_limit_events (bucket, key_hash, created_at)`,
  `create table if not exists analytics_events (
    id bigserial primary key,
    name text not null,
    session_id text,
    props jsonb not null,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists restamps (
    restamp_receipt_id text primary key references receipts_public (receipt_id),
    original_receipt_id text not null references receipts_public (receipt_id),
    drift_json jsonb not null,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists trade_intents (
    intent_id text primary key,
    receipt_id text not null references receipts_public (receipt_id),
    mode text not null,
    payload_hash text not null,
    request_json jsonb not null,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists method_versions (
    version text primary key,
    published_at date not null,
    summary text not null
  )`,
]

export async function migrate(db: Db): Promise<void> {
  await db.query(
    `create table if not exists then_migrations (id integer primary key, applied_at timestamptz not null default now())`,
  )
  const applied = new Set(
    (await db.query<{ id: number }>('select id from then_migrations')).map((row) => Number(row.id)),
  )
  for (const [index, statement] of MIGRATIONS.entries()) {
    if (applied.has(index)) continue
    await db.transaction(async (tx) => {
      await tx.query(statement)
      await tx.query('insert into then_migrations (id) values ($1)', [index])
    })
  }
}
