import { verifyPublic } from '@then/receipt'
import { FsReceiptStore, locateReceipt } from '@then/store'
import { checkRequest, livePrepare, paperIntent, tradeGate } from '@then/trade'
import { CliError, EXIT, nansenClient, trustedKeys } from '../config'

const REFUSALS: Record<string, string> = {
  VERDICT_NOT_VALID:
    'Only a VALID stamp can prepare a trade. CONTAMINATED and INSUFFICIENT claims are refused.',
  FIXTURE_RECEIPT: 'Fixture receipts never prepare trades.',
  RECEIPT_UNVERIFIED: 'The receipt did not pass public verification.',
  UNSUPPORTED_TRADE_CHAIN: 'Nansen Trading supports Solana and Base only.',
  SELL_CLAIM: 'A sell claim does not prepare a buy.',
}

/**
 * Prepares a USDC buy behind the verdict gate. Paper mode (default) prints a hashed intent. With
 * --live, Nansen returns an unsigned transaction for your wallet; THEN never signs or sends it.
 */
export async function tradePrepareCommand(
  target: string,
  flags: { root: string; wallet: string; amount: string; live?: boolean },
): Promise<number> {
  const located = locateReceipt(target, flags.root)
  if (!located)
    throw new CliError(`not a receipt id or a path inside a receipt bundle: ${target}`, EXIT.CONFIG)
  const receipt = await new FsReceiptStore(located.root).readPublic(located.receiptId)
  const gate = tradeGate(receipt, verifyPublic(receipt, { trustedKeys: await trustedKeys() }).ok)
  if (!gate.ok) throw new CliError(REFUSALS[gate.refusal] ?? gate.refusal, EXIT.INSUFFICIENT)
  const checked = checkRequest(gate.chain, {
    wallet_address: flags.wallet,
    amount_usdc: Number(flags.amount),
  })
  if (!checked.ok)
    throw new CliError(
      checked.error === 'INVALID_WALLET'
        ? `not a ${gate.chain} wallet address`
        : 'amount must be 5 to 1,000 USDC',
      EXIT.CONFIG,
    )
  if (!flags.live) {
    process.stdout.write(
      `${JSON.stringify(paperIntent(receipt, gate.chain, checked.wallet, Number(flags.amount)), null, 2)}\n`,
    )
    process.stderr.write(
      'paper mode: nothing was sent. Add --live to get an unsigned transaction.\n',
    )
    return EXIT.OK
  }
  const prepared = await livePrepare(
    nansenClient(),
    receipt,
    gate.chain,
    checked.wallet,
    checked.amount_base_units,
  )
  if (!prepared.ok)
    throw new CliError(`Nansen could not prepare this swap: ${prepared.error}`, EXIT.CONFIG)
  process.stdout.write(`${JSON.stringify(prepared, null, 2)}\n`)
  process.stderr.write(
    'unsigned: sign and send it from your own wallet. THEN does not broadcast.\n',
  )
  return EXIT.OK
}
