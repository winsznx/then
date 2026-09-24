import type { z } from 'zod'

function shapeKeys(schema: z.ZodType): Set<string> | null {
  const def = (
    schema as { def?: { type?: string; shape?: Record<string, unknown>; innerType?: z.ZodType } }
  ).def
  if (!def) return null
  if (def.type === 'object' && def.shape) return new Set(Object.keys(def.shape))
  if ((def.type === 'optional' || def.type === 'nullable') && def.innerType)
    return shapeKeys(def.innerType)
  return null
}

function elementSchema(schema: z.ZodType, key: string): z.ZodType | null {
  const def = (schema as { def?: { shape?: Record<string, z.ZodType> } }).def
  let field = def?.shape?.[key]
  while (field) {
    const fieldDef = (
      field as { def?: { type?: string; innerType?: z.ZodType; element?: z.ZodType } }
    ).def
    if (fieldDef?.type === 'array' && fieldDef.element) return fieldDef.element
    field = fieldDef?.innerType
  }
  return null
}

/**
 * Fields present in a response but absent from the schema, at the top level and in the first
 * row. Beta endpoints change; unknown fields are reported, never silently used.
 */
export function unexpectedFields(schema: z.ZodType, raw: unknown, rowsKey?: string): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  const out: string[] = []
  const known = shapeKeys(schema)
  if (known) for (const key of Object.keys(raw)) if (!known.has(key)) out.push(key)
  if (rowsKey) {
    const rows = (raw as Record<string, unknown>)[rowsKey]
    const element = elementSchema(schema, rowsKey)
    const rowKnown = element ? shapeKeys(element) : null
    if (Array.isArray(rows) && rows[0] && typeof rows[0] === 'object' && rowKnown) {
      for (const key of Object.keys(rows[0] as object))
        if (!rowKnown.has(key)) out.push(`${rowsKey}[].${key}`)
    }
  }
  return out.sort()
}
