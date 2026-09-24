#!/usr/bin/env node
import { ENDPOINTS } from '@then/nansen'
import { Command } from 'commander'
import { ablationCommand } from './commands/ablation'
import { corpusRunCommand } from './commands/corpus'
import { stampCommand } from './commands/stamp'
import { verifyCommand, verifyPublicCommand } from './commands/verify'
import { CliError, EXIT, loadDotEnv, localSigningKey, nansenClient } from './config'

loadDotEnv()

const program = new Command()
  .name('then')
  .description('Was this Smart Money then? Stamp and verify dated Smart Money claims.')
  .showHelpAfterError()

function run<Args extends unknown[]>(action: (...args: Args) => Promise<number>) {
  return async (...args: Args): Promise<void> => {
    try {
      process.exitCode = await action(...args)
    } catch (error) {
      if (error instanceof CliError) {
        process.stderr.write(`${error.message}\n`)
        process.exitCode = error.exitCode
        return
      }
      process.stderr.write(
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      )
      process.exitCode = 1
    }
  }
}

program
  .command('stamp')
  .description('Stamp one claim: VALID, CONTAMINATED, or INSUFFICIENT, with a receipt')
  .requiredOption('--chain <chain>', 'ethereum, base, solana, bnb, arbitrum, monad, robinhood')
  .requiredOption('--token <address>', 'token contract address')
  .requiredOption('--date <YYYY-MM-DD>', 'claim date (UTC)')
  .requiredOption('--claim <type>', 'SM_BOUGHT, SM_SOLD, SM_HOLDS, or SM_PERP')
  .option('--symbol <symbol>', 'token symbol for display')
  .option('--window-hours <hours>', 'claim window ending on the date, whole days up to 168')
  .option('--labels <list>', 'comma-separated Smart Money labels')
  .option('--min-usd <usd>', 'minimum threshold in USD', '1000')
  .option('--source-url <url>', 'where the claim was published')
  .option('--source-text <text>', 'the claim text')
  .option('--corroborate', 'also read the Smart Trader flow summary (5 credits)')
  .option('--out <dir>', 'receipt directory', 'receipts')
  .option('--json', 'print the public receipt as JSON')
  .option('--verbose', 'log every Nansen call to stderr')
  .action(run(stampCommand))

program
  .command('verify-public <receipt>')
  .description(
    'Check a public receipt: hashes, id, verdict rule, signature. No private data needed.',
  )
  .option('--root <dir>', 'receipt directory for bare ids', 'receipts')
  .option('--allow-unsigned', 'accept receipts without a signature')
  .option(
    '--keys <url-or-file>',
    "also trust a deployment's published keys (/.well-known/then-receipt-keys)",
  )
  .action(run(verifyPublicCommand))

program
  .command('verify <receipt>')
  .description('Recompute the verdict offline from a private evidence bundle')
  .option('--root <dir>', 'receipt directory for bare ids', 'receipts')
  .action(run(verifyCommand))

program
  .command('ablation <receipt>')
  .description('Replay a receipt with point-in-time Nansen data removed (offline)')
  .option('--root <dir>', 'receipt directory for bare ids', 'receipts')
  .action(run(ablationCommand))

const corpus = program.command('corpus').description('Frozen public-claim corpus')
corpus
  .command('run')
  .description('Stamp the frozen corpus in file order, within a credit budget')
  .option('--claims <file>', 'claims file', 'eval/corpus/claims.jsonl')
  .option('--out <dir>', 'output directory (private: holds raw payloads)', '.then/corpus')
  .option('--limit <n>', 'only the first n claims')
  .option('--reserve <credits>', 'credits to leave untouched', '5')
  .option('--s0 <file>', 'also write the S0 summary to this file')
  .option('--corroborate', 'also read the Smart Trader flow summary (5 credits per trade claim)')
  .option('--verbose', 'log every Nansen call to stderr')
  .action(run(corpusRunCommand))

program
  .command('account')
  .description('Show the Nansen plan and remaining credits (free call)')
  .action(
    run(async () => {
      const result = await nansenClient().call(ENDPOINTS.account, undefined)
      if (!result.ok)
        throw new CliError(`account check failed: ${result.error.message}`, EXIT.CONFIG)
      process.stdout.write(
        `plan ${result.data.plan}, ${result.data.credits_remaining} credits remaining\n`,
      )
      return EXIT.OK
    }),
  )

program
  .command('keys')
  .description('Show the key this machine signs receipts with')
  .action(
    run(async () => {
      const key = await localSigningKey()
      process.stdout.write(`${key.role} key ${key.key_id}\npublic ${key.public_key_hex}\n`)
      return EXIT.OK
    }),
  )

await program.parseAsync(process.argv)
