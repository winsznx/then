'use client'

import { SOURCE_CLASSES, type SourceClass } from '@then/core'
import { useEffect, useState } from 'react'
import { formatDay } from '@/lib/format'
import type { StageStatus } from './temporal-comparator'

const STAGE_LABEL: Record<SourceClass, string> = {
  historical_cohort: 'Historical cohort',
  dated_activity: 'Dated token activity',
  current_label_replay: 'Current-label replay',
}

function stageDetail(stage: SourceClass, date: string): string {
  switch (stage) {
    case 'historical_cohort':
      return `Smart Money as Nansen recognized it on ${formatDay(date)}`
    case 'dated_activity':
      return 'Price and volume for the window, one reference for both sides'
    case 'current_label_replay':
      return "Today's labels applied to the same dated activity"
  }
}

const STATUS_TEXT: Record<StageStatus, string> = {
  waiting: 'Waiting',
  running: 'Reconstructing',
  done: 'Reconstructed',
  failed: 'Unavailable',
  disabled: 'Switched off',
  skipped: 'Not needed',
}

function useElapsedSeconds(startedAt: number): number {
  const [now, setNow] = useState(startedAt)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return Math.max(0, Math.floor((now - startedAt) / 1000))
}

/**
 * The three reconstructions a stamp runs, with the status each one reported. There is no verdict
 * here and no number: those exist only after the engine has both sides.
 */
export function ReconstructionProgress({
  date,
  stages,
  startedAt,
}: {
  date: string
  stages: Partial<Record<SourceClass, StageStatus>>
  startedAt: number
}) {
  const elapsed = useElapsedSeconds(startedAt)
  return (
    <section
      aria-label="Reconstruction progress"
      className="rounded-lg border border-rule bg-workspace px-5 py-4 md:px-8"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="t-ui font-medium text-ink">Stamping</h2>
        <p className="t-meta" aria-hidden="true">
          {elapsed}s
        </p>
      </div>
      <ol className="mt-3 grid gap-3 md:grid-cols-3 md:gap-6">
        {SOURCE_CLASSES.map((stage) => {
          const status = stages[stage] ?? 'waiting'
          const active = status === 'running'
          return (
            <li key={stage} className="flex gap-3 border-t border-rule pt-3">
              <span
                aria-hidden="true"
                className={`mt-[7px] h-[2px] w-4 shrink-0 ${stage === 'historical_cohort' ? 'bg-time' : 'bg-ink'} ${active ? 'animate-pending' : status === 'waiting' ? 'opacity-30' : ''}`}
              />
              <div className="min-w-0">
                <p className="t-ui text-ink">
                  {STAGE_LABEL[stage]} <span className="text-meta">· {STATUS_TEXT[status]}</span>
                </p>
                <p className="t-ui text-ink-soft">{stageDetail(stage, date)}</p>
              </div>
            </li>
          )
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        {SOURCE_CLASSES.map(
          (stage) => `${STAGE_LABEL[stage]}: ${STATUS_TEXT[stages[stage] ?? 'waiting']}.`,
        ).join(' ')}
      </p>
    </section>
  )
}
