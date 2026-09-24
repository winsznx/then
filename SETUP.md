# Setup

Everything runs from the repository root. Requirements: Node 24 and pnpm 11 (`corepack enable` or `npm i -g pnpm@11`).

```bash
pnpm install
cp .env.example .env
```

## Configuration

`.env` at the repository root is read by both the CLI and the web app. Values already in the environment take precedence over the file.

| Variable | Used by | What it does |
|---|---|---|
| `NANSEN_API_KEY` | CLI, web | Needed to stamp. Server-side only. |
| `DATABASE_URL` | web, `then publish` | Postgres for a hosted deployment. Empty means the embedded store in `.then/pglite`. |
| `THEN_PGLITE_DIR` | web, `then publish` | Location of the embedded store (default `.then/pglite`). |
| `THEN_RECEIPT_SIGNING_KEY` | web, CLI | 32-byte hex seed for the ed25519 signing key. Required in production. |
| `THEN_SESSION_SECRET` | web | 32-byte hex secret for the anonymous Challenge session cookie. Required in production. |
| `THEN_TRUSTED_RECEIPT_KEYS` | web, CLI | Extra trusted public keys, `role:hex` separated by commas. Roles: `hosted`, `local`, `fixture`. |
| `THEN_PUBLIC_BASE_URL` | web | Public URL used in links, share cards, and the sitemap. |
| `THEN_STAMP_LIMIT_PER_HOUR` | web | Stamps per visitor per hour (default 10). |
| `THEN_TRADE_MODE` | web | `paper` (default) or `live`. |
| `THEN_ENABLE_INTERNAL_ROUTES`, `THEN_ADMIN_TOKEN` | web | Operator routes under `/api/internal`; both must be set. |
| `THEN_PUBLIC_MEMBERSHIP_DETAIL` | web | Wallet-level detail on public pages. Keep `0` unless Nansen has approved it in writing. |
| `THEN_DISABLE_HISTORICAL` | web, CLI | `1` switches off every point-in-time endpoint (the ablation check). |
| `THEN_GITHUB_URL` | web | Repository link shown on the site. |
| `THEN_RECEIPT_KEY_ROLE` | CLI | Role of `THEN_RECEIPT_SIGNING_KEY` for CLI stamps: `local` (default) or `hosted`. |
| `THEN_ENV_FILE` | web | Path of the env file to read, or `none` to read no file. |

In development the web app creates its signing key and session secret under `.then/keys` on first use. The CLI creates its own signing key at `.then/keys/local-signing-key.hex`. `.then/` is git-ignored.

## The CLI

```bash
pnpm then <command> --help
```

| Command | What it does |
|---|---|
| `stamp --chain --token --date --claim` | Stamps one claim and writes the receipt to `receipts/`. Exit code 0 for VALID or CONTAMINATED, 2 for INSUFFICIENT, 5 when point-in-time data is switched off. |
| `stamp --from-url <link>` or `--from-text <text>` | Fills fields you leave out from a post, printing the words each came from. A token named only by symbol is refused; pass `--token`. |
| `verify <receipt>` | Recomputes the verdict from the private bundle with no network. Exit 3 on any mismatch. |
| `verify-public <file or id>` | Checks a public receipt: schema, hashes, receipt id, verdict rule, signature. `--keys <url or file>` trusts a deployment's published keys. |
| `ablation <receipt>` | Replays a stored receipt with point-in-time data removed. Exits 5 when the verdict falls to INSUFFICIENT, as it must. |
| `restamp <receipt>` | Stamps the same claim again as a new receipt and writes `drift.json` beside it. The original is never written. |
| `report <receipt> --out file.html` | Writes a self-contained HTML page from the public receipt. |
| `trade prepare <receipt> --wallet --amount` | Prepares a USDC buy for a verified VALID receipt: a paper intent by default, an unsigned transaction with `--live`. |
| `corpus run` | Stamps the frozen corpus in file order with a credit reserve, reusing claims already stamped. |
| `publish receipts <ids...>`, `publish corpus`, `publish challenge` | Loads verified receipts, corpus runs, and Challenge cases into the web app's database. |
| `db migrate` | Creates or updates the tables in the web app's database. Run it before the first deploy to Cloudflare Workers, which never create tables. |
| `fixtures` | Rewrites `fixtures/receipts`: one synthetic, fixture-signed bundle per engine scenario. Deterministic. |
| `mcp` | Serves the `verdict_smart_money_claim` tool over stdio. |
| `account` | Shows the Nansen plan and remaining credits (free call). |
| `keys` | Prints this machine's signing key id and public key. |

Receipt arguments accept a bare id (looked up under `--root`, default `receipts`) or any path inside a receipt directory.

## The web app

```bash
pnpm dev          # http://localhost:3000
```

Locally the app uses the embedded store in `.then/pglite`. Only one process can open it at a time, so stop `pnpm dev` before running `then publish` against it.

To show receipts stamped with the CLI:

```bash
pnpm then keys                                   # copy the public key
echo "THEN_TRUSTED_RECEIPT_KEYS=local:<public key>" >> .env
pnpm then publish receipts <receipt id> --feature <receipt id>
pnpm dev
```

`--feature` picks the receipt that Inspect offers as its replayed example and the landing page shows.

A finished corpus run is published with its rows and summary, and its receipts become Challenge cases:

