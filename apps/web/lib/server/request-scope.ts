import { AsyncLocalStorage } from 'node:async_hooks'
import type { Db } from '@then/store'

/** Per-request resources on hosts where nothing may outlive the request (Cloudflare Workers). */
export interface RequestScope {
  db?: Promise<Db>
}

const storage = new AsyncLocalStorage<RequestScope>()

export function runInRequestScope<T>(scope: RequestScope, fn: () => T): T {
  return storage.run(scope, fn)
}

export function currentRequestScope(): RequestScope | undefined {
  return storage.getStore()
}

/** Closes what the request opened. A later use in the same request opens a fresh connection. */
export async function releaseRequestScope(scope: RequestScope): Promise<void> {
  const db = scope.db
  scope.db = undefined
  if (db) await (await db).close()
}
