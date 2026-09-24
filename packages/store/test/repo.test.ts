import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { claimFromReceipt, commitGuess, createCase } from '@then/challenge'
import { SCENARIOS, runFromScenario } from '@then/fixtures'
import { FIXTURE_SIGNING_KEY, buildReceipt } from '@then/receipt'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FsReceiptStore, ThenRepository, locateReceipt, migrate, pgliteDb, type Db } from '../src'

let db: Db
let repo: ThenRepository

beforeAll(async () => {
  db = await pgliteDb()
  await migrate(db)
  repo = new ThenRepository(db)
})

afterAll(async () => {
  await db.close()
})

function bundle(id = 'P1') {
  return buildReceipt(runFromScenario(SCENARIOS.find((s) => s.id === id)!), {
    origin: 'fixture',
    gitSha: null,
    signer: FIXTURE_SIGNING_KEY,
  })
}

describe('migrations', () => {
  it('are idempotent', async () => {
    // #when
    await migrate(db)
    // #then
    const rows = await db.query<{ count: number }>(
      'select count(*)::int as count from then_migrations',
    )
    expect(rows[0]!.count).toBeGreaterThan(10)
  })
})

describe('receipts', () => {
  it('round-trips a public receipt unchanged', async () => {
    // #given
    const b = bundle('P1')
    await repo.putReceipt(b)
    // #when
    const stored = await repo.getPublicReceipt(b.receipt_id)
    // #then
    expect(stored).toEqual(b.public)
  })

  it('keeps the private bundle behind its own accessor', async () => {
    // #given
    const b = bundle('P2')
    await repo.putReceipt(b)
    // #when
    const stored = await repo.getPrivateBundle(b.receipt_id)
    // #then
    expect(stored?.internal.receipt_id).toBe(b.receipt_id)
  })

  it('never writes the same receipt twice', async () => {
    // #given
    const b = bundle('P3')
    await repo.putReceipt(b)
    // #when
    await repo.putReceipt(b)
    // #then
    const rows = await db.query<{ count: number }>(
      'select count(*)::int as count from receipts_public where receipt_id = $1',
      [b.receipt_id],
    )
    expect(rows[0]!.count).toBe(1)
  })

  it('rejects ids outside the receipt charset without querying', async () => {
    // #when
    const result = await repo.getPublicReceipt("rcpt_x'; drop table receipts_public; --")
    // #then
    expect(result).toBeNull()
  })
})

describe('challenge attempts', () => {
  it('keep the first committed guess even if a second insert races in', async () => {
    // #given
    const b = bundle('neither')
    await repo.putReceipt(b)
    const challenge = createCase(b.public, claimFromReceipt(b.public), {
      now: '2026-09-24T00:00:00.000Z',
    })
    await repo.putCase(challenge)
    const first = commitGuess({
      challenge,
      receipt: b.public,
      guess: 'VALID',
      session: 'ses_x',
      mode: 'archive',
      now: '2026-09-24T01:00:00.000Z',
      existing: null,
    })
    const second = commitGuess({
      challenge,
      receipt: b.public,
      guess: 'INSUFFICIENT',
      session: 'ses_x',
      mode: 'archive',
      now: '2026-09-24T01:00:01.000Z',
      existing: null,
    })
    if (!first.ok || !second.ok) throw new Error('commit failed')
    // #when
    await repo.commitAttempt(first.attempt)
    const stored = await repo.commitAttempt(second.attempt)
    // #then
    expect(stored.guess).toBe('VALID')
  })

  it('assigns a Daily only once per case', async () => {
    // #given
    const b = bundle('P4')
    await repo.putReceipt(b)
    const challenge = createCase(b.public, claimFromReceipt(b.public), {
      now: '2026-09-24T00:00:00.000Z',
    })
    await repo.putCase(challenge)
    // #when
    await repo.assignDaily(challenge.challenge_id, '2026-09-24', 1)
    await repo.assignDaily(challenge.challenge_id, '2026-09-25', 2)
    // #then
    expect((await repo.getCase(challenge.challenge_id))?.daily_key).toBe('2026-09-24')
  })
})

describe('rate limits', () => {
  it('count earlier events in the window', async () => {
    // #given
    await repo.hitRateLimit('stamp', 'ip_a', 3600)
    await repo.hitRateLimit('stamp', 'ip_a', 3600)
    // #when
    const before = await repo.hitRateLimit('stamp', 'ip_a', 3600)
    // #then
    expect(before).toBe(2)
  })
})

describe('FsReceiptStore', () => {
  it('refuses path traversal through the receipt id', async () => {
    // #given
    const store = new FsReceiptStore(await mkdtemp(join(tmpdir(), 'then-')))
    // #then
    expect(() => store.dirOf('../../etc/passwd')).toThrow()
  })

  it('detects an edited file through hashes.sha256', async () => {
    // #given
    const root = await mkdtemp(join(tmpdir(), 'then-'))
    const store = new FsReceiptStore(root)
    const b = bundle('P1')
    const dir = await store.write(b)
    await writeFile(join(dir, 'verdict.json'), '{"verdict":"VALID"}\n')
    // #when
    const mismatched = await store.checkListing(b.receipt_id)
    // #then
    expect(mismatched).toEqual(['verdict.json'])
  })
})

describe('locateReceipt', () => {
  it('looks a bare receipt id up under the given root, not the working directory', () => {
    // #given a bare id and a receipt directory
    const id = 'rcpt_abcdefghijklmnopqrst'
    // #when it is located
    const located = locateReceipt(id, 'fixtures/receipts')
    // #then the root is the one given
    expect(located).toEqual({ root: resolve('fixtures/receipts'), receiptId: id })
  })

  it('reads the root from a path inside a bundle', () => {
    // #given a path to a public receipt file
    const path = '/data/receipts/rcpt_abcdefghijklmnopqrst/public/receipt.public.json'
    // #when it is located
    const located = locateReceipt(path, 'ignored')
    // #then the bundle's parent directory is the root
    expect(located).toEqual({ root: '/data/receipts', receiptId: 'rcpt_abcdefghijklmnopqrst' })
  })

  it('returns null for anything that names no receipt', () => {
    // #then
    expect(locateReceipt('../../etc/passwd')).toBeNull()
  })
})
