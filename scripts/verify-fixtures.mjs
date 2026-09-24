#!/usr/bin/env node
// Verifies every committed fixture receipt with the built CLI: full offline recomputation, public
// verification, and, for VALID and CONTAMINATED receipts, that removing point-in-time data drops
// the verdict to INSUFFICIENT (exit code 5). Runs with no network in the clean-room container.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.argv[2] ?? 'fixtures/receipts')
const cli = resolve('apps/cli/dist/then.mjs')
const index = JSON.parse(readFileSync(resolve(root, 'index.json'), 'utf8'))

function then(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
  return { code: result.status, out: `${result.stdout}${result.stderr}` }
}

const failures = []
for (const { scenario, receipt_id, verdict } of index) {
  const full = then(['verify', receipt_id, '--root', root])
  if (full.code !== 0) failures.push(`${scenario} ${receipt_id}: verify failed\n${full.out}`)
  const publicCheck = then(['verify-public', resolve(root, receipt_id, 'public/receipt.public.json')])
  if (publicCheck.code !== 0) failures.push(`${scenario} ${receipt_id}: verify-public failed\n${publicCheck.out}`)
  if (verdict !== 'INSUFFICIENT') {
    const ablation = then(['ablation', receipt_id, '--root', root])
    if (ablation.code !== 5) failures.push(`${scenario} ${receipt_id}: ablation exited ${ablation.code}, expected 5\n${ablation.out}`)
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n\n')}\n`)
  process.exit(1)
}
process.stdout.write(`verified ${index.length} fixture receipts offline; ablation held on every VALID and CONTAMINATED one\n`)
