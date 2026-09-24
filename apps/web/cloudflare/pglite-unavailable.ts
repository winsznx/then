/**
 * Stands in for @electric-sql/pglite in the Cloudflare build. The embedded store needs a
 * filesystem; on Workers the database is always DATABASE_URL.
 */
export class PGlite {
  static create(): never {
    throw new Error('The embedded store is not available on Cloudflare Workers; set DATABASE_URL.')
  }
}
