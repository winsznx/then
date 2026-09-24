import 'server-only'
import type { PublicCorpusRow, S0Summary } from '@then/corpus'
import { getRepo } from './db'

export interface CorpusRunView {
  run_id: string
  label: string
  method_version: string
  created_at: string
  /** Aggregate counts only; per-claim Smart Money values never leave the private bundle. */
  summary: S0Summary
  rows: PublicCorpusRow[]
}

export interface CorpusView {
  runs: CorpusRunView[]
}

/** Measured corpus runs as stored by the operator's publish step. Nothing here is computed on read. */
export async function loadCorpusView(): Promise<CorpusView> {
  const repo = await getRepo()
  const runs = await repo.corpusRuns()
  const views: CorpusRunView[] = []
  for (const run of runs) {
    const rows = await repo.corpusRows(run.run_id)
    views.push({
      run_id: run.run_id,
      label: run.label,
      method_version: run.method_version,
      created_at: run.created_at,
      summary: run.summary as S0Summary,
      rows: rows.map((entry) => entry.row as PublicCorpusRow),
    })
  }
  return { runs: views }
}
