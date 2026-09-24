import { createServer } from 'node:http'
import { SCENARIOS } from '@then/fixtures'
import { MOCK_NANSEN_PORT } from './constants'

/**
 * A stand-in for the Nansen API during e2e runs, so a full stamp can run without spending
 * credits. Every trade, price, and holdings request gets the synthetic P2 scenario's pages
 * (a healthy control), whatever the claim; the account reports ample credits.
 */
const P2 = SCENARIOS.find((scenario) => scenario.id === 'P2')!
const body = (source: string) =>
  P2.records.find((record) => record.source === source)?.bodies[0] ?? '{"data":[]}'

const ROUTES: Record<string, string> = {
  '/api/v1/tgm/dex-trades': body('live_trades'),
  '/api/v1beta1/tgm/historical-dex-trades': body('asof_trades'),
  '/api/v1/tgm/token-ohlcv': body('price'),
  '/api/v1/account': JSON.stringify({ user_id: 'e2e', plan: 'e2e', credits_remaining: 100_000 }),
}

createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://mock').pathname
  request.resume()
  request.on('end', () => {
    const payload = ROUTES[path]
    response.writeHead(payload ? 200 : 404, {
      'content-type': 'application/json',
      'x-nansen-credits-used': '0',
    })
    response.end(payload ?? JSON.stringify({ error: `no mock for ${path}` }))
  })
}).listen(MOCK_NANSEN_PORT, '127.0.0.1', () => {
  process.stdout.write(`mock nansen on ${MOCK_NANSEN_PORT}\n`)
})