```bash
pnpm then publish corpus --rows <dir>/rows.jsonl --summary <dir>/summary.json \
  --root <dir>/receipts --run-id <id> --label "<what the run was>" --method 2026-09-24.2
pnpm then publish challenge --rows <dir>/rows.jsonl
```

Every bundle is recomputed and publicly verified before it is published; anything that fails is refused.

## Hosting

The public deployment, https://then.timjosh507.workers.dev, runs on Cloudflare Workers with Postgres on Supabase. The same app also builds as a container image for any Node host.

### Cloudflare Workers

`pnpm --filter @then/web build:cf` builds the app with [vinext](https://github.com/cloudflare/vinext), a Vite implementation of the Next.js API, into a Worker. `deploy:cf` builds and deploys it with wrangler. Settings live in `apps/web/wrangler.jsonc`, and neither command reads `.env`.

A Worker cannot keep a database socket between requests, so each request opens one Postgres connection and closes it once the response and its background work are done. Put a pooler in front of Postgres: on Supabase, the transaction pooler (port 6543) for the Worker and the session pooler (port 5432) for the CLI. The Worker never creates tables, so do that and load the data from your machine first:

```bash
export DATABASE_URL='postgres://<user>:<password>@<pooler host>:5432/postgres'
pnpm then db migrate
pnpm then publish corpus ...     # and publish challenge / publish receipts, as above
```

Secrets go in a JSON file kept outside the repository:

```json
{
  "NANSEN_API_KEY": "...",
  "DATABASE_URL": "postgres://<user>:<password>@<pooler host>:6543/postgres",
  "THEN_RECEIPT_SIGNING_KEY": "<openssl rand -hex 32>",
  "THEN_SESSION_SECRET": "<openssl rand -hex 32>"
}
```

```bash
cd apps/web
pnpm deploy:cf --secrets-file ~/then-worker-secrets.json --var THEN_GIT_SHA:$(git rev-parse HEAD)
```

- Settings that are not secret, including `THEN_PUBLIC_BASE_URL` and `THEN_TRUSTED_RECEIPT_KEYS`, are `vars` in `wrangler.jsonc`.
- `placement.region` runs the Worker next to the database. A page makes several round trips to Postgres and one to the visitor. Without the hint the Worker ran in the visitor's nearest data center: from Cape Town to a database in Ireland the landing page took over 5 seconds, and about 1 second with it. Set it to your database's region, or use `{ "mode": "smart" }`.
- Cloudflare never shows a secret again once it is set, so keep a copy of the signing key. If it is ever replaced, add the old public key to `THEN_TRUSTED_RECEIPT_KEYS` as `hosted:<hex>` so the receipts it signed still verify.
- A stamp runs inside the request that starts it and streams its progress, so the end of a response does not cut it short. If the visitor leaves, Workers let it run for 30 more seconds.
- `pnpm --filter @then/web preview:cf` runs the built Worker locally in workerd. Pass settings with `--env-file`, using an absolute path: wrangler resolves a relative one against `dist/server`.

### Container

The repository's `Dockerfile` builds the web app as a Next.js standalone server. It reads all configuration from the environment and no `.env` file.

```bash
docker build -t then-web .
docker run -p 3000:3000 \
  -e NANSEN_API_KEY=... -e DATABASE_URL=postgres://... \
  -e THEN_RECEIPT_SIGNING_KEY=$(openssl rand -hex 32) -e THEN_SESSION_SECRET=$(openssl rand -hex 32) \
  -e THEN_PUBLIC_BASE_URL=https://your-domain \
  then-web
```

The container keeps one database pool per process and creates the schema on first start.

In production the app refuses to stamp without `THEN_RECEIPT_SIGNING_KEY` and refuses Challenge answers without `THEN_SESSION_SECRET`; it never invents either. Publish receipts to the hosted database by running `then publish` with `DATABASE_URL` set, and add the CLI key to `THEN_TRUSTED_RECEIPT_KEYS` so they verify.

## MCP

Stdio, with your own key (receipts are written locally):

```json
{
  "mcpServers": {
    "then": { "command": "pnpm", "args": ["--dir", "/path/to/then", "-s", "then", "mcp"] }
  }
}
```

A hosted deployment serves the same tool over Streamable HTTP at `https://<deployment>/api/mcp` (for the public one, https://then.timjosh507.workers.dev/api/mcp), with that deployment's limits and receipt links.

## Tests

```bash
pnpm test                         # unit tests, no network
pnpm typecheck && pnpm lint && pnpm --filter @then/web lint
pnpm build && pnpm test:e2e       # production build against a seeded throwaway database
pnpm test:live                    # adapter contract checks on Nansen's free endpoints (needs a key)
node scripts/verify-fixtures.mjs  # every committed fixture, offline

docker build -f Dockerfile.verify -t then-verify . && docker run --rm --network none then-verify
```

The end-to-end suite never reads `.env`; it runs with a sentinel key and checks that the key reaches no page and no script.

The same suite runs against the Cloudflare build in workerd, with a throwaway local Postgres:

```bash
docker run -d --name then-e2e-pg -p 127.0.0.1:55432:5432 -e POSTGRES_PASSWORD=then-e2e postgres:17
pnpm --filter @then/web build:cf
E2E_DATABASE_URL=postgres://postgres:then-e2e@127.0.0.1:55432/postgres \
  pnpm --filter @then/web exec playwright test -c playwright.workers.config.ts
```

The seed refuses any database that is not on this machine before it resets it. Two tests that need a separate address per visitor are tagged `@limit` and run only in the Node suite, since workerd reports one local address.
