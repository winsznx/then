import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { randomId } from '@then/core'
import { cookies, headers } from 'next/headers'
import { env } from './env'

const COOKIE = 'then_sid'
const ONE_YEAR = 60 * 60 * 24 * 365

export class SessionUnavailable extends Error {
  constructor() {
    super('THEN_SESSION_SECRET is not configured')
  }
}

function sessionSecret(): string {
  if (!env.sessionSecret) throw new SessionUnavailable()
  return env.sessionSecret
}

function sign(value: string): string {
  return createHmac('sha256', sessionSecret()).update(value).digest('base64url')
}

function verify(token: string): string | null {
  const [id, mac] = token.split('.')
  if (!id || !mac || !/^ses_[a-z2-7]{16}$/.test(id)) return null
  const expected = Buffer.from(sign(id))
  const given = Buffer.from(mac)
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null
}

/** Existing anonymous session id, or null. Never creates one (safe in server components). */
export async function readSession(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value
  return token ? verify(token) : null
}

/**
 * The anonymous player id: a random id with an HMAC, in an HttpOnly cookie. No account, no
 * personal data. Creates the cookie on first use (route handlers only).
 */
export async function ensureSession(): Promise<string> {
  const existing = await readSession()
  if (existing) return existing
  const id = randomId('ses')
  ;(await cookies()).set(COOKIE, `${id}.${sign(id)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    path: '/',
    maxAge: ONE_YEAR,
  })
  return id
}

/** A keyed hash of the client address for rate limits: the address itself is never stored. */
export async function clientKey(): Promise<string> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim()
  const address = forwarded || h.get('x-real-ip') || 'local'
  return createHmac('sha256', sessionSecret()).update(`ip:${address}`).digest('hex').slice(0, 32)
}
