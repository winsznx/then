import 'server-only'
import { ThenRepository, migrate, pgliteDb, postgresDb, type Db } from '@then/store'
import { env } from './env'

interface DbState {
  db: Promise<Db>
}

const globalForDb = globalThis as typeof globalThis & { __thenDb?: DbState }

/**
 * One database per process. Hosted: Postgres from DATABASE_URL. Local: embedded Postgres under
 * .then/pglite, which only one process may open, so the dev server and the CLI take turns.
 */
function open(): Promise<Db> {
  return (async () => {
    const db = env.databaseUrl ? await postgresDb(env.databaseUrl) : await pgliteDb(env.pgliteDir)
    await migrate(db)
    return db
  })()
}

export async function getDb(): Promise<Db> {
  if (!globalForDb.__thenDb) globalForDb.__thenDb = { db: open() }
  return globalForDb.__thenDb.db
}

export async function getRepo(): Promise<ThenRepository> {
  return new ThenRepository(await getDb())
}
