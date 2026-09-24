# Architecture

THEN has one path from a claim to a verdict, and every surface uses it: the web app, the CLI, corpus runs, and the MCP tool.

```text
claim ──► stamp orchestrator ──► Nansen adapters ──► raw responses
                 │                                        │
                 ▼                                        ▼
          engine (pure) ◄──────── projections ◄───────────┘
                 │
                 ▼
     verdict rule (decide) ──► receipt: public layer + private bundle, signed
```

## Packages

| Package | Role |
|---|---|
| `packages/core` | Claim model and parsing, chains, dates and settlement, the verdict rule (`decide`), reason codes, canonical JSON and hashing, receipt schemas. No I/O. |
| `packages/nansen` | Typed Nansen adapters: request and response schemas, timeouts, retries on 429 and 5xx only, credit accounting from response headers, raw payload capture, schema drift reporting, and the switch that fails every point-in-time endpoint closed. |
| `packages/stamp` | The orchestrator. Plans which endpoints a claim needs, runs them under a 45-second deadline with a 3 × 1,000-row cap per source, asks for the historical attribution lookup only when a verdict depends on it, and returns the run. |
| `packages/engine` | Pure evaluation: projections of raw pages, thresholds per method version, support per side, attribution and calibration, the decision inputs. No network, no clock. |
| `packages/engine-reference` | An independent implementation of the support rules, used in tests to cross-check the engine on every scenario. |
| `packages/receipt` | Builds, signs (ed25519), and verifies receipts. Public verification needs no private data; full verification recomputes the verdict from stored payloads. Also restamp drift and the redistribution scan. |
| `packages/store` | One SQL schema for embedded Postgres (PGlite, local) and Postgres (hosted), plus the on-disk receipt bundle format. |
| `packages/corpus` | Frozen corpus loading, the corpus runner with a credit reserve, forward returns (evaluation only), and summaries. |
| `packages/challenge` | Challenge cases built from published receipts: commitment, integrity binding, Daily selection, one immutable guess per player, stats, spoiler-safe share lines. |
| `packages/intake` | Proposes claim fields from a post link or pasted text. Advisory only. |
| `packages/trade` | The verdict gate and USDC trade preparation (paper intent or unsigned Nansen transaction). |
| `packages/mcp` | The `verdict_smart_money_claim` tool definition. |
| `packages/ui` | Design tokens and brand marks. |
| `packages/fixtures` | Synthetic scenarios for every verdict rule. |
| `apps/cli` | The `then` command. |
| `apps/web` | The Next.js app: pages, API routes, receipts, Challenge, MCP endpoint. |

## Nansen endpoints

Credit costs are as reported by Nansen for the plan THEN was built on.

| Source | Endpoint | Side | Credits |
|---|---|---|---|
| Buy and sell claims, today's labels | `POST /api/v1/tgm/dex-trades` with `include_smart_money_labels` | today | 1 |
| Buy and sell claims, as of the date | `POST /api/v1beta1/tgm/historical-dex-trades` with labels as of each trade | as of | 5 |
| Holdings claims, as of the date | `POST /api/v1/smart-money/historical-holdings` (daily snapshots) | as of | 1 |
| Holdings claims, today's labels | `POST /api/v1/tgm/flows` for the Smart Money segment | today | 1 |
| Price and volume | `POST /api/v1/tgm/token-ohlcv` | both | 1 |
| Attribution lookup (possible CONTAMINATED only) | `POST /api/v1beta1/tgm/historical-dex-trades` for one wallet | as of | 5 |
| Optional corroboration | `POST /api/v1beta1/tgm/historical-token-flow-summary` | as of | 5 |
| Token search | `POST /api/v1/search/general` | none | 0 |
| Account and credits | `GET /api/v1/account` | none | 0 |
| Trade preparation | `GET /api/v1/trade/quote`, `POST /api/v1/trade/prepare` | none | 0 |

THEN never calls the trade execute endpoint. Point-in-time endpoints are listed as `asof` in `packages/nansen/src/endpoints.ts`; `THEN_DISABLE_HISTORICAL=1` makes every one of them fail closed without a network call.

## Receipts

A stamp produces a bundle:

```text
receipts/<receipt_id>/
  public/receipt.public.json     shareable
  public/claim.json
  public/commitment.json
  private/receipt.internal.json  never published
  private/records.json           raw pages per source
  private/payloads.json          every raw response, including failures
  hashes.sha256                  sha256sum-compatible listing
  verdict.json
```

- The receipt id is derived from the claim hash, the stamp time, and the hash of the private body, so it commits to all three.
- The public receipt carries the decision inputs, so anyone can recompute the verdict rule from it, plus the hash of every stored response and the root of those hashes.
- The public receipt is signed with the deployment's or the CLI's ed25519 key. Keys are published at `/.well-known/then-receipt-keys`. The fixture key is public on purpose and verifiers always report it as synthetic.
- A receipt records its method version and is always verified under that version.

## Web app

- Pages render per request so each one carries a fresh CSP nonce. The browser can connect only to its own origin.
- `POST /api/stamp` validates the claim and applies the ten-minute reuse window, the per-client hourly limit, and the credit floor. An accepted stamp runs inside that request and streams one JSON line per event: accepted with the job id, each stage as it resolves, then the receipt or the failure. If the stream drops, the browser polls `/api/stamp/:job/status`. It never computes a verdict.
- Stored receipts are served as replays (`X-THEN-MODE: replay`). Only a stamp made in the current session is shown as LIVE STAMP.
- The Challenge sends the claim and a commitment before a guess, and the verdict and receipt only in the response to the player's own committed guess.
- `/api/mcp` is a stateless Streamable HTTP MCP endpoint that awaits the stamp in the request.
- Operator routes under `/api/internal` (private evidence, ablation, Daily assignment) are off unless enabled and then need a bearer token.

## Hosting

The web app builds two ways from the same source.

| Build | Command | Runs on | Database |
|---|---|---|---|
| Next.js standalone server | `pnpm build` | any Node host (`Dockerfile`) | one pool per process, migrated on first use |
| Cloudflare Worker (vinext) | `pnpm --filter @then/web build:cf` | Cloudflare Workers (the public deployment) | one connection per request, migrated by `then db migrate` |

On Workers, `apps/web/cloudflare/worker.ts` wraps vinext's handler. Each request runs in its own AsyncLocalStorage scope; the first query opens a Postgres connection there, and the entry closes it once the response body has been sent and every `waitUntil` task (the `after()` work, a stamp whose visitor left) has settled. The Worker is placed next to the database (`placement.region`), since a page makes several round trips to Postgres and only one to the visitor. The embedded store is swapped for a stub in this build, the build never reads `.env`, and Google fonts are downloaded at build time and served from the app's origin.

## Determinism

The engine is a pure function of the stored responses and the method version. The same bundle always gives the same verdict, which is what `then verify` checks. `then fixtures` regenerates the committed fixture bundles byte for byte, and CI fails if they drift.
