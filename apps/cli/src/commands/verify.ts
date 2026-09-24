import { readFile } from 'node:fs/promises'
import { isReceiptId } from '@then/core'
import { verifyFull, verifyPublic } from '@then/receipt'
import { FsReceiptStore, locateReceipt } from '@then/store'
import { CliError, EXIT, trustedKeys } from '../config'
import { verifyReportText } from '../print'

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new CliError(
      `cannot read ${path}: ${error instanceof Error ? error.message : 'unreadable'}`,
      EXIT.CONFIG,
    )
  }
}

/** Public integrity only: works on a downloaded receipt.public.json with no private data. */
export async function verifyPublicCommand(
  target: string,
  options: { root: string; allowUnsigned?: boolean },
): Promise<number> {
  const receipt = isReceiptId(target)
    ? await new FsReceiptStore(options.root).readPublic(target)
    : await readJson(target)
  const report = verifyPublic(receipt, {
    trustedKeys: await trustedKeys(),
    requireSignature: !options.allowUnsigned,
  })
  process.stdout.write(`${verifyReportText('verify-public', report)}\n`)
  return report.ok ? EXIT.OK : EXIT.VERIFY_MISMATCH
}

/** Full offline recomputation from an authorized private bundle. Never calls Nansen. */
export async function verifyCommand(target: string, options: { root: string }): Promise<number> {
  const located =
    locateReceipt(target) ??
    (isReceiptId(target) ? { root: options.root, receiptId: target } : null)
  if (!located)
    throw new CliError(`not a receipt id or a path inside a receipt bundle: ${target}`, EXIT.CONFIG)
  const store = new FsReceiptStore(located.root)
  const bundle = await store.readPrivate(located.receiptId)
  const publicReceipt = await store.readPublic(located.receiptId)
  const listing = await store.checkListing(located.receiptId)
  const report = verifyFull(bundle, publicReceipt)
  const publicReport = verifyPublic(publicReceipt, { trustedKeys: await trustedKeys() })
  const checks = [
    {
      name: 'bundle_file_listing',
      ok: listing.length === 0,
      ...(listing.length ? { detail: listing.join(', ') } : {}),
    },
    ...report.checks,
    ...publicReport.checks.map((check) => ({ ...check, name: `public.${check.name}` })),
  ]
  const ok = checks.every((check) => check.ok)
  process.stdout.write(
    `${verifyReportText('verify', { ok, checks, signer: publicReport.signer })}\n`,
  )
  return ok ? EXIT.OK : EXIT.VERIFY_MISMATCH
}
