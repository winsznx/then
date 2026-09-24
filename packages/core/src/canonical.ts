import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

/**
 * RFC 8785 style canonical JSON: object keys sorted by UTF-16 code units, no whitespace,
 * ECMAScript number formatting. `undefined` members are dropped, like JSON.stringify.
 */
export function canonicalize(value: unknown): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false'
    case 'number':
      if (!Number.isFinite(value))
        throw new TypeError(`cannot canonicalize non-finite number ${value}`)
      return JSON.stringify(value)
    case 'string':
      return JSON.stringify(value)
    case 'object': {
      if (Array.isArray(value))
        return `[${value.map((item) => canonicalize(item ?? null)).join(',')}]`
      const record = value as Record<string, unknown>
      const members = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      return `{${members.join(',')}}`
    }
    default:
      throw new TypeError(`cannot canonicalize ${typeof value}`)
  }
}

export function sha256Hex(input: string | Uint8Array): string {
  return bytesToHex(sha256(typeof input === 'string' ? utf8ToBytes(input) : input))
}

/** `sha256:<hex>` over the canonical form. */
export function hashCanonical(value: unknown): string {
  return `sha256:${sha256Hex(canonicalize(value))}`
}

export function hashBytes(input: string | Uint8Array): string {
  return `sha256:${sha256Hex(input)}`
}

/** Order-independent commitment over a set of `sha256:` hashes. */
export function hashSet(hashes: readonly string[]): string {
  return hashCanonical([...new Set(hashes)].sort())
}
