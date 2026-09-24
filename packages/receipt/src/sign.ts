import { ed25519 } from '@noble/curves/ed25519.js'
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { sha256Hex } from '@then/core'

export type KeyRole = 'hosted' | 'local' | 'fixture'

export interface SigningKey {
  key_id: string
  role: KeyRole
  secret: Uint8Array
  public_key_hex: string
}

export interface TrustedKey {
  key_id: string
  role: KeyRole
  public_key_hex: string
}

export function keyIdOf(publicKeyHex: string): string {
  return `then-${sha256Hex(hexToBytes(publicKeyHex)).slice(0, 16)}`
}

export function signingKeyFromSeed(seedHex: string, role: KeyRole): SigningKey {
  const secret = hexToBytes(seedHex.trim())
  if (secret.length !== 32) throw new Error('signing key seed must be 32 bytes of hex')
  const publicKeyHex = bytesToHex(ed25519.getPublicKey(secret))
  return { key_id: keyIdOf(publicKeyHex), role, secret, public_key_hex: publicKeyHex }
}

export function generateSigningKey(role: KeyRole): SigningKey {
  return signingKeyFromSeed(bytesToHex(ed25519.utils.randomSecretKey()), role)
}

export function trustedKeyOf(key: SigningKey): TrustedKey {
  return { key_id: key.key_id, role: key.role, public_key_hex: key.public_key_hex }
}

/**
 * Signs FIXTURE receipts only. The seed is public on purpose: anyone can mint a fixture receipt,
 * which is why verifiers report the fixture role and never treat it as a live stamp.
 */
export const FIXTURE_SIGNING_KEY: SigningKey = signingKeyFromSeed(
  sha256Hex('then fixture signing key v1 — synthetic receipts only'),
  'fixture',
)

export function signHash(publicHash: string, key: SigningKey): string {
  return bytesToHex(ed25519.sign(utf8ToBytes(publicHash), key.secret))
}

export function verifyHash(
  publicHash: string,
  signatureHex: string,
  publicKeyHex: string,
): boolean {
  try {
    return ed25519.verify(
      hexToBytes(signatureHex),
      utf8ToBytes(publicHash),
      hexToBytes(publicKeyHex),
    )
  } catch {
    return false
  }
}
