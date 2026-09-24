import { sha256 } from '@noble/hashes/sha2.js'
import { randomBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { canonicalize } from './canonical'

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567'

/** RFC 4648 base32, lowercase, unpadded. The alphabet stays inside [a-z0-9]. */
export function base32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31]
  return out
}

const RECEIPT_ID_LENGTH = 20
export const RECEIPT_ID_PATTERN = /^rcpt_[a-z2-7]{20}$/
export const CHALLENGE_ID_PATTERN = /^ch_[a-z2-7]{16}$/
export const SHARE_ID_PATTERN = /^sh_[a-z2-7]{16}$/

export interface ReceiptIdInputs {
  claim_hash: string
  generated_at: string
  internal_commitment: string
}

/** Receipt ids commit to the claim, the stamp time, and the private evidence. */
export function deriveReceiptId(inputs: ReceiptIdInputs): string {
  const digest = sha256(utf8ToBytes(canonicalize(inputs)))
  return `rcpt_${base32(digest).slice(0, RECEIPT_ID_LENGTH)}`
}

/** Receipt ids reach file paths and URLs; nothing else may pass. */
export function isReceiptId(value: unknown): value is string {
  return typeof value === 'string' && RECEIPT_ID_PATTERN.test(value)
}

export function randomId(prefix: 'ch' | 'sh' | 'int' | 'job' | 'ses' | 'att'): string {
  return `${prefix}_${base32(randomBytes(10)).slice(0, 16)}`
}
