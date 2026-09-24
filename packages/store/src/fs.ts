import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { isReceiptId, sha256Hex, type InternalReceipt, type PublicReceipt } from '@then/core'
import type { PrivateBundle, ReceiptBundle } from '@then/receipt'

/**
 * Portable receipt bundle on disk:
 *
 *   <root>/<receipt_id>/
 *     public/receipt.public.json   shareable
 *     public/claim.json
 *     public/commitment.json
 *     private/receipt.internal.json  never published
 *     private/records.json           raw page bodies per source
 *     private/payloads.json          every raw response, including failures
 *     hashes.sha256                  sha256sum-compatible listing of every file above
 *     verdict.json                   verdict + id only
 */
export class FsReceiptStore {
  readonly root: string

  constructor(root: string) {
    this.root = resolve(root)
  }

  /** Receipt ids are validated before they touch a path; anything else is rejected. */
  dirOf(receiptId: string): string {
    if (!isReceiptId(receiptId))
      throw new Error(`invalid receipt id: ${JSON.stringify(receiptId).slice(0, 40)}`)
    const dir = resolve(this.root, receiptId)
    if (!dir.startsWith(this.root + sep)) throw new Error('receipt path escapes the store root')
    return dir
  }

  async write(bundle: ReceiptBundle): Promise<string> {
    const dir = this.dirOf(bundle.receipt_id)
    const files: Record<string, string> = {
      'public/receipt.public.json': json(bundle.public),
      'public/claim.json': json(bundle.public.claim),
      'public/commitment.json': json({
        receipt_id: bundle.receipt_id,
        ...bundle.public.commitments,
        signature: bundle.public.signature ?? null,
      }),
      'private/receipt.internal.json': json(bundle.internal),
      'private/records.json': json(bundle.records),
      'private/payloads.json': json(bundle.payloads),
      'verdict.json': json({
        receipt_id: bundle.receipt_id,
        verdict: bundle.public.verdict,
        origin: bundle.public.origin,
      }),
    }
    const staging = `${dir}.partial-${process.pid}`
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(staging, path)), { recursive: true })
      await writeFile(join(staging, path), content)
    }
    const listing = Object.entries(files)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, content]) => `${sha256Hex(content)}  ${path}`)
      .join('\n')
    await writeFile(join(staging, 'hashes.sha256'), `${listing}\n`)
    await mkdir(this.root, { recursive: true })
    await rename(staging, dir)
    return dir
  }

  async readPublic(receiptId: string): Promise<PublicReceipt> {
    return JSON.parse(
      await readFile(join(this.dirOf(receiptId), 'public/receipt.public.json'), 'utf8'),
    ) as PublicReceipt
  }

  async readPrivate(receiptId: string): Promise<PrivateBundle> {
    const dir = this.dirOf(receiptId)
    return {
      internal: JSON.parse(
        await readFile(join(dir, 'private/receipt.internal.json'), 'utf8'),
      ) as InternalReceipt,
      records: JSON.parse(
        await readFile(join(dir, 'private/records.json'), 'utf8'),
      ) as PrivateBundle['records'],
      payloads: JSON.parse(
        await readFile(join(dir, 'private/payloads.json'), 'utf8'),
      ) as PrivateBundle['payloads'],
    }
  }

  /** Recomputes hashes.sha256; returns the files whose content no longer matches. */
  async checkListing(receiptId: string): Promise<string[]> {
    const dir = this.dirOf(receiptId)
    const listing = await readFile(join(dir, 'hashes.sha256'), 'utf8')
    const mismatched: string[] = []
    for (const line of listing.split('\n').filter(Boolean)) {
      const [hash, path] = line.split(/ {2}/)
      if (!hash || !path || path.includes('..')) {
        mismatched.push(line)
        continue
      }
      const content = await readFile(join(dir, path), 'utf8').catch(() => null)
      if (content === null || sha256Hex(content) !== hash) mismatched.push(path)
    }
    return mismatched
  }

  async list(): Promise<string[]> {
    const entries = await readdir(this.root, { withFileTypes: true }).catch(() => [])
    return entries
      .filter((entry) => entry.isDirectory() && isReceiptId(entry.name))
      .map((entry) => entry.name)
      .sort()
  }
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/** Accepts a receipt id or a path inside a bundle (…/rcpt_x/public/receipt.public.json). */
export function locateReceipt(input: string): { root: string; receiptId: string } | null {
  const absolute = resolve(input)
  const parts = absolute.split(sep)
  const index = parts.findIndex((part) => isReceiptId(part))
  if (index === -1)
    return isReceiptId(input) ? { root: resolve('receipts'), receiptId: input } : null
  return { root: parts.slice(0, index).join(sep) || sep, receiptId: parts[index]! }
}
