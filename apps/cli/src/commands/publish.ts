import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { claimFromReceipt, createCase } from '@then/challenge'
import { isReceiptId, type PublicReceipt } from '@then/core'
import { parseCorpus, publicCorpusRow, type CorpusRow } from '@then/corpus'
import { verifyFull, verifyPublic, type ReceiptBundle } from '@then/receipt'
import { FsReceiptStore, ThenRepository, migrate, pgliteDb, postgresDb, type Db } from '@then/store'
import { CliError, EXIT, trustedKeys } from '../config'

/**
 * The database the web app reads: DATABASE_URL when set (hosted), otherwise the embedded store
 * under .then/pglite that `pnpm dev` uses. The embedded store allows one process at a time, so
 * stop the dev server before publishing.
 */
async function openDb(): Promise<Db> {
  const url = process.env.DATABASE_URL?.trim()
  const db = url
    ? await postgresDb(url)
    : await pgliteDb(resolve(process.env.THEN_PGLITE_DIR ?? '.then/pglite'))
  await migrate(db)
  return db
}

async function withRepo<T>(fn: (repo: ThenRepository) => Promise<T>): Promise<T> {
  const db = await openDb()
  try {
    return await fn(new ThenRepository(db))
  } finally {
    await db.close()
  }
}

async function readJsonLines<T>(path: string): Promise<T[]> {
  const text = await readFile(path, 'utf8').catch(() => {
    throw new CliError(`cannot read ${path}`, EXIT.CONFIG)
  })
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T)
}

/**
 * Loads one bundle from disk and refuses it unless the private recomputation and the public
 * checks both pass here. Nothing unverified reaches the hosted database.
 */
async function verifiedBundle(store: FsReceiptStore, receiptId: string): Promise<ReceiptBundle> {
  const [publicReceipt, privateBundle] = await Promise.all([
    store.readPublic(receiptId),
    store.readPrivate(receiptId),
  ])
  const full = verifyFull(privateBundle, publicReceipt)
  const pub = verifyPublic(publicReceipt, { trustedKeys: await trustedKeys() })
  const failed = [...full.checks, ...pub.checks]
    .filter((check) => !check.ok)
    .map((check) => check.name)
  if (failed.length > 0)
    throw new CliError(
      `${receiptId} failed verification (${failed.join(', ')}); not published`,
      EXIT.VERIFY_MISMATCH,
    )
  return {
    receipt_id: receiptId,
    public: publicReceipt,
    internal: privateBundle.internal,
    records: privateBundle.records,
    payloads: privateBundle.payloads,
  }
}

export async function publishReceiptsCommand(
  ids: string[],
  flags: { root: string; feature?: string },
): Promise<number> {
  const store = new FsReceiptStore(flags.root)
  const bad = ids.filter((id) => !isReceiptId(id))
  if (bad.length > 0) throw new CliError(`not receipt ids: ${bad.join(', ')}`, EXIT.CONFIG)
  const bundles: ReceiptBundle[] = []
  for (const id of ids) bundles.push(await verifiedBundle(store, id))
  await withRepo(async (repo) => {
    for (const bundle of bundles) await repo.putReceipt(bundle)
    if (flags.feature) {
      if (!ids.includes(flags.feature) && !(await repo.getPublicReceipt(flags.feature)))
        throw new CliError(`cannot feature ${flags.feature}: not published`, EXIT.CONFIG)
      await repo.setFeatured(flags.feature)
    }
  })
  process.stdout.write(
    `published ${bundles.length} receipt${bundles.length === 1 ? '' : 's'}${flags.feature ? `, featured ${flags.feature}` : ''}\n`,
  )
  return EXIT.OK
}

/**
 * Publishes a finished corpus run: every stamped receipt (verified first), the public rows, and
 * the aggregate summary. Smart Money values in the private rows never reach the database.
 */
export async function publishCorpusCommand(flags: {
  rows: string
  summary: string
  root: string
  runId: string
  label: string
  method: string
}): Promise<number> {
  const rows = await readJsonLines<CorpusRow & { receipt_id?: string }>(flags.rows)
  const summaryFile = JSON.parse(await readFile(flags.summary, 'utf8')) as { summary?: unknown }
  if (!summaryFile.summary)
    throw new CliError(`${flags.summary} has no "summary" object`, EXIT.CONFIG)
  const store = new FsReceiptStore(flags.root)
  const bundles: ReceiptBundle[] = []
  for (const row of rows)
    if (row.status === 'stamped' && row.receipt_id)
      bundles.push(await verifiedBundle(store, row.receipt_id))
  await withRepo(async (repo) => {
    for (const bundle of bundles) await repo.putReceipt(bundle)
    await repo.putCorpusRun(
      {
        run_id: flags.runId,
        method_version: flags.method,
        label: flags.label,
        summary: summaryFile.summary,
      },
      rows.map((row) => ({
        claim_id: row.claim_id,
        row: publicCorpusRow(row),
        receipt_id: row.receipt_id ?? null,
      })),
    )
  })
  process.stdout.write(
    `published corpus run ${flags.runId}: ${rows.length} rows, ${bundles.length} receipts\n`,
  )
  return EXIT.OK
}

/**
 * Turns published corpus receipts into Challenge cases, quoting each claim from its source. A
 * receipt already backing a case is skipped, so running this twice creates no duplicates.
 */
export async function publishChallengeCommand(flags: {
  rows: string
  claims: string
}): Promise<number> {
  const rows = await readJsonLines<CorpusRow & { receipt_id?: string }>(flags.rows)
  const { claims, invalid } = parseCorpus(await readFile(flags.claims, 'utf8'))
  if (invalid.length > 0)
    throw new CliError(
      `claims file has invalid lines: ${invalid.map((i) => i.line).join(', ')}`,
      EXIT.CONFIG,
    )
  const byId = new Map(claims.map((claim) => [claim.claim_id, claim]))
  const keys = await trustedKeys()
  const created = await withRepo(async (repo) => {
    const existing = new Set((await repo.listCases()).map((challenge) => challenge.receipt_id))
    let count = 0
    for (const row of rows) {
      if (row.status !== 'stamped' || !row.receipt_id || existing.has(row.receipt_id)) continue
      const receipt: PublicReceipt | null = await repo.getPublicReceipt(row.receipt_id)
      if (!receipt)
        throw new CliError(
          `${row.receipt_id} is not published; run "then publish corpus" first`,
          EXIT.CONFIG,
        )
      if (!verifyPublic(receipt, { trustedKeys: keys }).ok)
        throw new CliError(`${row.receipt_id} failed public verification`, EXIT.VERIFY_MISMATCH)
      const source = byId.get(row.claim_id)
      const claim = claimFromReceipt(receipt, {
        quote: source?.quote ?? null,
        author: source?.source_author ?? null,
      })
      await repo.putCase(createCase(receipt, claim, { now: new Date().toISOString() }))
      count += 1
    }
    return count
  })
  process.stdout.write(`created ${created} challenge case${created === 1 ? '' : 's'}\n`)
  return EXIT.OK
}
