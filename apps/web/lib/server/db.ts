import 'server-only'
import { ThenRepository, migrate, pgliteDb, postgresDb, type Db } from '@then/store'
import { env } from './env'
import { currentRequestScope } from './request-scope'

interface DbState {
  db: Promise<Db>
}

const globalForDb = globalThis as typeof globalThis & { __thenDb?: DbState }

/** Cloudflare Workers report this user agent; Node reports its own version. */
const onWorkers = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers'

/**
 * Node (local and container hosting): one database per process, migrated on first use. Hosted
 * uses Postgres from DATABASE_URL; local uses embedded Postgres under .then/pglite, which only one
 * process may open, so the dev server and the CLI take turns.
 */
function openShared(): Promise<Db> {
  return (async () => {
    const db = env.databaseUrl ? await postgresDb(env.databaseUrl) : await pgliteDb(env.pgliteDir)
    await migrate(db)
    return db
  })()
}

/**
 * Cloudflare Workers: a socket cannot outlive the request that opened it, so each request opens
 * one connection on first use and everything in that request shares it. Workers never run
 * migrations; the CLI applies them (`then publish`, `then db migrate`) before a deploy.
 */
function openForRequest(): Promise<Db> {
  const scope = currentRequestScope()
  if (!scope) throw new Error('No request scope: the Worker entry must wrap every request')
  if (!env.databaseUrl) throw new Error('DATABASE_URL is required on Cloudflare Workers')
  scope.db ??= postgresDb(env.databaseUrl, { max: 1 })
  return scope.db
}

export async function getDb(): Promise<Db> {
  if (onWorkers) return openForRequest()
  globalForDb.__thenDb ??= { db: openShared() }
  return globalForDb.__thenDb.db
}

export async function getRepo(): Promise<ThenRepository> {
  return new ThenRepository(await getDb())
}
