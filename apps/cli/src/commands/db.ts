import { resolve } from 'node:path'
import { migrate, pgliteDb, postgresDb, type Db } from '@then/store'
import { EXIT } from '../config'

/**
 * The database the web app reads: DATABASE_URL when set (hosted), otherwise the embedded store
 * under .then/pglite that `pnpm dev` uses. The embedded store allows one process at a time, so
 * stop the dev server first.
 */
export async function connectDb(): Promise<Db> {
  const url = process.env.DATABASE_URL?.trim()
  return url
    ? await postgresDb(url)
    : await pgliteDb(resolve(process.env.THEN_PGLITE_DIR ?? '.then/pglite'))
}

/**
 * Creates or updates the tables. Hosts that open a connection per request (Cloudflare Workers)
 * never migrate on their own, so a deployment runs this first.
 */
export async function migrateCommand(): Promise<number> {
  const db = await connectDb()
  try {
    const ran = await migrate(db)
    process.stdout.write(
      ran === 0 ? 'database is up to date\n' : `applied ${ran} migration${ran === 1 ? '' : 's'}\n`,
    )
    return EXIT.OK
  } finally {
    await db.close()
  }
}
