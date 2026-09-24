import { evaluate, project, type SourceRecord } from '@then/engine'
import { FsReceiptStore, locateReceipt } from '@then/store'
import { CliError, EXIT } from '../config'

const ASOF_SOURCES = new Set(['asof_trades', 'asof_snapshot', 'asof_flow_summary', 'attribution'])

/**
 * Replays a stored receipt with every point-in-time source removed, offline. The sponsor claim
 * holds only if the verdict collapses to INSUFFICIENT.
 */
export async function ablationCommand(target: string, options: { root: string }): Promise<number> {
  const located = locateReceipt(target) ?? { root: options.root, receiptId: target }
  const store = new FsReceiptStore(located.root)
  const bundle = await store.readPrivate(located.receiptId).catch(() => {
    throw new CliError(`no private bundle for ${target}`, EXIT.CONFIG)
  })
  const body = bundle.internal.body
  const records: SourceRecord[] = bundle.records.map((record) =>
    ASOF_SOURCES.has(record.source)
      ? {
          source: record.source,
          status: 'disabled',
          bodies: [],
          truncated: false,
          error: {
            kind: 'disabled',
            code: 'SPONSOR_HISTORICAL_DISABLED',
            message: 'point-in-time surfaces are disabled',
          },
        }
      : record,
  )
  const result = evaluate({
    claim: body.claim,
    window: body.window,
    settlement: body.settlement,
    ablation: true,
    surface_available: body.surface_available,
    ...(body.unavailable_reason ? { unavailable_reason: body.unavailable_reason } : {}),
    calibration_window: body.calibration_window,
    projections: project(records, {
      window: body.window,
      chain: body.claim.chain,
      token_address: body.claim.token_address,
    }),
  })
  process.stdout.write(
    [
      `receipt ${located.receiptId}`,
      `  original verdict      ${body.verdict}`,
      `  without historical    ${result.verdict} (${result.reasons[0]})`,
      `  today's labels alone  support ${result.live.support}, not a verdict`,
      result.verdict === 'INSUFFICIENT'
        ? '  ablation holds: THEN cannot stamp VALID or CONTAMINATED without Nansen point-in-time data'
        : '  ABLATION FAILED: a verdict survived without point-in-time data',
      '',
    ].join('\n'),
  )
  return result.verdict === 'INSUFFICIENT' ? EXIT.ABLATION : EXIT.VERIFY_MISMATCH
}
