#!/usr/bin/env node
import { ENDPOINTS } from '@then/nansen'
import { Command } from 'commander'
import { ablationCommand } from './commands/ablation'
import { corpusRunCommand } from './commands/corpus'
import { migrateCommand } from './commands/db'
import { fixturesCommand } from './commands/fixtures'
import { mcpCommand } from './commands/mcp'
import { reportCommand } from './commands/report'
import { restampCommand } from './commands/restamp'
import {
  publishChallengeCommand,
  publishCorpusCommand,
  publishReceiptsCommand,
} from './commands/publish'
import { stampCommand } from './commands/stamp'
import { tradePrepareCommand } from './commands/trade'
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
  .option('--chain <chain>', 'ethereum, base, solana, bnb, arbitrum, monad, robinhood')
  .option('--token <address>', 'token contract address')
  .option('--date <YYYY-MM-DD>', 'claim date (UTC)')
  .option('--claim <type>', 'SM_BOUGHT, SM_SOLD, SM_HOLDS, or SM_PERP')
  .option('--from-url <url>', 'fill missing fields from a post or page link')
  .option('--from-text <text>', 'fill missing fields from the claim text')
  .option('--published <YYYY-MM-DD>', 'publish date of the source, for "today" and "yesterday"')
  .option('--symbol <symbol>', 'token symbol for display')
  .option('--window-hours <hours>', 'claim window ending on the date, whole days up to 168')
  .option('--labels <list>', 'comma-separated Smart Money labels')
  .option('--min-usd <usd>', 'minimum threshold in USD')
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
  .command('restamp <receipt>')
  .description('Stamp the same claim again as a new receipt and write drift.json beside it')
  .option('--root <dir>', 'receipt directory for bare ids', 'receipts')
  .option('--out <dir>', 'where to write the new receipt (default: next to the original)')
  .option('--verbose', 'log every Nansen call to stderr')
  .action(run(restampCommand))

program
  .command('report <receipt>')
  .description('Write a standalone HTML page for a public receipt')
  .option('--root <dir>', 'receipt directory for bare ids', 'receipts')
  .option('--out <file>', 'output file (default: <receipt id>.html)')
  .action(run(reportCommand))

const trade = program.command('trade').description('Verdict-gated trade preparation')
trade
  .command('prepare <receipt>')
  .description('Prepare a USDC buy for a VALID receipt (paper by default)')
  .requiredOption('--wallet <address>', 'your Solana or Base wallet')
  .requiredOption('--amount <usdc>', '5 to 1,000 USDC')
  .option('--live', 'ask Nansen for an unsigned transaction instead of a paper intent')
  .option('--root <dir>', 'receipt directory for bare ids', 'receipts')
  .action(run(tradePrepareCommand))

program
  .command('fixtures')
  .description('Write synthetic, fixture-signed receipt bundles for every engine scenario')
  .option('--out <dir>', 'output directory', 'fixtures/receipts')
  .action(run(fixturesCommand))

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

const publish = program
  .command('publish')
  .description(
    'Load verified receipts into the database the web app reads (DATABASE_URL, else .then/pglite)',
  )
publish
  .command('receipts <ids...>')
  .description('Verify receipt bundles and publish them')
  .option('--root <dir>', 'receipt directory', 'receipts')
  .option('--feature <id>', 'the receipt Inspect offers as its replayed example')
  .action(run(publishReceiptsCommand))
publish
  .command('corpus')
  .description('Publish a finished corpus run: verified receipts, public rows, and the summary')
  .requiredOption('--rows <file>', 'rows.jsonl written by "then corpus run"')
  .requiredOption('--summary <file>', 'summary JSON written by --s0')
  .requiredOption('--run-id <id>', 'stable id for this run')
  .requiredOption('--label <text>', 'what the run was')
  .requiredOption('--method <version>', 'method version the run was stamped under')
  .option('--root <dir>', 'receipt directory of the run', '.then/corpus/receipts')
  .action(run(publishCorpusCommand))
publish
  .command('challenge')
  .description('Create Challenge cases from published corpus receipts, quoting each source')
  .requiredOption('--rows <file>', 'rows.jsonl of a published corpus run')
  .option('--claims <file>', 'frozen corpus claims', 'eval/corpus/claims.jsonl')
  .action(run(publishChallengeCommand))

program
  .command('db')
  .description('Manage the database the web app reads (DATABASE_URL, else .then/pglite)')
  .command('migrate')
  .description('Create or update its tables; run before deploying to Cloudflare Workers')
  .action(run(migrateCommand))

program
  .command('mcp')
  .description('Serve the verdict_smart_money_claim tool to MCP clients over stdio')
  .option('--out <dir>', 'receipt directory', 'receipts')
  .action(run(mcpCommand))

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
