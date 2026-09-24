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

const onWorkers = typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers'

/**
 * The client address as the host reports it. On Cloudflare, CF-Connecting-IP is set by the edge
 * and cannot come from the client. Elsewhere, X-Real-IP or the last X-Forwarded-For hop, which is
 * the one the nearest proxy appended; the first hop is whatever the client sent.
 */
function clientAddress(h: Headers): string {
  if (onWorkers) return h.get('cf-connecting-ip') ?? 'unknown'
  const forwarded = h
    .get('x-forwarded-for')
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  return h.get('x-real-ip') ?? forwarded?.at(-1) ?? 'local'
}

/** A keyed hash of the client address for rate limits: the address itself is never stored. */
export async function clientKey(): Promise<string> {
  const address = clientAddress(await headers())
  return createHmac('sha256', sessionSecret()).update(`ip:${address}`).digest('hex').slice(0, 32)
}
