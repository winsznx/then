# Security

## Reporting

Report a vulnerability privately through GitHub's security advisories for this repository. Please do not open a public issue for it.

## What THEN protects, and how

Each claim below is enforced in code and checked by a test. `apps/web/e2e` runs against the production build; the rest are unit tests under `packages/*/test` and `apps/cli/test`.

| Claim | Control | Test |
|---|---|---|
| The Nansen API key never reaches the browser. | The key is read only by server modules; no `NEXT_PUBLIC_` variables exist. | `e2e/security.spec.ts`: a sentinel key appears in no page and no script the pages load. |
| The browser cannot call Nansen or anything else off-site. | Per-request CSP nonce, `script-src 'self' 'nonce-…' 'strict-dynamic'`, `connect-src 'self'`, `frame-ancestors 'none'`. | `e2e/security.spec.ts`: CSP header checked; every request in the main flows stays on the origin. |
| The key is never logged. | The adapter never hands headers to the logger and sends the key only in the `apikey` header. | `packages/nansen/test/client.test.ts`: "never logs the key", "sends the key only in the apikey header". |
| Private evidence is not public. | Public receipts are a separate projection; the private bundle has its own accessor; the operator route is off by default and needs a bearer token. | `e2e/security.spec.ts`: 401 without the token; no private wallet appears in the public receipt. `packages/receipt/test`: redistribution scan, smuggled private field rejected. `packages/mcp/test`: scan on the MCP answer. |
| Receipt ids cannot reach the filesystem or the database unchecked. | Ids must match `rcpt_[a-z2-7]{20}` before any path or query; the store also refuses paths that escape its root. | `packages/store/test`: path traversal refused. `e2e/security.spec.ts`: traversing ids are plain 404s. |
| A tampered receipt does not verify. | Receipt id derived from claim, time, and private body; hashes of every stored response; ed25519 signature over the public receipt. | `packages/receipt/test`: edited verdict, edited inputs, re-signed with an untrusted key, edited date, fixture posing as live, unsigned, swapped raw response, edited summary. |
| A fixture cannot pass as real. | The fixture signing key is public and always reported as synthetic; fixtures cannot sign live receipts; fixtures never prepare trades or answer the Challenge. | `packages/receipt/test`, `packages/challenge/test`, `apps/cli/test`. |
| Without point-in-time data there is no VALID or CONTAMINATED. | Every `asof` adapter fails closed under `THEN_DISABLE_HISTORICAL=1` without a network call; the verdict rule checks ablation first. | `packages/nansen/test`, `packages/engine/test` (every scenario), `e2e/security.spec.ts` (operator ablation route), `scripts/verify-fixtures.mjs` (exit code 5). |
| The verdict engine has no network. | The engine and verifier import no HTTP client and evaluate with `fetch` removed. | `packages/engine/test`: "engine purity"; `packages/receipt/test`: "verifier independence". |
| A replay never passes as live. | Stored receipts are served with `X-THEN-MODE: replay` and labeled REPLAY; only a stamp made in the current session shows LIVE STAMP. | `e2e/security.spec.ts`. |
| The current day is never stamped as if settled. | The date picker stops at the last settled day; the verdict rule returns DATE_NOT_SETTLED for an unsettled date. | `packages/engine/test` (P5). |
| The hosted key cannot be drained by one visitor. | Per-client hourly stamp limit, a ten-minute reuse window for the same claim, and a credit floor below which stamping pauses. The client is the address the host vouches for (Cloudflare's `cf-connecting-ip` on Workers, else `x-real-ip` or the last `X-Forwarded-For` hop), so a visitor cannot pick a new one per request. Addresses are stored only as keyed hashes. | `e2e/security.spec.ts`: a stamp over the limit is refused before Nansen is called. `packages/store/test`: rate-limit counting. |
| A Challenge answer cannot be seen early or changed. | The pre-guess payload has only the claim and a hash commitment; one guess per player and case, enforced by a unique index. | `e2e/challenge.spec.ts`, `packages/store/test`: a racing second insert keeps the first guess. |
| THEN never moves funds. | Trade preparation is gated on a verified VALID receipt; paper by default; live mode returns an unsigned transaction and there is no code path to Nansen's execute endpoint. | `packages/trade/test`. |

## Secrets and configuration

- `.env`, `.then/` (local keys and database), and `receipts/` (real receipts with private payloads) are git-ignored and excluded from Docker images. The Cloudflare build never reads `.env`; the Worker gets its secrets from Cloudflare. Only synthetic, fixture-signed bundles under `fixtures/receipts` are committed.
- In production the app does not generate secrets. Without `THEN_RECEIPT_SIGNING_KEY` it refuses to stamp; without `THEN_SESSION_SECRET` it refuses Challenge answers.
- The Challenge session is an anonymous random id in an HttpOnly, SameSite=Lax cookie, signed with HMAC. There are no accounts and no personal data.
- Analytics are first-party events with an allow-listed name and property set; free text is dropped on the server.

## Out of scope

THEN relies on Nansen for the correctness of labels and historical data. A receipt proves what Nansen returned when it was stamped and that the verdict follows from it; it cannot prove Nansen's data was right.
