import type { z } from 'zod'
import type { CallOptions, NansenClient } from './client'
import type { EndpointSpec } from './endpoints'
import type { NansenError } from './errors'

export type PagedResult<Row> =
  | { ok: true; rows: Row[]; pages: number; truncated: boolean; drift: string[] }
  | { ok: false; error: NansenError; rows: Row[]; pages: number }

interface Paged<Row> {
  data: Row[]
  pagination: { is_last_page: boolean }
}

/**
 * Fetches pages until `is_last_page` or `maxPages`. Hitting the cap is reported as truncation,
 * never hidden.
 */
export async function collectPages<S extends z.ZodType<Paged<Row>>, Row>(
  client: NansenClient,
  spec: EndpointSpec<S>,
  requestForPage: (page: number) => object,
  maxPages: number,
  options: CallOptions = {},
): Promise<PagedResult<Row>> {
  const rows: Row[] = []
  const drift = new Set<string>()
  for (let page = 1; page <= maxPages; page++) {
    const result = await client.call(spec, requestForPage(page), options)
    if (!result.ok) return { ok: false, error: result.error, rows, pages: page - 1 }
    const data = result.data as Paged<Row>
    rows.push(...data.data)
    for (const field of result.drift) drift.add(field)
    if (data.pagination.is_last_page || data.data.length === 0) {
      return { ok: true, rows, pages: page, truncated: false, drift: [...drift] }
    }
  }
  return { ok: true, rows, pages: maxPages, truncated: true, drift: [...drift] }
}
